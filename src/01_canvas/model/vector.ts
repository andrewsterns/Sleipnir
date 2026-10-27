// Vector nodes → SVG. The geometry and paint for shapes and pen paths, as
// plain element descriptions that the board renders as React elements and the
// emitter writes as JSX — one derivation, the same promise toCss.ts makes for
// boxes.
//
// Paint follows the box model's (see paint.ts) as closely as SVG allows. Each
// visible fill is its own copy of the shape, bottom to top, exactly as Figma
// paints a fill stack; the stroke is one more copy on top. Where SVG can't
// express something the canvas can author, it degrades rather than lies:
//
//   - an angular (conic) gradient has no SVG equivalent → its first stop, flat
//   - a tiled image → covers the shape instead (tile size needs the image's
//     natural size, which isn't known when the code is written)
//   - stroke position → always centered on the outline, SVG's only option
//   - drop shadows follow the shape (CSS drop-shadow), but have no spread
//   - inner shadows → not drawn

import { colorWithAlpha, effectsOf, isAbsoluteImageSrc, isPaintVisible, type ImageUrlResolver } from './paint'
import { cssColor, type CssProps } from './toCss'
import type { CanvasStyle, CanvasVectorNode, ColorRef, Fill, GradientStop, StrokeStyle, VectorPoint } from './types'

/** One SVG element, by its React prop names — written as JSX or created as a React element. */
export interface SvgEl {
  tag: string
  attrs: Record<string, string | number>
  /** Inline CSS, for values a presentation attribute can't take (a `var()` token). */
  style?: CssProps
  children?: SvgEl[]
}

/** Where a shape sits, in the coordinate space of the <svg> drawing it. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Two decimals at most, no trailing zeros — keeps emitted path data readable. */
export function num(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Geometry ───────────────────────────────────────────────────────────────

/**
 * A regular polygon stretched to fill its box, first vertex at top center —
 * Figma's polygon tool, so a 3-sided one is a triangle whose base is the
 * bottom edge.
 */
export function polygonPoints(sides: number, box: Box): { x: number; y: number }[] {
  const n = Math.max(3, Math.round(sides))
  const raw = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: Math.cos(a), y: Math.sin(a) }
  })
  const minX = Math.min(...raw.map((p) => p.x))
  const maxX = Math.max(...raw.map((p) => p.x))
  const minY = Math.min(...raw.map((p) => p.y))
  const maxY = Math.max(...raw.map((p) => p.y))
  return raw.map((p) => ({
    x: num(box.x + ((p.x - minX) / (maxX - minX || 1)) * box.w),
    y: num(box.y + ((p.y - minY) / (maxY - minY || 1)) * box.h),
  }))
}

/**
 * A pen path's `d`, its points scaled from the space they were drawn in to the
 * box the node occupies now. Straight between two sharp anchors, a cubic
 * bezier wherever either end has a handle.
 */
type XY = { x: number; y: number }

/** A rounded corner: where its arc leaves the incoming line, where it joins the outgoing one, and how it turns. */
interface Fillet {
  start: XY
  end: XY
  r: number
  sweep: 0 | 1
}

/**
 * The circular arc that rounds the corner at `p` between straight lines to
 * `a` and `b`, or null when there is nothing to round (no radius, a straight
 * line through, a zero-length side). The arc is tangent to both lines; when
 * they are too short for the radius asked, it shrinks to fit half of the
 * shorter one — so two rounded neighbours can never overlap — exactly as a
 * CSS border-radius gives way on a small box.
 */
function fillet(p: XY, a: XY, b: XY, radius: number): Fillet | null {
  if (!(radius > 0)) return null
  const la = Math.hypot(a.x - p.x, a.y - p.y)
  const lb = Math.hypot(b.x - p.x, b.y - p.y)
  if (la < 1e-6 || lb < 1e-6) return null
  const u1 = { x: (a.x - p.x) / la, y: (a.y - p.y) / la }
  const u2 = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb }
  const theta = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)))
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return null
  const half = Math.tan(theta / 2)
  let t = radius / half
  const tMax = Math.min(la, lb) / 2
  let r = radius
  if (t > tMax) {
    t = tMax
    r = t * half
  }
  // Moving in along -u1 then out along u2: a positive cross product is a
  // right-hand (clockwise on screen) turn, which is SVG's sweep-flag 1.
  const cross = -u1.x * u2.y + u1.y * u2.x
  return {
    start: { x: p.x + u1.x * t, y: p.y + u1.y * t },
    end: { x: p.x + u2.x * t, y: p.y + u2.y * t },
    r,
    sweep: cross > 0 ? 1 : 0,
  }
}

