import { useEffect, useRef } from 'react';
import type { Message } from '@shared/schema';

interface MessageBubbleProps {
  message: Message;
  isTyping?: boolean;
  className?: string;
  userColor?: string;
  fontSize?: string;
  onExpired?: (message: Message) => void;
}

export function MessageBubble({ message, isTyping = false, className = '', userColor, fontSize, onExpired }: MessageBubbleProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const expiredNotifiedRef = useRef(false);
  const getStableJitterRem = () => {
    const seedBase = isTyping
      ? `${message.username}:${message.room}:typing`
      : `${message.id}:${message.username}:${message.content}`;
    const hash = seedBase.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);
    const normalized = (hash % 1001) / 1000; // 0..1
    return normalized - 0.5; // -0.5rem .. +0.5rem
  };

  useEffect(() => {
    if (elementRef.current) {
      const element = elementRef.current;
      const jitterRem = getStableJitterRem().toFixed(3);
      element.style.top = `calc(${message.yPosition}% + ${jitterRem}rem)`;
      const configuredRight = message.xPosition ?? 0;
      
      // Only start animation for completed messages, not typing ones
      if (!isTyping) {
        // For server relays (negative configured x), ensure the entire bubble starts just off-screen right.
        const measuredWidth = Math.max(1, element.offsetWidth);
        const fullyOffscreenRight = -(measuredWidth + 10);
        const spawnRight = configuredRight < 0
          ? Math.min(configuredRight, fullyOffscreenRight)
          : configuredRight;
        element.style.right = `${spawnRight}px`;
        element.style.left = 'auto';

        // Longer messages should move slower (inverse of previous behavior).
        const contentLength = (message.content || '').length;
        const duration = Math.min(90000, Math.max(12000, 12000 + contentLength * 95));
        
        // Animate to the left
        const animation = element.animate([
          { transform: 'translateX(0)' },
          { transform: 'translateX(calc(-100vw - 100%))' }
        ], {
          duration,
          easing: 'linear',
          fill: 'forwards'
        });

        animation.onfinish = () => {
          if (!expiredNotifiedRef.current) {
            expiredNotifiedRef.current = true;
            onExpired?.(message);
          }
        };

        // Clean up animation on unmount
        return () => {
          animation.cancel();
        };
      } else {
        // For typing messages, position at right edge without animation
        element.style.right = `${configuredRight}px`;
        element.style.left = 'auto';
        element.style.transform = 'translateX(0)';
      }
    }
  }, [message.yPosition, message.xPosition, message.content, message.id, message.username, message.room, isTyping, onExpired]);

  const getUserColor = (username: string, customColor?: string) => {
    if (customColor) {
      const colorMap: Record<string, string> = {
        'blue': 'text-blue-400 bg-blue-900/70 border-blue-600/50',
        'emerald': 'text-emerald-400 bg-emerald-900/70 border-emerald-600/50',
        'purple': 'text-purple-400 bg-purple-900/70 border-purple-600/50',
        'orange': 'text-orange-400 bg-orange-900/70 border-orange-600/50',
        'cyan': 'text-cyan-400 bg-cyan-900/70 border-cyan-600/50',
        'pink': 'text-pink-400 bg-pink-900/70 border-pink-600/50',
      };
      return colorMap[customColor] || colorMap['blue'];
    }

    const colors = [
      'text-blue-400 bg-blue-900/70 border-blue-600/50',
      'text-emerald-400 bg-emerald-900/70 border-emerald-600/50',
      'text-purple-400 bg-purple-900/70 border-purple-600/50',
      'text-orange-400 bg-orange-900/70 border-orange-600/50',
      'text-cyan-400 bg-cyan-900/70 border-cyan-600/50',
      'text-pink-400 bg-pink-900/70 border-pink-600/50',
    ];
    
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getSizeClass = (size?: string) => {
    const sizeMap: Record<string, string> = {
      'sm': 'text-xs',
      'base': 'text-sm', 
      'lg': 'text-base',
    };
    return sizeMap[size || 'base'] || 'text-sm';
  };

  return (
    <div
      ref={elementRef}
      className={`absolute whitespace-nowrap ${className}`}
      style={{ zIndex: 10 }}
    >
      <div className={`inline-flex items-baseline gap-2 backdrop-blur-sm px-4 py-2 rounded-full border ${getUserColor(message.username, userColor)}`}>
        <span className={`font-medium ${getSizeClass(fontSize)}`}>
          {message.username}
        </span>
        {message.storyUrl && !isTyping ? (
          <a
            href={message.storyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-mono underline decoration-dotted ${getSizeClass(fontSize)}`}
          >
            {message.content}
          </a>
        ) : (
          <span className={`font-mono ${getSizeClass(fontSize)}`}>
            {message.content}
          </span>
        )}
        {message.sourceUrl && message.sourceLabel && !isTyping && (
          <a
            href={message.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={
              message.sourceLabel === 'HN'
                ? 'ml-1 inline-flex items-center rounded-full border border-slate-300/30 bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-200 no-underline transition-colors hover:border-slate-200/50 hover:bg-slate-700/80 hover:text-white'
                : `ml-1 inline-flex items-center rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold no-underline opacity-85 hover:opacity-100`
            }
            aria-label={`Source: ${message.sourceLabel}`}
          >
            {message.sourceLabel}
          </a>
        )}
        {isTyping && (
          <span className="animate-pulse">|</span>
        )}
      </div>
    </div>
  );
}
