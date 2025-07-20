import { useState } from 'react';

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Complete the message and start a new one
      if (currentMessage.trim()) {
        onSendKeystroke(currentMessage, true);
        setCurrentMessage('');
      }
    } else {
      // Send keystroke immediately
      const newContent = currentMessage + e.key;
      setCurrentMessage(newContent);
      onSendKeystroke(newContent, false);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const target = e.target as HTMLInputElement;
      setCurrentMessage(target.value);
      onSendKeystroke(target.value, false);
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

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-4 py-3">
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
            <input
              type="text"
              placeholder="Type to chat... (each keystroke is broadcast live)"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              Press Enter for new message
            </div>
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
          <button className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors border border-gray-600">
            <i className="fas fa-cog text-gray-400 text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
