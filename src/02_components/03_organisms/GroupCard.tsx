import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from '../02_molecules/Panel/Panel';
import type { TacticalVariant } from '../02_molecules/Panel/iPanel';
import { BadgeStatus } from '../02_molecules/StatusBadge/StatusBadge';
import { UnitGlyph } from '../01_atoms/UnitGlyph/UnitGlyph';
import type { UnitType } from '../01_atoms/UnitMarker/iUnitMarker';

export interface UnitTypeRow {
  name: string;
  unitType?: UnitType;
  count: number;
  active?: number;
  units?: { id: string; callsign?: string }[];
}

export interface GroupCardProps {
  name: string;
  tag?: string;
  status: BadgeStatus;
  unitTypes?: UnitTypeRow[];
  selected?: boolean;
  onClick?: () => void;
  onSelectUnit?: (id: string) => void;
  activeUnits?: number;
  totalUnits?: number;
  readiness?: number;
  isHostile?: boolean;
  /** Card appearance — defaults to 'ghost' (transparent overlay). Use 'default' for opaque standalone card. */
  variant?: TacticalVariant;
  /** Corner chamfer size. Default 0 for list use, set higher for standalone card. */
  chamfer?: number;
  className?: string;
  style?: React.CSSProperties;
}

const GroupIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="4.5" cy="4.5" r="2.8" stroke="currentColor" strokeWidth="1" />
    <circle cx="8.5" cy="4.5" r="2.8" stroke="currentColor" strokeWidth="1" />
    <circle cx="6.5" cy="8.5" r="2.8" stroke="currentColor" strokeWidth="1" />
  </svg>
);

export const GroupCard: React.FC<GroupCardProps> = ({
  name,
  tag,
  status,
  unitTypes,
  selected = false,
  onClick,
  onSelectUnit,
  activeUnits = 0,
  totalUnits = 4,
  isHostile = false,
  variant,
  chamfer = 0,
  className,
  style,
}) => {
  const rows = unitTypes ?? [{ name: 'UNITS', count: totalUnits, active: activeUnits }];
  const isCritical = status === 'critical';
  const isWarning  = status === 'warning' || status === 'damage';
  const headerColor = isHostile
    ? (selected ? '#ff6666' : '#cc2222')
    : (isCritical ? '#ffffff' : isWarning ? '#b8ccd8' : '#dce8f0');
  const unitColor = isHostile ? '#aa3333' : 'var(--text-1)';

  // Selection upgrades the card variant: ghost → dim when selected
  const resolvedVariant: TacticalVariant = variant ?? (selected ? 'dim' : 'ghost');

  return (
    <TacticalPanel
      flow="vertical"
      variant={resolvedVariant}
      chamfer={chamfer}
      onClick={onClick}
      className={className}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        padding: '8px 6px',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {/* Group name header */}
      <Frame flow="horizontal" align="center" gap={6} style={{ marginBottom: 8 }}>
        <span style={{ color: headerColor, opacity: selected ? 0.7 : 0.35, display: 'flex' }}>
          <GroupIcon />
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: headerColor,
          opacity: selected ? 1 : 0.85,
        }}>
          {name}
        </span>
        {tag && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
          }}>
            {tag}
          </span>
        )}
      </Frame>

      {/* Individual unit rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 4 }}>
        {rows.flatMap((row) =>
          (row.units ?? []).map((unit) => {
            const selectable = !!onSelectUnit;
            return (
              <div
                key={unit.id}
                onClick={selectable ? (e) => { e.stopPropagation(); onSelectUnit!(unit.id); } : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 6px',
                  cursor: selectable ? 'pointer' : 'default',
                  borderLeft: '1px solid transparent',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
                onMouseEnter={selectable ? e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(220,232,240,0.06)';
                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'rgba(255,255,255,0.22)';
                } : undefined}
                onMouseLeave={selectable ? e => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent';
                } : undefined}
              >
                {row.unitType && (
                  <span style={{ display: 'flex', flexShrink: 0 }}>
                    <UnitGlyph unitType={row.unitType} color={isHostile ? '#882222' : 'var(--text-2)'} size={20} />
                  </span>
                )}
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: unitColor,
                }}>
                  {unit.callsign ?? unit.id}
                </span>
              </div>
            );
          })
        )}
      </div>
    </TacticalPanel>
  );
};

// Keep old name as alias for backwards compat
export { GroupCard as UnitGroupCard };
export type { GroupCardProps as UnitGroupCardProps };
