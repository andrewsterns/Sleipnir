import { FrameProps } from '../Frame/Frame';

export type TacticalVariant = 'default' | 'warning' | 'critical' | 'tracking' | 'dim' | 'ghost';

export interface TacticalPanelProps extends Omit<FrameProps, 'variant'> {
  variant?: TacticalVariant;
  chamfer?: number;
  noLines?: boolean;
}
