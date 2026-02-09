import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, type WSMessage, type UserSession } from "@shared/schema";

interface ExtendedWebSocket extends WebSocket {
  username?: string;
  room?: string;
  sessionId?: string;
  browserFingerprint?: string;
  lastMessageTime?: number;
  messageCount?: number;
  lastResetTime?: number;
}

// Session management
const activeSessions = new Map<string, UserSession>(); // sessionId -> session
const usernameOwnership = new Map<string, string>(); // "room:username" -> sessionId
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const HOCKER_RELAY_ROOM = process.env.HOCKER_RELAY_ROOM || "global";
const HOCKER_PUSH_TOKEN = process.env.HOCKER_PUSH_TOKEN || "";

type HockerLatestItem = {
  hnId: number;
  type?: string | null;
  by?: string | null;
  title?: string | null;
  text?: string | null;
  url?: string | null;
  sourceUrl?: string | null;
};

type RelayTypingFrame = {
  content: string;
  delayMs: number;
};

type RelayTypingJob = {
  id: string;
  username: string;
  room: string;
  yPosition: number;
  sourceUrl: string;
  storyUrl: string | null;
  finalContent: string;
  frames: RelayTypingFrame[];
  frameIndex: number;
  nextAt: number;
};

const decodeEntities = (value: string) =>
  value
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripHtml = (value: string) =>
  decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const htmlToParagraphs = (value: string) => {
  const normalized = decodeEntities(value)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|blockquote|h1|h2|h3|h4|h5|h6)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  return normalized
    .split(/\n{2,}/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
};
const truncate = (value: string, max = 160) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}...` : value);
const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
const randFloat = (min: number, max: number) => min + Math.random() * (max - min);
const chance = (p: number) => Math.random() < p;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const RELAY_TICK_MS = 12;
const RELAY_MAX_EVENTS_PER_TICK = 16;
const RELAY_MAX_EVENTS_PER_JOB_PER_TICK = 3;

const calcTypingDelay = ({
  char,
  nextChar,
  burstCps,
}: {
  char: string;
  nextChar: string;
  burstCps: number;
}) => {
  let delay = (1000 / burstCps) * randFloat(0.55, 1.05);

  if (char === " ") {
    delay *= randFloat(0.4, 0.72);
  }
  if (/[,:;]/.test(char)) {
    delay += randInt(12, 70);
  }
  if (/[.!?]/.test(char)) {
    delay += randInt(40, 180);
  }
  if (nextChar === "\n") {
    delay += randInt(45, 140);
  }
  if (nextChar && /[A-Z]/.test(nextChar) && char === " ") {
    delay += randInt(12, 45);
  }
  if (chance(0.06) && (char === " " || /[.,!?]/.test(char))) {
    delay += randInt(18, 100);
  }

  return clamp(Math.round(delay), 8, 360);
};

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected clients
  const clients = new Set<ExtendedWebSocket>();
  const relayTypingJobs = new Map<string, RelayTypingJob>();
  let relayJobCounter = 0;
  const lastRelayedVersion = new Map<number, string>();
  
  // Clean up expired sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
      if (now - session.lastSeen > SESSION_TIMEOUT) {
        // Release username ownership
        const ownershipKey = `${session.room}:${session.username}`;
        if (usernameOwnership.get(ownershipKey) === sessionId) {
          usernameOwnership.delete(ownershipKey);
        }
        activeSessions.delete(sessionId);
      }
    }
  }, 60000); // Check every minute

  // Session management helpers
  const validateNameOwnership = (username: string, room: string, sessionId: string, browserFingerprint: string): { allowed: boolean; error?: string } => {
    const ownershipKey = `${room}:${username}`;
    const currentOwner = usernameOwnership.get(ownershipKey);
    
    if (!currentOwner) {
      // Name is available
      return { allowed: true };
    }
    
    const ownerSession = activeSessions.get(currentOwner);
    if (!ownerSession) {
      // Owner session expired, release name
      usernameOwnership.delete(ownershipKey);
      return { allowed: true };
    }
    
    if (currentOwner === sessionId) {
      // Same session trying to reconnect
      return { allowed: true };
    }
    
    if (ownerSession.browserFingerprint === browserFingerprint) {
      // Same browser, allow name handoff
      return { allowed: true };
    }
    
    // Different user trying to take the name
    return { 
      allowed: false, 
      error: `Username "${username}" is already taken by another user in this room.` 
    };
  };
  
  const claimUsername = (username: string, room: string, sessionId: string, browserFingerprint: string) => {
    const ownershipKey = `${room}:${username}`;
    const now = Date.now();
    
    // Update or create session
    const session: UserSession = {
      sessionId,
      username,
      room,
      browserFingerprint,
      lastSeen: now,
      connectionCount: (activeSessions.get(sessionId)?.connectionCount || 0) + 1
    };
    
    activeSessions.set(sessionId, session);
    usernameOwnership.set(ownershipKey, sessionId);
  };
  
  // API route to get recent messages for a room
  app.get('/api/messages/:room', async (req, res) => {
    try {
      const { room } = req.params;
      const messages = await storage.getRecentMessages(room, 100);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  const finalizeRelayTypingJob = async (job: RelayTypingJob) => {
    await storage.addMessage({
      username: job.username,
      content: job.finalContent,
      room: job.room,
      isTyping: false,
      xPosition: 0,
      yPosition: job.yPosition,
      sourceUrl: job.sourceUrl,
      sourceLabel: "HN",
      storyUrl: job.storyUrl || undefined,
      storyLabel: job.storyUrl ? "Story" : undefined,
    });

    broadcastToRoom(job.room, {
      type: "newMessage",
      username: job.username,
      content: job.finalContent,
      room: job.room,
      yPosition: job.yPosition,
      sourceUrl: job.sourceUrl,
      sourceLabel: "HN",
      storyUrl: job.storyUrl || undefined,
      storyLabel: job.storyUrl ? "Story" : undefined,
      serverPrepared: true,
    });
  };

  setInterval(() => {
    const now = Date.now();
    const readyJobs = Array.from(relayTypingJobs.values()).filter((job) => job.nextAt <= now);
    if (!readyJobs.length) {
      return;
    }

    let emittedGlobal = 0;

    for (const job of readyJobs) {
      if (emittedGlobal >= RELAY_MAX_EVENTS_PER_TICK) {
        break;
      }

      let emittedForJob = 0;
      while (
        emittedForJob < RELAY_MAX_EVENTS_PER_JOB_PER_TICK &&
        emittedGlobal < RELAY_MAX_EVENTS_PER_TICK &&
        job.frameIndex < job.frames.length &&
        job.nextAt <= now
      ) {
        const frame = job.frames[job.frameIndex];
        job.frameIndex += 1;
        job.nextAt += frame.delayMs;

        broadcastToRoom(job.room, {
          type: "keystroke",
          username: job.username,
          content: frame.content,
          room: job.room,
          isTyping: true,
          yPosition: job.yPosition,
        });

        emittedForJob += 1;
        emittedGlobal += 1;
      }

      if (job.frameIndex >= job.frames.length) {
        relayTypingJobs.delete(job.id);
        void finalizeRelayTypingJob(job).catch((error) => {
          console.error("[relay] finalizing typing job failed", error);
        });
      }
    }
  }, RELAY_TICK_MS);

  const buildRelayTypingFrames = (messageText: string): RelayTypingFrame[] => {
    const frames: RelayTypingFrame[] = [];
    let current = "";
    let burstRemaining = randInt(7, 18);
    let burstCps = randFloat(18, 32); // near-superhuman, but still believable

    const pushFrame = (content: string, delayMs: number) => {
      frames.push({
        content,
        delayMs: clamp(delayMs, 6, 360),
      });
    };

    for (let i = 0; i < messageText.length; i++) {
      if (burstRemaining <= 0) {
        burstRemaining = randInt(6, 16);
        burstCps = randFloat(17, 34);
      }

      const char = messageText[i];
      const nextChar = messageText[i + 1] || "";

      current += char;
      burstRemaining -= 1;

      let delay = calcTypingDelay({ char, nextChar, burstCps });
      if (burstRemaining === 0) {
        delay += randInt(12, 80);
      }
      pushFrame(current, delay);
    }

    return frames;
  };

  const relayHockerItem = async (item: HockerLatestItem, room: string) => {
    if (!item || !Number.isFinite(item.hnId)) {
      return;
    }

    const version = [
      item.hnId,
      item.type || "",
      item.title || "",
      item.text || "",
      item.url || "",
      item.sourceUrl || "",
    ].join("|");
    if (lastRelayedVersion.get(item.hnId) === version) {
      return;
    }
    lastRelayedVersion.set(item.hnId, version);
    if (lastRelayedVersion.size > 5000) {
      const oldestKey = lastRelayedVersion.keys().next().value;
      if (oldestKey !== undefined) {
        lastRelayedVersion.delete(oldestKey);
      }
    }

    const username = `HN:${item.by || "unknown"}`;
    const textParagraphs = item.text ? htmlToParagraphs(item.text) : [];
    const titleLine = stripHtml(item.title || "");
    const bodyText = textParagraphs.length ? textParagraphs.join(" ") : "";
    const messageText = truncate(titleLine || bodyText || `HN item #${item.hnId}`, 220);
    const sourceUrl = item.sourceUrl || `https://news.ycombinator.com/item?id=${item.hnId}`;
    const baseYPosition = Math.floor(18 + Math.random() * 55);
    const yPosition = Math.min(85, baseYPosition);
    const storyUrl = item.type === "story" && item.url ? item.url : null;

    const jobId = `relay-${Date.now()}-${relayJobCounter++}`;
    relayTypingJobs.set(jobId, {
      id: jobId,
      username,
      room,
      yPosition,
      sourceUrl,
      storyUrl,
      finalContent: messageText,
      frames: buildRelayTypingFrames(messageText),
      frameIndex: 0,
      nextAt: Date.now() + randInt(25, 180),
    });
  };

  app.post('/api/relay/hn-item', async (req, res) => {
    try {
      if (HOCKER_PUSH_TOKEN) {
        const token = req.header('x-hocker-token') || "";
        if (token !== HOCKER_PUSH_TOKEN) {
          res.status(401).json({ error: "Unauthorized relay token" });
          return;
        }
      }

      const payload = req.body as { item?: HockerLatestItem; room?: string };
      const item = payload?.item;
      if (!item || !Number.isFinite(item.hnId)) {
        res.status(400).json({ error: "Expected payload { item: { hnId, ... } }" });
        return;
      }

      const room = payload.room || HOCKER_RELAY_ROOM;
      await relayHockerItem(item, room);
      res.json({ ok: true, hnId: item.hnId, room });
    } catch (error) {
      console.error("[relay] inbound HN push failed", error);
      res.status(500).json({ error: "Failed to process HN relay item" });
    }
  });

  // Enhanced rate limiting helper
  const checkRateLimit = (ws: ExtendedWebSocket): boolean => {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxMessages = 50; // Increased back to reasonable limit for development
    const minInterval = 50; // Reduced to 50ms for more responsive typing
    
    // Check minimum interval (only if we have a previous message time)
    if (ws.lastMessageTime && now - ws.lastMessageTime < minInterval) {
      return false;
    }
    
    // Reset counter if window has passed
    if (!ws.lastResetTime || now - ws.lastResetTime > windowMs) {
      ws.messageCount = 0;
      ws.lastResetTime = now;
    }
    
    ws.messageCount = (ws.messageCount || 0) + 1;
    
    if (ws.messageCount > maxMessages) {
      return false; // Rate limit exceeded
    }
    
    return true;
  };

  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    console.log('New WebSocket connection');
    clients.add(ws);
    
    // Initialize rate limiting - don't set lastMessageTime on connection
    ws.messageCount = 0;
    ws.lastResetTime = Date.now();
    // ws.lastMessageTime will be set when first message is received
    
    // Extract room from query params
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const room = url.searchParams.get('room') || 'global';
    ws.room = room;

    ws.on('message', async (data) => {
      try {
        // Check rate limit
        if (!checkRateLimit(ws)) {
          console.log(`Rate limit exceeded for user ${ws.username}`);
          return;
        }
        
        const message = JSON.parse(data.toString()) as WSMessage;
        const validatedMessage = wsMessageSchema.parse(message);
        
        const now = Date.now();
        
        // Session and username validation for all message types with usernames
        if (validatedMessage.username) {
          // For join messages, we need session info
          if (validatedMessage.type === 'join') {
            const sessionId = validatedMessage.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const browserFingerprint = validatedMessage.browserFingerprint || 'unknown';
            
            const validation = validateNameOwnership(
              validatedMessage.username, 
              validatedMessage.room, 
              sessionId, 
              browserFingerprint
            );
            
            if (!validation.allowed) {
              // Send name error back to client
              ws.send(JSON.stringify({
                type: 'nameError',
                username: validatedMessage.username,
                room: validatedMessage.room,
                error: validation.error
              }));
              return;
            }
            
            // Claim the username
            claimUsername(validatedMessage.username, validatedMessage.room, sessionId, browserFingerprint);
            
            // Store session info on WebSocket
            ws.sessionId = sessionId;
            ws.browserFingerprint = browserFingerprint;
          } else {
            // For other message types, validate using existing session info
            if (ws.sessionId && ws.browserFingerprint) {
              const validation = validateNameOwnership(
                validatedMessage.username, 
                validatedMessage.room, 
                ws.sessionId, 
                ws.browserFingerprint
              );
              
              if (!validation.allowed) {
                // Send name error back to client for any message type
                ws.send(JSON.stringify({
                  type: 'nameError',
                  username: validatedMessage.username,
                  room: validatedMessage.room,
                  error: validation.error
                }));
                return;
              }
            }
          }
        }
        
        // Enhanced content validation
        if (validatedMessage.content) {
          // Reduced length limit
          if (validatedMessage.content.length > 200) {
            console.log(`Message too long from user ${validatedMessage.username}`);
            return;
          }
          
          // Detect repeated characters (spam pattern)
          const repeatedChars = /(.)\1{10,}/g;
          if (repeatedChars.test(validatedMessage.content)) {
            console.log(`Repeated character spam from user ${validatedMessage.username}`);
            return;
          }
          
          // Detect excessive special characters
          const specialCharCount = (validatedMessage.content.match(/[^a-zA-Z0-9\s]/g) || []).length;
          if (specialCharCount > validatedMessage.content.length * 0.5) {
            console.log(`Excessive special characters from user ${validatedMessage.username}`);
            return;
          }
        }
        
        // Update session last seen time
        if (ws.sessionId && activeSessions.has(ws.sessionId)) {
          const session = activeSessions.get(ws.sessionId)!;
          session.lastSeen = now;
          activeSessions.set(ws.sessionId, session);
        }
        
        ws.username = validatedMessage.username;
        ws.room = validatedMessage.room;
        ws.lastMessageTime = now; // Update after successful rate limit check

        switch (validatedMessage.type) {
          case 'keystroke':
            // Broadcast keystroke to all clients in the same room
            broadcastToRoom(validatedMessage.room, {
              type: 'keystroke',
              username: validatedMessage.username,
              content: validatedMessage.content,
              room: validatedMessage.room,
              isTyping: validatedMessage.isTyping,
              yPosition: validatedMessage.yPosition,
              userColor: validatedMessage.userColor,
              fontSize: validatedMessage.fontSize,
            }, ws);
            break;
            
          case 'newMessage':
            // Save completed message and broadcast
            if (validatedMessage.content && validatedMessage.yPosition !== undefined) {
              await storage.addMessage({
                username: validatedMessage.username,
                content: validatedMessage.content,
                room: validatedMessage.room,
                isTyping: false,
                xPosition: 0, // Messages start from right edge
                yPosition: validatedMessage.yPosition,
                sourceUrl: validatedMessage.sourceUrl,
                sourceLabel: validatedMessage.sourceLabel,
                storyUrl: validatedMessage.storyUrl,
                storyLabel: validatedMessage.storyLabel,
              });
            }
            broadcastToRoom(validatedMessage.room, {
              type: 'newMessage',
              username: validatedMessage.username,
              content: validatedMessage.content,
              room: validatedMessage.room,
              yPosition: validatedMessage.yPosition,
              userColor: validatedMessage.userColor,
              fontSize: validatedMessage.fontSize,
              sourceUrl: validatedMessage.sourceUrl,
              sourceLabel: validatedMessage.sourceLabel,
              storyUrl: validatedMessage.storyUrl,
              storyLabel: validatedMessage.storyLabel,
              serverPrepared: validatedMessage.serverPrepared,
            }, ws);
            break;
            
          case 'join':
            broadcastToRoom(validatedMessage.room, {
              type: 'join',
              username: validatedMessage.username,
              room: validatedMessage.room,
            }, ws);
            break;
            
          case 'leave':
            broadcastToRoom(validatedMessage.room, {
              type: 'leave',
              username: validatedMessage.username,
              room: validatedMessage.room,
            }, ws);
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clients.delete(ws);
      
      // Update session connection count
      if (ws.sessionId && activeSessions.has(ws.sessionId)) {
        const session = activeSessions.get(ws.sessionId)!;
        session.connectionCount = Math.max(0, session.connectionCount - 1);
        session.lastSeen = Date.now();
        activeSessions.set(ws.sessionId, session);
        
        // Only broadcast leave if this was the last connection for this session
        const remainingConnections = Array.from(clients).filter(
          client => client.sessionId === ws.sessionId
        ).length;
        
        if (remainingConnections === 0 && ws.username && ws.room) {
          broadcastToRoom(ws.room, {
            type: 'leave',
            username: ws.username,
            room: ws.room,
          }, ws);
        }
      } else if (ws.username && ws.room) {
        // Fallback for sessions without proper tracking
        broadcastToRoom(ws.room, {
          type: 'leave',
          username: ws.username,
          room: ws.room,
        }, ws);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  function broadcastToRoom(room: string, message: Partial<WSMessage>, sender?: ExtendedWebSocket) {
    clients.forEach((client) => {
      if (client.room === room && 
          client.readyState === WebSocket.OPEN) {
        // Send to all clients in the room, including other tabs of the same user
        // Only exclude the exact sender WebSocket connection
        if (client !== sender) {
          client.send(JSON.stringify(message));
        }
      }
    });
  }

  return httpServer;
}
