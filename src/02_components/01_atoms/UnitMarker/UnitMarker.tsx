import React from 'react';
import { UnitMarkerProps } from './iUnitMarker';
import { useUnitMarkerViewModel } from './UnitMarkerViewModel';
import { UnitGlyph } from '../UnitGlyph/UnitGlyph';

export const UnitMarker: React.FC<UnitMarkerProps> = (props) => {
  const {
    unitType = 'fixed-wing',
    label,
    callsign,
    selected = false,
    onClick,
    size = 28,
    style,
    className,
  } = props;

  const { color, rotate, strokeDash, innerSize, offset } = useUnitMarkerViewModel(props);

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
