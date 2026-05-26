import { useState } from 'react'
import './02_components/00_themes/default.css'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import { Button } from './02_components/02_molecules/Button/Button.tsx'
import { Frame } from './02_components/01_atoms/Frame/Frame'
import { Logo } from './02_components/01_atoms/Logo/Logo'
import { Text } from './02_components/01_atoms/Text/Text.tsx'
import DesignLibraryView from './02_components/DesignSystem/DesignLibrary.view.tsx'
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
            <Text variant="h1" weight="normal" color="text-0" className="font-brand uppercase tracking-[0.02em] leading-none text-[clamp(4rem,10vw,8rem)]">
              Sleipnir
            </Text>
            <Text variant="h4" weight="bold" className="uppercase tracking-[0.08em]">
              Component Library and Prototype Workspace
            </Text>
            <Text variant="p" color="text-2" className="max-w-2xl">
              Choose the DSM library or open the singular prototype lane. Everything stays in the Houseplant visual system and uses the shared primitives.
            </Text>
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
              <Text variant="xs" color="text-2" className="font-mono tracking-[0.18em]">
                {item.tag}
              </Text>
              <Text variant="h4" weight="black" className="uppercase tracking-[0.12em]">
                {item.title}
              </Text>
              <Text variant="small" color="text-2">
                {item.description}
              </Text>
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
    <ThemeProvider theme="default">
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
                    <Text variant="h4" weight="black" color="text-0" className="font-brand uppercase leading-none tracking-[0.04em]">
                      Sleipnir
                    </Text>
                    <Text variant="h6" weight="medium" className="text-[var(--font-small)] uppercase tracking-[0.08em]">
                      {mode === 'prototype' ? 'Prototype' : 'Component Library'}
                    </Text>
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
