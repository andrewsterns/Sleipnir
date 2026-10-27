// The inspector's color picker, Figma-style: a swatch opens a floating panel
// beside the properties panel with a saturation/value square, hue and alpha
// strips, an eyedropper and the hex — instead of the OS picker, which can't
// sit next to the paint it edits or carry the fill-type tabs.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { hsvToRgb, parseCssRgb, rgbToHsv, toHex, type Hsv, type Rgba } from '../model/colorMath'
import { cssColor } from '../model/toCss'
import { parseHex, colorWithAlpha } from '../model/paint'
import type { ColorRef } from '../model/types'
import { FIELD, ICON_BUTTON, MONO, NumberField } from './inspectorKit'

export const CHECKERBOARD = 'repeating-conic-gradient(#8a8a8a 0% 25%, #c8c8c8 0% 50%) 50% / 8px 8px'

const PANEL_W = 240
const GAP = 12

// ── Floating panel ─────────────────────────────────────────────────────────

/**
 * A panel floating beside `anchor`, to its left — so a picker opened from the
 * properties panel lands over the canvas, not over the fields below it. Falls
 * back to below the anchor when there's no room on the left. Closes on a
 * press anywhere outside it (the anchor toggles it itself) and on Escape.
 */
export function FloatingPanel({
  anchor,
  onClose,
  header,
  children,
}: {
  anchor: HTMLElement
  onClose: () => void
  /** The title row's content — a title or the fill-type tabs. */
  header?: React.ReactNode
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Portals into the nearest `.theme-*` ancestor, not document.body: every
  // token this panel reads is scoped to that class (same as Dropdown's menu).
  let portalTarget: HTMLElement | null = anchor
  while (portalTarget && !Array.from(portalTarget.classList).some((c) => c.startsWith('theme-'))) {
    portalTarget = portalTarget.parentElement
  }

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const h = panelRef.current?.offsetHeight ?? 320
      const roomLeft = a.left - GAP - PANEL_W >= 8
      let left = roomLeft ? a.left - GAP - PANEL_W : Math.min(a.left, window.innerWidth - PANEL_W - 8)
      let top = roomLeft ? a.top - 8 : a.bottom + 6
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
      left = Math.max(8, left)
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }))
    }
    place()
    // Re-placed as its content grows (switching a fill to a gradient).
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    if (panelRef.current) observer?.observe(panelRef.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onPress = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || anchor.contains(target)) return
      // A dropdown/select menu opened from inside the panel portals elsewhere.
      if ((target as Element).closest?.('[data-floating-menu]')) return
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor])

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: PANEL_W,
        zIndex: 200,
        background: 'var(--bg-1)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-control)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 4px 6px 6px', borderBottom: '1px solid var(--border-1)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>{header}</div>
        <button type="button" title="Close" onClick={onClose} style={ICON_BUTTON}>
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
        {children}
      </div>
    </div>,
    portalTarget ?? document.body,
  )
}

/** A tab in a FloatingPanel's header — the fill types. */
export function PanelTab({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        ...MONO,
        fontSize: 9,
        letterSpacing: '0.02em',
        // Five fill types have to fit beside the close button in PANEL_W.
        padding: '3px 4px',
        flexShrink: 0,
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        background: active ? 'rgba(var(--item-ink, 255,255,255), 0.12)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
      }}
    >
      {children}
    </button>
  )
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-2)' }}>{children}</span>
}

// ── Swatch ─────────────────────────────────────────────────────────────────

/** The small paint preview at the start of a paint row; pressing it opens that paint's picker. */
export function Swatch({
  background,
  onClick,
  active = false,
  title,
}: {
  background: string | undefined
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  /** Its picker is open. */
  active?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        padding: 0,
        border: '1px solid var(--border-2)',
        borderRadius: 2,
        background: CHECKERBOARD,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        outline: active ? '1px solid var(--text-1)' : 'none',
        outlineOffset: 1,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, background }} />
    </button>
  )
}

// ── Picker ─────────────────────────────────────────────────────────────────

