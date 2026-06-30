import React from 'react';
import { cn } from '../../../utils/cn';

export type IconName = 
  | 'click'
  | 'frame'
  | 'research'
  | 'git-merge'
  | 'player-play'
  | 'arrow-left'
  | 'cursor'
  | 'wire'
  | 'x'
  | 'network'
  | 'align-bottom-right'
  | 'align-center-middle'
  | 'align-left-bottom'
  | 'align-left-middle'
  | 'align-left-top'
  | 'align-right-bottom'
  | 'align-right-middle'
  | 'align-right-top'
  | 'align-top-center'
  | 'align-top-left'
  | 'align-top-right';

interface IconProps {
  name: IconName;
  className?: string;
  size?: number | string;
}

export const Icon: React.FC<IconProps> = ({ name, className, size = 24 }) => {
  const getIconContent = () => {
    switch (name) {
      case 'click':
        return <path d="M3 12H6M12 3V6M7.79998 7.8001L5.59998 5.6001M16.2 7.8001L18.4 5.6001M7.79998 16.2L5.59998 18.4M12 12L21 15L17 17L15 21L12 12Z" />;
      case 'frame':
        return <path d="M4 7H20M4 17H20M7 4V20M17 4V20" />;
      case 'research':
        return <path d="M9 3H15M10 9H14M10 9L10.0001 3M10 9L6.00005 20C5.9518 20.0971 5.92675 20.204 5.92688 20.3124C5.92701 20.4208 5.95231 20.5277 6.00078 20.6246C6.04926 20.7216 6.11959 20.806 6.20623 20.8711C6.29287 20.9362 6.39345 20.9804 6.50005 21H17.5001C17.6067 20.9804 17.7072 20.9362 17.7939 20.8711C17.8805 20.806 17.9508 20.7216 17.9993 20.6246C18.0478 20.5277 18.0731 20.4208 18.0732 20.3124C18.0733 20.204 18.0483 20.0971 18.0001 20L14 9M14 9L14.0001 3" />;
      case 'git-merge':
        return <path d="M7 16C7.53043 16 8.03914 16.2107 8.41421 16.5858C8.78929 16.9609 9 17.4696 9 18C9 18.5304 8.78929 19.0391 8.41421 19.4142C8.03914 19.7893 7.53043 20 7 20C6.46957 20 5.96086 19.7893 5.58579 19.4142C5.21071 19.0391 5 18.5304 5 18C5 17.4696 5.21071 16.9609 5.58579 16.5858C5.96086 16.2107 6.46957 16 7 16ZM7 16V8M7 8C6.46957 8 5.96086 7.78929 5.58579 7.41421C5.21071 7.03914 5 6.53043 5 6C5 5.46957 5.21071 4.96086 5.58579 4.58579C5.96086 4.21071 6.46957 4 7 4C7.53043 4 8.03914 4.21071 8.41421 4.58579C8.78929 4.96086 9 5.46957 9 6C9 6.53043 8.78929 7.03914 8.41421 7.41421C8.03914 7.78929 7.53043 8 7 8ZM7 8C7 9.06087 7.42143 10.0783 8.17157 10.8284C8.92172 11.5786 9.93913 12 11 12H15M15 12C15 12.5304 15.2107 13.0391 15.5858 13.4142C15.9609 13.7893 16.4696 14 17 14C17.5304 14 18.0391 13.7893 18.4142 13.4142C18.7893 13.0391 19 12.5304 19 12C19 11.4696 18.7893 10.9609 18.4142 10.5858C18.0391 10.2107 17.5304 10 17 10C16.4696 10 15.9609 10.2107 15.5858 10.5858C15.2107 10.9609 15 11.4696 15 12Z" />;
      case 'arrow-left':
        return <path d="M5 12H19M5 12L9 8M5 12L9 16" />;
      case 'cursor':
        return <path d="M7.904 2.803a.5 .5 0 0 1 .636 .357l3 12a.5 .5 0 0 1 -.47 .634l-2.573 -.11l-1.997 2.808a.5 .5 0 0 1 -.897 -.184l-3 -12a.5 .5 0 0 1 .716 -.583l4.585 2.085z" />;
      case 'wire':
        return <>
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M5 8V10C5 13 12 14 12 16M19 8V10C19 13 12 14 12 16" />
        </>;
      case 'x':
        return <path d="M18 6L6 18M6 6L18 18" />;
      case 'network':
        return <>
          <circle cx="12" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
          <path d="M12 7V14M12 14L5 17M12 14L19 17" />
        </>;
      case 'player-play':
        return <path d="M7 4V20L20 12L7 4Z" />;
      case 'align-bottom-right':
        return <path d="M11 15V17M14 11V17M17 13V17M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-center-middle':
        return <path d="M11 15H13M9 12H15M10 9H14M3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19Z" />;
      case 'align-left-bottom':
        return <path d="M9 17H7M13 14H7M11 11H7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-left-middle':
        return <path d="M9 15H7M13 12H7M11 9H7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-left-top':
        return <path d="M9 13H7M13 10H7M11 7H7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-right-bottom':
        return <path d="M15 17H17M11 14H17M13 11H17M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-right-middle':
        return <path d="M15 15H17M11 12H17M13 9H17M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-right-top':
        return <path d="M15 13H17M11 10H17M13 7H17M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-top-center':
        return <path d="M9 9V7M12 13V7M15 11V7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-top-left':
        return <path d="M7 9V7M10 13V7M13 11V7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      case 'align-top-right':
        return <path d="M11 9V7M14 13V7M17 11V7M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5Z" />;
      default:
        return null;
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block', className)}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {getIconContent()}
    </svg>
  );
};

// ── Unit marker exports (moved from 01_atoms/tactical/UnitMarker) ──────────────

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

// Friendly = square upright; Hostile = diamond (square rotated 45°); Unknown = dashed square rotated 45°
const AFFIL_COLOR: Record<UnitAffiliation, string> = {
  friendly: 'var(--scan)',
  hostile:  'var(--critical)',
  unknown:  'var(--text-2)',
};

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

export const UnitMarker: React.FC<UnitMarkerProps> = ({
  affiliation,
  unitType = 'fixed-wing',
  label,
  callsign,
  selected = false,
  onClick,
  size = 28,
  style,
  className,
}) => {
  React.useEffect(() => { ensurePulseKeyframes(); }, []);

  const color = AFFIL_COLOR[affiliation];
  const isHostile  = affiliation === 'hostile';
  const isUnknown  = affiliation === 'unknown';
  const rotate     = isHostile || isUnknown ? 45 : 0;
  const strokeDash = isUnknown ? '2,2' : 'none';

  const innerSize = size * 0.72;
  const offset    = (size - innerSize) / 2;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        width:  size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      className={className}
    >
      {/* Ping ring on select */}
      {selected && (
        <div style={{
          position: 'absolute',
          inset: -6,
          borderRadius: 0,
          border: `1px solid ${color}`,
          transform: `rotate(${rotate}deg)`,
          animation: 'unit-marker-ping 1.4s ease-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Main marker SVG */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        style={{ display: 'block' }}
      >
        {/* Outer selection highlight */}
        {selected && (
          <rect
            x={offset - 3}
            y={offset - 3}
            width={innerSize + 6}
            height={innerSize + 6}
            stroke={color}
            strokeWidth="0.5"
            strokeOpacity="0.4"
            fill="none"
            transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
          />
        )}

        {/* Background fill */}
        <rect
          x={offset}
          y={offset}
          width={innerSize}
          height={innerSize}
          fill={selected ? `${color}18` : `${color}0d`}
          stroke={color}
          strokeWidth={selected ? 1.5 : 1}
          strokeDasharray={strokeDash}
          transform={`rotate(${rotate} ${size / 2} ${size / 2})`}
        />
      </svg>

      {/* Unit type glyph, centered */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `rotate(${-rotate}deg)`,
      }}>
        <UnitGlyph unitType={unitType} color={color} size={size} />
      </div>

      {/* Label below marker */}
      {(label || callsign) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: 2,
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: color,
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
        }}>
          {callsign ?? label}
        </div>
      )}
    </div>
  );
};
