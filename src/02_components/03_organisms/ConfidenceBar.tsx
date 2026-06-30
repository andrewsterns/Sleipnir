import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';

export interface ConfidenceBarProps {
  value: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const getConfidenceColor = (v: number): string => {
  if (v >= 80) return 'var(--scan)';
  if (v >= 50) return 'var(--warn)';
  return 'var(--critical)';
};

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  value,
  label = 'CONFIDENCE LEVEL',
  className,
  style,
}) => {
  const color = getConfidenceColor(value);
  const pct = Math.min(100, Math.max(0, value));

  return (
    <Frame flow="vertical" gap={6} className={className} style={style}>
      <Frame flow="horizontal" justify="between" align="center">
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.10em',
          color: 'var(--text-3)',
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 700,
          color,
          letterSpacing: '0.04em',
        }}>
          {pct.toFixed(1)}%
        </span>
      </Frame>

      {/* Segmented bar */}
      <Frame flow="horizontal" gap={2} w="fill">
        {Array.from({ length: 20 }, (_, i) => {
          const threshold = (i + 1) * 5;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: 4,
                background: pct >= threshold ? color : 'rgba(255,255,255,0.06)',
                transition: 'background 0.3s ease',
              }}
            />
          );
        })}
      </Frame>
    </Frame>
  );
};
