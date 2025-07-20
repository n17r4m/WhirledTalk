import { useState, useRef, useEffect } from 'react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

interface CustomizationBarProps {
  username: string;
  onUsernameChange: (username: string) => void;
  onSendKeystroke: (content: string, isComplete: boolean) => void;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
}

export function CustomizationBar({
  username,
  onUsernameChange,
  onSendKeystroke,
  fontSize,
  onFontSizeChange,
  textColor,
  onTextColorChange,
}: CustomizationBarProps) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lastKeystroke, setLastKeystroke] = useState(Date.now());
  const [lastMessageLength, setLastMessageLength] = useState(0);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout>();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Clear idle timeout when manually completing
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      
      // Complete the message and start a new one
      if (currentMessage.trim()) {
        onSendKeystroke(currentMessage, true);
        setCurrentMessage('');
        setLastMessageLength(0);
      }
    }
    // Remove all other keystroke handling from here to avoid duplicates
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const now = Date.now();
    
    // Anti-spam protection: detect large paste operations
    const lengthDiff = Math.abs(value.length - lastMessageLength);
    const timeDiff = now - lastKeystroke;
    
    // If more than 10 characters added in less than 100ms, likely a paste - limit it
    if (lengthDiff > 10 && timeDiff < 100) {
      // Allow paste but limit to reasonable increments
      const maxIncrement = Math.min(lengthDiff, 3);
      const limitedValue = value.length > currentMessage.length 
        ? currentMessage + value.slice(currentMessage.length, currentMessage.length + maxIncrement)
        : value;
      setCurrentMessage(limitedValue);
      onSendKeystroke(limitedValue, false);
    } else {
      setCurrentMessage(value);
      // Only send keystroke if the content actually changed
      if (value !== currentMessage) {
        onSendKeystroke(value, false);
      }
    }
    
    setLastKeystroke(now);
    setLastMessageLength(value.length);
    
    // Clear existing idle timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    // Set new idle timeout - auto-complete message after 10 seconds of inactivity
    if (value.trim()) {
      idleTimeoutRef.current = setTimeout(() => {
        if (currentMessage.trim()) {
          onSendKeystroke(currentMessage, true);
          setCurrentMessage('');
        }
      }, 10000); // 10 seconds of idle time
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const newMessage = currentMessage + emojiData.emoji;
    setCurrentMessage(newMessage);
    setLastMessageLength(newMessage.length);
    setLastKeystroke(Date.now());
    onSendKeystroke(newMessage, false);
    setShowEmojiPicker(false);
    
    // Reset idle timeout for emoji insertion
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    if (newMessage.trim()) {
      idleTimeoutRef.current = setTimeout(() => {
        if (currentMessage.trim()) {
          onSendKeystroke(currentMessage, true);
          setCurrentMessage('');
        }
      }, 10000);
    }
  };

  const colorOptions = [
    { name: 'blue', class: 'bg-blue-500' },
    { name: 'emerald', class: 'bg-emerald-500' },
    { name: 'purple', class: 'bg-purple-500' },
    { name: 'orange', class: 'bg-orange-500' },
    { name: 'pink', class: 'bg-pink-500' },
    { name: 'cyan', class: 'bg-cyan-500' },
  ];

  // Close emoji picker when clicking outside
  const handleClickOutside = (e: React.MouseEvent) => {
    if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
      setShowEmojiPicker(false);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      className="bg-gray-800 border-t border-gray-700 px-4 py-3 relative"
      onClick={handleClickOutside}
    >
      <div className="flex items-center justify-between gap-4">
        {/* User Input Section */}
        <div className="flex-1 flex items-center gap-3">
          {/* Username Input */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium">Name:</label>
            <input
              type="text"
              placeholder="Your name"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-24"
            />
          </div>

          {/* Message Input */}
          <div className="flex-1 relative">
            <div className="relative flex">
              <input
                type="text"
                placeholder="Type to chat... (auto-completes after 10s idle)"
                value={currentMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 pr-20 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-300 transition-colors"
                  type="button"
                >
                  😊
                </button>
                <div className="text-xs text-gray-500">
                  {currentMessage.trim() ? '10s' : '⏎'}
                </div>
              </div>
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div 
                ref={emojiPickerRef}
                className="absolute bottom-full right-0 mb-2 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  width={300}
                  height={400}
                  theme="dark"
                  previewConfig={{ showPreview: false }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Customization Controls */}
        <div className="flex items-center gap-3">
          {/* Font Size */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium">Size:</label>
            <select
              value={fontSize}
              onChange={(e) => onFontSizeChange(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="sm">Small</option>
              <option value="base">Normal</option>
              <option value="lg">Large</option>
            </select>
          </div>

          {/* Text Color */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 font-medium">Color:</label>
            <div className="flex gap-1">
              {colorOptions.map((color) => (
                <button
                  key={color.name}
                  onClick={() => onTextColorChange(color.name)}
                  className={`w-4 h-4 rounded-full border border-gray-600 hover:scale-110 transition-transform ${color.class} ${
                    textColor === color.name ? 'ring-2 ring-white' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Settings */}
          <button 
            onClick={() => setShowEmojiPicker(false)}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors border border-gray-600"
          >
            <i className="fas fa-cog text-gray-400 text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
