import { useState } from 'react'
import './02_components/00_themes/default.css'
import './02_components/00_themes/dark.css'
import './02_components/00_themes/houseplant.css'
import { ThemeProvider } from './02_components/00_themes/ThemeProvider'
import { Button } from './02_components/02_molecules/Button/Button'
import { Frame } from './02_components/01_atoms/Frame/Frame'
import { Logo } from './02_components/01_atoms/Logo/Logo'
import { Text } from './02_components/01_atoms/Text/Text'
import DesignLibraryView from './02_components/DesignSystem/DesignLibrary.view'
import SingularPrototypeView from './03_prototypes/SingularPrototype.view'

type WorkspaceMode = 'home' | 'prototype' | 'library'
export type { Page } from './types'

function HomeMenu({ onSelect }: { onSelect: (mode: Exclude<WorkspaceMode, 'home'>) => void }) {
  const menuItems = [
    {
      id: 'library' as const,
      title: 'Component DSM',
      description: 'Browse the shared Frame, atoms, and molecules library in a neutral catalog surface.',
      tag: '01',
    },
    {
      id: 'prototype' as const,
      title: 'Prototype',
      description: 'Open the single tactical prototype lane tuned to the reference layout.',
      tag: '02',
    },
  ]

  return (
    <Frame flow="vertical" justify="center" align="center" h="fill" padding={32}>
      <Frame flow="vertical" gap={28} w="fill" maxW={1120}>

        <Frame flow="vertical" gap={18}>
          <Logo className="w-[180px] text-[var(--text-0)]" />
          <Frame flow="vertical" gap={10} maxW={760}>
            <Text
              variant="h1"
              weight="normal"
              color="text-0"
              className="font-brand uppercase tracking-[0.02em] leading-none text-[clamp(4rem,10vw,8rem)]"
            >
              Sleipnir
            </Text>
            <Text variant="h4" weight="bold" className="uppercase tracking-[0.08em]">
              Component Library and Prototype Workspace
            </Text>
            <Text variant="p" color="text-2" style={{ maxWidth: 640 }}>
              Choose the DSM library or open the singular prototype lane. Everything stays
              in the Houseplant visual system and uses the shared primitives.
            </Text>
          </Frame>
        </Frame>

        <Frame flow="grid" cols={2} gap={16}>
          {menuItems.map((item) => (
            <Frame
              key={item.id}
              as="button"
              variant="surface"
              onClick={() => onSelect(item.id)}
              padding={24}
              flow="vertical"
              align="start"
              gap={14}
              transition="all"
              activeScale={0.99}
            >
              <Text variant="xs" color="text-2" className="font-mono tracking-[0.18em]">
                {item.tag}
              </Text>
              <Text variant="h4" weight="light" className="uppercase tracking-[0.12em]">
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
        h="screen"
        flow="vertical"
        fill={{ solid: 'bg-1' }}
        textColor="var(--text-1)"
        clipContent
      >
        {mode === 'home' ? (
          <HomeMenu onSelect={setMode} />
        ) : (
          <>
            <Frame
              as="header"
              h={72}
              flow="horizontal"
              align="center"
              justify="between"
              padding={{ x: 24 }}
              stroke={{ bottom: { color: 'border-1' } }}
              fill={{ solid: 'rgba(255,255,255,0.02)' }}
            >
              <Button variant="ghost" onClick={() => setMode('home')} className="px-0">
                <Frame flow="horizontal" align="center" gap={12}>
                  <Logo className="w-[120px] text-[var(--text-0)]" />
                  <Frame flow="vertical" align="start">
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

            <Frame as="main" grow clipContent fill={{ solid: 'bg-1' }}>
              {mode === 'prototype' ? <SingularPrototypeView /> : <DesignLibraryView />}
            </Frame>
          </>
        )}
      </Frame>
    </ThemeProvider>
  )
}

export default App
