import { Button } from '../02_molecules/Button/Button'
import { Text } from '../01_atoms/Text/Text'
import { Frame as AtomFrame } from '../01_atoms/Frame/Frame'
import { Icon } from '../01_atoms/Icon/Icon'
import { Tooltip } from '../02_molecules/Tooltip/Tooltip'
import { MenuCard } from '../02_molecules/MenuCard/MenuCard.view'
import { Dropdown } from '../02_molecules/Dropdown/Dropdown.view'
import { ListItem } from '../02_molecules/ListItem/ListItem'
import { Logo } from '../01_atoms/Logo/Logo'
import React from 'react'

// ─── Preview map ─────────────────────────────────────────────────────────────

export const componentPreviewMap: Record<string, React.ReactNode> = {
  Frame: (
    <AtomFrame
      flow="horizontal"
      gap={10}
      padding={20}
      fill={{ solid: 'bg-2' }}
      stroke={{ color: 'border-1' }}
      radius="var(--radius-3)"
    >
      <AtomFrame size={36} radius="var(--radius-2)" fill={{ solid: 'primary-3' }} />
      <AtomFrame flow="vertical" gap={6}>
        <AtomFrame w={80} h={10} radius={4} fill={{ solid: 'text-2' }} opacity={0.4} />
        <AtomFrame w={56} h={8}  radius={4} fill={{ solid: 'text-3' }} opacity={0.3} />
      </AtomFrame>
    </AtomFrame>
  ),
  Icon: (
    <AtomFrame flow="horizontal" gap={16} align="center">
      <Icon name="frame" />
      <Icon name="click" />
      <Icon name="git-merge" />
      <Icon name="network" />
    </AtomFrame>
  ),
  Logo: <Logo />,
  Text: (
    <AtomFrame flow="vertical" gap={8} align="start">
      <Text variant="h3" weight="black" color="text-0">Display Heading</Text>
      <Text variant="p" color="text-2">Body text — regular weight, relaxed leading.</Text>
      <Text variant="xs" transform="uppercase" tracking="widest" color="text-3">Label / Tag</Text>
    </AtomFrame>
  ),
  Button: (
    <AtomFrame flow="horizontal" gap={12} align="center">
      <Button variant="primary"  size="md">Primary</Button>
      <Button variant="outline"  size="md">Outline</Button>
      <Button variant="ghost"    size="md">Ghost</Button>
    </AtomFrame>
  ),
  Tooltip: (
    <Tooltip content={<span>Helpful context here</span>}>
      <Button variant="outline" size="sm">Hover me</Button>
    </Tooltip>
  ),
  MenuCard: (
    <AtomFrame flow="horizontal" gap={12}>
      <MenuCard title="Option A" onClick={() => {}} subtitle="Primary" variant="primary" />
      <MenuCard title="Option B" onClick={() => {}} subtitle="Surface" variant="surface" />
    </AtomFrame>
  ),
  Dropdown: (
    <Dropdown
      options={[
        { label: 'One',   value: '1' },
        { label: 'Two',   value: '2' },
        { label: 'Three', value: '3' },
      ]}
      value="1"
      onChange={() => {}}
      label="Select"
    />
  ),
  ListItem: (
    <AtomFrame w={220} flow="vertical">
      <ListItem id="1" title="Active item"  subtitle="Selected state" isActive onClick={() => {}} />
      <ListItem id="2" title="Normal item"  subtitle="Default state"           onClick={() => {}} />
    </AtomFrame>
  ),
  ThemeProvider: (
    <AtomFrame flow="vertical" gap={6} align="start">
      <Text variant="small" color="text-2">Wraps the app, applies CSS vars via</Text>
      <Text variant="small" color="text-1">
        <code>{`className="theme-{name}"`}</code>
      </Text>
    </AtomFrame>
  ),
}

export function getComponentPreview(name: string): React.ReactNode {
  return componentPreviewMap[name] ?? (
    <Text variant="small" color="text-2">No preview available</Text>
  )
}

// ─── Curated code snippets ────────────────────────────────────────────────────

