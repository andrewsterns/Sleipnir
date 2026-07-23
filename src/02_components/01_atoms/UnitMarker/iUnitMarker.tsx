import React from 'react';

export type UnitAffiliation = 'friendly' | 'hostile' | 'unknown';
export type UnitType = 'fixed-wing' | 'ground' | 'drone' | 'naval';

export interface UnitMarkerProps {
  affiliation: UnitAffiliation;
  unitType?: UnitType;
  label?: string;
  callsign?: string;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}
