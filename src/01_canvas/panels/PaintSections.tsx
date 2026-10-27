// Figma's paint panels for the properties inspector: the fill list (solid,
// linear / radial / angular gradient, image), gradient stops, and effects
// (drop shadow, inner shadow, layer blur, background blur). Each paint is one
// row; its swatch opens the paint's editor in a panel beside the inspector
// (see ColorPicker.tsx).
//
// Every edit goes out as a whole new list through `onChange`, with a gesture
// key naming the control that produced it — the ViewModel coalesces a run of
// edits from one control into one undo step, so dragging the color picker
// across the wheel is one Ctrl+Z, not three hundred.

import { memo, useRef, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { colorWithAlpha, isPaintVisible, paintCss, type ImageUrlResolver } from '../model/paint'
import type {
  Effect,
  EffectType,
  Fill,
  FillType,
  GradientFill,
  GradientStop,
  ImageScaleMode,
  UnitPoint,
} from '../model/types'
import { ACTION, FIELD, ICON_BUTTON, Label, MONO, NumberField, Section } from './inspectorKit'
import { CHECKERBOARD, ColorField, ColorPicker, FloatingPanel, PanelTab, Swatch } from './ColorPicker'

/** Sends a new value plus the gesture that produced it (see the header). */
type Emit<T> = (next: T, gesture?: string) => void

/** How the image fill editor finds and adds images — supplied by the ViewModel. */
export interface ImageSources {
  /** Every image file in the workspace, workspace-relative. */
  list: () => Promise<string[]>
  /** Copies a file from disk into `.canvas/assets/` and resolves its workspace path. */
  importFile: (file: File) => Promise<string>
}

const pct = (n: number | undefined, fallback = 1) => Math.round((n ?? fallback) * 100)

const isGradient = (fill: Fill): fill is GradientFill =>
  fill.type === 'linear' || fill.type === 'radial' || fill.type === 'angular'

const fillType = (fill: Fill): FillType => fill.type ?? 'solid'

const FILL_TYPES: { id: FillType; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
  { id: 'angular', label: 'Angular' },
  { id: 'image', label: 'Image' },
]

/** Figma's default new fill. */
const NEW_FILL: Fill = { type: 'solid', color: '#d9d9d9' }

/**
 * Switches a paint's type, keeping what carries over: a solid's color seeds a
 * gradient (opaque to clear, Figma's default), a gradient keeps its stops
 * across gradient kinds, and an image remembers its source.
 */
export function convertFill(fill: Fill, type: FillType): Fill {
  const common = {
    ...(fill.opacity !== undefined ? { opacity: fill.opacity } : {}),
    ...(fill.visible !== undefined ? { visible: fill.visible } : {}),
  }
  const primary =
    fill.type === undefined || fill.type === 'solid'
      ? fill.color
      : isGradient(fill)
        ? (fill.stops[0]?.color ?? '#000000')
        : '#d9d9d9'
  const stops: GradientStop[] = isGradient(fill)
    ? fill.stops
    : [
        { position: 0, color: primary },
        { position: 1, color: primary, opacity: 0 },
      ]
  switch (type) {
    case 'solid':
      return { ...common, type: 'solid', color: primary }
    case 'linear':
      return { ...common, type: 'linear', angle: fill.type === 'linear' ? fill.angle : 180, stops }
    case 'radial':
      return { ...common, type: 'radial', stops }
    case 'angular':
      return { ...common, type: 'angular', angle: 0, stops }
    case 'image':
      return { ...common, type: 'image', src: fill.type === 'image' ? fill.src : '', scaleMode: 'fill' }
  }
}

// ── Shared controls ────────────────────────────────────────────────────────

function EyeButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={visible ? 'Hide' : 'Show'}
      style={{ ...ICON_BUTTON, color: visible ? 'var(--text-2)' : 'var(--text-3)' }}
    >
      {visible ? '◉' : '○'}
    </button>
  )
}

function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} style={ICON_BUTTON}>
      −
    </button>
  )
}

function AddButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{ ...ICON_BUTTON, fontSize: 13 }}>
      +
    </button>
  )
}

const SELECT: React.CSSProperties = { ...FIELD, flex: 1, padding: '3px 4px' }

// ── Fills ──────────────────────────────────────────────────────────────────

