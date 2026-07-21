import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';

export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  showValue?: boolean;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color = 'var(--scan)',
  trackColor = 'rgba(255,255,255,0.06)',
  label,
  showValue = false,
  height = 3,
  className,
  style,
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <Frame flow="vertical" gap={4} style={style} className={className}>
      {(label || showValue) && (
        <Frame
          flow="horizontal"
          justify="between"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.06em',
            color: 'var(--text-2)',
          }}
        >
          {label && <span>{label.toUpperCase()}</span>}
          {showValue && <span style={{ color: color }}>{Math.round(pct)}%</span>}
        </Frame>
      )}
      <Frame
        w="fill"
        style={{
          height: `${height}px`,
          background: trackColor,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </Frame>
    </Frame>
  );
};
