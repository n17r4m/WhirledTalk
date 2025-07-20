import { useState, useCallback, useEffect } from 'react';
import { ConnectionStatus } from '@/components/connection-status';
import { RoomIndicator } from '@/components/room-indicator';
import { ChatViewport } from '@/components/chat-viewport';
import { CustomizationBar } from '@/components/customization-bar';
import { useWebSocket } from '@/hooks/use-websocket';
import { useQueryParams } from '@/hooks/use-query-params';
import type { Message, WSMessage } from '@shared/schema';

export default function Chat() {
  const { params, getThemeClasses } = useQueryParams();
  const themeClasses = getThemeClasses();
  
  const [username, setUsername] = useState(() => {
    return `guest_${Math.random().toString(36).substr(2, 6)}`;
  });
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingMessages, setTypingMessages] = useState(new Map<string, { content: string; yPosition: number; username: string; userColor?: string; fontSize?: string }>());
  const [fontSize, setFontSize] = useState(params.size);
  const [textColor, setTextColor] = useState(params.color);

  const handleWebSocketMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'keystroke':
        if (wsMessage.username !== username && wsMessage.content !== undefined) {
          setTypingMessages(prev => {
            const newMap = new Map(prev);
            // Only update if content is different to reduce unnecessary re-renders
            const existing = newMap.get(wsMessage.username);
            if (!existing || existing.content !== wsMessage.content) {
              newMap.set(wsMessage.username, {
                content: wsMessage.content || '',
                yPosition: wsMessage.yPosition || existing?.yPosition || Math.random() * 70 + 15,
                username: wsMessage.username,
                userColor: wsMessage.userColor,
                fontSize: wsMessage.fontSize,
              });
            }
            return newMap;
          });
        }
        break;
        
      case 'newMessage':
        if (wsMessage.username !== username && wsMessage.content) {
          // Get the typing message position to maintain it
          const typingMessage = typingMessages.get(wsMessage.username);
          
          // Remove from typing and add to completed messages
          setTypingMessages(prev => {
            const newMap = new Map(prev);
            newMap.delete(wsMessage.username);
            return newMap;
          });
          
          setMessages(prev => [...prev, {
            id: Date.now(), // Temporary ID for display
            username: wsMessage.username,
            content: wsMessage.content,
            room: wsMessage.room,
            isTyping: false,
            timestamp: new Date(),
            xPosition: 0,
            yPosition: wsMessage.yPosition || typingMessage?.yPosition || Math.random() * 70 + 15,
          }]);
        }
        break;
        
      case 'join':
        console.log(`${wsMessage.username} joined the room`);
        break;
        
      case 'leave':
        console.log(`${wsMessage.username} left the room`);
        // Remove their typing indicator
        setTypingMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(wsMessage.username);
          return newMap;
        });
        break;
    }
  }, [username]);

  const { isConnected, connectedUsers, sendMessage } = useWebSocket({
    room: params.room,
    username,
    onMessage: handleWebSocketMessage,
  });

  const handleSendKeystroke = useCallback((content: string, isComplete: boolean) => {
    if (isComplete) {
      // Get the current typing position to maintain it for the completed message
      const currentTyping = typingMessages.get(username);
      const yPosition = currentTyping?.yPosition || Math.random() * 70 + 15;
      
      sendMessage({
        type: 'newMessage',
        content,
        yPosition,
        userColor: textColor,
        fontSize: fontSize,
      });
      
      // Add to local messages immediately with the same Y position as typing
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(), // Ensure unique ID
        username,
        content,
        room: params.room,
        isTyping: false,
        timestamp: new Date(),
        xPosition: 0,
        yPosition,
      }]);

      // Clear typing indicator and immediately start new typing position for next message
      setTypingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(username);
        return newMap;
      });
    } else {
      // Send keystroke event with current Y position for continuity or new random position
      const currentTyping = typingMessages.get(username);
      const yPosition = currentTyping?.yPosition || Math.random() * 70 + 15;
      
      sendMessage({
        type: 'keystroke',
        content,
        isTyping: true,
        yPosition,
        userColor: textColor,
        fontSize: fontSize,
      });

      // Update local typing state
      setTypingMessages(prev => {
        const newMap = new Map(prev);
        newMap.set(username, {
          content,
          yPosition,
          username,
          userColor: textColor,
          fontSize: fontSize,
        });
        return newMap;
      });
    }
  }, [sendMessage, username, params.room, typingMessages, textColor, fontSize]);

  // Load recent messages on mount
  useEffect(() => {
    fetch(`/api/messages/${params.room}`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(console.error);
  }, [params.room]);

  return (
    <div className={`h-full w-full flex flex-col relative ${themeClasses.background} ${themeClasses.font}`}>
      <ConnectionStatus isConnected={isConnected} connectedUsers={connectedUsers} />
      <RoomIndicator room={params.room} />
      
      <ChatViewport 
        messages={messages} 
        typingMessages={typingMessages}
        currentUser={username}
        userSettings={{ color: textColor, fontSize }}
      />
      
      <CustomizationBar
        username={username}
        onUsernameChange={setUsername}
        onSendKeystroke={handleSendKeystroke}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        textColor={textColor}
        onTextColorChange={setTextColor}
      />

      {/* Query Demo Indicator */}
      <div className="absolute bottom-4 left-4 bg-indigo-900/90 backdrop-blur-sm px-3 py-2 rounded-lg text-xs border border-indigo-600/50">
        <div className="text-indigo-300 font-medium mb-1">Query Customization:</div>
        <div className="text-gray-300">
          ?bg={params.bg}&room={params.room}&color={params.color}
        </div>
      </div>
    </div>
  );
}
