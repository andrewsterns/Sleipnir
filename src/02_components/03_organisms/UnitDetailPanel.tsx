import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from '../02_molecules/Panel/Panel';
import { StatusBadge, BadgeStatus } from '../02_molecules/StatusBadge/StatusBadge';
import { FixedWingViewer } from './FixedWingViewer';
import { DataReadout, DataReadoutItem } from '../02_molecules/DataReadout/DataReadout';

export type UnitDetailType = 'fixed-wing' | 'ground' | 'drone' | 'naval';

export interface UnitDetail {
  id: string;
  callsign: string;
  type: UnitDetailType;
  status: BadgeStatus;
  telemetry: DataReadoutItem[];
}

export interface UnitDetailPanelProps {
  unit: UnitDetail;
  onClose: () => void;
  style?: React.CSSProperties;
  className?: string;
}

const TYPE_LABEL: Record<UnitDetailType, string> = {
  'fixed-wing': 'Fixed Wing',
  'ground':     'Ground Unit',
  'drone':      'Drone / UAS',
  'naval':      'Naval Asset',
};

export const UnitDetailPanel: React.FC<UnitDetailPanelProps> = ({
  unit,
  onClose,
  style,
  className,
}) => {
  const isTracking = unit.status === 'tracking' || unit.status === 'acquired' || unit.status === 'nominal' || unit.status === 'operational';
  const variant = unit.status === 'critical' ? 'critical'
    : unit.status === 'damage' || unit.status === 'warning' ? 'warning'
    : 'tracking';

  return (
    <TacticalPanel
      flow="vertical"
      gap={0}
      chamfer={8}
      variant={variant}
      className={className}
      style={{ width: 220, ...style }}
    >
      {/* Header */}
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
            letterSpacing: '0.06em',
          }}>
            {TYPE_LABEL[unit.type]}
          </span>
        </Frame>
        <Frame flow="horizontal" align="center" gap={6}>
          <StatusBadge status={unit.status} />
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
      </Frame>

      {/* 3D viewer */}
      <div style={{ height: 150, position: 'relative', borderBottom: '1px solid var(--border-1)' }}>
        {unit.type === 'fixed-wing' && (
          <FixedWingViewer selected={isTracking} style={{ width: '100%', height: '100%' }} />
        )}
        {unit.type !== 'fixed-wing' && (
          <Frame
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
              3D MODEL: {TYPE_LABEL[unit.type].toUpperCase()}
            </span>
          </Frame>
        )}

        {/* ID overlay */}
        <div style={{
          position: 'absolute',
          bottom: 6,
          left: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
        }}>
          ID: {unit.id}
        </div>
      </div>

      {/* Telemetry readout */}
      <Frame padding={{ x: 10, y: 8 }}>
        <DataReadout data={unit.telemetry} cols={2} gap={10} />
      </Frame>
    </TacticalPanel>
  );
};