/** The live value of any ColorRef — a hex parses as-is, a theme token is read back from the DOM. */
function resolveColor(ref: ColorRef, probe: HTMLElement | null): Rgba {
  const hex = parseHex(ref)
  if (hex) return hex
  if (probe) {
    probe.style.color = ''
    probe.style.color = cssColor(ref)
    const rgb = parseCssRgb(getComputedStyle(probe).color)
    if (rgb) return rgb
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

/** Pointer drag over an element, reported as 0–1 fractions of its box. */
function useDrag(onMove: (fx: number, fy: number) => void) {
  const move = useRef(onMove)
  move.current = onMove
  return (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const report = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      move.current(
        Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
      )
    }
    report(e)
    const onPointerMove = (ev: PointerEvent) => report(ev)
    const onUp = () => {
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }
}

function Strip({ background, value, onChange }: { background: string; value: number; onChange: (v: number) => void }) {
  const drag = useDrag((fx) => onChange(fx))
  return (
    <div onPointerDown={drag} style={{ position: 'relative', height: 10, borderRadius: 5, background, cursor: 'pointer', touchAction: 'none' }}>
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: `${value * 100}%`,
          width: 12,
          height: 12,
          marginLeft: -6,
          marginTop: -6,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>
}
const eyeDropper = (): EyeDropperLike | null => {
  const Ctor = (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper
  return Ctor ? new Ctor() : null
}

/**
 * Edits one color. With `onOpacity` the alpha strip drives that separate
 * opacity (a fill's, a shadow's); without it, alpha is written into the hex
 * itself (`#rrggbbaa`) — a stroke has no opacity of its own.
 */
export function ColorPicker({
  color,
  opacity,
  onColor,
  onOpacity,
  gesture,
}: {
  color: ColorRef
  opacity?: number
  onColor: (next: ColorRef, gesture?: string) => void
  onOpacity?: (next: number, gesture?: string) => void
  gesture: string
}) {
  const probeRef = useRef<HTMLSpanElement>(null)
  const [rgba, setRgba] = useState<Rgba>(() => resolveColor(color, null))
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(rgba))
  // What this picker last wrote — an incoming color equal to it is our own
  // echo, and re-deriving HSV from it would snap the hue at grey or black.
  const lastWritten = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (color === lastWritten.current) return
    const next = resolveColor(color, probeRef.current)
    setRgba(next)
    setHsv((prev) => {
      const fresh = rgbToHsv(next)
      return fresh.s === 0 || fresh.v === 0 ? { ...fresh, h: prev.h } : fresh
    })
  }, [color])

  const alpha = onOpacity ? (opacity ?? 1) : rgba.a
  const writeHsv = (next: Hsv, a = alpha) => {
    setHsv(next)
    const rgb = hsvToRgb(next)
    // A separate opacity keeps whatever alpha the hex itself carried.
    const hex = toHex(rgb, onOpacity ? rgba.a : a)
    setRgba({ ...rgb, a: onOpacity ? rgba.a : a })
    lastWritten.current = hex
    onColor(hex, `${gesture}:color`)
  }
  const writeAlpha = (a: number) => {
    const rounded = Math.round(a * 100) / 100
    if (onOpacity) onOpacity(rounded, `${gesture}:opacity`)
    else writeHsv(hsv, rounded)
  }

  const squareDrag = useDrag((fx, fy) => writeHsv({ h: hsv.h, s: fx, v: 1 - fy }))
  const solid = toHex(hsvToRgb(hsv))
  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span ref={probeRef} style={{ display: 'none' }} />
      <div
        onPointerDown={squareDrag}
        style={{
          position: 'relative',
          height: 150,
          borderRadius: 3,
          cursor: 'crosshair',
          touchAction: 'none',
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h}, 100%, 50%)`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
            background: solid,
            pointerEvents: 'none',
          }}
        />
      </div>
      <Strip
        background="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
        value={hsv.h / 360}
        onChange={(f) => writeHsv({ ...hsv, h: Math.min(359.9, f * 360) })}
      />
      <Strip background={`linear-gradient(to right, transparent, ${solid}), ${CHECKERBOARD}`} value={alpha} onChange={writeAlpha} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {dropper && (
          <button
            type="button"
            title="Pick a color from the screen"
            onClick={() => {
              eyeDropper()
                ?.open()
                .then(({ sRGBHex }) => {
                  const picked = parseHex(sRGBHex) ?? parseCssRgb(sRGBHex)
                  if (!picked) return
                  writeHsv(rgbToHsv(picked))
                })
                .catch(() => {}) // dismissed with Escape
            }}
            style={{ ...ICON_BUTTON, border: '1px solid var(--border-1)', background: 'var(--bg-2)' }}
          >
            <EyedropperIcon />
          </button>
        )}
        <input
          value={color}
          spellCheck={false}
          placeholder="#ffffff or bg-2"
          onChange={(e) => onColor(e.target.value, `${gesture}:color`)}
          style={{ ...FIELD, flex: 1 }}
        />
        <div style={{ width: 52, flexShrink: 0 }}>
          <NumberField value={Math.round(alpha * 100)} min={0} max={100} suffix="%" onChange={(n) => writeAlpha(n / 100)} />
        </div>
      </div>
    </div>
  )
}

function EyedropperIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 4.5a2.1 2.1 0 0 0-3 0L13 8l-1-1-2 2 1 1-7 7v3h3l7-7 1 1 2-2-1-1 3.5-3.5a2.1 2.1 0 0 0 0-3z" />
    </svg>
  )
}

// ── Color row ──────────────────────────────────────────────────────────────

/**
 * One color as one row: swatch, the color as text (hex or a token id),
 * optionally its opacity, then whatever the caller adds (`children`). The
 * swatch opens the picker beside the panel.
 */
export function ColorField({
  color,
  opacity,
  onColor,
  onOpacity,
  gesture,
  title = 'Color',
  children,
}: {
  color: ColorRef
  opacity?: number
  onColor: (next: ColorRef, gesture?: string) => void
  onOpacity?: (next: number, gesture?: string) => void
  gesture: string
  /** The picker panel's title. */
  title?: string
  children?: React.ReactNode
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0 }}>
      <Swatch
        background={colorWithAlpha(color, opacity ?? 1)}
        active={!!anchor}
        title="Pick a color"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      />
      <input
        value={color}
        spellCheck={false}
        placeholder="#ffffff or bg-2"
        onChange={(e) => onColor(e.target.value, `${gesture}:color`)}
        style={{ ...FIELD, flex: 1 }}
      />
      {onOpacity && (
        <div style={{ width: 52, flexShrink: 0 }}>
          <NumberField
            value={Math.round((opacity ?? 1) * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(n) => onOpacity(n / 100, `${gesture}:opacity`)}
          />
        </div>
      )}
      {children}
      {anchor && (
        <FloatingPanel anchor={anchor} onClose={() => setAnchor(null)} header={<PanelTitle>{title.toUpperCase()}</PanelTitle>}>
          <ColorPicker color={color} opacity={opacity} onColor={onColor} onOpacity={onOpacity} gesture={gesture} />
        </FloatingPanel>
      )}
    </div>
  )
}
