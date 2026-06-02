import { useState, useCallback } from 'react';
import type { FrameProps } from './Frame';

export interface UseFrameViewModelProps {
  onClick?: FrameProps['onClick'];
  onHover?: FrameProps['onHover'];
  onHoverEnd?: FrameProps['onHoverEnd'];
  animate?: FrameProps['animate'];
}

export function useFrameViewModel({
  onClick,
  onHover,
  onHoverEnd,
  animate,
}: UseFrameViewModelProps) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setHovered(true);
    onHover?.(e);
  }, [onHover]);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setHovered(false);
    setActive(false);
    onHoverEnd?.(e);
  }, [onHoverEnd]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setActive(true);
    onClick?.(e);
  }, [onClick]);

  // Animation state could be expanded here
  return {
    hovered,
    active,
    handleMouseEnter,
    handleMouseLeave,
    handleClick,
    animate,
  };
}
