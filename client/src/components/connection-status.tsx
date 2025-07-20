interface ConnectionStatusProps {
  isConnected: boolean;
  connectedUsers: number;
}

export function ConnectionStatus({ isConnected, connectedUsers }: ConnectionStatusProps) {
  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-gray-800/90 backdrop-blur-sm px-3 py-2 rounded-full border border-gray-700">
      <div 
        className={`w-2 h-2 rounded-full ${
          isConnected 
            ? 'bg-emerald-500 animate-pulse' 
            : 'bg-red-500'
        }`}
      />
      <span className="text-xs text-gray-300 font-medium">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
      <span className="text-xs text-gray-500">
        {connectedUsers} online
      </span>
    </div>
  );
}
