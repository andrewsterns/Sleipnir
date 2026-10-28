import type React from 'react';
import type { ScrollWindowProps } from './iScrollWindow';

export function useScrollWindowViewModel({
  axis = 'y',
  fade = true,
  fadeSize = 24,
  hideScrollbar = true,
  style,
  className,
}: ScrollWindowProps) {
  const maskAxis = axis === 'x' ? 'to right' : axis === 'both' ? undefined : 'to bottom';

  const fadeMask = fade && maskAxis
    ? `linear-gradient(${maskAxis}, transparent 0, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`
    : undefined;

  const resolvedStyle: React.CSSProperties = {
    ...style,
    ...(fadeMask ? { maskImage: fadeMask, WebkitMaskImage: fadeMask } : null),
  };

  const resolvedClassName = hideScrollbar
    ? [className, 'scroll-window--no-scrollbar'].filter(Boolean).join(' ')
    : className;

  return { resolvedStyle, resolvedClassName };
}
