import React from 'react';
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';

export type TacticalVariant = 'default' | 'warning' | 'critical' | 'tracking' | 'dim' | 'ghost';

const STROKE_GRADIENT: Record<TacticalVariant, string> = {
  default:  'var(--stroke-default)',
  warning:  'var(--stroke-warn)',
  critical: 'var(--stroke-critical)',
  tracking: 'var(--stroke-track)',
  dim:      'var(--stroke-dim)',
  ghost:    'var(--stroke-dim)',
};

// bg opacity per variant — ghost/dim are overlay-safe
const FILL_BG: Record<TacticalVariant, string> = {
  default:  'var(--bg-2)',
  warning:  'var(--bg-2)',
  critical: 'var(--bg-2)',
  tracking: 'var(--bg-2)',
  dim:      'rgba(6,14,24,0.35)',
  ghost:    'rgba(4,9,16,0.04)',
};

export interface TacticalPanelProps extends Omit<FrameProps, 'variant'> {
  variant?: TacticalVariant;
  chamfer?: number;
  noLines?: boolean;
}

export const TacticalPanel = React.forwardRef<HTMLElement, TacticalPanelProps>(({
  variant = 'default',
  chamfer = 8,
  noLines = false,
  fill,
  stroke,
  effects,
  children,
  ...props
}, ref) => {
  const bg = FILL_BG[variant];
  const resolvedFill = fill ?? (noLines
    ? [{ solid: bg }]
    : [
        { lines: { angle: 135, spacing: 8, color: 'rgba(255,255,255,0.025)', width: 1 } },
        { solid: bg },
      ]
  );

  const resolvedStroke = stroke ?? { gradient: STROKE_GRADIENT[variant], width: 1 };
  const resolvedEffects = effects ?? { 'background-blur': 6 };

  return (
    <Frame
      ref={ref}
      fill={resolvedFill as FrameProps['fill']}
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
export type { TacticalPanelProps as PanelProps };
