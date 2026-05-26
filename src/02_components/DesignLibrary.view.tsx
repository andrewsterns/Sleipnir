import { useState } from 'react'
import { Frame } from './01_atoms/Frame/Frame'
import { Text } from './01_atoms/Text/Text'
import { ActiveCodePanel } from './DesignSystem/ActiveCodePanel'
import { LeftRailing } from './DesignSystem/leftRailing'
import { PreviewArea } from './DesignSystem/previewArea'
import { MOCK_CODE_MAP } from './DesignSystem/constants'

export default function DesignLibraryView() {
  const [activeComponent, setActiveComponent] = useState('Button')
  const [hoveredCodeTarget, setHoveredCodeTarget] = useState<string | null>(null)
  const activeCode = MOCK_CODE_MAP[activeComponent] ?? `// No snippet defined for ${activeComponent}`

  return (
    <Frame layout="grid" className="grid h-full w-full min-h-full grid-cols-[260px_1fr]">
      <LeftRailing
        activeComponent={activeComponent}
        hoveredCodeTarget={hoveredCodeTarget}
        onSelectComponent={setActiveComponent}
      />

      <Frame layout="flex" direction="column" gap={0} className="min-h-0">
        <PreviewArea activeComponent={activeComponent} onActiveComponentChange={setActiveComponent} />

        <Frame variant="surface" padding={18} layout="flex" direction="column" gap={12} className="min-h-0 flex-1">
          <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
            Code
          </Text>
          <Frame variant="none" padding={16} border="1px solid var(--border-1)" background="var(--primary-2)" className="overflow-auto">
            <ActiveCodePanel
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
