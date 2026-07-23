import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { StatusBadge, BadgeStatus } from '../../02_molecules/StatusBadge/StatusBadge';

export interface ThreatRowProps {
  id: string;
  callsign?: string;
  status: BadgeStatus;
  className?: string;
  style?: React.CSSProperties;
}

const STATUS_COLOR: Record<string, string> = {
  acquired: '#00ff88',
  from:     '#c8ffe0',
  damage:   '#ff6b00',
  critical: '#ff2222',
  warning:  '#ff6b00',
};

// Diamond SVG icon used for hostiles
const DiamondIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
    <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
  </svg>
);

export const ThreatRow: React.FC<ThreatRowProps> = ({
  id,
  callsign,
  status,
  className,
  style,
}) => {
  const color = STATUS_COLOR[status] ?? '#c8ffe0';

  return (
    <Frame
      flow="horizontal"
      align="center"
      gap={6}
      padding={{ x: 6, y: 3 }}
      className={className}
      style={style}
    >
      <DiamondIcon color={color} />
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '9px',
        color: 'var(--text-2)',
        flex: 1,
        letterSpacing: '0.04em',
      }}>
        {callsign ?? id}
      </span>
      <StatusBadge status={status} />
    </Frame>
  );
};
