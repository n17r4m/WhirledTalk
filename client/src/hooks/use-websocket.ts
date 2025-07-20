import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '@shared/schema';

interface UseWebSocketProps {
  room: string;
  username: string;
  onMessage: (message: WSMessage) => void;
}

export function useWebSocket({ room, username, onMessage }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(room)}`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Send join message
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'join',
            username,
            room,
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          onMessage(message);
          
          // Update connected users count (simplified)
          if (message.type === 'join') {
            setConnectedUsers(prev => prev + 1);
          } else if (message.type === 'leave') {
            setConnectedUsers(prev => Math.max(0, prev - 1));
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setIsConnected(false);
    }
  }, [room, username, onMessage]);

  const sendMessage = useCallback((message: Partial<WSMessage>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        username,
        room,
        ...message,
      }));
    }
  }, [username, room]);

  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        // Send leave message before closing
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'leave',
            username,
            room,
          }));
        }
        wsRef.current.close();
      }
    };
  }, [connect, username, room]);

  return {
    isConnected,
    connectedUsers,
    sendMessage,
  };
}
