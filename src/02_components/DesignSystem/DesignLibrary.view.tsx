import { useState } from 'react'
import { Button } from '../02_molecules/Button/Button'
import { Dropdown } from '../02_molecules/Dropdown/Dropdown.view'
import { Frame } from '../01_atoms/Frame/Frame'
import { Text } from '../01_atoms/Text/Text'
import { Counter } from '../02_molecules/Counter/Counter.view'
import { ActiveCodePanel } from './ActiveCodePanel'
import { COMPONENT_LIBRARY, MOCK_CODE_MAP } from './constants'

const COMPONENT_OPTIONS = COMPONENT_LIBRARY.map((component) => ({
  value: component.value,
  label: component.label,
}))

export default function DesignLibraryView() {
  const [activeComponent, setActiveComponent] = useState('Button')
  const [hoveredCodeTarget, setHoveredCodeTarget] = useState<string | null>(null)
  const activeCode = MOCK_CODE_MAP[activeComponent] ?? `// No snippet defined for ${activeComponent}`

  const preview = (() => {
    switch (activeComponent) {
      case 'Frame':
        return (
          <Frame layout="grid" className="grid gap-3 md:grid-cols-2">
            <Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
              <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
                Surface
              </Text>
              <Text variant="p">Shared frame container.</Text>
            </Frame>
            <Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
              <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
                Nested Frame
              </Text>
              <Text variant="p">Used for layout stacks and panel composition.</Text>
            </Frame>
          </Frame>
        )
      case 'Button':
        return (
          <Frame layout="flex" wrap="wrap" gap={10}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
          </Frame>
        )
      case 'Dropdown':
        return <Dropdown options={COMPONENT_OPTIONS} value={activeComponent} onChange={setActiveComponent} label="Component" />
      case 'Counter':
        return <Counter initialValue={3} maxWidth={360} />
      case 'Text':
        return (
          <Frame layout="flex" direction="column" gap={10}>
            <Text variant="h2" weight="black">Heading H2</Text>
            <Text variant="h4" weight="bold">Heading H4</Text>
            <Text variant="p">Body copy demonstrates the shared neutral type scale.</Text>
            <Text variant="xs" color="text-2">Utility label text.</Text>
          </Frame>
        )
      case 'Header':
        return (
          <Frame variant="surface" padding={18} layout="flex" align="center" justify="between" gap={12}>
            <Frame layout="flex" direction="column">
              <Text variant="small" color="text-2" transform="uppercase" tracking="widest" className="font-brand">Sleipnir</Text>
              <Text variant="h6" weight="bold" className="uppercase tracking-[0.12em]">Header</Text>
            </Frame>
            <Button variant="outline" size="sm">Action</Button>
          </Frame>
        )
      case 'Footer':
        return (
          <Frame variant="surface" padding={18} layout="flex" align="center" justify="between">
            <Text variant="xs" color="text-2" className="tracking-[0.18em]">STATUS_OK</Text>
            <Text variant="xs" color="text-2" className="tracking-[0.18em]">HOUSEPLANT</Text>
          </Frame>
        )
      default:
        return null
    }
  })()

  return (
    <Frame layout="grid" className="grid h-full w-full min-h-full grid-cols-[260px_1fr]">
      <Frame variant="surface" padding={18} layout="flex" direction="column" gap={14} className="min-h-0 border-r border-[var(--border-1)]">
        <Frame layout="flex" direction="column" gap={6}>
          <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
            Components Only
          </Text>
          <Text variant="h5" weight="black" className="uppercase tracking-[0.12em]">
            Left Rail
          </Text>
        </Frame>

        <Frame layout="flex" direction="column" gap={8} className="overflow-auto pr-1">
          {COMPONENT_LIBRARY.map((component) => (
            <Frame
              key={component.value}
              as="button"
              variant={activeComponent === component.value || hoveredCodeTarget === component.value ? 'secondary' : 'surface'}
              onClick={() => setActiveComponent(component.value)}
              padding={{ x: 14, y: 12 }}
              layout="flex"
              direction="column"
              align="start"
              gap={4}
              className="text-left transition-transform hover:-translate-y-0.5"
            >
              <Text variant="xs" color="text-2" className="tracking-[0.16em]">
                {component.value}
              </Text>
              <Text variant="small" weight="bold" className="uppercase tracking-[0.12em]">
                {component.label}
              </Text>
            </Frame>
          ))}
        </Frame>
      </Frame>

      <Frame layout="flex" direction="column" gap={0} height="100%">
        <Frame backgroundColor='var(--primary-5)' padding={18} layout="flex" direction="column" gap={12} height="100%">
          <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
            Preview
          </Text>
          <Frame
            variant="none"
            padding={16}
            layout="flex"
            align="center"
            justify="center"
            border="none"
            className="h-full"
          >
            {preview}
          </Frame>
        </Frame>

        <Frame backgroundColor='var(--primary-6)' padding={18} layout="flex" direction="column" gap={12} height="100%">
          <Text variant="small" color="text-2" transform="uppercase" tracking="widest">
            Code
          </Text>
          
            <ActiveCodePanel
              code={activeCode}
              onSelectComponent={setActiveComponent}
              onHoverComponent={setHoveredCodeTarget}
            />
        </Frame>
      </Frame>
    </Frame>
  )
}
