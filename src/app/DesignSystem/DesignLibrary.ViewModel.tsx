// ── Base imports ──────────────────────────────────────────────────────────────
import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Text  } from '../UIKit/Text/Text'
import { getGraphForMap } from '../../00_planning/graph/combine'
import type { GraphNode } from '../../00_planning/graph/types'
import { AutoPreview } from './AutoPreview'

// ── Molecules ─────────────────────────────────────────────────────────────────
import { Button }           from '../UIKit/Button/Button'
import { TacticalPanel as Panel } from '../UIKit/Panel/Panel'
import { Tabs }           from '../UIKit/Tabs/Tabs'
import { Dropdown }         from '../UIKit/Dropdown/Dropdown'

// ── Theme wrapper ─────────────────────────────────────────────────────────────
// All tactical previews get dark theme + centering
const T: React.FC<{ children: React.ReactNode; row?: boolean; pad?: number }> = ({
  children, row = false, pad = 16,
}) => (
  <div
    className="theme-tactical"
    style={{
      display: 'flex',
      flexDirection: row ? 'row' : 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 8,
      background: 'var(--bg-1)',
      padding: pad,
      width: '100%',
      minHeight: 80,
    }}
  >
    {children}
  </div>
)

// ─── Preview map ──────────────────────────────────────────────────────────────

export const componentPreviewMap: Record<string, React.ReactNode> = {

  // ── Base atoms ─────────────────────────────────────────────────────────────
  // Deliberately shows three Frames side by side with distinct fill/stroke/
  // radius combos — a single plain box (or worse, gray placeholder bars)
  // reads as an unstyled loading skeleton rather than a rendered example.
  Frame: (
    <T row pad={20}>
      <Frame
        w={72} h={72}
        flow="vertical" align="center" justify="center"
        fill={{ solid: 'primary-3' }}
        radius="var(--radius-3)"
      >
        <Text variant="xs" mono color="text-0">solid</Text>
      </Frame>
      <Frame
        w={72} h={72}
        flow="vertical" align="center" justify="center"
        fill={{ solid: 'bg-2' }}
        stroke={{ gradient: '135deg, rgba(0,255,136,0.6), rgba(0,80,40,0.08)', width: 1 }}
        chamfer={10}
      >
        <Text variant="xs" mono color="text-2">chamfer</Text>
      </Frame>
      <Frame
        w={72} h={72}
        flow="vertical" align="center" justify="center"
        fill={[
          { lines: { angle: 135, spacing: 6, color: 'rgba(255,255,255,0.08)', width: 1 } },
          { solid: 'bg-2' },
        ]}
        stroke={{ color: 'border-1' }}
        round
      >
        <Text variant="xs" mono color="text-2">round</Text>
      </Frame>
    </T>
  ),

  Text: (
    <Frame flow="vertical" gap={8} align="start">
      <Text variant="h3" weight="black" color="text-0">Display Heading</Text>
      <Text variant="p"  color="text-2">Body text — regular weight, relaxed leading.</Text>
      <Text variant="xs" transform="uppercase" tracking="widest" color="text-3">Label / Tag</Text>
    </Frame>
  ),

  // ── Button ────────────────────────────────────────────────────────────────
  Button: (
    <Frame flow="horizontal" gap={8} padding={16} align="center" justify="center" fill={{ solid: 'bg-2' }}>
      <Button variant="primary"   size="md">Primary</Button>
      <Button variant="secondary" size="md">Secondary</Button>
      <Button variant="outline"   size="md">Outline</Button>
      <Button variant="ghost"     size="md">Ghost</Button>
    </Frame>
  ),

  // ── Panel (styled frame) ───────────────────────────────────────────────────
  Panel: (
    <T row>
      <Panel flow="vertical" gap={4} chamfer={8} padding={10} style={{ width: 110 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.12em' }}>DEFAULT</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-1)' }}>XR-231</span>
      </Panel>
      <Panel flow="vertical" gap={4} chamfer={8} padding={10} variant="tracking" style={{ width: 110 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.12em' }}>TRACKING</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-1)' }}>XR-231</span>
      </Panel>
      <Panel flow="vertical" gap={4} chamfer={8} padding={10} variant="critical" style={{ width: 110 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.12em' }}>CRITICAL</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-1)' }}>XR-231</span>
      </Panel>
    </T>
  ),

  // ── Interactive primitives ─────────────────────────────────────────────────
  Tabs: (
    <T>
      <Tabs.Root defaultValue="alpha" style={{ width: 260 }}>
        <Tabs.List>
          <Tabs.Tab value="alpha">XR-231</Tabs.Tab>
          <Tabs.Tab value="beta">UAS-4</Tabs.Tab>
          <Tabs.Tab value="gamma" disabled>Offline</Tabs.Tab>
        </Tabs.List>
        <Panel variant="dim" chamfer={0} noLines style={{ borderTop: 'none' }}>
          <Tabs.Panel value="alpha">
            <Frame flow="vertical" gap={4} padding={{ x: 14, y: 10 }}>
              <Text variant="xs" mono color="text-2">ALT&nbsp;&nbsp;12,400 ft</Text>
              <Text variant="xs" mono color="text-2">HDG&nbsp;&nbsp;247°</Text>
            </Frame>
          </Tabs.Panel>
          <Tabs.Panel value="beta">
            <Frame flow="vertical" gap={4} padding={{ x: 14, y: 10 }}>
              <Text variant="xs" mono color="text-2">ALT&nbsp;&nbsp;3,200 ft</Text>
              <Text variant="xs" mono color="text-2">BAT&nbsp;&nbsp;78%</Text>
            </Frame>
          </Tabs.Panel>
        </Panel>
      </Tabs.Root>
    </T>
  ),

  Dropdown: (
    <T row pad={24}>
      <Dropdown
        label="Unit"
        options={[
          { value: 'xr231', label: 'XR-231' },
          { value: 'uas4', label: 'UAS-4' },
          { value: 'red1', label: 'RED-1' },
        ]}
      />
      <Dropdown
        label="Filters"
        multiple
        value={['atom', 'molecule']}
        options={[
          { value: 'atom', label: 'Atoms' },
          { value: 'molecule', label: 'Molecules' },
          { value: 'organism', label: 'Organisms' },
        ]}
      />
    </T>
  ),
}

