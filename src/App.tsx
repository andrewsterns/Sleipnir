import { useState } from 'react'
import './02_components/00_themes/default.css'
import './02_components/00_themes/dark.css'
import './02_components/00_themes/houseplant.css'
import './02_components/00_themes/tactical.css'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import { Frame } from './02_components/01_atoms/Frame/Frame'
import { Logo } from './02_components/01_atoms/Logo/Logo'
import { Icon, type IconName } from './02_components/01_atoms/Icon/Icon'
import { TacticalPanel } from './02_components/02_molecules/Panel/Panel'
import DesignLibraryView from './02_components/DesignSystem/DesignLibrary.view'
import { PrototypeList } from './03_prototypes/PrototypeList'

type WorkspaceMode = 'home' | 'library' | 'tactical' | 'research' | 'validation' | 'analytics'
export type { Page } from './types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function HomeChip({ onHome }: { onHome: () => void }) {
  return (
    <button
      onClick={onHome}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'var(--text-2)',
        fontSize: 9,
        letterSpacing: '0.14em',
        padding: '5px 14px',
        cursor: 'pointer',
        ...MONO,
      }}
    >
      ← HOME
    </button>
  )
}

function RadarDecoration() {
  return (
    <svg width="220" height="220" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.45, flexShrink: 0 }}>
      <circle cx="120" cy="120" r="100" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 7" />
      <circle cx="120" cy="120" r="66" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 6" />
      <circle cx="120" cy="120" r="32" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="3 5" />
      <rect x="108" y="108" width="24" height="24" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
      <path d="M118 108 L122 108" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <path d="M118 132 L122 132" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      {/* Cardinal marks */}
      <path d="M118 18 L122 18 M120 14 L120 22" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <path d="M118 218 L122 218 M120 214 L120 222" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      <path d="M218 118 L218 122 M214 120 L222 120" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <path d="M18 118 L18 122" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      {/* Corner bracket — top right */}
      <path d="M170 26 L188 26 L188 44" stroke="rgba(255,255,255,0.22)" strokeWidth="1" fill="none" />
      {/* Small ticks on outer ring */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = 100;
        const rad = (deg * Math.PI) / 180;
        const x1 = 120 + r * Math.sin(rad);
        const y1 = 120 - r * Math.cos(rad);
        const x2 = 120 + (r - 6) * Math.sin(rad);
        const y2 = 120 - (r - 6) * Math.cos(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />;
      })}
    </svg>
  );
}

function GlobeDecoration() {
  return (
    <svg width="72" height="72" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.55, flexShrink: 0 }}>
      <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <ellipse cx="40" cy="40" rx="34" ry="14" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <ellipse cx="40" cy="40" rx="34" ry="24" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
      <path d="M40 6 Q54 40 40 74" stroke="rgba(255,255,255,0.14)" strokeWidth="1" fill="none" />
      <path d="M40 6 Q26 40 40 74" stroke="rgba(255,255,255,0.14)" strokeWidth="1" fill="none" />
      <line x1="6" y1="40" x2="74" y2="40" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
    </svg>
  );
}

function ActivityBars() {
  const heights = [5, 8, 12, 9, 16, 13, 20, 18, 15, 20, 24, 22, 28, 22, 20, 26, 22, 18, 15, 20, 24, 22, 28, 30, 32, 30, 28, 26, 24, 22];
  const w = heights.length * 7;
  return (
    <svg width="100%" height="36" viewBox={`0 0 ${w} 36`} preserveAspectRatio="none" style={{ opacity: 0.45 }}>
      {heights.map((h, i) => (
        <rect key={i} x={i * 7} y={36 - h} width="4" height={h} fill="rgba(255,255,255,0.5)" />
      ))}
    </svg>
  );
}

