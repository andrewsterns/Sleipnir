// Fills and effects → CSS. The paint half of toCss.ts, split out because it is
// most of the Figma-parity surface and wants its own tests.
//
// Same contract as toCss: one derivation, used by the board renderer and the
// code emitter alike, so what you paint is what the file contains.
//
// The model is Figma's (see types.ts's Paint): a stack of paints painted
// bottom to top, each with its own opacity. CSS backgrounds are also a stack,
// but listed TOP first, and have no per-layer opacity — so opacity is baked
// into each paint's colors instead (rgba for literals, color-mix for tokens).
// Images are the one paint whose opacity can't be baked: there is no colour to
// fade. A stack containing a translucent image is drawn as one absolutely
// positioned layer per paint instead (see paintOverlays), each with its own
// `opacity`, behind the node's children.

import { cssColor, type CssProps } from './toCss'
import type {
  ColorRef,
  CanvasStyle,
  Effect,
  Fill,
  GradientStop,
  ImageFill,
  ShadowEffect,
} from './types'

/**
 * Turns an image fill's `src` into something `url()` can load, or undefined
 * when it can't be shown yet (a workspace file still being read). The board
 * resolves workspace paths to data URLs; the emitter resolves them to the
 * identifier of an `import` (see emit/react.ts).
 */
export type ImageUrlResolver = (src: string) => string | undefined

/** True for a src the browser can load as-is, with no workspace read or import. */
export function isAbsoluteImageSrc(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src.trim())
}

export const isPaintVisible = (paint: { visible?: boolean }) => paint.visible !== false

