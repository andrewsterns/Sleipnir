import { useState } from 'react'
import './02_components/00_themes/default.css'
import './02_components/00_themes/dark.css'
import './02_components/00_themes/houseplant.css'
import './02_components/00_themes/tactical.css'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import { Frame } from './02_components/01_atoms/Frame/Frame'
import { NavRail, type NavRailItem } from './02_components/03_organisms/NavRail/NavRail'
import { TerminalDock } from './02_components/03_organisms/TerminalDock/TerminalDock'
import DesignLibraryView from './02_components/DesignSystem/DesignLibrary.view'
import { PrototypeList } from './03_prototypes/PrototypeList'
import { PlanningView } from './00_planning/PlanningView'
import { ResearchView } from './01_research/ResearchView'
import { AnalyticsView } from './05_analytics/AnalyticsView'

type WorkspaceMode = 'planning' | 'research' | 'library' | 'tactical' | 'validation' | 'analytics'
export type { Page } from './types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const NAV_ITEMS: NavRailItem[] = [
  { id: 'planning',   tag: '00', title: 'Planning',   icon: 'network' },
  { id: 'research',   tag: '01', title: 'Research',   icon: 'research' },
  { id: 'library',    tag: '02', title: 'Components', icon: 'frame' },
  { id: 'tactical',   tag: '03', title: 'Prototypes', icon: 'player-play' },
  { id: 'validation', tag: '04', title: 'Validation', icon: 'click' },
  { id: 'analytics',  tag: '05', title: 'Analytics',  icon: 'git-merge' },
]

function PlaceholderView({ title }: { title: string }) {
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
    </Frame>
  );
}

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('planning')

  return (
    <ThemeProvider theme="default">
      <Frame
        h="screen"
        flow="horizontal"
        fill={{ solid: 'bg-1' }}
        textColor="var(--text-1)"
        clipContent
      >
        <NavRail
          items={NAV_ITEMS}
          activeId={mode}
          onSelect={(id) => setMode(id as WorkspaceMode)}
        />

        <Frame flow="vertical" grow minW={0} clipContent fill={{ solid: 'bg-1' }}>
          {mode === 'planning' ? (
            <PlanningView />
          ) : mode === 'tactical' ? (
            <PrototypeList onHome={() => setMode('planning')} />
          ) : mode === 'research' ? (
            <ResearchView />
          ) : mode === 'validation' ? (
            <PlaceholderView title="Validation" />
          ) : mode === 'analytics' ? (
            <AnalyticsView />
          ) : (
            <DesignLibraryView />
          )}
        </Frame>
      </Frame>
      <TerminalDock />
    </ThemeProvider>
  )
}

export default App
