import { useEffect, useRef } from 'react';
import type { Message } from '@shared/schema';

interface MessageBubbleProps {
  message: Message;
  isTyping?: boolean;
  className?: string;
}

export function MessageBubble({ message, isTyping = false, className = '' }: MessageBubbleProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (elementRef.current) {
      // Set initial position and start animation
      const element = elementRef.current;
      element.style.top = `${message.yPosition}%`;
      element.style.right = '0px'; // Start from right edge
      element.style.left = 'auto';
      
      // Animate to the left
      const animation = element.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(calc(-100vw - 100%))' }
      ], {
        duration: 20000, // 20 seconds to cross screen - slower for better readability
        easing: 'linear',
        fill: 'forwards'
      });

      // Clean up animation on unmount
      return () => {
        animation.cancel();
      };
    }
  }, [message.yPosition, message.content]);

  const getUserColor = (username: string) => {
    const colors = [
      'text-indigo-400 bg-indigo-900/70 border-indigo-600/50',
      'text-emerald-400 bg-emerald-900/70 border-emerald-600/50',
      'text-purple-400 bg-purple-900/70 border-purple-600/50',
      'text-orange-400 bg-orange-900/70 border-orange-600/50',
      'text-cyan-400 bg-cyan-900/70 border-cyan-600/50',
      'text-pink-400 bg-pink-900/70 border-pink-600/50',
    ];
    
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div
      ref={elementRef}
      className={`absolute whitespace-nowrap ${className}`}
      style={{ zIndex: 10 }}
    >
      <div className={`inline-flex items-baseline gap-2 backdrop-blur-sm px-4 py-2 rounded-full border ${getUserColor(message.username)}`}>
        <span className="font-medium text-sm">
          {message.username}
        </span>
        <span className="font-mono">
          {message.content}
        </span>
        {isTyping && (
          <span className="animate-pulse">|</span>
        )}
      </div>
    </div>
  );
}
