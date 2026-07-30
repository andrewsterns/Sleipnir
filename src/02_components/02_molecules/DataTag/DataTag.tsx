import React from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';

export interface DataTagProps {
  label: string;
  value: string | number;
  unit?: string;
  valueColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const DataTag: React.FC<DataTagProps> = ({
  label,
  value,
  unit,
  valueColor = 'var(--text-1)',
  className,
  style,
}) => {
  return (
    <Frame
      flow="vertical"
      gap={2}
      style={style}
      className={className}
    >
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
        fontSize: '13px',
        fontWeight: 600,
        color: valueColor,
        letterSpacing: '0.04em',
        lineHeight: 1,
      }}>
        {value}
        {unit && (
          <span style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>
        )}
      </span>
    </Frame>
  );
};