const LANGUAGE_LABEL_BY_EXT: Record<string, string> = {
  py: 'Python', rs: 'Rust', go: 'Go', ts: 'TypeScript',
}

// `path` lets components with no hand-curated entry still get *something*:
// a best-effort auto-render for .tsx files, or an honest "this language
// isn't visually previewable" message for everything else (Python/Rust/Go
// scaffolds are a single non-React file — there's nothing to mount).
export function getComponentPreview(name: string, path?: string): React.ReactNode {
  const curated = componentPreviewMap[name]
  if (curated) return curated

  if (!path) {
    return <Text variant="small" color="text-2">No preview available</Text>
  }
  if (path.endsWith('.tsx')) {
    return <AutoPreview path={path} name={name} />
  }
  const ext = path.split('.').pop() ?? ''
  const langLabel = LANGUAGE_LABEL_BY_EXT[ext] ?? ext.toUpperCase()
  return (
    <Text variant="small" color="text-2" mono>
      No visual preview for {langLabel} components — view source below.
    </Text>
  )
}

// ─── Code snippets ────────────────────────────────────────────────────────────
// Each entry mirrors the component's actual return() JSX so the code panel
// and the source file stay in sync by construction.

const componentCodeMap: Record<string, string> = {

  // ── Atoms — return self ──────────────────────────────────────────────────────

  Frame: `// Frame is the universal layout primitive — every surface is built from it.

return (
  <Frame
    flow="vertical"        // horizontal | vertical | grid
    gap={16}
    padding={24}
    fill={{ solid: 'bg-2' }}
    stroke={{ color: 'border-1' }}
    radius="var(--radius-3)"
  >
    {children}
  </Frame>
)

// Grid layout
<Frame flow="grid" cols="260px 1fr" h="fill" w="fill" />

// Multi-fill: diagonal lines + solid bg (same pattern Panel uses)
<Frame
  fill={[
    { lines: { angle: 135, spacing: 8, color: 'rgba(255,255,255,0.025)', width: 1 } },
    { solid: 'var(--bg-2)' },
  ]}
  stroke={{ gradient: 'var(--stroke-default)', width: 1 }}
  chamfer={8}
  effects={{ 'background-blur': 6 }}
/>

// Figma fill types: angular/diamond gradients, image scale modes, per-fill controls
<Frame
  fill={[
    { 'angular-gradient': 'from 45deg, #0ff, #f0f, #0ff', opacity: 0.35 },
    { image: { src: '/hero.png', mode: 'fill' }, blendMode: 'luminosity' },
    { solid: 'bg-2' },
  ]}
  stroke={{ color: 'border-1', width: 2, position: 'outside' }}
/>`,

  Text: `// Text — typography atom, wraps all font variants.

return (
  <Frame flow="vertical" gap={8} align="start">
    <Text variant="h3" weight="black" color="text-0">Display Heading</Text>
    <Text variant="p"  color="text-2">Body text — regular weight, relaxed leading.</Text>
    <Text variant="xs" transform="uppercase" tracking="widest" color="text-3">
      Label / Tag
    </Text>
  </Frame>
)

// variant: h1–h6 | p | small | xs | link | li
// weight:  light | normal | medium | bold | black
// color:   text-0 | text-1 | text-2 | text-3 | accent | inherit`,

  // ── Molecules — return the Frame atoms they are built of ─────────────────────

  Button: `// Button = Frame<button> + Text atom.

return (
  <Frame
    as="button"
    variant={FRAME_VARIANT[variant]}   // primary | secondary | none
    layout="inline-flex"
    flow="horizontal"
    align="center"
    justify="center"
    radius="var(--radius-3)"
    padding={padding ?? SIZE_PADDING[size]}  // { x: '1rem', y: '0.5rem' } for md
    transition="all"
    focusRing
    activeScale={0.98}
    disabledOpacity
    disabledPointerEvents
    {...VARIANT_EXTRAS[variant]}   // outline → stroke border-1; ghost → hoverFill bg-2
    {...frameProps}
  >
    {isLoading && <span className="animate-spin ..." />}
    <Text
      variant={SIZE_TEXT[size]}    // small | p | h6
      weight="medium"
      italic
      transform="uppercase"
      tracking="tight"
      leading="none"
    >
      {children}
    </Text>
  </Frame>
)

// variant:  primary | secondary | outline | ghost | none
// size:     sm | md | lg`,

  Panel: `// Panel = Frame with stacked fill (lines + solid), gradient stroke, backdrop blur.
// Every card and surface in the system is built on Panel.

return (
  <Frame
    fill={fill ?? [
      { lines: { angle: 135, spacing: 8, color: 'rgba(255,255,255,0.025)', width: 1 } },
      { solid: 'var(--bg-2)' },
    ]}
    stroke={stroke ?? { gradient: 'var(--stroke-default)', width: 1 }}
    chamfer={chamfer}              // default 8
    effects={effects ?? { 'background-blur': 6 }}
    {...props}
  >
    {children}
  </Frame>
)

// variant controls stroke gradient token:
// default  → var(--stroke-default)   white 28%→3%
// tracking → var(--stroke-track)     blue-grey
// critical → var(--stroke-critical)  white 48%→3%
// warning  → var(--stroke-warn)
// dim      → var(--stroke-dim)       white 10%→2%
// ghost    → var(--stroke-dim)       same, 4% opacity bg`,

  Tabs: `// Tabs = compound primitive — Frame<list> of button tabs + Frame<panel> content.

return (
  <Tabs.Root defaultValue="alpha">
    <Tabs.List>
      <Tabs.Tab value="alpha">XR-231</Tabs.Tab>
      <Tabs.Tab value="beta">UAS-4</Tabs.Tab>
      <Tabs.Tab value="gamma" disabled>Offline</Tabs.Tab>
    </Tabs.List>

    <Panel variant="dim" chamfer={0} noLines>
      <Tabs.Panel value="alpha">
        <Frame padding={12}>{alphaContent}</Frame>
      </Tabs.Panel>
      <Tabs.Panel value="beta">
        <Frame padding={12}>{betaContent}</Frame>
      </Tabs.Panel>
    </Panel>
  </Tabs.Root>
)

// Controlled: <Tabs.Root value={tab} onValueChange={setTab}>
// ARIA: role="tablist" | role="tab" (aria-selected) | role="tabpanel"`,

  Dropdown: `// Dropdown = Frame<button> trigger + portaled Frame menu (escapes ScrollWindow clipping).

return (
  <Dropdown
    label="Unit"
    options={[
      { value: 'xr231', label: 'XR-231' },
      { value: 'uas4', label: 'UAS-4' },
    ]}
    value={selected}
    onChange={setSelected}
  />
)

// Multi-select: menu stays open across picks, each row gets a ☑/☐ glyph.
<Dropdown
  multiple
  value={activeIds}
  onChange={setActiveIds}
  options={filterOptions}
  trigger={<Icon name="filter" size={13} />}
/>

// The menu portals into the nearest .theme-* ancestor (not document.body) so
// it keeps inheriting that scope's CSS custom properties, and so it can
// visually escape an ancestor ScrollWindow's overflow clipping.`,
}

