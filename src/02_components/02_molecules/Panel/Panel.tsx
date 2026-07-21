import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { TacticalPanelProps } from './iPanel';
import { usePanelViewModel } from './PanelViewModel';

export const TacticalPanel = React.forwardRef<HTMLElement, TacticalPanelProps>(({
  chamfer = 8,
  children,
  variant,
  noLines,
  fill,
  stroke,
  effects,
  ...props
}, ref) => {
  const { resolvedFill, resolvedStroke, resolvedEffects } = usePanelViewModel({ variant, noLines, fill, stroke, effects });

  return (
    <Frame
      ref={ref}
      fill={resolvedFill}
      stroke={resolvedStroke}
      chamfer={chamfer}
      effects={resolvedEffects}
      {...props}
    >
      {children}
    </Frame>
  );
});

TacticalPanel.displayName = 'TacticalPanel';

// Named alias for direct import as Panel
export { TacticalPanel as Panel };
export type { TacticalPanelProps as PanelProps } from './iPanel';
