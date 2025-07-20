import { useMemo } from 'react';

export function useQueryParams() {
  const params = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      bg: urlParams.get('bg') || 'gray-900',
      color: urlParams.get('color') || 'blue',
      room: urlParams.get('room') || 'global',
      theme: urlParams.get('theme') || 'dark',
      font: urlParams.get('font') || 'inter',
      size: urlParams.get('size') || 'base',
    };
  }, []);

  const getThemeClasses = () => {
    const bgColorMap: Record<string, string> = {
      'orange': 'bg-orange-900',
      'blue': 'bg-blue-900',
      'purple': 'bg-purple-900',
      'emerald': 'bg-emerald-900',
      'red': 'bg-red-900',
      'gray': 'bg-gray-900',
    };

    const textColorMap: Record<string, string> = {
      'orange': 'text-orange-400',
      'blue': 'text-blue-400', 
      'purple': 'text-purple-400',
      'emerald': 'text-emerald-400',
      'red': 'text-red-400',
      'gray': 'text-gray-400',
    };

    return {
      background: bgColorMap[params.bg] || 'bg-gray-900',
      text: textColorMap[params.color] || 'text-blue-400',
      font: params.font === 'mono' ? 'font-mono' : 'font-inter',
      size: `text-${params.size}`,
    };
  };

  return {
    params,
    getThemeClasses,
  };
}
