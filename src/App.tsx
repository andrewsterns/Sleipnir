import { useState } from 'react'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import './02_components/00_themes/houseplant.css'
import { Button } from './02_components/01_atoms/Button/Button'
import { Frame } from './02_components/01_atoms/Frame/Frame'
import { Logo } from './02_components/01_atoms/Logo/Logo'
import { Typography } from './02_components/01_atoms/Typography/Typography'
import DesignLibraryView from './02_components/DesignLibrary.view.tsx'
import SingularPrototypeView from './03_prototypes/SingularPrototype.view.tsx'

type WorkspaceMode = 'home' | 'prototype' | 'library'
export type { Page } from './types'

function HomeMenu({ onSelect }: { onSelect: (mode: Exclude<WorkspaceMode, 'home'>) => void }) {
  const menuItems = [
    {
      id: 'library' as const,
      title: 'Component DSM',
      description: 'Browse the shared Frame, atoms, and molecules library in a neutral catalog surface.',
      tag: '01'
    },
    {
      id: 'prototype' as const,
      title: 'Prototype',
      description: 'Open the single tactical prototype lane tuned to the reference layout.',
      tag: '02'
    }
  ]

  return (
    <Frame
      layout="flex"
      direction="column"
      justify="center"
      align="center"
      height="100%"
      padding={32}
    >
      <Frame layout="flex" direction="column" gap={28} width="100%" maxWidth={1120}>
        <Frame layout="flex" direction="column" gap={18}>
          <Logo className="w-[180px] text-[var(--text-0)]" />
          <Frame layout="flex" direction="column" gap={10} maxWidth={760}>
            <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
              Sleipnir
            </Typography>
            <Typography variant="h2" weight="black" className="uppercase tracking-[0.08em]">
              Component Library and Prototype Workspace
            </Typography>
            <Typography variant="p" color="text-2" className="max-w-2xl">
              Choose the DSM library or open the singular prototype lane. Everything stays in the Houseplant visual system and uses the shared primitives.
            </Typography>
          </Frame>
        </Frame>

        <Frame layout="grid" className="grid gap-4 md:grid-cols-2">
          {menuItems.map((item) => (
            <Frame
              key={item.id}
              as="button"
              variant="surface"
              onClick={() => onSelect(item.id)}
              padding={24}
              layout="flex"
              direction="column"
              align="start"
              gap={14}
              className="text-left transition-transform hover:-translate-y-0.5"
            >
              <Typography variant="xs" color="text-2" className="font-mono tracking-[0.18em]">
                {item.tag}
              </Typography>
              <Typography variant="h4" weight="black" className="uppercase tracking-[0.12em]">
                {item.title}
              </Typography>
              <Typography variant="small" color="text-2">
                {item.description}
              </Typography>
            </Frame>
          ))}
        </Frame>
      </Frame>
    </Frame>
  )
}

function App() {
  const [mode, setMode] = useState<WorkspaceMode>('home')

  return (
    <ThemeProvider theme="houseplant">
      <Frame
        height="100vh"
        layout="flex"
        direction="column"
        background="var(--bg-1)"
        className="text-[var(--text-1)]"
        clipContent
      >
        {mode === 'home' ? (
          <HomeMenu onSelect={setMode} />
        ) : (
          <>
            <Frame
              as="header"
              height={72}
              layout="flex"
              align="center"
              justify="between"
              padding={{ x: 24 }}
              border={{ bottom: { width: '1px', color: 'var(--border-1)' } }}
              background="rgba(255,255,255,0.02)"
            >
              <Button variant="ghost" onClick={() => setMode('home')} className="px-0">
                <Frame layout="flex" align="center" gap={12}>
                  <Logo className="w-[120px] text-[var(--text-0)]" />
                  <Frame layout="flex" direction="column" align="start">
                    <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
                      Sleipnir DSM
                    </Typography>
                    <Typography variant="h6" weight="bold" className="uppercase tracking-[0.12em]">
                      {mode === 'prototype' ? 'Prototype' : 'Component Library'}
                    </Typography>
                  </Frame>
                </Frame>
              </Button>

              <Button variant="outline" size="sm" onClick={() => setMode('home')}>
                Home Menu
              </Button>
            </Frame>

            <Frame as="main" flexGrow={1} clipContent background="var(--bg-1)">
              {mode === 'prototype' ? <SingularPrototypeView /> : <DesignLibraryView />}
            </Frame>
          </>
        )}
      </Frame>
    </ThemeProvider>
  )
}

export default App