const NAV_ITEMS: Array<{ id: Exclude<WorkspaceMode, 'home'>; tag: string; title: string; description: string; icon: IconName }> = [
  {
    id: 'research',
    tag: '01',
    title: 'Research',
    description: 'Intelligence feeds and data source explorer.',
    icon: 'research',
  },
  {
    id: 'library',
    tag: '02',
    title: 'Component DSM',
    description: 'Browse shared Frame, atoms, and molecules library.',
    icon: 'frame',
  },
  {
    id: 'tactical',
    tag: '03',
    title: 'Prototypes',
    description: 'Browse and launch experimental prototypes.',
    icon: 'player-play',
  },
  {
    id: 'validation',
    tag: '04',
    title: 'Validation',
    description: 'Quality checks, test coverage, and regression review.',
    icon: 'click',
  },
  {
    id: 'analytics',
    tag: '05',
    title: 'Analytics',
    description: 'Platform metrics, usage data, and telemetry.',
    icon: 'git-merge',
  },
];

function HomeMenu({ onSelect }: { onSelect: (mode: Exclude<WorkspaceMode, 'home'>) => void }) {
  return (
    <Frame
      theme="tactical"
      h="fill"
      flow="vertical"
      fill={{ solid: 'var(--bg-1)' }}
      style={MONO}
    >
      {/* Top status bar */}
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          PROJECT: EVERYTHING, CONNECTED.
        </span>
        <Frame flow="horizontal" align="center" gap={20}>
          {['USER: ENGINEER', 'WORKSPACE: ORBIT', 'v1.0.0'].map((s) => (
            <span key={s} style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
              {s}
            </span>
          ))}
        </Frame>
      </Frame>

      {/* Main body — hero top, cards+overview anchored to bottom */}
      <Frame flow="vertical" grow padding={{ x: 32, y: 24 }} gap={0}>

        {/* Hero */}
        <Frame flow="horizontal" justify="between" align="center" w="fill">
          <Frame flow="vertical" gap={14}>
            <Logo className="w-[140px] text-[var(--text-1)]" />
            <Frame flow="vertical" gap={4}>
              <span style={{ fontSize: 13, letterSpacing: '0.10em', color: 'var(--text-1)', lineHeight: 1.5, ...MONO }}>
                THE WORKSPACE, UNIFIED.
              </span>
              <span style={{ fontSize: 13, letterSpacing: '0.10em', color: 'var(--text-2)', lineHeight: 1.5, ...MONO }}>
                PLAN. DESIGN. BUILD. SHIP. REPEAT.
              </span>
            </Frame>
          </Frame>

          <RadarDecoration />
        </Frame>

        {/* Cards + overview grow to fill remaining height, children anchored to bottom */}
        <Frame flow="vertical" grow justify="end" gap={14}>

        {/* Nav cards */}
        <Frame flow="grid" cols={5} gap={12} w="fill">
          {NAV_ITEMS.map((item) => (
            <TacticalPanel
              key={item.id}
              as="button"
              variant="default"
              chamfer={6}
              flow="vertical"
              padding={20}
              gap={14}
              align="start"
              cursor="pointer"
              w="fill"
              className="text-left"
              onClick={() => onSelect(item.id)}
            >
              <Frame flow="horizontal" align="center" justify="between" w="fill">
                <span style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--text-2)', ...MONO }}>
                  {item.tag}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>—</span>
              </Frame>

              <span style={{ color: 'var(--text-1)', opacity: 0.75, display: 'flex' }}>
                <Icon name={item.icon} size={38} />
              </span>

              <span style={{ fontSize: 12, letterSpacing: '0.12em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                {item.title.toUpperCase()}
              </span>

              <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.09)' }} />

              <span style={{ fontSize: 10, letterSpacing: '0.07em', color: 'var(--text-2)', lineHeight: 1.65, flexGrow: 1, ...MONO }}>
                {item.description.toUpperCase()}
              </span>

              <Frame flow="horizontal" justify="end" w="fill">
                <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', ...MONO }}>{'>'}_</span>
              </Frame>
            </TacticalPanel>
          ))}
        </Frame>

        {/* System overview */}
        <div style={{ height: 16 }} />
        <TacticalPanel variant="dim" chamfer={6} flow="horizontal" align="center" w="fill" padding={{ x: 24, y: 16 }} gap={0}>
          <Frame flow="horizontal" align="center" gap={20} grow>
            <GlobeDecoration />
            <Frame flow="vertical" gap={5}>
              {[
                ['WORKSPACE', 'ORBIT'],
                ['MODULES', '5'],
                ['COMPONENTS', '24+'],
                ['ACTIVITY', '24H'],
              ].map(([label, value]) => (
                <Frame key={label} flow="horizontal" align="center" gap={10}>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', minWidth: 100, ...MONO }}>
                    {label}:
                  </span>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-1)', ...MONO }}>
                    {value}
                  </span>
                </Frame>
              ))}
            </Frame>
            <Frame grow minW={0} padding={{ left: 20 }}>
              <ActivityBars />
            </Frame>
          </Frame>

          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.07)', margin: '0 28px' }} />

          <Frame flow="vertical" gap={6} minW={210}>
            {['EVERY TOOL.', 'ONE FLOW.', 'ZERO CONTEXT SWITCH.'].map((line) => (
              <span key={line} style={{ fontSize: 12, letterSpacing: '0.10em', color: 'var(--text-1)', lineHeight: 1.5, ...MONO }}>
                {line}
              </span>
            ))}
            <Frame flow="horizontal" justify="end" margin={{ top: 6 }}>
              <span style={{ fontSize: 18, color: 'var(--text-3)', ...MONO }}>+</span>
            </Frame>
          </Frame>
        </TacticalPanel>

        </Frame> {/* end cards+overview anchor */}

      </Frame>
    </Frame>
  );
}