export function pathData(points: VectorPoint[], closed: boolean, box: Box, viewBox: { w: number; h: number }): string {
  const n = points.length
  if (n === 0) return ''
  const sx = box.w / (viewBox.w || 1)
  const sy = box.h / (viewBox.h || 1)
  const map = (q: XY): XY => ({ x: box.x + q.x * sx, y: box.y + q.y * sy })
  const fmt = (q: XY) => `${num(q.x)} ${num(q.y)}`
  const pts = points.map((p) => ({ at: map(p), in: p.in && map(p.in), out: p.out && map(p.out), radius: p.radius }))
  const wraps = closed && n > 2

  // Rounding needs a sharp anchor with straight lines on both sides.
  const fillets = pts.map((p, i) => {
    if (!p.radius || p.in || p.out) return null
    const prevI = i > 0 ? i - 1 : wraps ? n - 1 : -1
    const nextI = i < n - 1 ? i + 1 : wraps ? 0 : -1
    if (prevI < 0 || nextI < 0) return null
    const prev = pts[prevI]
    const next = pts[nextI]
    if (prev.out || next.in) return null
    return fillet(p.at, prev.at, next.at, p.radius)
  })

  const arc = (f: Fillet) => `A ${num(f.r)} ${num(f.r)} 0 0 ${f.sweep} ${fmt(f.end)}`
  // Arriving at anchor `to` along the segment from anchor `from`.
  const segment = (fromI: number, toI: number) => {
    const from = pts[fromI]
    const to = pts[toI]
    if (from.out || to.in) return `C ${fmt(from.out ?? from.at)} ${fmt(to.in ?? to.at)} ${fmt(to.at)}`
    const f = fillets[toI]
    return f ? `L ${fmt(f.start)} ${arc(f)}` : `L ${fmt(to.at)}`
  }

  const first = fillets[0]
  const parts = [`M ${fmt(wraps && first ? first.end : pts[0].at)}`]
  for (let i = 1; i < n; i += 1) parts.push(segment(i - 1, i))
  if (wraps) {
    // The closing segment, unless it is a straight line to an unrounded start
    // (Z draws that one for free).
    if (pts[n - 1].out || pts[0].in || first) parts.push(segment(n - 1, 0))
    parts.push('Z')
  }
  return parts.join(' ')
}

