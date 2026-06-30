import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from './Panel';
import type { TacticalVariant } from './Panel';
import { DataTag } from './DataTag';

export interface DataReadoutItem {
  label: string;
  value: string | number;
  unit?: string;
  valueColor?: string;
}

export interface DataReadoutProps {
  data: DataReadoutItem[];
  cols?: number;
  gap?: number;
  /** Wrap in a TacticalPanel card. Pass a variant or just true for 'default'. */
  card?: boolean | TacticalVariant;
  chamfer?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const DataReadout: React.FC<DataReadoutProps> = ({
  data,
  cols = 3,
  gap = 16,
  card,
  chamfer = 8,
  className,
  style,
}) => {
  const grid = (
    <Frame
      flow="grid"
      cols={cols}
      gap={gap}
      className={card ? undefined : className}
      style={card ? undefined : style}
    >
      {data.map((item, i) => (
        <DataTag
          key={i}
          label={item.label}
          value={item.value}
          unit={item.unit}
          valueColor={item.valueColor}
        />
      ))}
    </Frame>
  );

  if (!card) return grid;

  const variant: TacticalVariant = card === true ? 'default' : card;
  return (
    <TacticalPanel
      flow="vertical"
      variant={variant}
      chamfer={chamfer}
      padding={12}
      className={className}
      style={style}
    >
      {grid}
    </TacticalPanel>
  );
};
