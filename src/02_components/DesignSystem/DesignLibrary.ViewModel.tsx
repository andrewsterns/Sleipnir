// ── Base imports ──────────────────────────────────────────────────────────────
import React from 'react'
import { Frame } from '../01_atoms/Frame/Frame'
import { Text  } from '../01_atoms/Text/Text'

// ── Tactical theme ────────────────────────────────────────────────────────────
import '../00_themes/tactical.css'

// ── Atoms ─────────────────────────────────────────────────────────────────────
import { UnitGlyph } from '../01_atoms/UnitGlyph/UnitGlyph'

// ── Molecules ─────────────────────────────────────────────────────────────────
import { Button }           from '../02_molecules/Button/Button'
import { TacticalPanel as Panel } from '../02_molecules/Panel/Panel'
import { StatusBadge }    from '../02_molecules/StatusBadge/StatusBadge'
import { ProgressBar }    from '../02_molecules/ProgressBar/ProgressBar'
import { SignalBar }      from '../02_molecules/SignalBar/SignalBar'
import { DataTag }        from '../02_molecules/DataTag/DataTag'
import { Tabs }           from '../02_molecules/Tabs/Tabs'
import { Accordion }      from '../02_molecules/Accordion/Accordion'
import { Select }         from '../02_molecules/Select/Select'
import { Dialog }         from '../02_molecules/Dialog/Dialog'
import { CommandOverlay } from '../02_molecules/CommandOverlay/CommandOverlay'
import type { OverlayMessage } from '../02_molecules/CommandOverlay/CommandOverlay'
import { DataReadout }      from '../02_molecules/DataReadout/DataReadout'
import { NotificationFeed } from '../02_molecules/NotificationFeed/NotificationFeed'

// ── Organisms ─────────────────────────────────────────────────────────────────
import { GroupCard }   from '../03_organisms/GroupCard'
import { StatusPanel } from '../03_organisms/StatusPanel'

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
      background: 'rgba(4,9,16,0.97)',
      padding: pad,
      width: '100%',
      minHeight: 80,
    }}
  >
    {children}
  </div>
)

// ── CommandOverlay seed messages ──────────────────────────────────────────────
const OVERLAY_SEED: OverlayMessage[] = [
  {
    id: 'co-s1', role: 'system', priority: 'critical',
    text: 'RED-3 SAM radar lock at grid E7. XR-231 within threat envelope.',
    ts: new Date(),
    actions: [
      { label: 'EVASIVE', variant: 'confirm', onClick: () => {} },
      { label: 'DISMISS', onClick: () => {} },
    ],
  },
  {
    id: 'co-s2', role: 'system', priority: 'suggested',
    text: 'XR-231 fuel at 18%. Recommend return to base.',
    ts: new Date(),
  },
  { id: 'co-u1', role: 'user', text: 'STATUS GROUP-1', ts: new Date() },
  {
    id: 'co-t1', role: 'tars',
    text: 'GROUP-1 nominal. 3 of 3 units active and within operational envelope.',
    ts: new Date(),
    data: [
      { label: 'ALT',  value: '12,400', unit: 'ft'   },
      { label: 'SPD',  value: '0.62',   unit: 'MACH' },
      { label: 'FUEL', value: '61%' },
      { label: 'HDG',  value: '247°' },
    ],
  },
]

const CommandOverlayPreview: React.FC = () => (
  <T pad={0}>
    <CommandOverlay.Root defaultOpen initialMessages={OVERLAY_SEED}>
      <CommandOverlay.Window style={{ position: 'relative', height: 400, width: '100%' }}>
        <CommandOverlay.Header />
        <CommandOverlay.Feed />
        <CommandOverlay.Input />
      </CommandOverlay.Window>
    </CommandOverlay.Root>
  </T>
)

