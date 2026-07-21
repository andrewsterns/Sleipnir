import React, { useState, useMemo } from 'react';
import { Frame } from '../../02_components/01_atoms/Frame/Frame';
import { TacticalPanel } from '../../02_components/02_molecules/Panel/Panel';
import { StatusBadge } from '../../02_components/02_molecules/StatusBadge/StatusBadge';
import { SignalBar } from '../../02_components/02_molecules/SignalBar/SignalBar';
import { GlobeMap } from '../../02_components/03_organisms/GlobeMap';
import type { GlobeUnit } from '../../02_components/03_organisms/GlobeMap';
import { DataReadout } from '../../02_components/02_molecules/DataReadout/DataReadout';
import { NotificationFeed } from '../../02_components/02_molecules/NotificationFeed/NotificationFeed';
import type { Notification } from '../../02_components/02_molecules/NotificationFeed/NotificationFeed';
import { UnitDetailPanel } from '../../02_components/03_organisms/UnitDetailPanel';
import type { UnitDetail } from '../../02_components/03_organisms/UnitDetailPanel';
import { CommandOverlay } from '../../02_components/02_molecules/CommandOverlay';
import type { OverlayMessage } from '../../02_components/02_molecules/CommandOverlay';
import { GroupDetailPanel } from '../../02_components/03_organisms/GroupDetailPanel';
import { StatusPanel } from '../../02_components/03_organisms/StatusPanel';
import { TarsPanel } from '../../02_components/03_organisms/TarsPanel';
import { ThreatAssessmentPanel } from '../../02_components/03_organisms/ThreatAssessmentPanel';
import '../../02_components/00_themes/tactical.css';
import { Button } from '../../02_components/02_molecules/Button/Button';

// ── Unit data ─────────────────────────────────────────────────────────────────

interface MapUnit extends GlobeUnit {
  detail: UnitDetail;
}

