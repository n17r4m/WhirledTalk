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
  usernameStatus?: 'valid' | 'pending' | 'rejected';
  validUsername?: string;
}

export function CustomizationBar({
  username,
  onUsernameChange,
  onSendKeystroke,
  fontSize,
  onFontSizeChange,
  textColor,
  onTextColorChange,
  usernameStatus = 'valid',
  validUsername,
}: CustomizationBarProps) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lastKeystroke, setLastKeystroke] = useState(Date.now());
  const [lastMessageLength, setLastMessageLength] = useState(0);
  const [pasteAttempts, setPasteAttempts] = useState<number[]>([]);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Block paste shortcuts completely
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      return;
    }
    
    // Block other potentially spammy shortcuts
    if ((e.ctrlKey || e.metaKey) && ['a', 'x', 'c'].includes(e.key.toLowerCase())) {
      // Allow these but track them
      const now = Date.now();
      if (now - lastKeystroke < 100) {
        e.preventDefault();
        return;
      }
    }
    
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
        setPasteAttempts([]); // Reset paste tracking
      }
    }
  };

  // Enhanced spam detection
  const detectSpam = (value: string, now: number): boolean => {
    const lengthDiff = Math.abs(value.length - lastMessageLength);
    const timeDiff = now - lastKeystroke;
    
    // Clean up old paste attempts (older than 10 seconds)
    const recentPastes = pasteAttempts.filter(timestamp => now - timestamp < 10000);
    setPasteAttempts(recentPastes);
    
    // Detect rapid paste: more than 5 chars in less than 50ms
    const isRapidPaste = lengthDiff > 5 && timeDiff < 50;
    
    // Detect burst pasting: more than 3 paste attempts in 10 seconds
    const isBurstPasting = recentPastes.length >= 3;
    
    // Detect excessive length change
    const isExcessiveLength = lengthDiff > 50;
    
    if (isRapidPaste || isBurstPasting || isExcessiveLength) {
      if (isRapidPaste) {
        setPasteAttempts(prev => [...prev, now]);
      }
      return true;
    }
    
    return false;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const now = Date.now();
    
    // Enhanced anti-spam protection
    if (detectSpam(value, now)) {
      // Reject the change completely for spam
      e.preventDefault();
      return;
    }
    
    // Rate limiting: don't allow changes faster than 30ms
    const timeDiff = now - lastKeystroke;
    if (timeDiff < 30) {
      return;
    }
    
    // Content length limiting
    if (value.length > 200) {
      const truncatedValue = value.substring(0, 200);
      setCurrentMessage(truncatedValue);
      onSendKeystroke(truncatedValue, false);
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
    
    // Set new idle timeout - auto-complete message after 15 seconds of inactivity
    if (value.trim()) {
      idleTimeoutRef.current = setTimeout(() => {
        if (currentMessage.trim()) {
          onSendKeystroke(currentMessage, true);
          setCurrentMessage('');
        }
      }, 15000); // 15 seconds of idle time
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
      }, 15000);
    }
  };

  const colorOptions = [
    { name: 'blue', class: 'bg-blue-500' },
    { name: 'emerald', class: 'bg-emerald-500' },
    { name: 'purple', class: 'bg-purple-500' },
    { name: 'orange', class: 'bg-orange-500' },
    { name: 'cyan', class: 'bg-cyan-500' },
    { name: 'pink', class: 'bg-pink-500' },
  ];

  // Close emoji picker when clicking outside
  const handleClickOutside = (e: React.MouseEvent) => {
    if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
      setShowEmojiPicker(false);
    }
  };

  // Cleanup timeout on unmount and initialize UI state from localStorage
  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  // Ensure UI reflects current selections on mount
  useEffect(() => {
    // Force UI update to reflect current color selection
    const colorButton = document.querySelector(`[data-color="${textColor}"]`);
    if (colorButton) {
      // Add visual feedback that this color is selected
      document.querySelectorAll('[data-color]').forEach(btn => btn.classList.remove('ring-2', 'ring-white'));
      colorButton.classList.add('ring-2', 'ring-white');
    }

    // Force UI update to reflect current font size selection
    const sizeButton = document.querySelector(`[data-size="${fontSize}"]`);
    if (sizeButton) {
      // Add visual feedback that this size is selected
      document.querySelectorAll('[data-size]').forEach(btn => btn.classList.remove('bg-indigo-600'));
      sizeButton.classList.add('bg-indigo-600');
    }
  }, [textColor, fontSize]);

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
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                className={`bg-gray-700 text-white px-3 py-1 rounded text-sm border focus:outline-none w-16 ${
                  usernameStatus === 'valid' ? 'border-gray-600 focus:border-blue-500' :
                  usernameStatus === 'pending' ? 'border-yellow-500 focus:border-yellow-400' :
                  'border-red-500 focus:border-red-400'
                }`}
                placeholder="Enter name..."
              />
              {/* Status indicator */}
              {usernameStatus === 'pending' && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                </div>
              )}
              {usernameStatus === 'rejected' && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                </div>
              )}
              {usernameStatus === 'valid' && username !== validUsername && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              )}
            </div>
            {/* Status text */}
            {usernameStatus === 'rejected' && validUsername && (
              <span className="text-xs text-red-400">
                Using: {validUsername}
              </span>
            )}
          </div>

          {/* Message Input */}
          <div className="flex-1 relative">
            <div className="relative flex">
              <input
                ref={inputRef}
                type="text"
                placeholder="Type to chat..."
                value={currentMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  // Block all paste operations
                  e.preventDefault();
                }}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 pr-20 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="emoji-button p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-gray-300 transition-colors"
                  type="button"
                >
                  😊
                </button>
                <div className="text-xs text-gray-500">
                  {currentMessage.trim() ? '15s' : '⏎'}
                </div>
              </div>
            </div>
            
            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div 
                ref={emojiPickerRef}
                className="emoji-picker absolute bottom-full right-0 mb-2 z-50"
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
                  className={`color-button w-4 h-4 rounded-full border border-gray-600 hover:scale-110 transition-transform ${color.class} ${
                    textColor === color.name ? 'ring-2 ring-white' : ''
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Settings */}
          <button 
            onClick={() => setShowEmojiPicker(false)}
            className="settings-button p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors border border-gray-600"
          >
            <i className="fas fa-cog text-gray-400 text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