/** The bounds of a set of anchors and their handles. */
export function pointsBounds(points: VectorPoint[]): Box {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of points) {
    for (const q of [p, p.in, p.out]) {
      if (!q) continue
      xs.push(q.x)
      ys.push(q.y)
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** A rectangle's four corner radii, top-left clockwise — a uniform radius repeated. */
export function cornerRadii(style: CanvasStyle): [number, number, number, number] {
  const r = style.radius
  if (r === undefined) return [0, 0, 0, 0]
  if (typeof r === 'number') return [r, r, r, r]
  return [r.tl ?? 0, r.tr ?? 0, r.br ?? 0, r.bl ?? 0]
}

/** A rectangle's corners as path points, each carrying its own radius. */
export function rectanglePoints(style: CanvasStyle, w: number, h: number): VectorPoint[] {
  const [tl, tr, br, bl] = cornerRadii(style)
  const corner = (x: number, y: number, radius: number): VectorPoint => (radius > 0 ? { x, y, radius } : { x, y })
  return [corner(0, 0, tl), corner(w, 0, tr), corner(w, h, br), corner(0, h, bl)]
}

/** The bare shape — no paint — for a vector node occupying `box`. */
export function vectorShape(node: Pick<CanvasVectorNode, 'shape' | 'sides' | 'points' | 'closed' | 'viewBox' | 'style'>, box: Box): SvgEl {
  switch (node.shape) {
    case 'ellipse':
      return { tag: 'ellipse', attrs: { cx: num(box.x + box.w / 2), cy: num(box.y + box.h / 2), rx: num(box.w / 2), ry: num(box.h / 2) } }
    case 'polygon':
      return {
        tag: 'polygon',
        attrs: { points: polygonPoints(node.sides ?? 3, box).map((p) => `${num(p.x)},${num(p.y)}`).join(' ') },
      }
    case 'path':
      return { tag: 'path', attrs: { d: pathData(node.points ?? [], !!node.closed, box, node.viewBox ?? { w: box.w, h: box.h }) } }
    default: {
      const [tl, tr, br, bl] = cornerRadii(node.style)
      // Corners that differ have no <rect> form — the rect becomes the path
      // that rounds each one by its own radius.
      if (!(tl === tr && tr === br && br === bl)) {
        return { tag: 'path', attrs: { d: pathData(rectanglePoints(node.style, box.w, box.h), true, box, { w: box.w, h: box.h }) } }
      }
      const rx = Math.max(0, Math.min(tl, box.w / 2, box.h / 2))
      return {
        tag: 'rect',
        attrs: { x: num(box.x), y: num(box.y), width: num(box.w), height: num(box.h), ...(rx > 0 ? { rx: num(rx) } : {}) },
      }
    }
  }
}

// ── Paint ──────────────────────────────────────────────────────────────────

/**
 * A color as an attribute where SVG takes it as one, or as inline style where
 * it can't: presentation attributes don't resolve CSS variables, so a token
 * (`bg-2` → `var(--bg-2)`) has to go through `style`.
 */
function colorProp(prop: string, ref: ColorRef, target: SvgEl): void {
  const value = cssColor(ref)
  if (value.includes('var(')) target.style = { ...target.style, [prop]: value }
  else target.attrs[prop] = value
}

function stopEls(stops: GradientStop[], opacity: number): SvgEl[] {
  const sorted = [...stops].sort((a, b) => a.position - b.position)
  return sorted.map((stop) => {
    const el: SvgEl = { tag: 'stop', attrs: { offset: `${num(Math.min(1, Math.max(0, stop.position)) * 100)}%` } }
    colorProp('stopColor', stop.color, el)
    const alpha = (stop.opacity ?? 1) * opacity
    if (alpha < 1) el.attrs.stopOpacity = num(alpha)
    return el
  })
}

const SCALE_ASPECT: Record<string, string> = { fill: 'xMidYMid slice', fit: 'xMidYMid meet', stretch: 'none', tile: 'xMidYMid slice' }

/** One fill as a paint server (or a flat color), for a shape occupying `box`. */
function fillPaint(
  fill: Fill,
  id: string,
  box: Box,
  imageUrl: ImageUrlResolver,
): { def?: SvgEl; color?: ColorRef; server?: string; opacity: number } | null {
  const opacity = Math.min(1, Math.max(0, fill.opacity ?? 1))
  switch (fill.type) {
    case 'linear': {
      if (fill.stops.length === 0) return null
      // CSS's angle convention: 0 runs bottom → top, clockwise from there.
      const a = (fill.angle * Math.PI) / 180
      const dx = Math.sin(a) / 2
      const dy = -Math.cos(a) / 2
      return {
        server: id,
        opacity: 1,
        def: {
          tag: 'linearGradient',
          attrs: { id, x1: num(0.5 - dx), y1: num(0.5 - dy), x2: num(0.5 + dx), y2: num(0.5 + dy) },
          children: stopEls(fill.stops, opacity),
        },
      }
    }
    case 'radial': {
      if (fill.stops.length === 0) return null
      const c = fill.center ?? { x: 0.5, y: 0.5 }
      const r = fill.radius ?? { x: 0.5, y: 0.5 }
      const round = Math.abs(r.x - r.y) < 1e-6
      return {
        server: id,
        opacity: 1,
        def: {
          tag: 'radialGradient',
          attrs: round
            ? { id, cx: num(c.x), cy: num(c.y), r: num(r.x) }
            : {
                id,
                cx: num(c.x),
                cy: num(c.y),
                r: 1,
                gradientTransform: `translate(${num(c.x)} ${num(c.y)}) scale(${num(r.x)} ${num(r.y)}) translate(${num(-c.x)} ${num(-c.y)})`,
              },
          children: stopEls(fill.stops, opacity),
        },
      }
    }
    case 'angular': {
      const first = [...fill.stops].sort((a, b) => a.position - b.position)[0]
      if (!first) return null
      return { color: first.color, opacity: opacity * (first.opacity ?? 1) }
    }
    case 'image': {
      const src = fill.src.trim()
      if (!src) return null
      const href = isAbsoluteImageSrc(src) ? src : imageUrl(src)
      if (!href) return null
      return {
        server: id,
        opacity,
        def: {
          tag: 'pattern',
          attrs: { id, patternUnits: 'objectBoundingBox', width: 1, height: 1 },
          children: [
            {
              tag: 'image',
              attrs: { href, width: num(box.w), height: num(box.h), preserveAspectRatio: SCALE_ASPECT[fill.scaleMode ?? 'fill'] },
            },
          ],
        },
      }
    }
    default:
      return { color: fill.color, opacity }
  }
}

function strokeOf(shape: SvgEl, stroke: StrokeStyle): SvgEl {
  const el: SvgEl = { tag: shape.tag, attrs: { ...shape.attrs, fill: 'none' } }
  colorProp('stroke', stroke.color, el)
  el.attrs.strokeWidth = stroke.width
  if (stroke.style === 'dashed') el.attrs.strokeDasharray = `${num(stroke.width * 3)} ${num(stroke.width * 2)}`
  if (stroke.style === 'dotted') {
    el.attrs.strokeDasharray = `0 ${num(stroke.width * 2)}`
    el.attrs.strokeLinecap = 'round'
  }
  return el
}

/**
 * Everything a shape needs inside an <svg>: paint servers for `<defs>`, then
 * one copy of the shape per visible fill (bottom first) and one for the
 * stroke. `idPrefix` keeps gradient and pattern ids unique within the <svg>.
 */
export function paintedShape(
  shape: SvgEl,
  style: CanvasStyle,
  box: Box,
  idPrefix: string,
  imageUrl: ImageUrlResolver,
): { defs: SvgEl[]; els: SvgEl[] } {
  const defs: SvgEl[] = []
  const els: SvgEl[] = []
  ;(style.fills ?? []).forEach((fill, i) => {
    if (!isPaintVisible(fill)) return
    const paint = fillPaint(fill, `${idPrefix}-fill-${i}`, box, imageUrl)
    if (!paint) return
    const el: SvgEl = { tag: shape.tag, attrs: { ...shape.attrs } }
    if (paint.def) defs.push(paint.def)
    if (paint.server) el.attrs.fill = `url(#${paint.server})`
    // A flat color carries its alpha in fill-opacity, which keeps a token a token.
    else if (paint.color) colorProp('fill', paint.color, el)
    if (paint.opacity < 1) el.attrs.fillOpacity = num(paint.opacity)
    els.push(el)
  })
  if (style.stroke && style.stroke.width > 0) els.push(strokeOf(shape, style.stroke))
  // Nothing to paint still needs the outline present, so it can be hit and selected.
  if (els.length === 0) els.push({ tag: shape.tag, attrs: { ...shape.attrs, fill: 'none' } })
  return { defs, els }
}

/**
 * Effects on an <svg>, as CSS. drop-shadow() follows the painted shape rather
 * than its box, which is the point of drawing it as SVG — but takes no spread.
 * Inner shadows have no CSS form on SVG and are skipped (the inspector says so).
 */
export function vectorEffectsCss(style: CanvasStyle): CssProps {
  const css: CssProps = {}
  const filters: string[] = []
  for (const e of effectsOf(style).filter(isPaintVisible)) {
    if (e.type === 'drop-shadow') filters.push(`drop-shadow(${e.x}px ${e.y}px ${e.blur}px ${colorWithAlpha(e.color, e.opacity ?? 1)})`)
    if (e.type === 'layer-blur' && e.radius > 0) filters.push(`blur(${e.radius}px)`)
    if (e.type === 'background-blur' && e.radius > 0) {
      css.backdropFilter = `blur(${e.radius}px)`
      css.WebkitBackdropFilter = `blur(${e.radius}px)`
    }
  }
  if (filters.length > 0) css.filter = filters.join(' ')
  if (style.opacity !== undefined) css.opacity = style.opacity
  return css
}

export const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * A vector node drawn as its own <svg> — how a vector appears on the board,
 * and inside a component emitted as divs. Its viewBox is its own box, so its
 * geometry is in its own pixels and nothing is scaled. `overflow: visible`
 * lets a stroke on the outline, or a shadow, reach past the box.
 */
export function vectorSvg(node: CanvasVectorNode, idPrefix: string, imageUrl: ImageUrlResolver, css: CssProps = {}): SvgEl {
  const box: Box = { x: 0, y: 0, w: node.rect.w, h: node.rect.h }
  const { defs, els } = paintedShape(vectorShape(node, box), node.style, box, idPrefix, imageUrl)
  return {
    tag: 'svg',
    attrs: { width: num(box.w), height: num(box.h), viewBox: `0 0 ${num(box.w)} ${num(box.h)}`, fill: 'none', xmlns: SVG_NS },
    style: { ...css, ...vectorEffectsCss(node.style), overflow: 'visible' },
    children: [...(defs.length > 0 ? [{ tag: 'defs', attrs: {}, children: defs }] : []), ...els],
  }
}
