// The inspector's layout controls, as icon buttons rather than dropdowns:
//
//   ARRANGE — align / distribute / group the selection (what used to float
//             over the board as a toolbar);
//   LAYOUT  — a frame's flow (freeform, stacks, grid, along a path), how its
//             children align and spread, gap, wrap and columns;
//   SPACING — padding (a frame's inner space) and margin (the space a child
//             keeps around itself inside an auto-layout parent).
//
// Every icon is a small inline SVG drawn in currentColor, so it follows the
// button's state and the theme.

import { Frame } from '../../app/UIKit/Frame/Frame'
import type { AlignMode, DistributeMode } from '../model/align'
import { MAX_PATTERN } from '../model/pathPattern'
import type { Align, AlongPath, CanvasNode, CanvasStyle, Flow, Justify, Padding } from '../model/types'
import { Label, MONO, NumberField, Section } from './inspectorKit'

type StyleChange = (patch: Partial<CanvasStyle>, gesture?: string) => void

// ── Icons ───────────────────────────────────────────────────────────────────

/** A 16×16 line icon in currentColor. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

const ICONS = {
  // flow
  freeform: (
    <Glyph>
      <rect x={2} y={2.5} width={5} height={4} rx={0.5} />
      <rect x={8.5} y={6} width={5.5} height={4} rx={0.5} />
      <rect x={3.5} y={10} width={4.5} height={3.5} rx={0.5} />
    </Glyph>
  ),
  vertical: (
    <Glyph>
      <rect x={3} y={2} width={10} height={3.5} rx={0.5} />
      <rect x={3} y={6.25} width={10} height={3.5} rx={0.5} />
      <rect x={3} y={10.5} width={10} height={3.5} rx={0.5} />
    </Glyph>
  ),
  horizontal: (
    <Glyph>
      <rect x={2} y={3} width={3.5} height={10} rx={0.5} />
      <rect x={6.25} y={3} width={3.5} height={10} rx={0.5} />
      <rect x={10.5} y={3} width={3.5} height={10} rx={0.5} />
    </Glyph>
  ),
  grid: (
    <Glyph>
      <rect x={2} y={2} width={5} height={5} rx={0.5} />
      <rect x={9} y={2} width={5} height={5} rx={0.5} />
      <rect x={2} y={9} width={5} height={5} rx={0.5} />
      <rect x={9} y={9} width={5} height={5} rx={0.5} />
    </Glyph>
  ),
  path: (
    <Glyph>
      <path d="M1.5 12 C 4 2, 9 14, 14.5 4" strokeDasharray="1.5 1.5" />
      <rect x={1.5} y={9.5} width={3} height={3} rx={0.5} fill="currentColor" stroke="none" />
      <rect x={6.5} y={7} width={3} height={3} rx={0.5} fill="currentColor" stroke="none" />
      <rect x={11.5} y={3} width={3} height={3} rx={0.5} fill="currentColor" stroke="none" />
    </Glyph>
  ),
  // align selection
  'align-left': (
    <Glyph>
      <path d="M2.5 2v12" />
      <rect x={4.5} y={4} width={8} height={3} rx={0.5} />
      <rect x={4.5} y={9} width={5} height={3} rx={0.5} />
    </Glyph>
  ),
  'align-center-x': (
    <Glyph>
      <path d="M8 2v12" />
      <rect x={3} y={4} width={10} height={3} rx={0.5} />
      <rect x={4.5} y={9} width={7} height={3} rx={0.5} />
    </Glyph>
  ),
  'align-right': (
    <Glyph>
      <path d="M13.5 2v12" />
      <rect x={3.5} y={4} width={8} height={3} rx={0.5} />
      <rect x={6.5} y={9} width={5} height={3} rx={0.5} />
    </Glyph>
  ),
  'align-top': (
    <Glyph>
      <path d="M2 2.5h12" />
      <rect x={4} y={4.5} width={3} height={8} rx={0.5} />
      <rect x={9} y={4.5} width={3} height={5} rx={0.5} />
    </Glyph>
  ),
  'align-center-y': (
    <Glyph>
      <path d="M2 8h12" />
      <rect x={4} y={3} width={3} height={10} rx={0.5} />
      <rect x={9} y={4.5} width={3} height={7} rx={0.5} />
    </Glyph>
  ),
  'align-bottom': (
    <Glyph>
      <path d="M2 13.5h12" />
      <rect x={4} y={3.5} width={3} height={8} rx={0.5} />
      <rect x={9} y={6.5} width={3} height={5} rx={0.5} />
    </Glyph>
  ),
  'distribute-h': (
    <Glyph>
      <path d="M2 2v12M14 2v12" />
      <rect x={6} y={5} width={4} height={6} rx={0.5} />
    </Glyph>
  ),
  'distribute-v': (
    <Glyph>
      <path d="M2 2h12M2 14h12" />
      <rect x={5} y={6} width={6} height={4} rx={0.5} />
    </Glyph>
  ),
  group: (
    <Glyph>
      <rect x={1.5} y={1.5} width={13} height={13} rx={1} strokeDasharray="2 1.5" />
      <rect x={4} y={4} width={4} height={4} rx={0.5} />
      <rect x={8.5} y={8.5} width={3.5} height={3.5} rx={0.5} />
    </Glyph>
  ),
  ungroup: (
    <Glyph>
      <rect x={2} y={2} width={5} height={5} rx={0.5} />
      <rect x={9} y={9} width={5} height={5} rx={0.5} />
      <path d="M9 3.5h4.5V8M3 9v4.5h4" strokeDasharray="1.5 1.5" />
    </Glyph>
  ),
  // spacing
  'even-spacing': (
    <Glyph>
      <path d="M1.5 8h13" strokeDasharray="1.5 1.5" />
      <circle cx={2.5} cy={8} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={8} cy={8} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={13.5} cy={8} r={1.5} fill="currentColor" stroke="none" />
    </Glyph>
  ),
  'gap-spacing': (
    <Glyph>
      <path d="M1.5 8h13" strokeDasharray="1.5 1.5" />
      <circle cx={2.5} cy={8} r={1.5} fill="currentColor" stroke="none" />
      <circle cx={6.5} cy={8} r={1.5} fill="currentColor" stroke="none" />
      <path d="M8.5 5.5v5M11.5 5.5v5M8.5 8h3" />
    </Glyph>
  ),
  wrap: (
    <Glyph>
      <path d="M2 4h10a2.5 2.5 0 0 1 0 5H6" />
      <path d="M7.5 7.5 6 9l1.5 1.5" />
      <path d="M2 12.5h5" />
    </Glyph>
  ),
} as const

/**
 * Cross-axis alignment and main-axis distribution icons, drawn for the
 * frame's direction — "start" in a vertical stack hugs the left edge, in a
 * horizontal one the top — so the picture always matches what happens.
 */
