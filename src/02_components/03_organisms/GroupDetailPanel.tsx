import React, { useState } from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from '../02_molecules/Panel';
import { StatusBadge } from '../02_molecules/StatusBadge';
import { FixedWingViewer } from './FixedWingViewer';
import { DataReadout } from '../02_molecules/DataReadout';
import type { UnitDetail } from './UnitDetailPanel';

export interface GroupDetailPanelProps {
  groupName: string;
  units: UnitDetail[];
  onClose: () => void;
  style?: React.CSSProperties;
  className?: string;
}

const TYPE_LABEL: Record<string, string> = {
  'fixed-wing': 'Fixed Wing',
  'ground':     'Ground Unit',
  'drone':      'Drone / UAS',
  'naval':      'Naval Asset',
};

export const GroupDetailPanel: React.FC<GroupDetailPanelProps> = ({
  groupName,
  units,
  onClose,
  style,
  className,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const unit = units[activeIdx];
  if (!unit) return null;

  const isActiveUnit = unit.status === 'tracking' || unit.status === 'operational' || unit.status === 'nominal' || unit.status === 'acquired';

  return (
    <TacticalPanel
      flow="vertical"
      gap={0}
      chamfer={8}
      className={className}
      style={{ width: 240, ...style }}
    >
      {/* Group header */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 10, y: 7 }}
        style={{ borderBottom: '1px solid var(--border-1)' }}
      >
        <Frame flow="horizontal" align="center" gap={7}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--text-3)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}>
            ⧉
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '0.10em',
          }}>
            {groupName}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-3)',
            background: 'rgba(255,255,255,0.06)',
            padding: '1px 5px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {units.length}
          </span>
        </Frame>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </Frame>

      {/* Unit tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-1)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {units.map((u, i) => (
          <button
            key={u.id}
            onClick={() => setActiveIdx(i)}
            style={{
              background: i === activeIdx ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderBottom: i === activeIdx
                ? '1px solid rgba(255,255,255,0.35)'
                : '1px solid transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: i === activeIdx ? 'var(--text-1)' : 'var(--text-3)',
              padding: '5px 10px',
              whiteSpace: 'nowrap',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            {u.callsign}
          </button>
        ))}
      </div>

      {/* Active unit sub-header */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 10, y: 6 }}
        style={{ borderBottom: '1px solid var(--border-1)' }}
      >
        <Frame flow="vertical" gap={1}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-1)',
            letterSpacing: '0.08em',
          }}>
            {unit.callsign}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-3)',
          }}>
            {TYPE_LABEL[unit.type] ?? unit.type}
          </span>
        </Frame>
        <StatusBadge status={unit.status} />
      </Frame>

      {/* 3D viewer */}
      <div style={{ height: 130, position: 'relative', borderBottom: '1px solid var(--border-1)' }}>
        {unit.type === 'fixed-wing' ? (
          <FixedWingViewer
            selected={isActiveUnit}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <Frame style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
              {(TYPE_LABEL[unit.type] ?? unit.type).toUpperCase()} — 3D MODEL
            </span>
          </Frame>
        )}
        <div style={{
          position: 'absolute',
          bottom: 5,
          left: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
        }}>
          ID: {unit.id}
        </div>
      </div>

      {/* Telemetry */}
      <Frame padding={{ x: 10, y: 8 }}>
        <DataReadout data={unit.telemetry} cols={2} gap={10} />
      </Frame>
    </TacticalPanel>
  );
};