const UNITS: MapUnit[] = [
  {
    id: 'blu-1', groupId: 'GROUP-1',
    affiliation: 'friendly', unitType: 'fixed-wing',
    callsign: 'XR-231', lat: 22.0, lon: 72.8,
    detail: {
      id: 'XR-231', callsign: 'XR-231', type: 'fixed-wing', status: 'tracking',
      telemetry: [
        { label: 'ALT',  value: '12,400', unit: 'ft' },
        { label: 'HDG',  value: '247°' },
        { label: 'SPD',  value: '0.62', unit: 'MACH' },
        { label: 'FUEL', value: '61%' },
      ],
    },
  },
  {
    id: 'blu-2', groupId: 'GROUP-1',
    affiliation: 'friendly', unitType: 'drone',
    callsign: 'UAS-4', lat: 15.5, lon: 80.2,
    detail: {
      id: 'UAS-4', callsign: 'UAS-4', type: 'drone', status: 'nominal',
      telemetry: [
        { label: 'ALT',  value: '3,200', unit: 'ft' },
        { label: 'HDG',  value: '112°' },
        { label: 'BAT',  value: '78%' },
        { label: 'LINK', value: 'STRONG' },
      ],
    },
  },
  {
    id: 'blu-3', groupId: 'GROUP-2',
    affiliation: 'friendly', unitType: 'ground',
    callsign: 'GRD-1', lat: 17.2, lon: 83.4,
    detail: {
      id: 'GRD-1', callsign: 'GRD-1', type: 'ground', status: 'warning',
      telemetry: [
        { label: 'POS',  value: 'G7-A3' },
        { label: 'SPD',  value: '28', unit: 'km/h' },
        { label: 'AMMO', value: '32%' },
        { label: 'COMM', value: 'DEGRADED' },
      ],
    },
  },
  {
    id: 'red-1', groupId: 'THREATS',
    affiliation: 'hostile', unitType: 'fixed-wing',
    callsign: 'RED-1', lat: 24.8, lon: 88.0,
    detail: {
      id: 'RED-1', callsign: 'RED-1', type: 'fixed-wing', status: 'critical',
      telemetry: [
        { label: 'ALT',   value: '8,800', unit: 'ft' },
        { label: 'HDG',   value: '198°' },
        { label: 'SPD',   value: '0.81', unit: 'MACH' },
        { label: 'RANGE', value: '23', unit: 'km' },
      ],
    },
  },
  {
    id: 'red-2', groupId: 'THREATS',
    affiliation: 'hostile', unitType: 'ground',
    callsign: 'RED-3', lat: 20.2, lon: 92.5,
    detail: {
      id: 'RED-3', callsign: 'RED-3', type: 'ground', status: 'warning',
      telemetry: [
        { label: 'SPD',   value: '42', unit: 'km/h' },
        { label: 'HDG',   value: '215°' },
        { label: 'RANGE', value: '31', unit: 'km' },
        { label: 'TYPE',  value: 'SAM' },
      ],
    },
  },
  {
    id: 'unk-1', groupId: 'THREATS',
    affiliation: 'unknown', unitType: 'fixed-wing',
    callsign: 'ZJ45', lat: 18.0, lon: 84.2,
    detail: {
      id: 'ZJ45', callsign: 'ZJ45', type: 'fixed-wing', status: 'acquired',
      telemetry: [
        { label: 'ALT',  value: '11,200', unit: 'ft' },
        { label: 'HDG',  value: '263°' },
        { label: 'SPD',  value: '0.74', unit: 'MACH' },
        { label: 'IFF',  value: 'PENDING' },
      ],
    },
  },
  // ── Additional friendlies ────────────────────────────────────────────────────
  {
    id: 'blu-4', groupId: 'GROUP-1',
    affiliation: 'friendly', unitType: 'drone',
    callsign: 'UAS-7', lat: 19.8, lon: 75.5,
    detail: {
      id: 'UAS-7', callsign: 'UAS-7', type: 'drone', status: 'nominal',
      telemetry: [
        { label: 'ALT',  value: '2,800', unit: 'ft' },
        { label: 'HDG',  value: '088°' },
        { label: 'BAT',  value: '54%' },
        { label: 'LINK', value: 'STRONG' },
      ],
    },
  },
  {
    id: 'blu-5', groupId: 'GROUP-2',
    affiliation: 'friendly', unitType: 'fixed-wing',
    callsign: 'XR-447', lat: 12.3, lon: 77.8,
    detail: {
      id: 'XR-447', callsign: 'XR-447', type: 'fixed-wing', status: 'nominal',
      telemetry: [
        { label: 'ALT',  value: '14,200', unit: 'ft' },
        { label: 'HDG',  value: '315°' },
        { label: 'SPD',  value: '0.71', unit: 'MACH' },
        { label: 'FUEL', value: '44%' },
      ],
    },
  },
  {
    id: 'blu-6', groupId: 'GROUP-3',
    affiliation: 'friendly', unitType: 'ground',
    callsign: 'GRD-4', lat: 25.1, lon: 68.2,
    detail: {
      id: 'GRD-4', callsign: 'GRD-4', type: 'ground', status: 'nominal',
      telemetry: [
        { label: 'POS',  value: 'F4-B2' },
        { label: 'SPD',  value: '0', unit: 'km/h' },
        { label: 'AMMO', value: '91%' },
        { label: 'COMM', value: 'NOMINAL' },
      ],
    },
  },
  {
    id: 'blu-7', groupId: 'GROUP-3',
    affiliation: 'friendly', unitType: 'drone',
    callsign: 'UAS-9', lat: 28.4, lon: 70.1,
    detail: {
      id: 'UAS-9', callsign: 'UAS-9', type: 'drone', status: 'nominal',
      telemetry: [
        { label: 'ALT',  value: '1,500', unit: 'ft' },
        { label: 'HDG',  value: '180°' },
        { label: 'BAT',  value: '88%' },
        { label: 'LINK', value: 'STRONG' },
      ],
    },
  },
  {
    id: 'blu-8', groupId: 'GROUP-3',
    affiliation: 'friendly', unitType: 'naval',
    callsign: 'NVL-2', lat: 8.6, lon: 76.4,
    detail: {
      id: 'NVL-2', callsign: 'NVL-2', type: 'naval', status: 'nominal',
      telemetry: [
        { label: 'POS',  value: 'H9-C1' },
        { label: 'SPD',  value: '18', unit: 'kts' },
        { label: 'HDG',  value: '024°' },
        { label: 'COMM', value: 'NOMINAL' },
      ],
    },
  },
  // ── Additional threats ───────────────────────────────────────────────────────
  {
    id: 'red-3', groupId: 'THREATS',
    affiliation: 'hostile', unitType: 'fixed-wing',
    callsign: 'RED-5', lat: 30.2, lon: 95.4,
    detail: {
      id: 'RED-5', callsign: 'RED-5', type: 'fixed-wing', status: 'acquired',
      telemetry: [
        { label: 'ALT',   value: '6,400', unit: 'ft' },
        { label: 'HDG',   value: '271°' },
        { label: 'SPD',   value: '0.77', unit: 'MACH' },
        { label: 'RANGE', value: '48', unit: 'km' },
      ],
    },
  },
  {
    id: 'red-4', groupId: 'THREATS',
    affiliation: 'hostile', unitType: 'ground',
    callsign: 'RED-7', lat: 22.8, lon: 90.3,
    detail: {
      id: 'RED-7', callsign: 'RED-7', type: 'ground', status: 'critical',
      telemetry: [
        { label: 'SPD',   value: '0', unit: 'km/h' },
        { label: 'HDG',   value: '—' },
        { label: 'RANGE', value: '14', unit: 'km' },
        { label: 'TYPE',  value: 'ARTY' },
      ],
    },
  },
  {
    id: 'unk-2', groupId: 'THREATS',
    affiliation: 'unknown', unitType: 'fixed-wing',
    callsign: 'JK-88', lat: 14.5, lon: 86.7,
    detail: {
      id: 'JK-88', callsign: 'JK-88', type: 'fixed-wing', status: 'acquired',
      telemetry: [
        { label: 'ALT',  value: '9,100', unit: 'ft' },
        { label: 'HDG',  value: '330°' },
        { label: 'SPD',  value: '0.68', unit: 'MACH' },
        { label: 'IFF',  value: 'FAIL' },
      ],
    },
  },
  {
    id: 'unk-3', groupId: 'THREATS',
    affiliation: 'unknown', unitType: 'drone',
    callsign: 'Q-22', lat: 21.5, lon: 79.8,
    detail: {
      id: 'Q-22', callsign: 'Q-22', type: 'drone', status: 'warning',
      telemetry: [
        { label: 'ALT',  value: '800', unit: 'ft' },
        { label: 'HDG',  value: '052°' },
        { label: 'SPD',  value: '220', unit: 'km/h' },
        { label: 'IFF',  value: 'UNKNOWN' },
      ],
    },
  },
];

