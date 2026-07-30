import { useEffect } from 'react';
import { UnitAffiliation, UnitMarkerProps } from './iUnitMarker';

// Inject keyframes once
let _pulseInjected = false;
function ensurePulseKeyframes() {
  if (_pulseInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.textContent = `
@keyframes unit-marker-pulse {
  0%   { transform: scale(1);    opacity: 0.6; }
  50%  { transform: scale(1.35); opacity: 0.2; }
  100% { transform: scale(1),    opacity: 0.6; }
}
@keyframes unit-marker-ping {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(1.8); opacity: 0; }
  100% { transform: scale(1.8); opacity: 0; }
}
`;
  document.head.appendChild(el);
  _pulseInjected = true;
}

// Friendly = square upright; Hostile = diamond (square rotated 45°); Unknown = dashed square rotated 45°
const AFFIL_COLOR: Record<UnitAffiliation, string> = {
  friendly: 'var(--scan)',
  hostile:  'var(--critical)',
  unknown:  'var(--text-2)',
};

export function useUnitMarkerViewModel({ affiliation, size = 28 }: UnitMarkerProps) {
  useEffect(() => { ensurePulseKeyframes(); }, []);

  const color = AFFIL_COLOR[affiliation];
  const isHostile  = affiliation === 'hostile';
  const isUnknown  = affiliation === 'unknown';
  const rotate     = isHostile || isUnknown ? 45 : 0;
  const strokeDash = isUnknown ? '2,2' : 'none';

  const innerSize = size * 0.72;
  const offset    = (size - innerSize) / 2;

  return { color, rotate, strokeDash, innerSize, offset };
}
