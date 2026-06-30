import { useState } from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Text } from '../01_atoms/Text/Text'
import { CodePanel } from './CodePanelView'
import { LeftRailing } from './LeftRailingView'
import { ComponentPreview } from './ComponentPreviewView'
import { getComponentCode } from './DesignLibrary.ViewModel'

export default function DesignLibraryView() {
  const [activeComponent, setActiveComponent] = useState('Frame')
  const [hoveredCodeTarget, setHoveredCodeTarget] = useState<string | null>(null)

  const activeCode = getComponentCode(activeComponent)

  return (
    <Frame layout="grid" cols="260px 1fr" h="fill" w="fill">
      <LeftRailing
        activeComponent={activeComponent}
        hoveredCodeTarget={hoveredCodeTarget}
        onSelectComponent={setActiveComponent}
      />

      <Frame flow="vertical" gap={0} minH={0} h="fill">
        <ComponentPreview
          activeComponent={activeComponent}
          onActiveComponentChange={setActiveComponent}
        />

        {/* Code section — fills remaining height, scrolls internally */}
        <Frame
          flow="vertical"
          gap={0}
          grow
          minH={0}
          fill={{ solid: 'bg-2' }}
        >
          {/* Header bar */}
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 16, y: 10 }}
            stroke={{ bottom: { color: 'border-1' } }}
            fill={{ solid: 'bg-2' }}
          >
            <Text variant="xs" color="text-3" transform="uppercase" tracking="widest">
              {activeComponent}
            </Text>
            <Text variant="xs" color="text-3" transform="uppercase" tracking="widest">
              JSX
            </Text>
          </Frame>

          {/* Scrollable code body */}
          <Frame
            grow
            minH={0}
            padding={20}
            style={{ overflowY: 'auto' }}
          >
            <CodePanel
              code={activeCode}
              onSelectComponent={setActiveComponent}
              onHoverComponent={setHoveredCodeTarget}
            />
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  )
}