function alignIcon(value: Align, vertical: boolean) {
  const at = { start: 3, center: 8, end: 13, stretch: 8 }[value]
  const bars = [{ len: value === 'stretch' ? 10 : 6 }, { len: value === 'stretch' ? 10 : 9 }]
  return (
    <Glyph>
      {/* The line the children align to (dashed for center and stretch). */}
      <path d={vertical ? `M${at} 2v12` : `M2 ${at}h12`} strokeDasharray={value === 'center' || value === 'stretch' ? '1.5 1.5' : undefined} />
      {bars.map((b, i) => {
        const pos = value === 'start' ? 3 : value === 'end' ? 13 - b.len : value === 'stretch' ? 3 : 8 - b.len / 2
        return vertical ? (
          <rect key={i} x={pos} y={4 + i * 5} width={b.len} height={3} rx={0.5} />
        ) : (
          <rect key={i} x={4 + i * 5} y={pos} width={3} height={b.len} rx={0.5} />
        )
      })}
    </Glyph>
  )
}

function justifyIcon(value: Justify, vertical: boolean) {
  // Three items along the main axis, packed per the justify mode.
  const positions: Record<Justify, number[]> = {
    start: [2, 5.5, 9],
    center: [3.75, 7.25, 10.75],
    end: [5.5, 9, 12.5],
    between: [2, 7.25, 12.5],
    around: [3, 7.25, 11.5],
  }
  return (
    <Glyph>
      {positions[value].map((p, i) =>
        vertical ? <rect key={i} x={5} y={p} width={6} height={2} rx={0.5} /> : <rect key={i} x={p} y={5} width={2} height={6} rx={0.5} />,
      )}
      {vertical ? <path d="M3 1.5v13M13 1.5v13" strokeOpacity={0.45} /> : <path d="M1.5 3h13M1.5 13h13" strokeOpacity={0.45} />}
    </Glyph>
  )
}