// ── Interactive Dialog preview (needs its own state) ──────────────────────────
const DialogPreview: React.FC = () => (
  <T pad={24}>
    <Dialog.Root>
      <Dialog.Trigger>
        <button style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.18)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-1)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          padding: '7px 16px',
          outline: 'none',
        }}>
          Open Dialog
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content variant="default" chamfer={10} style={{ width: 360 }}>
          <Dialog.Title>Confirm Action</Dialog.Title>
          <div style={{ padding: '14px 14px 10px' }}>
            <Dialog.Description style={{ marginBottom: 14 }}>
              Authorize reinforcement for UNIT BRAVO-9? This commits 2 assets from GROUP-1 to theater grid E7.
            </Dialog.Description>
            <Frame flow="horizontal" gap={8} justify="end">
              <Dialog.Close style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.16)',
                color: 'var(--text-1)',
                padding: '5px 14px',
              }}>
                Confirm
              </Dialog.Close>
              <Dialog.Close>Cancel</Dialog.Close>
            </Frame>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </T>
)

// ─── Preview map ──────────────────────────────────────────────────────────────

export const componentPreviewMap: Record<string, React.ReactNode> = {

  // ── Base atoms ─────────────────────────────────────────────────────────────
  Frame: (
    <Frame
      flow="horizontal"
      gap={10}
      padding={20}
      fill={{ solid: 'bg-2' }}
      stroke={{ color: 'border-1' }}
      radius="var(--radius-3)"
    >
      <Frame size={36} radius="var(--radius-2)" fill={{ solid: 'primary-3' }} />
      <Frame flow="vertical" gap={6}>
        <Frame w={80} h={10} radius={4} fill={{ solid: 'text-2' }} opacity={0.4} />
        <Frame w={56} h={8}  radius={4} fill={{ solid: 'text-3' }} opacity={0.3} />
      </Frame>
    </Frame>
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

  // ── Display atoms ──────────────────────────────────────────────────────────
  StatusBadge: (
    <T row>
      <StatusBadge status="operational" />
      <StatusBadge status="nominal"     />
      <StatusBadge status="tracking"    />
      <StatusBadge status="warning"     />
      <StatusBadge status="critical"    />
      <StatusBadge status="acquired"    />
    </T>
  ),

  ProgressBar: (
    <T pad={20}>
      <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ProgressBar value={85} label="READINESS" showValue />
        <ProgressBar value={45} label="FUEL"      showValue color="var(--warn)"     />
        <ProgressBar value={18} label="AMMO"      showValue color="var(--critical)" />
      </div>
    </T>
  ),

  SignalBar: (
    <T row>
      <SignalBar value={1.0} segments={5} />
      <SignalBar value={0.6} segments={5} />
      <SignalBar value={0.2} segments={5} />
    </T>
  ),

  DataTag: (
    <T row>
      <DataTag label="ALT"  value="12,400" unit="ft"   />
      <DataTag label="SPD"  value="0.62"   unit="MACH" />
      <DataTag label="HDG"  value="247°"               />
      <DataTag label="FUEL" value="61%"                />
    </T>
  ),

  UnitGlyph: (
    <T row>
      <UnitGlyph unitType="fixed-wing" color="var(--text-1)" size={32} />
      <UnitGlyph unitType="drone"      color="var(--text-1)" size={32} />
      <UnitGlyph unitType="ground"     color="var(--text-1)" size={32} />
      <UnitGlyph unitType="naval"      color="var(--text-1)" size={32} />
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
            <div style={{ padding: '10px 14px' }}>
              <DataReadout cols={2} gap={10} data={[
                { label: 'ALT', value: '12,400', unit: 'ft' },
                { label: 'HDG', value: '247°' },
              ]} />
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="beta">
            <div style={{ padding: '10px 14px' }}>
              <DataReadout cols={2} gap={10} data={[
                { label: 'ALT', value: '3,200', unit: 'ft' },
                { label: 'BAT', value: '78%' },
              ]} />
            </div>
          </Tabs.Panel>
        </Panel>
      </Tabs.Root>
    </T>
  ),

  Accordion: (
    <T>
      <Accordion.Root type="single" defaultValue="unit1" style={{ width: 260 }}>
        <Panel variant="tracking" chamfer={6}>
          <Accordion.Item value="unit1">
            <Accordion.Trigger>XR-231 — Fixed Wing</Accordion.Trigger>
            <Accordion.Content>
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-1)' }}>
                <DataReadout cols={2} gap={10} data={[
                  { label: 'ALT', value: '12,400', unit: 'ft'   },
                  { label: 'SPD', value: '0.62',   unit: 'MACH' },
                ]} />
              </div>
            </Accordion.Content>
          </Accordion.Item>
          <Accordion.Item value="unit2">
            <Accordion.Trigger>RED-1 — Hostile SAM</Accordion.Trigger>
            <Accordion.Content>
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-1)' }}>
                <DataReadout cols={2} gap={10} data={[
                  { label: 'RNG',  value: '23',  unit: 'km' },
                  { label: 'TYPE', value: 'SAM'              },
                ]} />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Panel>
      </Accordion.Root>
    </T>
  ),

  Select: (
    <T pad={48}>
      <Select.Root defaultValue="xr231" style={{ width: 220 }}>
        <Select.Trigger />
        <Select.Content>
          <Select.Label>Friendly</Select.Label>
          <Select.Item value="xr231">XR-231 — Fixed Wing</Select.Item>
          <Select.Item value="uas4">UAS-4 — Drone</Select.Item>
          <Select.Separator />
          <Select.Label>Hostile</Select.Label>
          <Select.Item value="red1">RED-1 — SAM</Select.Item>
          <Select.Item value="red3" disabled>RED-3 — Out of range</Select.Item>
        </Select.Content>
      </Select.Root>
    </T>
  ),

  Dialog: <DialogPreview />,
  CommandOverlay: <CommandOverlayPreview />,

  // ── Molecules ──────────────────────────────────────────────────────────────
  DataReadout: (
    <T>
      <DataReadout
        card="tracking"
        chamfer={6}
        cols={2}
        gap={14}
        style={{ width: 220 }}
        data={[
          { label: 'ALT',  value: '12,400', unit: 'ft'   },
          { label: 'HDG',  value: '247°'                  },
          { label: 'SPD',  value: '0.62',   unit: 'MACH' },
          { label: 'FUEL', value: '61%'                   },
        ]}
      />
    </T>
  ),

  GroupCard: (
    <T row pad={16}>
      <GroupCard
        name="GROUP-1" tag="0505" status="operational" variant="default" chamfer={8}
        style={{ width: 180 }}
        unitTypes={[
          { name: 'FIXED_WING', unitType: 'fixed-wing', count: 1, active: 1, units: [{ id: 'u1', callsign: 'XR-231' }] },
          { name: 'DRONE',      unitType: 'drone',       count: 1, active: 1, units: [{ id: 'u2', callsign: 'UAS-4'  }] },
        ]}
      />
      <GroupCard
        name="GROUP-2" tag="0822" status="warning" variant="dim" chamfer={8} selected
        style={{ width: 180 }}
        unitTypes={[
          { name: 'GROUND_UNIT', unitType: 'ground', count: 1, active: 1, units: [{ id: 'u3', callsign: 'GRD-1' }] },
        ]}
      />
    </T>
  ),

  NotificationFeed: (
    <T pad={12}>
      <NotificationFeed notifications={[
        { level: 'warning', message: 'SAM radar lock — action required', ref: 'R2.1132', age: '4min'  },
        { level: 'caution', message: 'ZJ45 — unauthorized vector',       ref: 'T0.9910', age: '2min'  },
        { level: 'iff',     message: 'Recommend identify ZJ45',          ref: 'RED-3'                 },
        { level: 'note',    message: 'Altitude deviation XR-231',        ref: 'T1.3772', age: '12min' },
      ]} />
    </T>
  ),

  // ── Organisms ──────────────────────────────────────────────────────────────
  StatusPanel: (
    <T pad={0}>
      <div style={{ width: 220, maxHeight: 200, overflow: 'hidden' }}>
        <StatusPanel
          groups={[
            {
              name: 'GROUP-1', tag: '0505', status: 'operational',
              unitTypes: [
                { name: 'FIXED_WING', unitType: 'fixed-wing', count: 1, active: 1, units: [{ id: 'u1', callsign: 'XR-231' }] },
                { name: 'DRONE',      unitType: 'drone',       count: 1, active: 1, units: [{ id: 'u2', callsign: 'UAS-4'  }] },
              ],
            },
            {
              name: 'GROUP-2', tag: '0822', status: 'warning',
              unitTypes: [
                { name: 'GROUND_UNIT', unitType: 'ground', count: 1, active: 1, units: [{ id: 'u3', callsign: 'GRD-1' }] },
              ],
            },
          ]}
          hostiles={[
            { id: 'R1', callsign: 'RED-1', status: 'acquired' },
            { id: 'R2', callsign: 'RED-3', status: 'critical' },
          ]}
          sensorCoverage={70}
          threatLevel="critical"
          selectedGroupId="GROUP-1"
        />
      </div>
    </T>
  ),
}  // end componentPreviewMap