export function getComponentCode(name: string): string {
  return componentCodeMap[name] ?? '// No example available'
}

// ─── Component registry ───────────────────────────────────────────────────────
// Node = Component: the registry below is derived from the same component-library graph
// Planning reads (see 00_planning/graph/combine.ts), not a separately
// hand-maintained list. Anything scaffolded through Planning's "+" flow shows
// up here the moment the graph is regenerated — no manual registration.

export interface ComponentMeta {
  name: string
  path: string
  type: 'atom' | 'molecule' | 'organism'
}

const LIBRARY_TYPES = new Set(['atom', 'molecule', 'organism'])

// Excludes ViewModel/interface files so each real component appears once —
// same convention Planning's scaffold flow uses to find a node's main file.
function isMainComponentNode(id: string): boolean {
  const segments = id.split('/')
  const base = segments[segments.length - 1]
  const folder = segments.length >= 2 ? segments[segments.length - 2] : base
  if (/ViewModel$/i.test(base)) return false
  if (base === `i${folder}`) return false
  return true
}

export function buildComponentsList(nodes: GraphNode[]): ComponentMeta[] {
  return nodes
    .filter((n) => n.kind === 'built' && n.type && LIBRARY_TYPES.has(n.type) && isMainComponentNode(n.id))
    .map((n) => ({
      name: n.label,
      // n.id has .ts/.tsx stripped (see generate-graph.mjs's toId) but keeps
      // other extensions as-is, so a blanket `${n.id}.tsx` produced bogus
      // paths like "Foo.py.tsx" for non-TypeScript components. n.filePath
      // is always the real repo-root-relative path — just drop the `src/`
      // prefix to match the src-relative convention `path` uses elsewhere.
      path: (n.filePath ?? `${n.id}.tsx`).replace(/^src\//, ''),
      type: n.type as ComponentMeta['type'],
    }))
}

export const componentsList: ComponentMeta[] = buildComponentsList(getGraphForMap('dsm').nodes)