// ── Buttons ─────────────────────────────────────────────────────────────────

const ICON_BTN: React.CSSProperties = {
  width: 26,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  padding: 0,
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-2)',
  cursor: 'pointer',
}

const ICON_BTN_ON: React.CSSProperties = {
  background: 'var(--bg-3, var(--bg-2))',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
}

/** One icon button. `pressed` makes it a toggle/segment that shows its state. */
export function IconButton({
  title,
  icon,
  pressed,
  disabled,
  onClick,
  testId,
}: {
  title: string
  icon: React.ReactNode
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      style={{ ...ICON_BTN, ...(pressed ? ICON_BTN_ON : null), opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}
    >
      {icon}
    </button>
  )
}

/** A row of mutually exclusive icon buttons — the inspector's segmented control. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: T | undefined
  options: { id: T; title: string; icon: React.ReactNode }[]
  onChange: (id: T) => void
}) {
  return (
    <Frame flow="vertical" gap={3} w="fill">
      {label && <Label>{label}</Label>}
      <div
        role="radiogroup"
        aria-label={label}
        style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-control)', width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}
      >
        {options.map((o) => (
          <IconButton key={o.id} title={o.title} icon={o.icon} pressed={value === o.id} onClick={() => onChange(o.id)} />
        ))}
      </div>
    </Frame>
  )
}

const DIVIDER = <div style={{ width: 1, alignSelf: 'stretch', margin: '2px 3px', background: 'var(--border-1)' }} />

// ── ARRANGE ─────────────────────────────────────────────────────────────────

export interface ArrangeProps {
  canAlign: boolean
  canDistribute: boolean
  canGroup: boolean
  canUngroup: boolean
  onAlign: (mode: AlignMode) => void
  onDistribute: (mode: DistributeMode) => void
  onGroup: () => void
  onUngroup: () => void
  /** A path and a piece selected — "Pattern along path" can wrap them. */
  canPattern?: boolean
  onPattern?: () => void
}

const ALIGN_BUTTONS: { mode: AlignMode; title: string; icon: keyof typeof ICONS }[] = [
  { mode: 'left', title: 'Align left', icon: 'align-left' },
  { mode: 'center-x', title: 'Align horizontal centers', icon: 'align-center-x' },
  { mode: 'right', title: 'Align right', icon: 'align-right' },
  { mode: 'top', title: 'Align top', icon: 'align-top' },
  { mode: 'center-y', title: 'Align vertical centers', icon: 'align-center-y' },
  { mode: 'bottom', title: 'Align bottom', icon: 'align-bottom' },
]

/** Align, distribute and group the selection — one row, shown whenever any of it applies. */
export function ArrangeSection({ canAlign, canDistribute, canGroup, canUngroup, onAlign, onDistribute, onGroup, onUngroup, canPattern, onPattern }: ArrangeProps) {
  if (!canAlign && !canGroup && !canUngroup) return null
  return (
    <Section title="ARRANGE">
      <div data-canvas-arrange="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        {ALIGN_BUTTONS.map((b) => (
          <IconButton key={b.mode} title={b.title} icon={ICONS[b.icon]} disabled={!canAlign} onClick={() => onAlign(b.mode)} />
        ))}
        {DIVIDER}
        <IconButton title="Distribute horizontal spacing" icon={ICONS['distribute-h']} disabled={!canDistribute} onClick={() => onDistribute('horizontal')} />
        <IconButton title="Distribute vertical spacing" icon={ICONS['distribute-v']} disabled={!canDistribute} onClick={() => onDistribute('vertical')} />
        {DIVIDER}
        <IconButton title="Group (Ctrl+G)" icon={ICONS.group} disabled={!canGroup} onClick={onGroup} />
        <IconButton title="Ungroup (Ctrl+Shift+G)" icon={ICONS.ungroup} disabled={!canUngroup} onClick={onUngroup} />
        {DIVIDER}
        <IconButton
          title={canPattern ? 'Pattern along path — repeat one layer along the other' : 'Pattern along path: select a shape and the path to repeat it along'}
          icon={ICONS.path}
          disabled={!canPattern}
          onClick={() => onPattern?.()}
        />
      </div>
    </Section>
  )
}