export function getComponentPreview(name: string): React.ReactNode {
  return componentPreviewMap[name] ?? (
    <Text variant="small" color="text-2">No preview available</Text>
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

  UnitGlyph: `// UnitGlyph — SVG silhouette atom for unit type display.

return (
  <svg width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round"
  >
    {/* path varies per unitType */}
  </svg>
)

// Usage:
<UnitGlyph unitType="fixed-wing" size={28} color="var(--text-1)" />
<UnitGlyph unitType="drone"      size={28} color="var(--text-2)" />
<UnitGlyph unitType="ground"     size={28} />
<UnitGlyph unitType="naval"      size={28} />

// type UnitType = 'fixed-wing' | 'rotary-wing' | 'drone' | 'ground' | 'naval'

// Full marker with affiliation border + selection ring:
<UnitMarker
  affiliation="friendly"
  unitType="fixed-wing"
  selected={false}
  label="XR-231"
  onClick={handler}
/>`,

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

  StatusBadge: `// StatusBadge = Frame<inline> + text span — atomic status pill.

return (
  <Frame
    chamfer={3}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 6px',
      background: cfg.bg,       // e.g. rgba(255,255,255,0.08)
      color: cfg.color,         // e.g. #dce8f0
      fontSize: '9px',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.08em',
      fontWeight: 600,
      lineHeight: '16px',
      border: '1px solid rgba(255,255,255,0.10)',
    }}
  >
    {text}  {/* label ?? status.toUpperCase() */}
  </Frame>
)

// status: operational | warning | critical | nominal | tracking | acquired | damage | from`,

  ProgressBar: `// ProgressBar = Frame<column> → optional Frame<row header> + Frame<track> + div<fill>.

return (
  <Frame flow="vertical" gap={4}>
    {(label || showValue) && (
      <Frame
        flow="horizontal"
        justify="between"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.06em',
          color: 'var(--text-2)',
        }}
      >
        {label && <span>{label.toUpperCase()}</span>}
        {showValue && <span style={{ color }}>{Math.round(pct)}%</span>}
      </Frame>
    )}
    <Frame
      w="fill"
      style={{
        height: \`\${height}px\`,
        background: trackColor,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: \`\${pct}%\`,
        background: color,
        transition: 'width 0.3s ease',
      }} />
    </Frame>
  </Frame>
)`,

  SignalBar: `// SignalBar = Frame<row> + N ascending-height div segments.

return (
  <Frame flow="horizontal" align="end" gap={2}>
    {Array.from({ length: segments }, (_, i) => (
      <div
        key={i}
        style={{
          width: 3,
          height: \`\${6 + i * 3}px\`,
          background: i < active ? color : dimColor,
          transition: 'background 0.2s ease',
        }}
      />
    ))}
  </Frame>
)

// active = Math.round(value * segments)
// value: 0.0–1.0   segments: default 5`,

  DataTag: `// DataTag = Frame<column> + label span + value span — the atomic readout unit.

return (
  <Frame flow="vertical" gap={2}>
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '8px',
      letterSpacing: '0.10em',
      color: 'var(--text-3)',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      fontWeight: 600,
      color: valueColor,
      letterSpacing: '0.04em',
      lineHeight: 1,
    }}>
      {value}
      {unit && (
        <span style={{ fontSize: '9px', color: 'var(--text-3)', marginLeft: 2 }}>
          {unit}
        </span>
      )}
    </span>
  </Frame>
)`,

  DataReadout: `// DataReadout = Frame<grid> of DataTag atoms, optionally wrapped in TacticalPanel.

// Without card prop — bare grid:
return (
  <Frame flow="grid" cols={cols} gap={gap}>
    {data.map((item, i) => (
      <DataTag
        key={i}
        label={item.label}
        value={item.value}
        unit={item.unit}
        valueColor={item.valueColor}
      />
    ))}
  </Frame>
)

// With card prop — wraps the grid in TacticalPanel:
return (
  <TacticalPanel flow="vertical" variant={variant} chamfer={chamfer} padding={12}>
    <Frame flow="grid" cols={cols} gap={gap}>
      {data.map((item, i) => (
        <DataTag key={i} label={item.label} value={item.value} unit={item.unit} />
      ))}
    </Frame>
  </TacticalPanel>
)`,

  NotificationFeed: `// NotificationFeed = Frame<column> + div rows (level label + message + ref + age).

return (
  <Frame
    flow="vertical"
    gap={3}
    style={{ background: 'transparent', padding: '8px 12px' }}
  >
    {notifications.map((n, i) => (
      <div
        key={n.id ?? i}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          lineHeight: '13px',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: LEVEL_COLOR[n.level], minWidth: 60, flexShrink: 0 }}>
          {LEVEL_LABEL[n.level]}  {/* e.g. '**WARNING' */}
        </span>
        <span style={{ color: 'var(--text-2)', flex: 1 }}>{n.message}</span>
        {n.ref && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{n.ref}</span>}
        {n.age && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{n.age}</span>}
      </div>
    ))}
  </Frame>
)

// level → color token:
// note → text-3 | advise → text-2 | warning → --warn | caution → --caution | iff → --track`,

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
        <Frame padding={12}>
          <DataReadout cols={2} data={alphaData} />
        </Frame>
      </Tabs.Panel>
      <Tabs.Panel value="beta">
        <Frame padding={12}>
          <DataReadout cols={2} data={betaData} />
        </Frame>
      </Tabs.Panel>
    </Panel>
  </Tabs.Root>
)

// Controlled: <Tabs.Root value={tab} onValueChange={setTab}>
// ARIA: role="tablist" | role="tab" (aria-selected) | role="tabpanel"`,

  Accordion: `// Accordion = compound primitive — Panel wrapping collapsible Item + Trigger + Content.

return (
  <Accordion.Root type="single" defaultValue="unit1">
    <Panel variant="tracking" chamfer={6}>
      <Accordion.Item value="unit1">
        <Accordion.Trigger>XR-231 — Fixed Wing</Accordion.Trigger>
        <Accordion.Content>
          <Frame
            padding={{ x: 12, y: 8 }}
            style={{ borderTop: '1px solid var(--border-1)' }}
          >
            <DataReadout cols={2} data={telemetry} />
          </Frame>
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="unit2">
        <Accordion.Trigger>RED-1 — Hostile SAM</Accordion.Trigger>
        <Accordion.Content>
          <Frame padding={{ x: 12, y: 8 }} style={{ borderTop: '1px solid var(--border-1)' }}>
            <DataReadout cols={2} data={threatData} />
          </Frame>
        </Accordion.Content>
      </Accordion.Item>
    </Panel>
  </Accordion.Root>
)

// type="multiple" → several items open at once
// Animation: CSS grid-template-rows: 0fr → 1fr (no JS height measurement)`,

  Select: `// Select = compound primitive — Trigger button + floating Content list.

return (
  <Select.Root value={unit} onValueChange={setUnit}>
    <Select.Trigger placeholder="Select unit…" />
    <Select.Content>
      <Select.Label>Friendly</Select.Label>
      <Select.Item value="xr231">XR-231 — Fixed Wing</Select.Item>
      <Select.Item value="uas4">UAS-4 — Drone</Select.Item>
      <Select.Separator />
      <Select.Label>Hostile</Select.Label>
      <Select.Item value="red1">RED-1 — SAM</Select.Item>
      <Select.Item value="red3" disabled>RED-3 — Out of range</Select.Item>
    </Select.Content>
  </Select.Root>
)

// Keyboard: ↑↓ navigate | Enter selects | Escape closes
// ARIA: role="listbox" | role="option" | aria-activedescendant`,

  Dialog: `// Dialog = compound primitive — Portal + Overlay backdrop + Content panel.

return (
  <Dialog.Root>
    <Dialog.Trigger>
      <button>Open Dialog</button>
    </Dialog.Trigger>

    <Dialog.Portal>
      <Dialog.Overlay />
      <Dialog.Content variant="default" chamfer={10} style={{ width: 360 }}>
        <Dialog.Title>Confirm Action</Dialog.Title>
        <Frame flow="vertical" gap={12} padding={{ x: 14, y: 12 }}>
          <Dialog.Description>
            Authorize reinforcement for UNIT BRAVO-9?
          </Dialog.Description>
          <Frame flow="horizontal" gap={8} justify="end">
            <Dialog.Close>Confirm</Dialog.Close>
            <Dialog.Close>Cancel</Dialog.Close>
          </Frame>
        </Frame>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)

// Focus trap: Tab cycles within Content, Shift+Tab reverses.
// Controlled: <Dialog.Root open={open} onOpenChange={setOpen}>`,

  CommandOverlay: `// CommandOverlay = compound — Root / Window / Header / Feed / Input.
// Three message roles: system (proactive alerts), user (commands), tars (AI responses).

// Inline preview mode (no Portal):
return (
  <CommandOverlay.Root defaultOpen initialMessages={seed}>
    <CommandOverlay.Window style={{ position: 'relative', height: 400, width: '100%' }}>
      <CommandOverlay.Header />
      <CommandOverlay.Feed />
      <CommandOverlay.Input />
    </CommandOverlay.Window>
  </CommandOverlay.Root>
)

// Full portal usage with LLM hook:
return (
  <CommandOverlay.Root onSubmit={(text, respond) => {
    myLLM(text).then(reply =>
      respond({ role: 'tars', text: reply.text, data: reply.data })
    )
  }}>
    <CommandOverlay.Trigger><button>Open TARS</button></CommandOverlay.Trigger>
    <CommandOverlay.Portal>
      <CommandOverlay.Backdrop />
      <CommandOverlay.Window>
        <CommandOverlay.Header title="TARS — TACTICAL AI" />
        <CommandOverlay.Feed />
        <CommandOverlay.Input />
      </CommandOverlay.Window>
    </CommandOverlay.Portal>
  </CommandOverlay.Root>
)`,

  // ── Organisms — return molecule + atom combos ────────────────────────────────

  GroupCard: `// GroupCard = TacticalPanel > Frame header + unit rows with UnitGlyph atoms.

return (
  <TacticalPanel
    flow="vertical"
    variant={selected ? 'dim' : 'ghost'}
    chamfer={chamfer}
    onClick={onClick}
    style={{ cursor: 'pointer', padding: '8px 6px', transition: 'all 0.15s' }}
  >
    {/* Group name header */}
    <Frame flow="horizontal" align="center" gap={6} style={{ marginBottom: 8 }}>
      <GroupIcon />  {/* inline SVG: 3 overlapping circles */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', color: headerColor }}>
        {name}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)' }}>
        {tag}
      </span>
    </Frame>

    {/* Individual unit rows */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 4 }}>
      {units.map((unit) => (
        <div key={unit.id}
          onClick={(e) => { e.stopPropagation(); onSelectUnit?.(unit.id); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px', cursor: 'pointer' }}
        >
          <UnitGlyph unitType={row.unitType} color="var(--text-2)" size={20} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em' }}>
            {unit.callsign}
          </span>
        </div>
      ))}
    </div>
  </TacticalPanel>
)`,

  StatusPanel: `// StatusPanel = Frame<column> > StatusBadge header + ProgressBar + GroupCard list.

return (
  <Frame flow="vertical" gap={10} padding={{ x: 10, y: 10 }} w={200}
    style={{ background: 'transparent' }}
  >
    {/* Theater header */}
    <Frame flow="horizontal" justify="between" align="center">
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px',
        letterSpacing: '0.12em', color: 'var(--text-3)' }}>
        AGENTRIC WARFARE SYS {systemVersion}
      </span>
      <StatusBadge status={theaterStatus} label="THEATER STATUS" />
    </Frame>

    <div style={{ height: 1, background: 'var(--border-1)' }} />

    {/* Sensor coverage */}
    <ProgressBar value={sensorCoverage} label="SENSOR COVERAGE" showValue />

    {/* Friendly group cards */}
    {groups.map((g) => (
      <GroupCard
        key={g.name}
        {...g}
        selected={g.name === selectedGroupId}
        onClick={() => onSelectGroup?.(g.name)}
        onSelectUnit={onSelectUnit}
      />
    ))}

    {/* Hostile threat rows */}
    {hostiles.map((h) => (
      <GroupCard key={h.id} {...h} isHostile />
    ))}
  </Frame>
)`,
}