function clamp01(n: number | undefined, fallback = 1): number {
  if (n === undefined || Number.isNaN(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

/** Percent with at most two decimals, and no trailing zeros: 12.5, 50, 33.33. */
function pct(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` (the `#` optional) as 0–255 channels and 0–1 alpha; null for anything else. */
export function parseHex(value: string): { r: number; g: number; b: number; a: number } | null {
  const hex = value.trim().replace(/^#/, '')
  if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  }
}

/**
 * A color at `alpha` opacity. A hex literal becomes rgba(); a token (or any
 * other CSS color) is mixed with transparent, which keeps it a live token —
 * fading `bg-2` must still follow the theme, not freeze today's hex.
 */
export function colorWithAlpha(ref: ColorRef, alpha: number): string {
  const a = clamp01(alpha)
  const base = cssColor(ref)
  if (base === 'transparent') return base
  const hex = parseHex(ref)
  if (hex) {
    const combined = Math.round(hex.a * a * 1000) / 1000
    if (combined >= 1) return ref.trim()
    return `rgba(${hex.r}, ${hex.g}, ${hex.b}, ${combined})`
  }
  if (a >= 1) return base
  return `color-mix(in srgb, ${base} ${pct(a)}, transparent)`
}

function stopList(stops: GradientStop[], opacity: number): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  // CSS needs two stops; a lone stop is a flat color across the whole run.
  const usable = sorted.length === 1 ? [{ ...sorted[0], position: 0 }, { ...sorted[0], position: 1 }] : sorted
  return usable
    .map((stop) => `${colorWithAlpha(stop.color, clamp01(stop.opacity) * opacity)} ${pct(clamp01(stop.position, 0))}`)
    .join(', ')
}

/** One CSS background layer: an image plus how it sits in the box. */
interface PaintLayer {
  image: string
  position?: string
  size?: string
  repeat?: string
}

function imageLayer(fill: ImageFill, resolve: ImageUrlResolver): PaintLayer | null {
  const src = fill.src.trim()
  if (!src) return null
  const url = isAbsoluteImageSrc(src) ? src : resolve(src)
  if (!url) return null
  const image = `url(${JSON.stringify(url)})`
  switch (fill.scaleMode ?? 'fill') {
    case 'fit':
      return { image, position: 'center', size: 'contain', repeat: 'no-repeat' }
    case 'stretch':
      return { image, position: '0 0', size: '100% 100%', repeat: 'no-repeat' }
    case 'tile':
      return { image, position: '0 0', size: 'auto', repeat: 'repeat' }
    default:
      return { image, position: 'center', size: 'cover', repeat: 'no-repeat' }
  }
}

/**
 * One paint as a background layer. `opacity` is baked into colors; an image's
 * is not (the caller decides how to honor it — see paintCss).
 */
function fillLayer(fill: Fill, resolve: ImageUrlResolver): PaintLayer | null {
  const opacity = clamp01(fill.opacity)
  switch (fill.type) {
    case 'linear':
      if (fill.stops.length === 0) return null
      return { image: `linear-gradient(${fill.angle}deg, ${stopList(fill.stops, opacity)})` }
    case 'radial': {
      if (fill.stops.length === 0) return null
      const c = fill.center ?? { x: 0.5, y: 0.5 }
      const r = fill.radius ?? { x: 0.5, y: 0.5 }
      return {
        image: `radial-gradient(ellipse ${pct(r.x)} ${pct(r.y)} at ${pct(c.x)} ${pct(c.y)}, ${stopList(fill.stops, opacity)})`,
      }
    }
    case 'angular': {
      if (fill.stops.length === 0) return null
      const c = fill.center ?? { x: 0.5, y: 0.5 }
      return {
        image: `conic-gradient(from ${fill.angle ?? 0}deg at ${pct(c.x)} ${pct(c.y)}, ${stopList(fill.stops, opacity)})`,
      }
    }
    case 'image':
      return imageLayer(fill, resolve)
    default: {
      // A flat color as an image layer, so it can sit anywhere in the stack
      // rather than only at the bottom, where background-color is confined.
      const color = colorWithAlpha(fill.color, opacity)
      return { image: `linear-gradient(${color}, ${color})` }
    }
  }
}

function layerShorthand(layer: PaintLayer): string {
  let out = layer.image
  if (layer.position) out += ` ${layer.position}`
  if (layer.size) out += ` / ${layer.size}`
  if (layer.repeat) out += ` ${layer.repeat}`
  return out
}

/** Whether this stack has to be drawn as separate layers (see the header). */
function needsLayers(fills: Fill[]): boolean {
  return fills.some((f) => f.type === 'image' && clamp01(f.opacity) < 1)
}

/**
 * The node's own background for its fill stack. Empty when the stack is drawn
 * as layers instead — then it is only what makes those layers work: a
 * positioned box for them to fill, and an isolated stacking context so their
 * `z-index: -1` lands behind the children without escaping the node.
 */
export function paintCss(fills: Fill[] | undefined, resolve: ImageUrlResolver): CssProps {
  const visible = (fills ?? []).filter(isPaintVisible)
  if (visible.length === 0) return {}
  if (needsLayers(visible)) return { position: 'relative', isolation: 'isolate' }

  // The overwhelmingly common case stays the plain property it always was.
  const [only] = visible
  if (visible.length === 1 && (only.type === undefined || only.type === 'solid')) {
    return { background: colorWithAlpha(only.color, clamp01(only.opacity)) }
  }

  const layers = visible.map((fill) => fillLayer(fill, resolve)).filter((l): l is PaintLayer => l !== null)
  if (layers.length === 0) return {}
  // CSS lists the TOP layer first; the model lists the bottom first.
  return { background: layers.reverse().map(layerShorthand).join(', ') }
}

/**
 * The per-paint layers for a stack paintCss couldn't express as one
 * background, bottom first — render each as a child placed before the node's
 * real children. Empty for every other stack.
 */
export function paintOverlays(fills: Fill[] | undefined, resolve: ImageUrlResolver): CssProps[] {
  const visible = (fills ?? []).filter(isPaintVisible)
  if (!needsLayers(visible)) return []
  return visible.flatMap((fill) => {
    const layer = fillLayer(fill, resolve)
    if (!layer) return []
    const css: CssProps = {
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: -1,
      background: layerShorthand(layer),
    }
    // Colors already carry their opacity; an image's is the layer's.
    if (fill.type === 'image' && clamp01(fill.opacity) < 1) css.opacity = clamp01(fill.opacity)
    return [css]
  })
}

/** `effects`, or the legacy single `shadow` read as a drop shadow. */
export function effectsOf(style: CanvasStyle): Effect[] {
  if (style.effects) return style.effects
  return style.shadow ? [{ type: 'drop-shadow', ...style.shadow }] : []
}

function shadowColor(effect: ShadowEffect): string {
  return colorWithAlpha(effect.color, clamp01(effect.opacity))
}

/**
 * Figma's four effects. On a box: shadows are box-shadow (inner ones inset),
 * layer blur is `filter`, background blur is `backdrop-filter`. On text, a
 * drop shadow follows the glyphs (text-shadow, which has no spread) and an
 * inner shadow has no CSS equivalent, so it is dropped rather than faked as a
 * box shadow around the text's frame.
 */
export function effectsCss(style: CanvasStyle, { text = false }: { text?: boolean } = {}): CssProps {
  const css: CssProps = {}
  const visible = effectsOf(style).filter(isPaintVisible)

  const shadows = visible.filter((e): e is ShadowEffect => e.type === 'drop-shadow' || e.type === 'inner-shadow')
  if (text) {
    const drops = shadows.filter((e) => e.type === 'drop-shadow')
    if (drops.length > 0) css.textShadow = drops.map((e) => `${e.x}px ${e.y}px ${e.blur}px ${shadowColor(e)}`).join(', ')
  } else if (shadows.length > 0) {
    css.boxShadow = shadows
      .map((e) => `${e.type === 'inner-shadow' ? 'inset ' : ''}${e.x}px ${e.y}px ${e.blur}px ${e.spread ?? 0}px ${shadowColor(e)}`)
      .join(', ')
  }

  const layerBlurs = visible.filter((e) => e.type === 'layer-blur' && e.radius > 0)
  if (layerBlurs.length > 0) css.filter = layerBlurs.map((e) => `blur(${(e as { radius: number }).radius}px)`).join(' ')

  const backgroundBlur = visible.find((e) => e.type === 'background-blur' && e.radius > 0)
  if (backgroundBlur) {
    const value = `blur(${(backgroundBlur as { radius: number }).radius}px)`
    css.backdropFilter = value
    // Safari before 18 only knows the prefixed form, and this lands in
    // someone else's project, which may well ship to it.
    css.WebkitBackdropFilter = value
  }
  return css
}