/** The paint as a swatch: itself at full strength, so the preview reads even at low opacity. */
function fillPreview(fill: Fill, imageUrl: ImageUrlResolver): string | undefined {
  return paintCss([{ ...fill, opacity: 1, visible: true }], imageUrl).background as string | undefined
}

// Memoized, with stable callbacks from the inspector: dragging a node re-renders
// the inspector every frame (its X/Y change), but its fills don't.
export const FillsSection = memo(function FillsSection({
  fills,
  onChange,
  imageUrl,
  images,
  svg = false,
}: {
  fills: Fill[]
  onChange: Emit<Fill[]>
  imageUrl: ImageUrlResolver
  images: ImageSources
  /** The fills paint a vector, drawn as SVG — which has no conic gradient and can't tile an image of unknown size. */
  svg?: boolean
}) {
  // Which paint's picker is open, and the swatch it hangs off — Figma opens
  // one at a time.
  const [open, setOpen] = useState<{ index: number; anchor: HTMLElement } | null>(null)

  const replace = (index: number, next: Fill, gesture?: string) =>
    onChange(fills.map((f, i) => (i === index ? next : f)), gesture)
  const move = (index: number, by: number) => {
    const to = index + by
    if (to < 0 || to >= fills.length) return
    const next = [...fills]
    ;[next[index], next[to]] = [next[to], next[index]]
    onChange(next)
    setOpen((cur) => (cur ? { ...cur, index: to } : cur))
  }

  // Topmost paint first, as Figma's panel lists them; the model stores bottom first.
  const order = fills.map((_, i) => i).reverse()
  const openFill = open && fills[open.index] ? fills[open.index] : null

  return (
    <Section title="FILL" action={<AddButton title="Add fill" onClick={() => onChange([...fills, NEW_FILL])} />}>
      {fills.length === 0 && <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>No fill</span>}
      {order.map((index) => {
        const fill = fills[index]
        const visible = isPaintVisible(fill)
        const toggle = (e: React.MouseEvent<HTMLElement>) =>
          setOpen(open?.index === index ? null : { index, anchor: e.currentTarget })
        return (
          <Frame key={index} flow="horizontal" gap={4} align="center" w="fill" style={{ opacity: visible ? 1 : 0.5 }}>
            <Swatch background={fillPreview(fill, imageUrl)} active={open?.index === index} title="Edit fill" onClick={toggle} />
            {fill.type === undefined || fill.type === 'solid' ? (
              <input
                value={fill.color}
                spellCheck={false}
                placeholder="#ffffff or bg-2"
                onChange={(e) => replace(index, { ...fill, color: e.target.value }, `fill:${index}:color`)}
                style={{ ...FIELD, flex: 1 }}
              />
            ) : (
              // A gradient or image has no one value to type — its name opens
              // the editor, like pressing the swatch.
              <button type="button" onClick={toggle} style={{ ...FIELD, flex: 1, textAlign: 'left', cursor: 'pointer' }}>
                {FILL_TYPES.find((t) => t.id === fill.type)?.label}
              </button>
            )}
            <div style={{ width: 52, flexShrink: 0 }}>
              <NumberField
                value={pct(fill.opacity)}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => replace(index, { ...fill, opacity: n / 100 }, `fill:${index}:opacity`)}
              />
            </div>
            <EyeButton visible={visible} onToggle={() => replace(index, { ...fill, visible: !visible })} />
            <RemoveButton
              title="Remove fill"
              onClick={() => {
                onChange(fills.filter((_, i) => i !== index))
                setOpen(null)
              }}
            />
          </Frame>
        )
      })}
      {open && openFill && (
        <FloatingPanel
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          header={FILL_TYPES.map((t) => (
            <PanelTab
              key={t.id}
              active={fillType(openFill) === t.id}
              onClick={() => fillType(openFill) !== t.id && replace(open.index, convertFill(openFill, t.id))}
            >
              {t.label}
            </PanelTab>
          ))}
        >
          <FillEditor
            fill={openFill}
            gesture={`fill:${open.index}`}
            onChange={(next, gesture) => replace(open.index, next, gesture)}
            images={images}
            svg={svg}
            canRaise={open.index < fills.length - 1}
            canLower={open.index > 0}
            onRaise={() => move(open.index, 1)}
            onLower={() => move(open.index, -1)}
          />
        </FloatingPanel>
      )}
    </Section>
  )
})

