import { useState, useCallback, useEffect } from 'react';
import { ConnectionStatus } from '@/components/connection-status';
import { RoomIndicator } from '@/components/room-indicator';
import { ChatViewport } from '@/components/chat-viewport';
import { CustomizationBar } from '@/components/customization-bar';
import { useWebSocket } from '@/hooks/use-websocket';
import { useQueryParams } from '@/hooks/use-query-params';
import type { Message, WSMessage } from '@shared/schema';
import { useStyleSync } from '@/hooks/use-style-sync';

export default function Chat() {
  const { params, getThemeClasses } = useQueryParams();
  const themeClasses = getThemeClasses();
  
  const [username, setUsername] = useState(() => {
    const saved = localStorage.getItem('whirledtalk-username');
    return saved || `guest_${Math.random().toString(36).substr(2, 6)}`;
  });
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingMessages, setTypingMessages] = useState(new Map<string, { content: string; yPosition: number; username: string; userColor?: string; fontSize?: string }>());
  const [occupiedPositions, setOccupiedPositions] = useState<Array<{ yPosition: number; timestamp: number; height: number }>>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [nameError, setNameError] = useState<string>('');
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('whirledtalk-font-size');
    return saved || params.size;
  });
  const [textColor, setTextColor] = useState(() => {
    const saved = localStorage.getItem('whirledtalk-text-color');
    return saved || params.color;
  });

  // Update URL params when preferences change
  useEffect(() => {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('color', textColor);
    newUrl.searchParams.set('size', fontSize);
    window.history.replaceState({}, '', newUrl.toString());
  }, [textColor, fontSize]);

  // Auto-focus management
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is on interactive elements that should NOT trigger focus
      const interactiveSelectors = [
        'input', 'button', 'select', 'textarea',
        '.emoji-picker', '[data-color]', '[data-size]',
        '.emoji-button', '.color-button', '.settings-button'
      ];
      
      const isInteractiveElement = interactiveSelectors.some(selector => {
        return target.matches?.(selector) || target.closest?.(selector);
      });
      
      // If not clicking on interactive elements, focus the text input
      if (!isInteractiveElement) {
        const textInput = document.querySelector('input[type="text"][placeholder*="chat"]') as HTMLInputElement;
        if (textInput && textInput !== target) {
          setTimeout(() => textInput.focus(), 0);
        }
      }
    };

    const handleWindowFocus = () => {
      // When window gains focus, focus the text input
      const textInput = document.querySelector('input[type="text"][placeholder*="chat"]') as HTMLInputElement;
      if (textInput) {
        setTimeout(() => textInput.focus(), 0);
      }
    };

    // Add event listeners
    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('focus', handleWindowFocus);
    
    // Initial focus on mount
    setTimeout(() => {
      const textInput = document.querySelector('input[type="text"][placeholder*="chat"]') as HTMLInputElement;
      if (textInput) {
        textInput.focus();
      }
    }, 100);

    return () => {
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // Smart positioning algorithm
  const findOptimalPosition = useCallback((): number => {
    const now = Date.now();
    const messageLifetime = 25000; // 25 seconds for messages to cross screen
    const minSpacing = 8; // Minimum percentage spacing between messages
    const messageHeight = 6; // Approximate message height in percentage
    const viewportUsable = 70; // Use 70% of viewport (15% margin top/bottom)
    const viewportStart = 15; // Start at 15% from top
    
    // Clean up expired positions
    const activePositions = occupiedPositions.filter(pos => 
      now - pos.timestamp < messageLifetime
    );
    
    // Update state with cleaned positions
    setOccupiedPositions(activePositions);
    
    // Sort positions by Y coordinate
    const sortedPositions = [...activePositions].sort((a, b) => a.yPosition - b.yPosition);
    
    // Try to find gaps between existing messages
    const candidates: Array<{ yPosition: number; score: number }> = [];
    
    // Add position before first message
    if (sortedPositions.length === 0 || sortedPositions[0].yPosition > viewportStart + messageHeight + minSpacing) {
      const pos = viewportStart + Math.random() * 20; // Some randomness in top area
      candidates.push({ yPosition: pos, score: 100 - Math.abs(pos - 30) }); // Prefer middle-ish
    }
    
    // Look for gaps between messages
    for (let i = 0; i < sortedPositions.length - 1; i++) {
      const current = sortedPositions[i];
      const next = sortedPositions[i + 1];
      const gapSize = next.yPosition - (current.yPosition + current.height);
      
      if (gapSize >= messageHeight + minSpacing * 2) {
        // Found a suitable gap
        const gapStart = current.yPosition + current.height + minSpacing;
        const gapEnd = next.yPosition - messageHeight - minSpacing;
        const centerPos = gapStart + (gapEnd - gapStart) / 2;
        
        // Add some randomness but prefer center of gap
        const randomOffset = (Math.random() - 0.5) * Math.min(gapSize * 0.3, 15);
        const pos = Math.max(gapStart, Math.min(gapEnd, centerPos + randomOffset));
        
        // Score based on gap size and position quality
        const sizeScore = Math.min(gapSize / 20, 1) * 50;
        const positionScore = 50 - Math.abs(pos - 50) / 2; // Prefer middle of screen
        candidates.push({ yPosition: pos, score: sizeScore + positionScore });
      }
    }
    
    // Add position after last message
    const lastPos = sortedPositions.length > 0 ? sortedPositions[sortedPositions.length - 1] : null;
    const lastEnd = lastPos ? lastPos.yPosition + lastPos.height : viewportStart;
    if (lastEnd + messageHeight + minSpacing <= viewportStart + viewportUsable) {
      const pos = lastEnd + minSpacing + Math.random() * 10;
      candidates.push({ yPosition: pos, score: 80 - Math.abs(pos - 40) }); // Slight preference for earlier positions
    }
    
    // If no good gaps, create new position with collision avoidance
    if (candidates.length === 0) {
      let attempts = 0;
      while (attempts < 20) {
        const randomPos = viewportStart + Math.random() * viewportUsable;
        
        // Check collision with existing messages
        const hasCollision = sortedPositions.some(pos => 
          Math.abs(pos.yPosition - randomPos) < messageHeight + minSpacing
        );
        
        if (!hasCollision) {
          candidates.push({ yPosition: randomPos, score: 40 + Math.random() * 20 });
          break;
        }
        attempts++;
      }
    }
    
    // Fall back to completely random if all else fails
    if (candidates.length === 0) {
      candidates.push({ 
        yPosition: viewportStart + Math.random() * viewportUsable, 
        score: 20 
      });
    }
    
    // Select best candidate (with slight randomness for organic feel)
    const sortedCandidates = candidates.sort((a, b) => b.score - a.score);
    const topCandidates = sortedCandidates.slice(0, Math.min(3, sortedCandidates.length));
    const weights = topCandidates.map((_, i) => Math.pow(2, topCandidates.length - i));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * totalWeight;
    for (let i = 0; i < topCandidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return Math.max(viewportStart, Math.min(viewportStart + viewportUsable - messageHeight, topCandidates[i].yPosition));
      }
    }
    
    return topCandidates[0].yPosition;
  }, [occupiedPositions]);

  const handleWebSocketMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'keystroke':
        if (wsMessage.content !== undefined) {
          setTypingMessages(prev => {
            const newMap = new Map(prev);
            // Only update if content is different to reduce unnecessary re-renders
            const existing = newMap.get(wsMessage.username);
            if (!existing || existing.content !== wsMessage.content) {
              newMap.set(wsMessage.username, {
                content: wsMessage.content || '',
                yPosition: wsMessage.yPosition || existing?.yPosition || findOptimalPosition(),
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
        if (wsMessage.content) {
          // Get the typing message position to maintain it
          const typingMessage = typingMessages.get(wsMessage.username);
          const yPosition = wsMessage.yPosition || typingMessage?.yPosition || findOptimalPosition();
          
          // Record this position as occupied
          setOccupiedPositions(prev => [...prev, {
            yPosition,
            timestamp: Date.now(),
            height: 6
          }]);
          
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
            yPosition,
            userColor: wsMessage.userColor, // Include style from sender
            fontSize: wsMessage.fontSize,   // Include style from sender
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
    onNameError: (error) => {
      setNameError(error);
      // Auto-clear after 5 seconds
      setTimeout(() => setNameError(''), 5000);
    },
  });



  // Handle color changes with localStorage persistence and cross-tab sync
  const handleTextColorChange = useCallback((newColor: string) => {
    setTextColor(newColor);
    localStorage.setItem('whirledtalk-text-color', newColor);
    // Broadcast to other tabs will be handled by useStyleSync
  }, []);

  // Handle font size changes with localStorage persistence and cross-tab sync
  const handleFontSizeChangeWithSync = useCallback((newSize: string) => {
    setFontSize(newSize);
    localStorage.setItem('whirledtalk-font-size', newSize);
    // Broadcast to other tabs will be handled by useStyleSync
  }, []);

  // Handle username changes with localStorage persistence
  const handleUsernameChange = useCallback((newUsername: string) => {
    setUsername(newUsername);
    localStorage.setItem('whirledtalk-username', newUsername);
  }, []);

  // Style synchronization across tabs for same username
  const { broadcastStyleChange } = useStyleSync({
    username,
    textColor,
    fontSize,
    onTextColorChange: handleTextColorChange,
    onFontSizeChange: handleFontSizeChangeWithSync,
  });

  // Broadcast style changes when they occur
  useEffect(() => {
    broadcastStyleChange(textColor, fontSize);
  }, [textColor, fontSize, broadcastStyleChange]);

  const handleSendKeystroke = useCallback((content: string, isComplete: boolean) => {
    if (isComplete) {
      // Get the current typing position to maintain it for the completed message
      const currentTyping = typingMessages.get(username);
      const yPosition = currentTyping?.yPosition || findOptimalPosition();
      
      // Record this position as occupied
      setOccupiedPositions(prev => [...prev, {
        yPosition,
        timestamp: Date.now(),
        height: 6 // Approximate message height percentage
      }]);
      
      sendMessage({
        type: 'newMessage',
        content,
        yPosition,
        userColor: textColor,
        fontSize: fontSize,
      });
      
      // Add to local messages immediately with the same Y position as typing and style info
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(), // Ensure unique ID
        username,
        content,
        room: params.room,
        isTyping: false,
        timestamp: new Date(),
        xPosition: 0,
        yPosition,
        userColor: textColor, // Include current style
        fontSize: fontSize,   // Include current style
      }]);

      // Clear typing indicator
      setTypingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(username);
        return newMap;
      });
    } else {
      // Send keystroke event with current Y position for continuity or new optimal position
      const currentTyping = typingMessages.get(username);
      const yPosition = currentTyping?.yPosition || findOptimalPosition();
      
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
  }, [sendMessage, username, params.room, typingMessages, textColor, fontSize, findOptimalPosition]);

  // Load recent messages on mount with animated replay
  useEffect(() => {
    fetch(`/api/messages/${params.room}`)
      .then(res => res.json())
      .then((data: Message[]) => {
        if (data && data.length > 0) {
          setIsReplaying(true);
          
          // Sort by timestamp to ensure chronological order
          const sortedMessages = data.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          // Animate messages appearing one by one
          sortedMessages.forEach((message, index) => {
            setTimeout(() => {
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                if (prev.some(m => m.id === message.id)) {
                  return prev;
                }
                
                // Assign staggered Y position if not already set
                const yPosition = message.yPosition || ((index * 15) % 80) + 10;
                
                return [...prev, {
                  ...message,
                  yPosition,
                }];
              });
              
              // Record position as occupied
              setOccupiedPositions(prev => [...prev, {
                yPosition: message.yPosition || ((index * 15) % 80) + 10,
                timestamp: Date.now(),
                height: 6
              }]);
              
              // Stop replay indicator after last message
              if (index === sortedMessages.length - 1) {
                setTimeout(() => setIsReplaying(false), 500);
              }
            }, index * 400); // 400ms interval for faster replay
          });
        }
      })
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
        onUsernameChange={handleUsernameChange}
        onSendKeystroke={handleSendKeystroke}
        fontSize={fontSize}
        onFontSizeChange={handleFontSizeChangeWithSync}
        textColor={textColor}
        onTextColorChange={handleTextColorChange}
      />

      {/* Replay Indicator */}
      {isReplaying && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-900/95 backdrop-blur-md px-6 py-4 rounded-xl text-sm border border-gray-600/50 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-300">Replaying chat history...</span>
          </div>
        </div>
      )}

      {/* Name Error Indicator */}
      {nameError && (
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-red-900/95 backdrop-blur-md px-6 py-4 rounded-xl text-sm border border-red-600/50 shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="text-red-200">{nameError}</span>
          </div>
        </div>
      )}

      {/* Query Demo Indicator */}
      <div className="absolute bottom-20 left-4 bg-indigo-900/90 backdrop-blur-sm px-3 py-2 rounded-lg text-xs border border-indigo-600/50">
        <div className="text-indigo-300 font-medium mb-1">Query Customization:</div>
        <div className="text-gray-300">
          ?bg={params.bg}&room={params.room}&color={params.color}
        </div>
      </div>
    </div>
  );
}
