import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';

export type ChipVariant = 'new' | 'default';

const VARIANT_STYLE: Record<ChipVariant, { bg: string; color: string }> = {
  new:     { bg: '#ffffff', color: '#0a0a0a' },
  default: { bg: 'rgba(255,255,255,0.08)', color: 'var(--text-2)' },
};

export interface ChipProps {
  variant?: ChipVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Chip: React.FC<ChipProps> = ({ variant = 'default', children, className, style }) => {
  const cfg = VARIANT_STYLE[variant];

  return (
    <Frame
      chamfer={2}
      className={className}
      // eslint-disable-next-line no-restricted-syntax -- typography (font/letter-spacing/transform) has no Frame prop; same accepted pattern as StatusBadge.
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 5px',
        background: cfg.bg,
        color: cfg.color,
        fontSize: '8px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em',
        fontWeight: 700,
        lineHeight: 1.6,
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </Frame>
  );
};
