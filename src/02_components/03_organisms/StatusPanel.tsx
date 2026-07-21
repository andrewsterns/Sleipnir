import React from 'react';
import { Frame } from '../01_atoms/Frame/Frame';
import { StatusBadge } from '../02_molecules/StatusBadge/StatusBadge';
import { ProgressBar } from '../02_molecules/ProgressBar/ProgressBar';
import { GroupCard, GroupCardProps } from './GroupCard';
import { ThreatRow, ThreatRowProps } from './ThreatRow';

export interface StatusPanelProps {
  systemVersion?: string;
  theaterStatus?: 'operational' | 'warning' | 'critical';
  groups: GroupCardProps[];
  threats?: GroupCardProps[];
  sensorCoverage?: number;
  hostiles: ThreatRowProps[];
  threatLevel?: 'low' | 'elevated' | 'critical';
  selectedGroupId?: string | null;
  onSelectGroup?: (name: string) => void;
  onSelectUnit?: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const ThreatLevelIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="9" viewBox="0 0 10 9" fill="none">
    <path d="M5 0L10 9H0L5 0Z" fill={color} />
  </svg>
);

export const StatusPanel: React.FC<StatusPanelProps> = ({
  systemVersion = 'v3.1',
  theaterStatus = 'operational',
  groups,
  threats,
  sensorCoverage = 70,
  hostiles,
  threatLevel = 'critical',
  selectedGroupId,
  onSelectGroup,
  onSelectUnit,
  className,
  style,
}) => {
  const threatColor = threatLevel === 'critical' ? 'var(--critical)'
    : threatLevel === 'elevated' ? 'var(--warn)'
    : 'var(--scan)';

  return (
    <Frame
      flow="vertical"
      gap={10}
      padding={{ x: 10, y: 10 }}
      w={200}
      className={className}
      style={{ background: 'transparent', ...style }}
    >
      {/* Tab cycle header */}
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '7px',
        letterSpacing: '0.14em',
        color: 'var(--text-3)',
        textAlign: 'center',
      }}>
        {'< TAB TO CYCLE >>'}
      </span>

      <div style={{ height: 1, background: 'var(--border-1)' }} />

      {/* System header */}
      <Frame flow="horizontal" justify="between" align="center">
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.12em',
          color: 'var(--text-3)',
        }}>
          AGENTRIC WARFARE SYS {systemVersion}
        </span>
        <StatusBadge status={theaterStatus} label="THEATER STATUS" />
      </Frame>

      <div style={{ height: 1, background: 'var(--border-1)' }} />

      {/* Groups */}
      <Frame flow="vertical" gap={0}>
        {groups.map((g, i) => (
          <GroupCard
            key={i}
            {...g}
            selected={selectedGroupId === g.name}
            onClick={() => onSelectGroup?.(g.name)}
            onSelectUnit={onSelectUnit}
          />
        ))}
      </Frame>

      {/* Threats */}
      {threats && threats.length > 0 && (
        <Frame flow="vertical" gap={0}>
          <div style={{ height: 1, background: 'var(--border-1)' }} />
          {threats.map((g, i) => (
            <GroupCard
              key={i}
              {...g}
              isHostile
              selected={selectedGroupId === g.name}
              onClick={() => onSelectGroup?.(g.name)}
              onSelectUnit={onSelectUnit}
            />
          ))}
        </Frame>
      )}

      <div style={{ height: 1, background: 'var(--border-1)' }} />

      {/* Sensor coverage */}
      <Frame flow="vertical" gap={6}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.10em',
          color: 'var(--text-3)',
        }}>
          SENSOR COVERAGE
        </span>

        <Frame flow="horizontal" align="center" gap={8}>
          {/* Circular indicator */}
          <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="14"
              fill="none"
              stroke="var(--scan)"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 14 * sensorCoverage / 100} ${2 * Math.PI * 14}`}
              strokeLinecap="butt"
              transform="rotate(-90 18 18)"
            />
            <text x="18" y="21" textAnchor="middle" fill="var(--scan)"
              style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {sensorCoverage}%
            </text>
          </svg>

          <Frame flow="vertical" gap={3}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-2)' }}>
              FULL COVERAGE
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: 'var(--text-3)' }}>
              NOMINAL
            </span>
            <ProgressBar value={sensorCoverage} height={2} color="var(--scan)" />
          </Frame>
        </Frame>
      </Frame>

      <div style={{ height: 1, background: 'var(--border-1)' }} />

      {/* Hostiles */}
      <Frame flow="vertical" gap={2}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.10em',
          color: 'var(--text-3)',
          marginBottom: 2,
        }}>
          HOSTILES
        </span>
        {hostiles.map((h, i) => (
          <ThreatRow key={i} {...h} />
        ))}
      </Frame>

      <div style={{ height: 1, background: 'var(--border-1)' }} />

      {/* Threat level */}
      <Frame flow="vertical" gap={6}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.10em',
          color: 'var(--text-3)',
        }}>
          THREAT LEVEL
        </span>
        <Frame flow="horizontal" align="center" gap={4}>
          {[...Array(4)].map((_, i) => (
            <ThreatLevelIcon key={i} color={threatColor} />
          ))}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            fontWeight: 700,
            color: threatColor,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginLeft: 4,
          }}>
            {threatLevel}
          </span>
        </Frame>
      </Frame>
    </Frame>
  );
};

// Keep old name as alias
export { StatusPanel as TheaterStatusPanel };
export type { StatusPanelProps as TheaterStatusPanelProps };