function FillEditor({
  fill,
  gesture,
  onChange,
  images,
  svg,
  canRaise,
  canLower,
  onRaise,
  onLower,
}: {
  fill: Fill
  gesture: string
  onChange: Emit<Fill>
  images: ImageSources
  svg: boolean
  canRaise: boolean
  canLower: boolean
  onRaise: () => void
  onLower: () => void
}) {
  return (
    <>
      {(fill.type === undefined || fill.type === 'solid') && (
        <ColorPicker
          color={fill.color}
          opacity={fill.opacity}
          gesture={gesture}
          onColor={(color, g) => onChange({ ...fill, color }, g)}
          onOpacity={(opacity, g) => onChange({ ...fill, opacity }, g)}
        />
      )}

      {isGradient(fill) && (
        <GradientStops fill={fill} gesture={gesture} onChange={(stops, g) => onChange({ ...fill, stops }, g)} />
      )}
      {fill.type === 'linear' && (
        <NumberField label="ANGLE" value={fill.angle} suffix="°" onChange={(angle) => onChange({ ...fill, angle }, `${gesture}:angle`)} />
      )}
      {fill.type === 'angular' && (
        <NumberField label="START ANGLE" value={fill.angle ?? 0} suffix="°" onChange={(angle) => onChange({ ...fill, angle }, `${gesture}:angle`)} />
      )}
      {(fill.type === 'radial' || fill.type === 'angular') && (
        <PointFields
          label="CENTER"
          value={fill.center ?? { x: 0.5, y: 0.5 }}
          onChange={(center, g) => onChange({ ...fill, center }, `${gesture}:center:${g}`)}
        />
      )}
      {fill.type === 'radial' && (
        <PointFields
          label="RADIUS"
          axes={['W', 'H']}
          value={fill.radius ?? { x: 0.5, y: 0.5 }}
          onChange={(radius, g) => onChange({ ...fill, radius }, `${gesture}:radius:${g}`)}
        />
      )}

      {fill.type === 'image' && (
        <ImageFields
          src={fill.src}
          scaleMode={fill.scaleMode ?? 'fill'}
          images={images}
          onSrc={(src, g) => onChange({ ...fill, src }, g ?? `${gesture}:src`)}
          onScaleMode={(scaleMode) => onChange({ ...fill, scaleMode })}
        />
      )}

      {svg && fill.type === 'angular' && <SvgNote>SVG has no angular gradient — this draws as its first stop.</SvgNote>}
      {svg && fill.type === 'image' && fill.scaleMode === 'tile' && <SvgNote>SVG can't tile an image of unknown size — this covers the shape instead.</SvgNote>}

      {(canRaise || canLower) && (
        <Frame flow="horizontal" gap={4} w="fill">
          <button type="button" disabled={!canRaise} onClick={onRaise} style={{ ...ACTION, opacity: canRaise ? 1 : 0.4 }}>
            ▲ MOVE UP
          </button>
          <button type="button" disabled={!canLower} onClick={onLower} style={{ ...ACTION, opacity: canLower ? 1 : 0.4 }}>
            ▼ MOVE DOWN
          </button>
        </Frame>
      )}
    </>
  )
}

/** A point in the box, shown and typed as percentages. */
function PointFields({
  label,
  value,
  onChange,
  axes = ['X', 'Y'],
}: {
  label: string
  value: UnitPoint
  onChange: (next: UnitPoint, axis: 'x' | 'y') => void
  axes?: [string, string]
}) {
  return (
    <Frame flow="vertical" gap={2} w="fill">
      <Label>{label}</Label>
      <Frame flow="horizontal" gap={6} w="fill">
        <NumberField label={axes[0]} value={pct(value.x)} suffix="%" onChange={(n) => onChange({ ...value, x: n / 100 }, 'x')} />
        <NumberField label={axes[1]} value={pct(value.y)} suffix="%" onChange={(n) => onChange({ ...value, y: n / 100 }, 'y')} />
      </Frame>
    </Frame>
  )
}

/**
 * Figma's gradient editor: a bar with a handle per stop — click one to edit
 * it below, drag it to move, click the bar to add one there — then the picker
 * for the selected stop, then every stop as a row.
 */
function GradientStops({
  fill,
  gesture,
  onChange,
}: {
  fill: GradientFill
  gesture: string
  onChange: Emit<GradientStop[]>
}) {
  const stops = fill.stops
  const [selected, setSelected] = useState(0)
  const current = Math.min(selected, stops.length - 1)
  const stop = stops[current]
  const replace = (index: number, next: GradientStop, g?: string) => onChange(stops.map((s, i) => (i === index ? next : s)), g)
  // The bar always runs left to right so stops read in position order,
  // whatever the gradient's own geometry.
  const bar = paintCss([{ type: 'linear', angle: 90, stops }], () => undefined).background as string | undefined
  const barRef = useRef<HTMLDivElement>(null)

  const positionAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100) / 100
  }

  const dragStop = (index: number) => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setSelected(index)
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    // Reads the stops through this closure's own copy, updated as it goes —
    // the props won't re-render into it mid-drag.
    let latest = stops
    const onMove = (ev: PointerEvent) => {
      latest = latest.map((s, i) => (i === index ? { ...s, position: positionAt(ev.clientX) } : s))
      onChange(latest, `${gesture}:stop:${index}:position`)
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return (
    <Frame flow="vertical" gap={8} w="fill">
      <div
        ref={barRef}
        title="Click to add a stop"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const position = positionAt(e.clientX)
          onChange([...stops, { position, color: stop?.color ?? '#000000', opacity: stop?.opacity }])
          setSelected(stops.length)
        }}
        style={{
          position: 'relative',
          height: 16,
          margin: '0 6px',
          borderRadius: 3,
          border: '1px solid var(--border-1)',
          background: `${bar ?? 'transparent'}, ${CHECKERBOARD}`,
          cursor: 'copy',
        }}
      >
        {stops.map((s, i) => (
          <span
            key={i}
            onPointerDown={dragStop(i)}
            title={`Stop at ${pct(s.position, 0)}%`}
            style={{
              position: 'absolute',
              top: -3,
              left: `${s.position * 100}%`,
              width: 12,
              height: 20,
              marginLeft: -6,
              borderRadius: 3,
              border: `2px solid ${i === current ? 'var(--text-1)' : '#fff'}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
              background: `linear-gradient(${colorWithAlpha(s.color, s.opacity ?? 1)}, ${colorWithAlpha(s.color, s.opacity ?? 1)}), ${CHECKERBOARD}`,
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
          />
        ))}
      </div>

      {stop && (
        <ColorPicker
          color={stop.color}
          opacity={stop.opacity}
          gesture={`${gesture}:stop:${current}`}
          onColor={(color, g) => replace(current, { ...stop, color }, g)}
          onOpacity={(opacity, g) => replace(current, { ...stop, opacity }, g)}
        />
      )}

      <Frame flow="vertical" gap={4} w="fill">
        <Frame flow="horizontal" align="center" justify="between" w="fill">
          <Label>STOPS</Label>
          <AddButton
            title="Add stop"
            onClick={() => {
              // Between the two stops furthest apart, in the color of the first.
              const sorted = [...stops].sort((a, b) => a.position - b.position)
              let at = 0.5
              let color = sorted[0]?.color ?? '#000000'
              let widest = -1
              for (let i = 0; i < sorted.length - 1; i += 1) {
                const gap = sorted[i + 1].position - sorted[i].position
                if (gap > widest) {
                  widest = gap
                  at = sorted[i].position + gap / 2
                  color = sorted[i].color
                }
              }
              onChange([...stops, { position: Math.round(at * 100) / 100, color }])
              setSelected(stops.length)
            }}
          />
        </Frame>
        {stops.map((s, index) => (
          <Frame key={index} flow="horizontal" gap={4} align="center" w="fill">
            <div style={{ width: 46, flexShrink: 0 }}>
              <NumberField
                value={pct(s.position, 0)}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => replace(index, { ...s, position: n / 100 }, `${gesture}:stop:${index}:position`)}
              />
            </div>
            {/* The stop's own swatch selects it for the picker above. */}
            <Swatch
              background={colorWithAlpha(s.color, s.opacity ?? 1)}
              active={index === current}
              title="Edit this stop"
              onClick={() => setSelected(index)}
            />
            <input
              value={s.color}
              spellCheck={false}
              onFocus={() => setSelected(index)}
              onChange={(e) => replace(index, { ...s, color: e.target.value }, `${gesture}:stop:${index}:color`)}
              style={{ ...FIELD, flex: 1 }}
            />
            <div style={{ width: 46, flexShrink: 0 }}>
              <NumberField
                value={pct(s.opacity)}
                min={0}
                max={100}
                suffix="%"
                onChange={(n) => replace(index, { ...s, opacity: n / 100 }, `${gesture}:stop:${index}:opacity`)}
              />
            </div>
            {stops.length > 2 ? (
              <RemoveButton title="Remove stop" onClick={() => onChange(stops.filter((_, i) => i !== index))} />
            ) : (
              <span style={{ width: 20, flexShrink: 0 }} />
            )}
          </Frame>
        ))}
      </Frame>
    </Frame>
  )
}

const SCALE_MODES: { id: ImageScaleMode; label: string }[] = [
  { id: 'fill', label: 'Fill' },
  { id: 'fit', label: 'Fit' },
  { id: 'stretch', label: 'Stretch' },
  { id: 'tile', label: 'Tile' },
]

function ImageFields({
  src,
  scaleMode,
  images,
  onSrc,
  onScaleMode,
}: {
  src: string
  scaleMode: ImageScaleMode
  images: ImageSources
  onSrc: (src: string, gesture?: string) => void
  onScaleMode: (mode: ImageScaleMode) => void
}) {
  const [choices, setChoices] = useState<string[] | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const toggleChoices = () => {
    if (choices) {
      setChoices(null)
      return
    }
    setError(null)
    images
      .list()
      .then(setChoices)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }

  const shown = (choices ?? []).filter((p) => p.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 60)

  return (
    <Frame flow="vertical" gap={4} w="fill">
      <Label>SOURCE</Label>
      <input
        value={src}
        spellCheck={false}
        placeholder=".components/assets/… or https://…"
        onChange={(e) => onSrc(e.target.value)}
        style={FIELD}
      />
      <Frame flow="horizontal" gap={4} w="fill">
        <button type="button" onClick={toggleChoices} style={ACTION}>
          {choices ? 'CLOSE' : 'FROM WORKSPACE…'}
        </button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} style={{ ...ACTION, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'IMPORTING…' : 'IMPORT FILE…'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            setError(null)
            images
              .importFile(file)
              .then((path) => onSrc(path, 'import'))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false))
          }}
        />
      </Frame>
      {choices && (
        <Frame flow="vertical" gap={2} w="fill">
          <input value={filter} placeholder="filter images" onChange={(e) => setFilter(e.target.value)} style={FIELD} />
          <Frame flow="vertical" w="fill" style={{ maxHeight: 160, overflowY: 'auto' }}>
            {shown.length === 0 && <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', padding: 4 }}>No images found</span>}
            {shown.map((path) => (
              <button
                key={path}
                type="button"
                className="srow"
                title={path}
                onClick={() => {
                  onSrc(path, 'choose')
                  setChoices(null)
                }}
                style={{
                  ...MONO,
                  fontSize: 9,
                  textAlign: 'left',
                  padding: '3px 6px',
                  background: path === src ? 'var(--bg-2)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {path}
              </button>
            ))}
          </Frame>
        </Frame>
      )}
      {error && <span style={{ ...MONO, fontSize: 9, color: '#e07a7a' }}>{error}</span>}
      <Frame flow="vertical" gap={2} w="fill">
        <Label>SCALE</Label>
        <select value={scaleMode} onChange={(e) => onScaleMode(e.target.value as ImageScaleMode)} style={SELECT}>
          {SCALE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Frame>
    </Frame>
  )
}

// ── Effects ────────────────────────────────────────────────────────────────

const EFFECT_TYPES: { id: EffectType; label: string }[] = [
  { id: 'drop-shadow', label: 'Drop shadow' },
  { id: 'inner-shadow', label: 'Inner shadow' },
  { id: 'layer-blur', label: 'Layer blur' },
  { id: 'background-blur', label: 'Background blur' },
]

/** Figma's defaults for a new effect of each type. */
export function newEffect(type: EffectType, from?: Effect): Effect {
  const visible = from?.visible
  const keep = visible === undefined ? {} : { visible }
  if (type === 'layer-blur' || type === 'background-blur') {
    const radius = from && 'radius' in from ? from.radius : 4
    return { ...keep, type, radius }
  }
  if (from && (from.type === 'drop-shadow' || from.type === 'inner-shadow')) return { ...from, type }
  return { ...keep, type, x: 0, y: 4, blur: 4, spread: 0, color: '#000000', opacity: 0.25 }
}

/** Where SVG can't match what the canvas authors, said where it's authored. */
function SvgNote({ children }: { children: React.ReactNode }) {
  return <span style={{ ...MONO, fontSize: 9, color: '#e0b07a', lineHeight: 1.5 }}>{children}</span>
}

export const EffectsSection = memo(function EffectsSection({
  effects,
  onChange,
  text = false,
  svg = false,
}: {
  effects: Effect[]
  onChange: Emit<Effect[]>
  text?: boolean
  /** The effects apply to a vector: shadows follow the shape, so they take no spread and can't be inset. */
  svg?: boolean
}) {
  const replace = (index: number, next: Effect, gesture?: string) => onChange(effects.map((e, i) => (i === index ? next : e)), gesture)

  return (
    <Section title="EFFECTS" action={<AddButton title="Add effect" onClick={() => onChange([...effects, newEffect('drop-shadow')])} />}>
      {effects.length === 0 && <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>No effects</span>}
      {effects.map((effect, index) => {
        const visible = isPaintVisible(effect)
        const gesture = `effect:${index}`
        // On text, CSS can only follow the glyphs with a drop shadow (see
        // paint.ts's effectsCss) — say so rather than silently drawing nothing.
        const unsupported = (text || svg) && effect.type === 'inner-shadow'
        return (
          <Frame key={index} flow="vertical" gap={6} w="fill" style={{ opacity: visible ? 1 : 0.5 }}>
            <Frame flow="horizontal" gap={4} align="center" w="fill">
              <select value={effect.type} onChange={(e) => replace(index, newEffect(e.target.value as EffectType, effect))} style={SELECT}>
                {EFFECT_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <EyeButton visible={visible} onToggle={() => replace(index, { ...effect, visible: !visible })} />
              <RemoveButton title="Remove effect" onClick={() => onChange(effects.filter((_, i) => i !== index))} />
            </Frame>
            {unsupported && (
              <span style={{ ...MONO, fontSize: 9, color: '#e0b07a', lineHeight: 1.5 }}>
                {text ? "Inner shadows can't be drawn on text in CSS" : "Inner shadows can't follow an SVG shape"}, so this one is skipped.
              </span>
            )}
            {(effect.type === 'drop-shadow' || effect.type === 'inner-shadow') && (
              <>
                <Frame flow="horizontal" gap={6} w="fill">
                  <NumberField label="X" value={effect.x} onChange={(x) => replace(index, { ...effect, x }, `${gesture}:x`)} />
                  <NumberField label="Y" value={effect.y} onChange={(y) => replace(index, { ...effect, y }, `${gesture}:y`)} />
                </Frame>
                <Frame flow="horizontal" gap={6} w="fill">
                  <NumberField label="BLUR" value={effect.blur} min={0} onChange={(blur) => replace(index, { ...effect, blur }, `${gesture}:blur`)} />
                  <NumberField
                    label="SPREAD"
                    value={effect.spread ?? 0}
                    disabled={text || svg}
                    onChange={(spread) => replace(index, { ...effect, spread }, `${gesture}:spread`)}
                  />
                </Frame>
                <ColorField
                  color={effect.color}
                  opacity={effect.opacity}
                  gesture={gesture}
                  onColor={(color, g) => replace(index, { ...effect, color }, g)}
                  onOpacity={(opacity, g) => replace(index, { ...effect, opacity }, g)}
                />
              </>
            )}
            {(effect.type === 'layer-blur' || effect.type === 'background-blur') && (
              <NumberField label="BLUR" value={effect.radius} min={0} onChange={(radius) => replace(index, { ...effect, radius }, `${gesture}:radius`)} />
            )}
          </Frame>
        )
      })}
    </Section>
  )
})
