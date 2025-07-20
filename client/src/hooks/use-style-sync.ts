import { useEffect, useCallback } from 'react';

interface StyleSyncData {
  username: string;
  textColor: string;
  fontSize: string;
  timestamp: number;
}

interface UseStyleSyncProps {
  username: string;
  textColor: string;
  fontSize: string;
  onTextColorChange: (color: string) => void;
  onFontSizeChange: (size: string) => void;
}

export function useStyleSync({
  username,
  textColor,
  fontSize,
  onTextColorChange,
  onFontSizeChange,
}: UseStyleSyncProps) {
  const channelName = `whirledtalk-styles-${username}`;
  
  // Broadcast style changes to other tabs with the same username
  const broadcastStyleChange = useCallback((newTextColor: string, newFontSize: string) => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel(channelName);
        const data: StyleSyncData = {
          username,
          textColor: newTextColor,
          fontSize: newFontSize,
          timestamp: Date.now(),
        };
        channel.postMessage(data);
        channel.close();
      } catch (error) {
        console.warn('Failed to broadcast style change:', error);
      }
    }
  }, [username, channelName]);

  // Listen for style changes from other tabs
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }

    let channel: BroadcastChannel;
    
    try {
      channel = new BroadcastChannel(channelName);
      
      const handleMessage = (event: MessageEvent<StyleSyncData>) => {
        const data = event.data;
        
        // Only apply changes from the same username
        if (data.username === username) {
          // Apply received style changes
          if (data.textColor !== textColor) {
            onTextColorChange(data.textColor);
          }
          if (data.fontSize !== fontSize) {
            onFontSizeChange(data.fontSize);
          }
        }
      };

      channel.addEventListener('message', handleMessage);
      
      return () => {
        channel.removeEventListener('message', handleMessage);
        channel.close();
      };
    } catch (error) {
      console.warn('Failed to set up BroadcastChannel:', error);
    }
  }, [username, textColor, fontSize, onTextColorChange, onFontSizeChange, channelName]);

  return { broadcastStyleChange };
}