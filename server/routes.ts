import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { wsMessageSchema, type WSMessage } from "@shared/schema";

interface ExtendedWebSocket extends WebSocket {
  username?: string;
  room?: string;
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

  wss.on('connection', (ws: ExtendedWebSocket, req) => {
    console.log('New WebSocket connection');
    clients.add(ws);
    
    // Extract room from query params
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const room = url.searchParams.get('room') || 'global';
    ws.room = room;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        const validatedMessage = wsMessageSchema.parse(message);
        
        ws.username = validatedMessage.username;
        ws.room = validatedMessage.room;

        switch (validatedMessage.type) {
          case 'keystroke':
            // Broadcast keystroke to all clients in the same room
            broadcastToRoom(validatedMessage.room, validatedMessage, ws);
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
            broadcastToRoom(validatedMessage.room, validatedMessage, ws);
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
