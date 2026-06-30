import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';

export interface SignalBarProps {
  value: number;
  segments?: number;
  color?: string;
  dimColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const SignalBar: React.FC<SignalBarProps> = ({
  value,
  segments = 5,
  color = 'var(--scan)',
  dimColor = 'rgba(255,255,255,0.08)',
  className,
  style,
}) => {
  const active = Math.round(value * segments);

  return (
    <Frame
      flow="horizontal"
      align="end"
      gap={2}
      style={style}
      className={className}
    >
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${6 + i * 3}px`,
            background: i < active ? color : dimColor,
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </Frame>
  );
};