const componentCodeMap: Record<string, string> = {
  Frame: `// Vertical stack
<Frame
  flow="vertical"
  gap={16}
  padding={24}
  fill={{ solid: 'bg-2' }}
  stroke={{ color: 'border-1' }}
  radius="var(--radius-3)"
>
  {children}
</Frame>

// Grid layout
<Frame
  flow="grid"
  cols="260px 1fr"
  h="fill"
  w="fill"
/>

// Glass panel
<Frame
  flow="vertical"
  gap={12}
  padding={20}
  radius="var(--radius-3)"
  stroke={{ color: 'rgba(255,255,255,0.1)' }}
  effects={{
    glass: { blur: 16, tint: 'rgba(255,255,255,0.06)' },
    noise: { opacity: 0.05 },
  }}
/>

// Drop-shadow card
<Frame
  flow="vertical"
  gap={12}
  padding={20}
  fill={{ solid: 'bg-2' }}
  radius="var(--radius-2)"
  effects={{
    'drop-shadow': { y: 8, blur: 24, color: 'rgba(0,0,0,0.35)' },
  }}
/>

// Absolute overlay
<Frame
  absolute
  inset
  fill={{ solid: 'rgba(0,0,0,0.5)' }}
  effects={{ 'background-blur': 4 }}
/>`,

  Text: `// Headings
<Text variant="h1" weight="black" color="text-0">
  Display
</Text>
<Text variant="h4" weight="bold" transform="uppercase" tracking="wide">
  Section heading
</Text>

// Body
<Text variant="p" color="text-2" leading="relaxed">
  Paragraph body text.
</Text>

// Label / tag
<Text variant="xs" transform="uppercase" tracking="widest" color="text-3">
  Label
</Text>`,

  Button: `// Usage
<Button variant="primary" size="md">Label</Button>
<Button variant="outline" size="sm">Outline</Button>
<Button variant="ghost" isLoading>Loading…</Button>

// Internal Frame
<Frame
  as="button"
  layout="inline-flex"
  flow="horizontal"
  align="center"
  justify="center"
  radius="var(--radius-3)"
  padding={{ x: '1rem', y: '0.5rem' }}
  transition="all"
  activeScale={0.98}
  focusRing
>
  <Text variant="p" weight="medium" italic transform="uppercase" tracking="tight">
    {children}
  </Text>
</Frame>`,

  ListItem: `// Usage
<ListItem
  id="item-1"
  title="List Item"
  subtitle="Supporting text"
  isActive={false}
  onClick={(id) => handleSelect(id)}
/>

// Internal Frame
<Frame as="li" w="fill">
  <Frame
    as="button"
    w="fill"
    flow="vertical"
    align="start"
    gap={3}
    padding={{ x: 12, y: 10 }}
    radius="var(--radius-1)"
    fill={{ solid: isActive ? 'primary-3' : 'transparent' }}
    hoverFill="primary"
    transition="colors"
  >
    <Text variant="xs" weight="bold" transform="uppercase" tracking="wide">
      {title}
    </Text>
  </Frame>
</Frame>`,

  Icon: `// Available names
type IconName =
  | 'frame' | 'click' | 'git-merge' | 'network'
  | 'research' | 'player-play' | 'arrow-left'
  | 'cursor' | 'wire' | 'x' | 'align-*'

// Usage
<Icon name="frame" />
<Icon name="click" size={20} />`,

  Logo: `<Logo />
<Logo className="w-[180px] text-[var(--text-0)]" />`,

  Tooltip: `// Usage
<Tooltip content={<span>Helpful info</span>}>
  <Button size="sm">Hover me</Button>
</Tooltip>

// Internal Frame (tooltip panel)
<Frame
  absolute
  y="100%"
  x={0}
  margin={{ top: 6 }}
  padding={{ x: 8, y: 6 }}
  fill={{ solid: 'bg-2' }}
  stroke={{ color: 'border-1' }}
  radius="var(--radius-2)"
  z={100}
>
  {content}
</Frame>`,

  MenuCard: `// Usage
<MenuCard
  title="Option"
  subtitle="Description"
  variant="primary"
  onClick={handler}
/>

// Internal Frame
<Frame
  as="button"
  variant="primary"
  flow="vertical"
  align="center"
  justify="center"
  gap={16}
  padding={{ x: 40, y: 48 }}
  radius="var(--radius-1)"
  activeScale={0.98}
  transition="all"
>
  <Text variant="h4" weight="black" italic transform="uppercase" tracking="tight">
    {title}
  </Text>
</Frame>`,

  Dropdown: `// Usage
<Dropdown
  label="Select option"
  options={[
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
  ]}
  value="a"
  onChange={(val) => setState(val)}
/>

// Internal trigger Frame
<Frame
  as="button"
  flow="horizontal"
  align="center"
  justify="between"
  padding={{ x: 12, y: 8 }}
  variant="surface"
  radius="var(--radius-1)"
  w="fill"
  activeScale={0.98}
  effects={{
    'drop-shadow': { x: 4, y: 4, blur: 0, color: 'var(--primary-3)' },
  }}
>
  <span>{selectedLabel}</span>
  <span>▼</span>
</Frame>`,

  ThemeProvider: `// Wrap the app root
<ThemeProvider theme="default">
  <App />
</ThemeProvider>

// Available tokens (from .theme-{name} CSS class)
--bg-1 / --bg-2 / --bg-3
--text-0 / --text-1 / --text-2 / --text-3
--primary-1…7   --secondary-1…7
--accent-1…7    --border-1 / --border-2
--radius-1…4    --shadow-1

// Frame variant prop maps to these automatically
<Frame variant="surface" />   // bg-2 + border-1
<Frame variant="primary" />   // primary-1 bg
<Frame variant="accent"  />   // accent-1 bg`,
}

export function getComponentCode(name: string): string {
  return componentCodeMap[name] ?? '// No example available'
}

// ─── Component metadata ───────────────────────────────────────────────────────

export interface ComponentMeta {
  name: string
  path: string
  type: 'theme' | 'atom' | 'molecule'
}

export const componentsList: ComponentMeta[] = [
  { name: 'ThemeProvider', path: '../00_themes/ThemeProvider',            type: 'theme'    },
  { name: 'Frame',         path: '../01_atoms/Frame/Frame',               type: 'atom'     },
  { name: 'Icon',          path: '../01_atoms/Icon/Icon',                 type: 'atom'     },
  { name: 'Logo',          path: '../01_atoms/Logo/Logo',                 type: 'atom'     },
  { name: 'Text',          path: '../01_atoms/Text/Text',                 type: 'atom'     },
  { name: 'Tooltip',       path: '../02_molecules/Tooltip/Tooltip',       type: 'molecule' },
  { name: 'MenuCard',      path: '../02_molecules/MenuCard/MenuCard.view',type: 'molecule' },
  { name: 'Dropdown',      path: '../02_molecules/Dropdown/Dropdown.view',type: 'molecule' },
  { name: 'Button',        path: '../02_molecules/Button/Button',         type: 'molecule' },
  { name: 'ListItem',      path: '../02_molecules/ListItem/ListItem',     type: 'molecule' },
]

export function getComponentNamesByType(type: ComponentMeta['type']): string[] {
  return componentsList.filter(c => c.type === type).map(c => c.name)
}

export function getComponentMetaByName(name: string): ComponentMeta | undefined {
  return componentsList.find(c => c.name === name)
}
