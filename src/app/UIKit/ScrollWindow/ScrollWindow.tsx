import React from 'react';
import { Frame } from '../Frame/Frame';
import { ScrollWindowProps } from './iScrollWindow';
import { useScrollWindowViewModel } from './ScrollWindowViewModel';

export const ScrollWindow = React.forwardRef<HTMLElement, ScrollWindowProps>(({
  axis = 'y',
  fade = true,
  fadeSize = 24,
  hideScrollbar = true,
  children,
  style,
  className,
  ...props
}, ref) => {
  const { resolvedStyle, resolvedClassName } = useScrollWindowViewModel({
    axis, fade, fadeSize, hideScrollbar, style, className,
  });

  return (
    <Frame
      ref={ref}
      scroll={axis}
      style={resolvedStyle}
      className={resolvedClassName}
      {...props}
    >
      {children}
    </Frame>
  );
});

ScrollWindow.displayName = 'ScrollWindow';

export type { ScrollWindowProps } from './iScrollWindow';
