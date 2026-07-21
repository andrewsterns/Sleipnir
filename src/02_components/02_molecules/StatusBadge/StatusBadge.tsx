import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';

export type BadgeStatus = 'operational' | 'warning' | 'critical' | 'nominal' | 'tracking' | 'acquired' | 'damage' | 'from';

const STATUS_CONFIG: Record<BadgeStatus, { bg: string; color: string }> = {
  operational: { bg: 'rgba(255,255,255,0.08)', color: '#dce8f0' },
  warning:     { bg: 'rgba(255,255,255,0.06)', color: '#b8ccd8' },
  critical:    { bg: 'rgba(255,255,255,0.14)', color: '#ffffff' },
  nominal:     { bg: 'rgba(255,255,255,0.05)', color: '#9ab4c4' },
  tracking:    { bg: 'rgba(255,255,255,0.08)', color: '#c8dce8' },
  acquired:    { bg: 'rgba(255,255,255,0.07)', color: '#dce8f0' },
  damage:      { bg: 'rgba(255,255,255,0.06)', color: '#b8ccd8' },
  from:        { bg: 'rgba(255,255,255,0.04)', color: '#7a92a8' },
};

export interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className, style }) => {
  const cfg = STATUS_CONFIG[status];
  const text = label ?? status.toUpperCase();

  return (
    <Frame
      chamfer={3}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        background: cfg.bg,
        color: cfg.color,
        fontSize: '9px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em',
        fontWeight: 600,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        border: '1px solid rgba(255,255,255,0.10)',
        ...style,
      }}
      className={className}
    >
      {text}
    </Frame>
  );
};
