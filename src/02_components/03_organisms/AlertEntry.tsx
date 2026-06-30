import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';

export type AlertPriority = 'low' | 'med' | 'high';

export interface AlertEntryProps {
  timestamp: string;
  source?: string;
  message: string;
  priority?: AlertPriority;
  className?: string;
  style?: React.CSSProperties;
}

const PRIORITY_COLOR: Record<AlertPriority, string> = {
  low:  'var(--nominal)',
  med:  'var(--warn)',
  high: 'var(--critical)',
};

export const AlertEntry: React.FC<AlertEntryProps> = ({
  timestamp,
  source,
  message,
  priority = 'low',
  className,
  style,
}) => {
  const accent = PRIORITY_COLOR[priority];

  return (
    <Frame
      flow="horizontal"
      gap={8}
      padding={{ x: 8, y: 5 }}
      style={{
        borderLeft: `2px solid ${accent}`,
        background: 'rgba(255,255,255,0.02)',
        ...style,
      }}
      className={className}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '8px',
        color: 'var(--text-3)',
        whiteSpace: 'nowrap',
        lineHeight: '14px',
        flexShrink: 0,
      }}>
        {timestamp}
      </span>
      <Frame flow="vertical" gap={2} grow>
        {source && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            color: accent,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            {source}
          </span>
        )}
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          color: 'var(--text-2)',
          lineHeight: '14px',
        }}>
          {message}
        </span>
      </Frame>
    </Frame>
  );
};
