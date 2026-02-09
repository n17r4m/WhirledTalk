import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  const [nameError, setNameError] = useState<string>('');
  const [validUsername, setValidUsername] = useState(username); // Last known valid username
  const [pendingUsername, setPendingUsername] = useState<string>(''); // Username being attempted
  const [usernameStatus, setUsernameStatus] = useState<'valid' | 'pending' | 'rejected'>('valid');
  const pendingTimeoutRef = useRef<NodeJS.Timeout>();
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
    const messageLifetime = 25000;
    const messageHeight = 6;
    const minSpacing = 5;
    const topBound = 6;
    const bottomBound = 92;
    const yMin = topBound;
    const yMax = bottomBound - messageHeight;

    const activeCompleted = occupiedPositions.filter((pos) => now - pos.timestamp < messageLifetime);
    setOccupiedPositions(activeCompleted);

    // Include currently typing lines as active occupancy to prevent clustering while composing.
    const activeTyping = Array.from(typingMessages.values()).map((typing) => ({
      yPosition: typing.yPosition,
      timestamp: now,
      height: messageHeight,
    }));

    const activePositions = [...activeCompleted, ...activeTyping];
    if (activePositions.length === 0) {
      return yMin + Math.random() * (yMax - yMin);
    }

    const scoreCandidate = (yPosition: number) => {
      let penalty = 0;
      let separationScore = 0;
      let density = 0;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const pos of activePositions) {
        const age = now - pos.timestamp;
        const ageFactor = Math.max(0.25, 1 - age / messageLifetime);
        const dy = Math.abs(pos.yPosition - yPosition);
        const softRadius = minSpacing + (pos.height + messageHeight) / 2;

        minDistance = Math.min(minDistance, dy);

        if (dy < softRadius) {
          const overlap = softRadius - dy;
          penalty += overlap * overlap * 4.5 * ageFactor;
        } else {
          separationScore += Math.min(26, dy - softRadius) * 0.55 * ageFactor;
        }

        const sigma = 8.5;
        density += Math.exp(-(dy * dy) / (2 * sigma * sigma)) * ageFactor;
      }

      const edgeDistance = Math.min(yPosition - yMin, yMax - yPosition);
      const edgePenalty = edgeDistance < 2 ? (2 - edgeDistance) * 10 : 0;
      const jitter = (Math.random() - 0.5) * 2.8;

      return minDistance * 1.4 + separationScore - density * 13.5 - penalty - edgePenalty + jitter;
    };

    const sampleCount = 90;
    const candidates: Array<{ yPosition: number; score: number }> = [];
    for (let i = 0; i < sampleCount; i++) {
      const yPosition = yMin + Math.random() * (yMax - yMin);
      candidates.push({ yPosition, score: scoreCandidate(yPosition) });
    }

    const sortedCandidates = candidates.sort((a, b) => b.score - a.score);
    const topCandidates = sortedCandidates.slice(0, 8);
    const weighted = topCandidates.map((candidate, index) => ({
      ...candidate,
      weight: Math.max(0.1, 8 - index) * Math.max(0.2, candidate.score - topCandidates[topCandidates.length - 1].score + 0.35),
    }));
    const totalWeight = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);

    let draw = Math.random() * totalWeight;
    for (const candidate of weighted) {
      draw -= candidate.weight;
      if (draw <= 0) {
        return Math.max(yMin, Math.min(yMax, candidate.yPosition));
      }
    }

    return Math.max(yMin, Math.min(yMax, topCandidates[0]?.yPosition ?? (yMin + yMax) / 2));
  }, [occupiedPositions, typingMessages]);

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
            xPosition: wsMessage.xPosition ?? 0,
            yPosition,
            userColor: wsMessage.userColor, // Include style from sender
            fontSize: wsMessage.fontSize,   // Include style from sender
            sourceUrl: wsMessage.sourceUrl || null,
            sourceLabel: wsMessage.sourceLabel || null,
            storyUrl: wsMessage.storyUrl || null,
            storyLabel: wsMessage.storyLabel || null,
          }]);
        }
        break;
        
      case 'join':
        // Username successfully validated - check if this is our join
        console.log(`${wsMessage.username} joined the room`);
        if (wsMessage.username === username || wsMessage.username === pendingUsername) {
          // Clear pending timeout
          if (pendingTimeoutRef.current) {
            clearTimeout(pendingTimeoutRef.current);
          }
          
          setValidUsername(wsMessage.username);
          setUsernameStatus('valid');
          setPendingUsername('');
          
          // Show success message for name changes (but use different styling)
          if (wsMessage.username !== validUsername) {
            // We could add a separate success message state, but for now use nameError with different text
            setNameError(`✓ Username changed to "${wsMessage.username}"`);
            setTimeout(() => setNameError(''), 2000);
          }
          
          // Update username if it was different (successful name change)
          if (wsMessage.username !== username) {
            setUsername(wsMessage.username);
            localStorage.setItem('whirledtalk-username', wsMessage.username);
          }
          console.log(`Username "${wsMessage.username}" successfully validated`);
        }
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
  }, [username, pendingUsername]);

  const { isConnected, connectedUsers, sendMessage } = useWebSocket({
    room: params.room,
    username,
    onMessage: handleWebSocketMessage,
    onNameError: (error) => {
      console.log('Name error received:', error);
      setNameError(error);
      setUsernameStatus('rejected');
      setPendingUsername(username);
      
      // Clear pending timeout since we got a definitive response
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
      
      // Auto-clear error after 5 seconds, but keep status as rejected
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

  // Handle username changes with localStorage persistence and validation
  const handleUsernameChange = useCallback((newUsername: string) => {
    // Clear any existing timeout
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
    }
    
    if (newUsername !== validUsername) {
      setUsernameStatus('pending');
      setPendingUsername(newUsername);
      
      // Set timeout to reset to valid state if no response in 5 seconds (shorter timeout)
      pendingTimeoutRef.current = setTimeout(() => {
        setUsernameStatus('valid');
        setValidUsername(newUsername);
        setPendingUsername('');
        console.log('Username validation timeout - assuming valid');
      }, 5000);
    } else {
      // Going back to a known valid username
      setUsernameStatus('valid');
      setPendingUsername('');
    }
    setUsername(newUsername);
    localStorage.setItem('whirledtalk-username', newUsername);
  }, [validUsername]);

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
    // Use valid username for messages when in rejected state
    const messageUsername = usernameStatus === 'rejected' ? validUsername : username;
    
    // Show error flash if trying to send with rejected username
    if (isComplete && usernameStatus === 'rejected') {
      setNameError(`Cannot send message as "${username}" - name is taken. Using "${validUsername}" instead.`);
      setTimeout(() => setNameError(''), 3000);
    }
    
    if (isComplete) {
      // Get the current typing position to maintain it for the completed message
      const currentTyping = typingMessages.get(messageUsername);
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
      
      // Add to local messages immediately with the actual sending username
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(), // Ensure unique ID
        username: messageUsername,
        content,
        room: params.room,
        isTyping: false,
        timestamp: new Date(),
        xPosition: 0,
        yPosition,
        userColor: textColor, // Include current style
        fontSize: fontSize,   // Include current style
        sourceUrl: null,
        sourceLabel: null,
        storyUrl: null,
        storyLabel: null,
      }]);

      // Clear typing indicator
      setTypingMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(messageUsername);
        return newMap;
      });
    } else {
      // Send keystroke event with current Y position for continuity or new optimal position
      const currentTyping = typingMessages.get(messageUsername);
      const yPosition = currentTyping?.yPosition || findOptimalPosition();
      
      sendMessage({
        type: 'keystroke',
        content,
        isTyping: true,
        yPosition,
        userColor: textColor,
        fontSize: fontSize,
      });

      // Update local typing state with message username
      setTypingMessages(prev => {
        const newMap = new Map(prev);
        newMap.set(messageUsername, {
          content,
          yPosition,
          username: messageUsername,
          userColor: textColor,
          fontSize: fontSize,
        });
        return newMap;
      });
    }
  }, [sendMessage, username, validUsername, usernameStatus, params.room, typingMessages, textColor, fontSize, findOptimalPosition]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
    };
  }, []);

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
        usernameStatus={usernameStatus}
        validUsername={validUsername}
      />

      {/* Name Error/Success Indicator */}
      {nameError && (
        <div className={`absolute top-8 left-1/2 transform -translate-x-1/2 backdrop-blur-md px-6 py-4 rounded-xl text-sm border shadow-lg animate-pulse ${
          nameError.startsWith('✓') 
            ? 'bg-green-900/95 border-green-600/50' 
            : 'bg-red-900/95 border-red-600/50'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${
              nameError.startsWith('✓') ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={nameError.startsWith('✓') ? 'text-green-200' : 'text-red-200'}>
              {nameError}
            </span>
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
