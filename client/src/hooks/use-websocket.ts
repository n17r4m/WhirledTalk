import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '@shared/schema';

// Generate browser fingerprint for session management
const generateBrowserFingerprint = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Browser fingerprint', 2, 2);
  }
  
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvas.toDataURL(),
    localStorage.getItem('whirledtalk-browser-id') || Math.random().toString(36)
  ].join('|');
  
  // Store persistent browser ID
  if (!localStorage.getItem('whirledtalk-browser-id')) {
    localStorage.setItem('whirledtalk-browser-id', Math.random().toString(36).substr(2, 12));
  }
  
  return btoa(fingerprint).substr(0, 32); // Hash and truncate
};

interface UseWebSocketProps {
  room: string;
  username: string;
  onMessage: (message: WSMessage) => void;
  onNameError?: (error: string) => void;
}

export function useWebSocket({ room, username, onMessage, onNameError }: UseWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const sessionIdRef = useRef<string>('');
  const browserFingerprintRef = useRef<string>('');
  
  // Generate session ID and browser fingerprint on first load
  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = localStorage.getItem('whirledtalk-session-id') || 
        `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('whirledtalk-session-id', sessionIdRef.current);
    }
    
    if (!browserFingerprintRef.current) {
      browserFingerprintRef.current = generateBrowserFingerprint();
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(room)}`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Send join message with session info
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'join',
            username,
            room,
            sessionId: sessionIdRef.current,
            browserFingerprint: browserFingerprintRef.current,
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          
          // Handle name collision errors
          if (message.type === 'nameError' && onNameError) {
            onNameError(message.error || 'Username is already taken');
            return;
          }
          
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