// ── Group definitions ─────────────────────────────────────────────────────────

const GROUPS = [
  {
    name: 'GROUP-1', tag: '0505', status: 'operational' as const,
    activeUnits: 3, totalUnits: 3, readiness: 85,
    unitTypes: [
      { name: 'FIXED_WING', unitType: 'fixed-wing' as const, count: 1, active: 1, units: [{ id: 'blu-1', callsign: 'XR-231' }] },
      { name: 'DRONE',      unitType: 'drone'      as const, count: 2, active: 2, units: [{ id: 'blu-2', callsign: 'UAS-4'  }, { id: 'blu-4', callsign: 'UAS-7' }] },
    ],
  },
  {
    name: 'GROUP-2', tag: '0822', status: 'warning' as const,
    activeUnits: 2, totalUnits: 2, readiness: 58,
    unitTypes: [
      { name: 'GROUND_UNIT', unitType: 'ground'     as const, count: 1, active: 1, units: [{ id: 'blu-3', callsign: 'GRD-1'  }] },
      { name: 'FIXED_WING',  unitType: 'fixed-wing' as const, count: 1, active: 1, units: [{ id: 'blu-5', callsign: 'XR-447' }] },
    ],
  },
  {
    name: 'GROUP-3', tag: '1144', status: 'operational' as const,
    activeUnits: 3, totalUnits: 3, readiness: 92,
    unitTypes: [
      { name: 'GROUND_UNIT', unitType: 'ground' as const, count: 1, active: 1, units: [{ id: 'blu-6', callsign: 'GRD-4' }] },
      { name: 'DRONE',       unitType: 'drone'  as const, count: 1, active: 1, units: [{ id: 'blu-7', callsign: 'UAS-9' }] },
      { name: 'NAVAL',       unitType: 'naval'  as const, count: 1, active: 1, units: [{ id: 'blu-8', callsign: 'NVL-2' }] },
    ],
  },
];

