interface RoomIndicatorProps {
  room: string;
}

export function RoomIndicator({ room }: RoomIndicatorProps) {
  return (
    <div className="absolute top-4 right-4 z-50 bg-gray-800/90 backdrop-blur-sm px-3 py-2 rounded-full border border-gray-700">
      <span className="text-xs text-gray-300 font-medium">
        <i className="fas fa-hashtag text-indigo-400 mr-1" />
        {room}
      </span>
    </div>
  );
}
