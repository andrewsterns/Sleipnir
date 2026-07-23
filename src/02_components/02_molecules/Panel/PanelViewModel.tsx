import { FrameProps } from '../../01_atoms/Frame/Frame';
import { TacticalPanelProps, TacticalVariant } from './iPanel';

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

export function usePanelViewModel({
  variant = 'default',
  noLines = false,
  fill,
  stroke,
  effects,
}: TacticalPanelProps) {
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

  return {
    resolvedFill: resolvedFill as FrameProps['fill'],
    resolvedStroke,
    resolvedEffects,
  };
}