const THREATS_GROUPS = [
  {
    name: 'THREATS', tag: 'HVT', status: 'critical' as const,
    activeUnits: 7, totalUnits: 7,
    unitTypes: [
      { name: 'FIXED_WING', unitType: 'fixed-wing' as const, count: 2, active: 2, units: [{ id: 'red-1', callsign: 'RED-1' }, { id: 'red-3', callsign: 'RED-5' }] },
      { name: 'GROUND',     unitType: 'ground'     as const, count: 2, active: 2, units: [{ id: 'red-2', callsign: 'RED-3' }, { id: 'red-4', callsign: 'RED-7' }] },
      { name: 'UNKNOWN',    unitType: 'fixed-wing' as const, count: 3, active: 3, units: [{ id: 'unk-1', callsign: 'ZJ45' }, { id: 'unk-2', callsign: 'JK-88' }, { id: 'unk-3', callsign: 'Q-22' }] },
    ],
  },
];

const HOSTILES = [
  { id: 'RED-1', callsign: 'RED-1', status: 'acquired' as const },
  { id: 'RED-3', callsign: 'RED-3', status: 'damage'   as const },
  { id: 'RED-5', callsign: 'RED-5', status: 'acquired' as const },
  { id: 'RED-7', callsign: 'RED-7', status: 'critical' as const },
];

// ── Analysis panel data ───────────────────────────────────────────────────────

const TARS_LOGS = [
  { timestamp: '14:02', source: 'MIL-20%', message: 'satellite noise',  priority: 'low'  as const },
  { timestamp: '14:02', source: 'A3/200P', message: 'ACTIVE',           priority: 'med'  as const },
  { timestamp: '14:02', message: 'Track executed arcing maneuvers — UNAUTHORIZED', priority: 'high' as const },
];

const THREAT_ITEMS = [
  { label: 'Source',   value: 'Multiple radar signatures indicate coordinated launch' },
  { label: 'Type',     value: 'Surface-to-Air Missile (SAM)' },
  { label: 'Range',    value: '23–31 km' },
  { label: 'Intent',   value: 'Area Denial / Asset Interdiction' },
  { label: 'Prob Hit', value: '87.3%' },
  { label: 'Action',   value: 'Authorize defensive countermeasures' },
];

const NOTIFICATIONS: Notification[] = [
  { level: 'note',    message: 'Altitude deviation XR-231',          ref: 'T1.3772', age: '12min' },
  { level: 'advise',  message: 'VTS corridor — confirm clearance',   ref: 'R1.3722', age: '21min' },
  { level: 'warning', message: 'SAM radar lock — action required',   ref: 'R2.1132', age: '4min'  },
  { level: 'caution', message: 'ZJ45 arcing — unauthorized vector',  ref: 'T0.9910', age: '2min'  },
  { level: 'iff',     message: 'Recommend identify ZJ45',            ref: 'RED-3'              },
];

