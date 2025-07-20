import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, type WSMessage } from "@shared/schema";

interface ExtendedWebSocket extends WebSocket {
  username?: string;
  room?: string;
  lastMessageTime?: number;
  messageCount?: number;
  lastResetTime?: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server on /ws path to avoid conflicts with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected clients
  const clients = new Set<ExtendedWebSocket>();
  
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

  // Rate limiting helper
  const checkRateLimit = (ws: ExtendedWebSocket): boolean => {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxMessages = 50; // Max 50 messages per minute
    
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
    
    // Initialize rate limiting
    ws.messageCount = 0;
    ws.lastResetTime = Date.now();
    ws.lastMessageTime = Date.now();
    
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
        
        // Additional spam protection - prevent too frequent messages
        const now = Date.now();
        if (ws.lastMessageTime && now - ws.lastMessageTime < 50) { // Min 50ms between messages
          return;
        }
        
        // Content validation - basic spam detection
        if (validatedMessage.content && validatedMessage.content.length > 500) {
          console.log(`Message too long from user ${validatedMessage.username}`);
          return;
        }
        
        ws.username = validatedMessage.username;
        ws.room = validatedMessage.room;
        ws.lastMessageTime = now;

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
      
      if (ws.username && ws.room) {
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
      if (client !== sender && 
          client.room === room && 
          client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  return httpServer;
}
