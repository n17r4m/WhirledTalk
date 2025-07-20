import { useRef, useEffect } from 'react';
import { MessageBubble } from './message-bubble';
import type { Message } from '@shared/schema';

interface ChatViewportProps {
  messages: Message[];
  typingMessages: Map<string, { content: string; yPosition: number; username: string }>;
}

export function ChatViewport({ messages, typingMessages }: ChatViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to the right when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [messages, typingMessages]);

  return (
    <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Main message container - no scrolling needed, messages animate across */}
      <div className="h-full relative w-full">
        {/* Completed messages */}
        {messages.map((message) => (
          <MessageBubble
            key={`message-${message.id}-${message.timestamp}`}
            message={message}
          />
        ))}
        
        {/* Currently typing messages */}
        {Array.from(typingMessages.entries()).map(([username, data]) => (
          <MessageBubble
            key={`typing-${username}`}
            message={{
              id: -1,
              username: data.username,
              content: data.content,
              room: '',
              isTyping: true,
              timestamp: new Date(),
              xPosition: 0,
              yPosition: data.yPosition,
            }}
            isTyping={true}
          />
        ))}
      </div>

      {/* WhirledTalk branding */}
      <div className="absolute bottom-20 right-4 bg-gray-800/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-gray-400 border border-gray-600/50">
        <i className="fas fa-globe mr-1" />
        WhirledTalk
      </div>
    </div>
  );
}
