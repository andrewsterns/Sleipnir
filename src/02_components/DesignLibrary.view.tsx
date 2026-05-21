import { useState } from 'react'
import { Button } from './01_atoms/Button/Button'
import { Dropdown } from './01_atoms/Dropdown/Dropdown.view'
import { Frame } from './01_atoms/Frame/Frame'
import { Typography } from './01_atoms/Typography/Typography'
import { Counter } from './02_molecules/Counter/Counter.view'
import { COMPONENT_LIBRARY, MOCK_CODE_MAP } from './DesignSystem/constants'

const COMPONENT_OPTIONS = COMPONENT_LIBRARY.map((component) => ({
  value: component.value,
  label: component.label,
}))

export default function DesignLibraryView() {
  const [activeComponent, setActiveComponent] = useState('Button')
  const activeCode = MOCK_CODE_MAP[activeComponent] ?? `// No snippet defined for ${activeComponent}`

  const preview = (() => {
    switch (activeComponent) {
      case 'Frame':
        return (
          <Frame layout="grid" className="grid gap-3 md:grid-cols-2">
            <Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
              <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
                Surface
              </Typography>
              <Typography variant="p">Shared frame container.</Typography>
            </Frame>
            <Frame variant="surface" padding={18} layout="flex" direction="column" gap={8}>
              <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
                Nested Frame
              </Typography>
              <Typography variant="p">Used for layout stacks and panel composition.</Typography>
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
      case 'Typography':
        return (
          <Frame layout="flex" direction="column" gap={10}>
            <Typography variant="h2" weight="black">Heading H2</Typography>
            <Typography variant="h4" weight="bold">Heading H4</Typography>
            <Typography variant="p">Body copy demonstrates the shared neutral type scale.</Typography>
            <Typography variant="xs" color="text-2">Utility label text.</Typography>
          </Frame>
        )
      case 'Header':
        return (
          <Frame variant="surface" padding={18} layout="flex" align="center" justify="between" gap={12}>
            <Frame layout="flex" direction="column">
              <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">Sleipnir</Typography>
              <Typography variant="h6" weight="bold" className="uppercase tracking-[0.12em]">Header</Typography>
            </Frame>
            <Button variant="outline" size="sm">Action</Button>
          </Frame>
        )
      case 'Footer':
        return (
          <Frame variant="surface" padding={18} layout="flex" align="center" justify="between">
            <Typography variant="xs" color="text-2" className="tracking-[0.18em]">STATUS_OK</Typography>
            <Typography variant="xs" color="text-2" className="tracking-[0.18em]">HOUSEPLANT</Typography>
          </Frame>
        )
      default:
        return null
    }
  })()

  return (
    <Frame layout="grid" className="grid min-h-full grid-cols-[260px_1fr] gap-4 p-6 md:p-8">
      <Frame variant="surface" padding={18} layout="flex" direction="column" gap={14} className="min-h-0">
        <Frame layout="flex" direction="column" gap={6}>
          <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
            Components Only
          </Typography>
          <Typography variant="h5" weight="black" className="uppercase tracking-[0.12em]">
            Left Rail
          </Typography>
        </Frame>

        <Frame layout="flex" direction="column" gap={8} className="overflow-auto pr-1">
          {COMPONENT_LIBRARY.map((component) => (
            <Frame
              key={component.value}
              as="button"
              variant={activeComponent === component.value ? 'secondary' : 'surface'}
              onClick={() => setActiveComponent(component.value)}
              padding={{ x: 14, y: 12 }}
              layout="flex"
              direction="column"
              align="start"
              gap={4}
              className="text-left transition-transform hover:-translate-y-0.5"
            >
              <Typography variant="xs" color="text-2" className="tracking-[0.16em]">
                {component.value}
              </Typography>
              <Typography variant="small" weight="bold" className="uppercase tracking-[0.12em]">
                {component.label}
              </Typography>
            </Frame>
          ))}
        </Frame>
      </Frame>

      <Frame layout="flex" direction="column" gap={16} className="min-h-0">
        <Frame variant="surface" padding={18} layout="flex" direction="column" gap={12}>
          <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
            Code Dropdown
          </Typography>
          <Typography variant="h4" weight="black" className="uppercase tracking-[0.12em]">
            {activeComponent}
          </Typography>
          <Dropdown options={COMPONENT_OPTIONS} value={activeComponent} onChange={setActiveComponent} label="Component" />
        </Frame>

        <Frame variant="surface" padding={18} layout="flex" direction="column" gap={12} className="min-h-0">
          <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
            Preview
          </Typography>
          <Frame variant="none" padding={16} border="1px solid var(--border-1)" background="rgba(255,255,255,0.02)">
            {preview}
          </Frame>
        </Frame>

        <Frame variant="surface" padding={18} layout="flex" direction="column" gap={12} className="min-h-0">
          <Typography variant="small" color="text-2" transform="uppercase" tracking="widest">
            Code
          </Typography>
          <Frame variant="none" padding={16} border="1px solid var(--border-1)" background="rgba(0,0,0,0.18)" className="overflow-auto">
            <Typography as="pre" variant="xs" color="text-1" className="whitespace-pre-wrap break-words font-mono normal-case leading-relaxed">
              {activeCode}
            </Typography>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  )
}