function PlaceholderView({ title, onHome }: { title: string; onHome: () => void }) {
  return (
    <Frame
      theme="tactical"
      h="fill"
      flow="vertical"
      align="center"
      justify="center"
      fill={{ solid: 'var(--bg-1)' }}
      gap={16}
      style={MONO}
    >
      <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-3)', ...MONO }}>
        {title.toUpperCase()} — INITIALIZING...
      </span>
      <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-2)', ...MONO }}>
        MODULE NOT YET DEPLOYED
      </span>
      <div style={{ marginTop: 12 }}>
        <HomeChip onHome={onHome} />
      </div>
    </Frame>
  );
}

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('home')

  return (
    <ThemeProvider theme="default">
      <Frame
        h="screen"
        flow="vertical"
        fill={{ solid: 'bg-1' }}
        textColor="var(--text-1)"
        clipContent
      >
        {mode === 'home' ? (
          <HomeMenu onSelect={setMode} />
        ) : mode === 'tactical' ? (
          <PrototypeList onHome={() => setMode('home')} />
        ) : mode === 'research' ? (
          <PlaceholderView title="Research" onHome={() => setMode('home')} />
        ) : mode === 'validation' ? (
          <PlaceholderView title="Validation" onHome={() => setMode('home')} />
        ) : mode === 'analytics' ? (
          <PlaceholderView title="Analytics" onHome={() => setMode('home')} />
        ) : (
          <>
            <Frame
              as="header"
              h={56}
              flow="horizontal"
              align="center"
              justify="between"
              padding={{ x: 24 }}
              stroke={{ bottom: { color: 'border-1' } }}
              fill={{ solid: 'rgba(255,255,255,0.02)' }}
            >
              <Logo className="w-[110px] text-[var(--text-0)]" />
              <HomeChip onHome={() => setMode('home')} />
            </Frame>

            <Frame as="main" grow clipContent fill={{ solid: 'bg-1' }}>
              <DesignLibraryView />
            </Frame>
          </>
        )}
      </Frame>
    </ThemeProvider>
  )
}

export default App