const TARS_ALERTS: OverlayMessage[] = [
  {
    id: 'hud-s1', role: 'system', priority: 'critical',
    text: 'ALPHA-3 COMMS LOSS at Grid E7. Last ping 02:14:33Z.',
    ts: new Date(),
    actions: [
      { label: 'DEPLOY RELAY', variant: 'confirm', onClick: () => {} },
      { label: 'DISMISS',      onClick: () => {} },
    ],
  },
  {
    id: 'hud-s2', role: 'system', priority: 'critical',
    text: 'BRAVO-9 engaged hostile force. Ammo at 32%. Reinforcement required.',
    ts: new Date(),
    actions: [
      { label: 'REINFORCE',  variant: 'confirm', onClick: () => {} },
      { label: 'WITHDRAW',   variant: 'danger',  onClick: () => {} },
    ],
  },
  {
    id: 'hud-s3', role: 'system', priority: 'warning',
    text: 'DRONE SWARM SIGMA navigation failure. Drift +1.8km off vector.',
    ts: new Date(),
    actions: [
      { label: 'RECALIBRATE', variant: 'confirm', onClick: () => {} },
      { label: 'ABORT',       variant: 'danger',  onClick: () => {} },
    ],
  },
  {
    id: 'hud-s4', role: 'system', priority: 'suggested',
    text: 'ECHO-7 sector bravo patrol window closing in 12 minutes.',
    ts: new Date(),
  },
];

// ── Top navigation bar ────────────────────────────────────────────────────────

const TopNav: React.FC<{ onHome?: () => void }> = ({ onHome }) => (
  <Frame
  id="top-nav"
    flow="horizontal"
    align="center"
    justify="between"
    padding={{ x: 14, y: 0 }}
    height={136}
    shrink={0}
    fill={{ solid: 'rgba(3,8,14,0.97)' }}
    stroke={{ bottom: { color: 'border-1' } }}
  >
    <Frame flow="horizontal" align="center" gap={16}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '0.10em' }}>
        AGENTRIC WARFARE SYSTEMS
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)' }}>v3.1</span>
    </Frame>
    
    <Frame flow="vertical" align="center" gap={20} height={111} width={222} fill={{solid: 'rgba(14, 224, 95, 0.9)' }} >
      <Frame flow="horizontal" align="center" gap={12}>Hello Mark</Frame>
      <Frame flow="horizontal" align="center" gap={12}>Hello nate</Frame>
      <Frame flow="horizontal" align="center" gap={12}>Hello kenn</Frame>
      </Frame>

    <Frame flow="horizontal" align="center" gap={20}>
      <Button
      onClick={onHome}
      >
        ← HOME
      </Button>
      {['Tracks', 'Resources'].map(label => (
        <span
          key={label}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: 'var(--text-3)',
            letterSpacing: '0.06em', cursor: 'pointer',
          }}
        >
          {label}
        </span>
      ))}
    </Frame>

    <Frame flow="horizontal" align="center" gap={12}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
        UPTIME: 47:10:11
      </span>
      <StatusBadge status="operational" label="ALPHA-1" />
    </Frame>
  </Frame>
);

// ── Bottom bar ────────────────────────────────────────────────────────────────

const BottomBar: React.FC<{
  onCommandPalette: () => void;
  commandPaletteOpen: boolean;
}> = ({ onCommandPalette, commandPaletteOpen }) => (
  <Frame
    flow="horizontal"
    align="center"
    justify="between"
    padding={{ x: 14, y: 0 }}
    h={26}
    shrink={0}
    fill={{ solid: 'rgba(3,8,14,0.98)' }}
    stroke={{ top: { color: 'border-1' } }}
  >
    <Frame flow="horizontal" align="center" gap={12}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
        MISSION TIME: <span style={{ color: 'var(--text-2)' }}>02:13:45</span>
      </span>
      <StatusBadge status="nominal" label="SECURE" />
    </Frame>

    <Frame flow="horizontal" align="center" gap={16}>
      {[{ label: 'SAT', value: '13' }, { label: 'GPS', value: '24' }, { label: 'NET', value: '100%' }].map(({ label, value }) => (
        <span key={label} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
          {label}: <span style={{ color: 'var(--text-2)' }}>{value}</span>
        </span>
      ))}
    </Frame>

    <button
      onClick={onCommandPalette}
      style={{
        background: commandPaletteOpen ? 'rgba(255,255,255,0.06)' : 'none',
        border: commandPaletteOpen ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: commandPaletteOpen ? 'var(--text-1)' : 'var(--text-3)',
        letterSpacing: '0.08em',
        padding: '2px 10px',
      }}
    >
      Command Palette {commandPaletteOpen ? '▲' : '▼'}
    </button>

    <Frame flow="horizontal" align="center" gap={12}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
        FEED: <span style={{ color: 'var(--text-1)' }}>LIVE</span>
      </span>
      <SignalBar value={0.8} segments={5} />
    </Frame>
  </Frame>
);