export function getComponentCode(name: string): string {
  return componentCodeMap[name] ?? '// No example available'
}

// ─── Component registry ───────────────────────────────────────────────────────

export interface ComponentMeta {
  name: string
  path: string
  type: 'atom' | 'molecule' | 'organism'
}

export const componentsList: ComponentMeta[] = [
  // Atoms — pure building blocks: layout, typography, icons
  { name: 'Frame',     path: '../01_atoms/Frame/Frame',  type: 'atom' },
  { name: 'Text',      path: '../01_atoms/Text/Text',    type: 'atom' },
  { name: 'UnitGlyph', path: '../01_atoms/UnitGlyph/UnitGlyph', type: 'atom' },

  // Molecules — compounds built from atoms
  { name: 'Button',          path: '../02_molecules/Button/Button',   type: 'molecule' },
  { name: 'Panel',           path: '../02_molecules/Panel',           type: 'molecule' },
  { name: 'StatusBadge',     path: '../02_molecules/StatusBadge/StatusBadge',     type: 'molecule' },
  { name: 'ProgressBar',     path: '../02_molecules/ProgressBar/ProgressBar',     type: 'molecule' },
  { name: 'SignalBar',       path: '../02_molecules/SignalBar/SignalBar',        type: 'molecule' },
  { name: 'DataTag',         path: '../02_molecules/DataTag/DataTag',          type: 'molecule' },
  { name: 'DataReadout',     path: '../02_molecules/DataReadout/DataReadout',      type: 'molecule' },
  { name: 'NotificationFeed',path: '../02_molecules/NotificationFeed/NotificationFeed', type: 'molecule' },
  { name: 'Tabs',            path: '../02_molecules/Tabs/Tabs',             type: 'molecule' },
  { name: 'Accordion',       path: '../02_molecules/Accordion/Accordion',        type: 'molecule' },
  { name: 'Select',          path: '../02_molecules/Select/Select',           type: 'molecule' },
  { name: 'Dialog',          path: '../02_molecules/Dialog/Dialog',           type: 'molecule' },
  { name: 'CommandOverlay',  path: '../02_molecules/CommandOverlay/CommandOverlay',   type: 'molecule' },

  // Organisms — domain-specific compositions of molecules
  { name: 'GroupCard',   path: '../03_organisms/GroupCard',   type: 'organism' },
  { name: 'StatusPanel', path: '../03_organisms/StatusPanel', type: 'organism' },
]

export function getComponentNamesByType(type: ComponentMeta['type']): string[] {
  return componentsList.filter(c => c.type === type).map(c => c.name)
}

export function getComponentMetaByName(name: string): ComponentMeta | undefined {
  return componentsList.find(c => c.name === name)
}
