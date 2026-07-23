import React from 'react';
import type { UnitType } from '../UnitMarker/iUnitMarker';

// Small unit type glyph inside the marker — exported for reuse in sidebar cards
export const UnitGlyph: React.FC<{ unitType: UnitType; color: string; size: number }> = ({ unitType, color, size }) => {
  const s = size * 0.36;
  if (unitType === 'fixed-wing') {
    return (
      <svg width={s} height={s} viewBox="0 0 10 10" fill="none">
        <path d="M5 1 L5 9 M2 5 L8 5 M3 7 L7 7" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (unitType === 'ground') {
    return (
      <svg width={s} height={s} viewBox="0 0 10 10" fill="none">
        <rect x="2" y="3" width="6" height="4" stroke={color} strokeWidth="1.2" />
        <circle cx="3.5" cy="8" r="1" fill={color} />
        <circle cx="6.5" cy="8" r="1" fill={color} />
      </svg>
    );
  }
  if (unitType === 'drone') {
    return (
      <svg width={s} height={s} viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="1.5" stroke={color} strokeWidth="1.2" />
        <line x1="5" y1="1" x2="5" y2="3" stroke={color} strokeWidth="1" />
        <line x1="5" y1="7" x2="5" y2="9" stroke={color} strokeWidth="1" />
        <line x1="1" y1="5" x2="3" y2="5" stroke={color} strokeWidth="1" />
        <line x1="7" y1="5" x2="9" y2="5" stroke={color} strokeWidth="1" />
      </svg>
    );
  }
  return null;
};