// ── Predictive trajectory ─────────────────────────────────────────────────────

const PredictiveTrajectoryPanel: React.FC = () => (
  <TacticalPanel flow="vertical" gap={0} chamfer={8} variant="tracking" grow basis={0} minW={180}>
    <Frame padding={{ x: 10, y: 6 }} stroke={{ bottom: { color: 'border-1' } }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.12em', color: 'var(--text-3)' }}>
        ✦ PREDICTIVE TRAJECTORY
      </span>
    </Frame>
    <Frame grow basis={0} relative minH={100}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="traj-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.4)" />
          </linearGradient>
        </defs>
        <path d="M 20 90 Q 80 20 160 60" stroke="url(#traj-grad)" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />
        <circle cx="160" cy="60" r="4" fill="rgba(255,255,255,0.35)" />
        <circle cx="160" cy="60" r="8" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      </svg>
    </Frame>
    <Frame padding={{ x: 10, y: 8 }} stroke={{ top: { color: 'border-1' } }}>
      <DataReadout cols={3} gap={12} data={[
        { label: 'ETA', value: '00:63:31', valueColor: 'var(--critical)' },
        { label: 'ALT', value: '0.3772', unit: 'M' },
        { label: 'VEL', value: '0.62', unit: 'MACH' },
      ]} />
    </Frame>
  </TacticalPanel>
);

// ── Main HUD ──────────────────────────────────────────────────────────────────

export const TacticalHUD: React.FC<{ onHome?: () => void }> = ({ onHome }) => {
  const [selectedUnitId,  setSelectedUnitId]  = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false); // toggles TARS analysis row

  const selectedUnit  = useMemo(() => UNITS.find(u => u.id === selectedUnitId)?.detail ?? null,  [selectedUnitId]);
  const groupUnits    = useMemo(
    () => selectedGroupId ? UNITS.filter(u => u.groupId === selectedGroupId).map(u => u.detail) : [],
    [selectedGroupId],
  );

  const handleSelectUnit = (id: string) => {
    setSelectedUnitId(id);
    setSelectedGroupId(null);
  };

  const handleSelectGroup = (name: string) => {
    setSelectedGroupId(prev => prev === name ? null : name);
    setSelectedUnitId(null);
  };

  const handleCloseDetail = () => {
    setSelectedUnitId(null);
    setSelectedGroupId(null);
  };

  const showRightPanel = !!(selectedUnit || (selectedGroupId && groupUnits.length > 0));

  return (
    <Frame
      theme="tactical"
      flow="vertical"
      w="screen"
      h="screen"
      fill={{ solid: 'bg-1' }}
      textColor="var(--text-1)"
      clipContent
      // eslint-disable-next-line no-restricted-syntax -- inherited font has no Frame prop
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <TopNav onHome={onHome} />

      {/* Main content — vertical column so TARS row can sit below */}
      <Frame flow="vertical" grow minH={0} clipContent>

        {/* Globe area — fills all remaining height; left panel overlays it absolutely */}
        <Frame grow relative fill={{ 'radial-gradient': 'ellipse at 50% 50%, rgba(6,14,28,0.8) 0%, rgba(3,8,14,1) 100%' }}>
          {/* Globe canvas — fills entire area */}
          <GlobeMap
            units={UNITS}
            selectedUnitId={selectedUnitId}
            selectedGroupId={selectedGroupId}
            onSelectUnit={handleSelectUnit}
            style={{ position: 'absolute', inset: 0 }}
          />

          {/* LEFT PANEL — absolute overlay, fully transparent so globe shows through */}
          <Frame
            flow="vertical"
            absolute
            x={0}
            y={0}
            bottom={0}
            w={260}
            z={10}
          >
            {/* Unit list — scrollable, no visible scrollbar */}
            <Frame grow className="no-scrollbar" scroll="y" minH={0}>
              <StatusPanel
                groups={GROUPS}
                threats={THREATS_GROUPS}
                hostiles={HOSTILES}
                sensorCoverage={70}
                threatLevel="critical"
                selectedGroupId={selectedGroupId}
                onSelectGroup={handleSelectGroup}
                onSelectUnit={handleSelectUnit}
              />
            </Frame>

            {/* TARS trigger — opens full-screen command overlay */}
            <CommandOverlay.Root initialMessages={TARS_ALERTS}>
              <CommandOverlay.Trigger style={{ width: '100%' }}>
                <TacticalPanel
                  flow="horizontal"
                  align="center"
                  justify="between"
                  padding={{ x: 14, y: 9 }}
                  variant="ghost"
                  chamfer={6}
                  w="fill"
                  cursor="pointer"
                >
                  <Frame flow="horizontal" align="center" gap={8}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.12em' }}>
                      ✦
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', letterSpacing: '0.08em' }}>
                      TARS
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--critical)', letterSpacing: '0.10em' }}>
                      {TARS_ALERTS.filter(m => m.priority === 'critical').length} CRITICAL
                    </span>
                  </Frame>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)' }}>›</span>
                </TacticalPanel>
              </CommandOverlay.Trigger>
              <CommandOverlay.Portal>
                <CommandOverlay.Backdrop />
                <CommandOverlay.Window>
                  <CommandOverlay.Header />
                  <CommandOverlay.Feed />
                  <CommandOverlay.Input />
                </CommandOverlay.Window>
              </CommandOverlay.Portal>
            </CommandOverlay.Root>
          </Frame>

          {/* Notification feed — upper right */}
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 20, pointerEvents: 'none' }}>
            <NotificationFeed notifications={NOTIFICATIONS} />
          </div>

          {/* Right panel: unit or group detail */}
          {showRightPanel && (
            <div style={{ position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 30 }}>
              {selectedUnit && !selectedGroupId && (
                <UnitDetailPanel unit={selectedUnit} onClose={handleCloseDetail} />
              )}
              {selectedGroupId && groupUnits.length > 0 && (
                <GroupDetailPanel
                  groupName={selectedGroupId}
                  units={groupUnits}
                  onClose={handleCloseDetail}
                />
              )}
            </div>
          )}
        </Frame>

        {/* Bottom analysis panels — toggled by command palette button */}
        {commandPaletteOpen && (
          <Frame
            flow="horizontal"
            gap={8}
            padding={8}
            h={240}
            shrink={0}
            stroke={{ top: { color: 'border-1' } }}
            fill={{ solid: 'rgba(3,8,14,0.05)' }}
          >
            <TarsPanel
              logs={TARS_LOGS}
              asset={{
                callsign: '2116-R2241JFR',
                status: 'TRACKING',
                confidence: 98.7,
                type: 'ISR / TARGETING',
                role: 'XB-231',
              }}
              effDetect={90.7}
              style={{ flex: 1.2 }}
            />
            <PredictiveTrajectoryPanel />
            <ThreatAssessmentPanel
              items={THREAT_ITEMS}
              confidenceValue={90.7}
              impactMode="AT.25"
              style={{ flex: 1.1 }}
            />
          </Frame>
        )}
      </Frame>

      <BottomBar
        onCommandPalette={() => setCommandPaletteOpen(v => !v)}
        commandPaletteOpen={commandPaletteOpen}
      />
    </Frame>
  );
};

export default TacticalHUD;