// ── LAYOUT ──────────────────────────────────────────────────────────────────

type FlowChoice = Flow | 'path'

const FLOW_OPTIONS: { id: FlowChoice; title: string; icon: React.ReactNode }[] = [
  { id: 'freeform', title: 'Freeform', icon: ICONS.freeform },
  { id: 'vertical', title: 'Vertical stack', icon: ICONS.vertical },
  { id: 'horizontal', title: 'Horizontal stack', icon: ICONS.horizontal },
  { id: 'grid', title: 'Grid', icon: ICONS.grid },
  { id: 'path', title: 'Along path', icon: ICONS.path },
]

const ALIGN_LABEL: Record<Align, string> = { start: 'Start', center: 'Center', end: 'End', stretch: 'Stretch' }
const JUSTIFY_LABEL: Record<Justify, string> = {
  start: 'Pack at start',
  center: 'Pack in center',
  end: 'Pack at end',
  between: 'Space between',
  around: 'Space around',
}

/** A frame's flow and how it places its children. */
export function LayoutSection({ node, onStyleChange }: { node: CanvasNode; onStyleChange: StyleChange }) {
  const style = node.style
  const flow: FlowChoice = style.alongPath ? 'path' : (style.flow ?? 'freeform')
  const stack = flow === 'vertical' || flow === 'horizontal'
  const vertical = flow === 'vertical'
  // "Along path" isn't a CSS flow: the frame stays freeform and
  // model/pathFlow.ts writes the children's positions — so it is its own style
  // field, offered here as one more flow.
  const setFlow = (next: FlowChoice) =>
    next === 'path'
      ? onStyleChange({ flow: 'freeform', alongPath: style.alongPath ?? { spacing: 'even' } })
      : onStyleChange({ flow: next, alongPath: undefined })

  return (
    <Section title="LAYOUT">
      <Segmented label="FLOW" value={flow} options={FLOW_OPTIONS} onChange={setFlow} />

      {stack && (
        <>
          <Frame flow="horizontal" gap={8} w="fill" align="end" wrap="wrap">
            <Segmented
              label="ALIGN"
              value={style.align ?? 'start'}
              options={(['start', 'center', 'end', 'stretch'] as Align[]).map((a) => ({ id: a, title: `Align children: ${ALIGN_LABEL[a]}`, icon: alignIcon(a, vertical) }))}
              onChange={(align) => onStyleChange({ align: align === 'start' ? undefined : align })}
            />
          </Frame>
          <Segmented
            label="DISTRIBUTE"
            value={style.justify ?? 'start'}
            options={(['start', 'center', 'end', 'between', 'around'] as Justify[]).map((j) => ({ id: j, title: JUSTIFY_LABEL[j], icon: justifyIcon(j, vertical) }))}
            onChange={(justify) => onStyleChange({ justify: justify === 'start' ? undefined : justify })}
          />
          <Frame flow="horizontal" gap={6} w="fill" align="end">
            <NumberField label="GAP" value={style.gap ?? 0} min={0} onChange={(gap) => onStyleChange({ gap: gap || undefined }, 'gap')} />
            {!vertical && (
              <Frame flow="vertical" gap={3}>
                <Label>WRAP</Label>
                <IconButton title={style.wrap ? 'Wrapping onto new rows' : 'One row'} icon={ICONS.wrap} pressed={!!style.wrap} onClick={() => onStyleChange({ wrap: style.wrap ? undefined : true })} />
              </Frame>
            )}
          </Frame>
        </>
      )}

      {flow === 'grid' && (
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="COLUMNS" value={style.cols ?? 2} min={1} onChange={(cols) => onStyleChange({ cols: Math.max(1, Math.round(cols)) }, 'cols')} />
          <NumberField label="GAP" value={style.gap ?? 0} min={0} onChange={(gap) => onStyleChange({ gap: gap || undefined }, 'gap')} />
        </Frame>
      )}

      {style.alongPath && (
        <AlongPathFields
          alongPath={style.alongPath}
          gap={style.gap ?? 0}
          hasGuide={node.kind === 'frame' && node.children.some((c) => c.kind === 'vector')}
          onStyleChange={onStyleChange}
        />
      )}

      {flow === 'freeform' && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Children sit wherever you put them. Pick a stack or grid to have the frame lay them out.
        </span>
      )}
    </Section>
  )
}

/** Settings for an "Along path" frame (CanvasStyle.alongPath, model/pathFlow.ts). */
function AlongPathFields({
  alongPath,
  gap,
  hasGuide,
  onStyleChange,
}: {
  alongPath: AlongPath
  gap: number
  hasGuide: boolean
  onStyleChange: StyleChange
}) {
  const set = (patch: Partial<AlongPath>, gesture?: string) => onStyleChange({ alongPath: { ...alongPath, ...patch } }, gesture)
  const spacing = alongPath.spacing ?? 'even'
  const check: React.CSSProperties = { ...MONO, fontSize: 9, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }
  return (
    <Frame flow="vertical" gap={8} w="fill">
      {!hasGuide && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Draw the path inside this frame — P for the pen, or O for a ring. Its bottom-most vector layer is the
          path; every other layer is spaced along it.
        </span>
      )}
      <Frame flow="horizontal" gap={8} w="fill" align="end">
        <Segmented
          label="SPACING"
          value={spacing}
          options={[
            { id: 'even', title: 'Even — share the whole path', icon: ICONS['even-spacing'] },
            { id: 'gap', title: 'Fixed gap between pieces', icon: ICONS['gap-spacing'] },
          ]}
          onChange={(s) => set({ spacing: s })}
        />
        {spacing === 'gap' && <NumberField label="GAP" value={gap} onChange={(n) => onStyleChange({ gap: n }, 'gap')} />}
      </Frame>
      {/* Pattern: the first layer repeated along the path (model/pathPattern.ts). */}
      <Frame flow="horizontal" gap={6} w="fill" align="end">
        <label style={{ ...check, paddingBottom: 5 }}>
          <input type="checkbox" checked={alongPath.repeat !== undefined} onChange={(e) => set({ repeat: e.target.checked ? 8 : undefined })} />
          REPEAT FIRST LAYER
        </label>
        {alongPath.repeat !== undefined && (
          <>
            <NumberField
              label="COUNT"
              value={alongPath.repeat === 'fill' ? undefined : alongPath.repeat}
              min={1}
              max={MAX_PATTERN}
              disabled={alongPath.repeat === 'fill'}
              onChange={(n) => set({ repeat: Math.round(n) }, 'path:repeat')}
            />
            <label style={{ ...check, paddingBottom: 5 }}>
              <input
                type="checkbox"
                checked={alongPath.repeat === 'fill'}
                onChange={(e) => set({ repeat: e.target.checked ? 'fill' : 8, ...(e.target.checked ? { spacing: 'gap' } : {}) })}
              />
              FILL PATH
            </label>
          </>
        )}
      </Frame>
      <Frame flow="horizontal" gap={6} w="fill" align="center">
        <NumberField label="OFFSET" value={alongPath.offset ?? 0} onChange={(n) => set({ offset: n || undefined }, 'path:offset')} />
        <label style={check}>
          <input type="checkbox" checked={!!alongPath.orient} onChange={(e) => set({ orient: e.target.checked || undefined })} />
          ROTATE TO PATH
        </label>
      </Frame>
    </Frame>
  )
}

// ── SPACING ─────────────────────────────────────────────────────────────────

const SIDES = ['top', 'right', 'bottom', 'left'] as const

function sidesOf(value: number | Padding | undefined): Required<Padding> {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value }
  return { top: value?.top ?? 0, right: value?.right ?? 0, bottom: value?.bottom ?? 0, left: value?.left ?? 0 }
}

/** Stored the compact way: a single number when every side matches, nothing when all are 0. */
function compact(sides: Required<Padding>): number | Padding | undefined {
  const { top, right, bottom, left } = sides
  if (top === right && right === bottom && bottom === left) return top === 0 ? undefined : top
  return sides
}

/** A side's icon: the box with that one edge drawn heavy. */
function sideIcon(side: (typeof SIDES)[number] | 'all') {
  const edge = { top: 'M3 3h10', right: 'M13 3v10', bottom: 'M3 13h10', left: 'M3 3v10', all: 'M3 3h10v10H3z' }[side]
  return (
    <Glyph>
      <rect x={3} y={3} width={10} height={10} rx={1} strokeOpacity={0.35} strokeDasharray="1.5 1.5" />
      <path d={edge} strokeWidth={2} />
    </Glyph>
  )
}

/**
 * Four-sided spacing (padding or margin): one ALL field while the sides match,
 * split into top/right/bottom/left with the toggle beside it.
 */
function SpacingFields({
  label,
  value,
  disabled,
  gesture,
  onChange,
}: {
  label: string
  value: number | Padding | undefined
  disabled?: boolean
  gesture: string
  onChange: (next: number | Padding | undefined, gesture?: string) => void
}) {
  const sides = sidesOf(value)
  const split = typeof value === 'object'
  return (
    <Frame flow="vertical" gap={3} w="fill">
      <Frame flow="horizontal" align="center" justify="between" w="fill">
        <Label>{label}</Label>
        <IconButton
          title={split ? `Same ${label.toLowerCase()} on every side` : `${label[0]}${label.slice(1).toLowerCase()} per side`}
          icon={sideIcon(split ? 'all' : 'left')}
          pressed={split}
          disabled={disabled}
          onClick={() => onChange(split ? compact({ top: sides.top, right: sides.top, bottom: sides.top, left: sides.top }) : { ...sides })}
        />
      </Frame>
      {split ? (
        <Frame flow="horizontal" gap={4} w="fill">
          {SIDES.map((side) => (
            <Frame key={side} flow="horizontal" align="center" gap={2} grow style={{ minWidth: 0 }}>
              <span title={side} style={{ color: 'var(--text-3)', display: 'grid', flexShrink: 0 }}>{sideIcon(side)}</span>
              <NumberField value={sides[side]} min={0} disabled={disabled} onChange={(n) => onChange({ ...sides, [side]: n }, `${gesture}:${side}`)} />
            </Frame>
          ))}
        </Frame>
      ) : (
        <Frame flow="horizontal" align="center" gap={4} w="fill">
          <span style={{ color: 'var(--text-3)', display: 'grid', flexShrink: 0 }}>{sideIcon('all')}</span>
          <NumberField value={sides.top} min={0} disabled={disabled} onChange={(n) => onChange(compact({ top: n, right: n, bottom: n, left: n }), gesture)} />
        </Frame>
      )}
    </Frame>
  )
}

/**
 * Padding (a frame's inner space, for the children an auto-layout places) and
 * margin (the space a node keeps around itself inside an auto-layout parent).
 * Each says plainly when it has nothing to act on, rather than silently doing
 * nothing.
 */
export function SpacingSection({ node, parentFlow, onStyleChange }: { node: CanvasNode; parentFlow: Flow | undefined; onStyleChange: StyleChange }) {
  const style = node.style
  const isFrame = node.kind === 'frame'
  const laysOut = isFrame && !!style.flow && style.flow !== 'freeform'
  const inLayout = !!parentFlow && parentFlow !== 'freeform'
  const note: React.CSSProperties = { ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }
  return (
    <Section title="SPACING">
      {isFrame && (
        <>
          <SpacingFields label="PADDING" value={style.padding} gesture="padding" onChange={(padding, g) => onStyleChange({ padding }, g)} />
          {!laysOut && style.padding === undefined && (
            <span style={note}>Padding spaces the children a stack or grid lays out.</span>
          )}
        </>
      )}
      <SpacingFields label="MARGIN" value={style.margin} disabled={!inLayout} gesture="margin" onChange={(margin, g) => onStyleChange({ margin }, g)} />
      {!inLayout && <span style={note}>Margin applies inside a stack or grid — this layer is placed freely.</span>}
    </Section>
  )
}
