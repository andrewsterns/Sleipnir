// Editing a vector's points, and hit-testing a vector by its outline — the
// pure half of the pen's edit mode (CanvasView.ViewModel owns the gestures,
// board/CanvasBoard draws the anchors).
//
// Everything works in the node's LOCAL pixel space: an editable path's
// viewBox equals its rect's size, so a point's (x, y) is simply pixels from
// the node's top-left. toEditablePath establishes that once on entering edit
// mode; refit keeps it true after every change by moving the rect to wherever
// the points went.

import { isPaintVisible } from './paint'
import { num, polygonPoints, rectanglePoints } from './vector'
import type { CanvasVectorNode, VectorPoint } from './types'

type Pt = { x: number; y: number }
type Cubic = [Pt, Pt, Pt, Pt]

/** The circle-approximating handle length for a quarter-ellipse cubic. */
const KAPPA = 0.5523

function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
    y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y,
  }
}

/** The segments of a path as cubics (a straight one has its handles on its ends). */
function segments(points: VectorPoint[], closed: boolean): { from: number; c: Cubic }[] {
  const out: { from: number; c: Cubic }[] = []
  const n = points.length
  const count = closed && n > 2 ? n : n - 1
  for (let i = 0; i < count; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % n]
    out.push({ from: i, c: [a, a.out ?? a, b.in ?? b, b] })
  }
  return out
}

const isStraight = (c: Cubic) => c[0] === c[1] && c[2] === c[3]

/** The path flattened to a polyline, in local space — for hit-testing and bounds. */
export function flattenPath(points: VectorPoint[], closed: boolean, steps = 16): Pt[] {
  if (points.length === 0) return []
  const out: Pt[] = [{ x: points[0].x, y: points[0].y }]
  for (const seg of segments(points, closed)) {
    if (isStraight(seg.c)) {
      out.push({ x: seg.c[3].x, y: seg.c[3].y })
      continue
    }
    for (let s = 1; s <= steps; s += 1) out.push(cubicAt(seg.c, s / steps))
  }
  return out
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distToPolyline(p: Pt, line: Pt[], closed: boolean): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i += 1) best = Math.min(best, distToSegment(p, line[i], line[i + 1]))
  if (closed && line.length > 2) best = Math.min(best, distToSegment(p, line[line.length - 1], line[0]))
  return best
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function mapPoint(p: VectorPoint, f: (q: Pt) => Pt): VectorPoint {
  return {
    ...f(p),
    ...(p.in ? { in: f(p.in) } : {}),
    ...(p.out ? { out: f(p.out) } : {}),
    ...(p.radius ? { radius: p.radius } : {}),
  }
}

/** A path's points scaled from its viewBox to its rect — local pixels. */
function localPoints(node: CanvasVectorNode): VectorPoint[] {
  const vb = node.viewBox ?? { w: node.rect.w, h: node.rect.h }
  const sx = node.rect.w / (vb.w || 1)
  const sy = node.rect.h / (vb.h || 1)
  return (node.points ?? []).map((p) => mapPoint(p, (q) => ({ x: q.x * sx, y: q.y * sy })))
}

/**
 * Whether a local point hits the vector: inside its fill, or within
 * `tolerance` of its outline (always for an unfilled shape, so an open path or
 * a stroke-only ring can still be clicked). A rectangle is its box.
 */
export function vectorContains(node: CanvasVectorNode, x: number, y: number, tolerance: number): boolean {
  const { w, h } = node.rect
  const filled = (node.style.fills ?? []).some(isPaintVisible)
  const reach = tolerance + (node.style.stroke?.width ?? 0) / 2
  const p = { x, y }
  switch (node.shape) {
    case 'rectangle':
      return true
    case 'ellipse': {
      const rx = w / 2 || 1
      const ry = h / 2 || 1
      const d = Math.sqrt(((x - rx) / rx) ** 2 + ((y - ry) / ry) ** 2)
      return (filled && d <= 1) || Math.abs(d - 1) * Math.min(rx, ry) <= reach
    }
    case 'polygon': {
      const poly = polygonPoints(node.sides ?? 3, { x: 0, y: 0, w, h })
      return (filled && pointInPolygon(p, poly)) || distToPolyline(p, poly, true) <= reach
    }
    default: {
      const line = flattenPath(localPoints(node), !!node.closed)
      if (line.length < 2) return false
      // SVG fills an open path as though it were closed, so the fill test does too.
      return (filled && pointInPolygon(p, line)) || distToPolyline(p, line, !!node.closed) <= reach
    }
  }
}

function roundPoint(p: VectorPoint): VectorPoint {
  const rounded = mapPoint(p, (q) => ({ x: num(q.x), y: num(q.y) }))
  return p.radius ? { ...rounded, radius: p.radius } : rounded
}

/**
 * The node as a path whose viewBox is its own size, ready to edit point by
 * point. A path keeps its points (scaled into local pixels); a shape becomes
 * the path that draws it — Figma's "edit a rectangle and it becomes a vector".
 * A rectangle's corner radius doesn't survive the conversion.
 */
export function toEditablePath(node: CanvasVectorNode): CanvasVectorNode {
  const { w, h } = node.rect
  let points: VectorPoint[]
  let closed = true
  if (node.shape === 'path') {
    points = localPoints(node)
    closed = !!node.closed
  } else if (node.shape === 'ellipse') {
    const rx = w / 2
    const ry = h / 2
    const kx = rx * KAPPA
    const ky = ry * KAPPA
    points = [
      { x: rx, y: 0, in: { x: rx - kx, y: 0 }, out: { x: rx + kx, y: 0 } },
      { x: w, y: ry, in: { x: w, y: ry - ky }, out: { x: w, y: ry + ky } },
      { x: rx, y: h, in: { x: rx + kx, y: h }, out: { x: rx - kx, y: h } },
      { x: 0, y: ry, in: { x: 0, y: ry + ky }, out: { x: 0, y: ry - ky } },
    ]
  } else if (node.shape === 'polygon') {
    points = polygonPoints(node.sides ?? 3, { x: 0, y: 0, w, h })
  } else {
    // Its corner radius carries over as a radius on each corner point, so
    // editing a rounded rectangle doesn't square it off.
    points = rectanglePoints(node.style, w, h)
  }
  const { sides: _sides, ...rest } = node
  const style = node.shape === 'rectangle' ? { ...node.style, radius: undefined } : node.style
  return { ...rest, style, shape: 'path', points: points.map(roundPoint), closed, viewBox: { w, h } }
}

/**
 * Re-fits an editable path's rect to its curve after its points moved: the
 * rect shifts to the curve's new bounds and the points shift back the other
 * way, so on the board nothing moves — only the selection box follows.
 */
export function refit(node: CanvasVectorNode): CanvasVectorNode {
  const points = node.points ?? []
  const line = flattenPath(points, !!node.closed)
  if (line.length === 0) return node
  const minX = Math.min(...line.map((p) => p.x))
  const minY = Math.min(...line.map((p) => p.y))
  const w = Math.max(Math.max(...line.map((p) => p.x)) - minX, 1)
  const h = Math.max(Math.max(...line.map((p) => p.y)) - minY, 1)
  return {
    ...node,
    rect: { x: num(node.rect.x + minX), y: num(node.rect.y + minY), w: num(w), h: num(h) },
    viewBox: { w: num(w), h: num(h) },
    points: points.map((p) => mapPoint(p, (q) => ({ x: num(q.x - minX), y: num(q.y - minY) }))),
  }
}

export type PointPart = 'anchor' | 'in' | 'out'

/**
 * Moves one anchor (its handles travel with it) or one handle. A handle drags
 * its partner into the mirrored position unless `breakSymmetry` (Alt in the
 * UI) — Figma's default, so a curve stays smooth through its anchor.
 */
export function movePoint(node: CanvasVectorNode, index: number, part: PointPart, to: Pt, breakSymmetry = false): CanvasVectorNode {
  const points = [...(node.points ?? [])]
  const p = points[index]
  if (!p) return node
  if (part === 'anchor') {
    const dx = to.x - p.x
    const dy = to.y - p.y
    points[index] = mapPoint(p, (q) => ({ x: q.x + dx, y: q.y + dy }))
  } else {
    const other = part === 'in' ? 'out' : 'in'
    const next: VectorPoint = { ...p, [part]: { x: to.x, y: to.y } }
    if (!breakSymmetry) next[other] = { x: 2 * p.x - to.x, y: 2 * p.y - to.y }
    points[index] = next
  }
  return { ...node, points }
}

/** Removes an anchor, keeping at least two. */
export function deletePoint(node: CanvasVectorNode, index: number): CanvasVectorNode {
  const points = node.points ?? []
  if (points.length <= 2 || index < 0 || index >= points.length) return node
  return { ...node, points: points.filter((_, i) => i !== index) }
}

/** The segment of the path nearest a local point, and where along it. */
export function nearestSegment(node: CanvasVectorNode, x: number, y: number): { index: number; t: number; dist: number } | null {
  let best: { index: number; t: number; dist: number } | null = null
  const steps = 32
  const distAt = (c: Cubic, t: number) => {
    const q = segmentAt(c, t)
    return Math.hypot(q.x - x, q.y - y)
  }
  for (const seg of segments(node.points ?? [], !!node.closed)) {
    const c = seg.c
    let t: number
    if (isStraight(c)) {
      // A line: the exact foot of the perpendicular, t linear along it.
      const dx = c[3].x - c[0].x
      const dy = c[3].y - c[0].y
      const len2 = dx * dx + dy * dy
      t = len2 > 0 ? Math.max(0, Math.min(1, ((x - c[0].x) * dx + (y - c[0].y) * dy) / len2)) : 0
    } else {
      // A curve: the nearest of a coarse sampling, then narrowed in on it, so
      // the point lands on the curve under the cursor rather than a sample near it.
      t = 0
      for (let s = 0; s <= steps; s += 1) if (distAt(c, s / steps) < distAt(c, t)) t = s / steps
      let lo = Math.max(0, t - 1 / steps)
      let hi = Math.min(1, t + 1 / steps)
      for (let i = 0; i < 24; i += 1) {
        const m1 = lo + (hi - lo) / 3
        const m2 = hi - (hi - lo) / 3
        if (distAt(c, m1) < distAt(c, m2)) hi = m2
        else lo = m1
      }
      t = (lo + hi) / 2
    }
    const dist = distAt(c, t)
    if (!best || dist < best.dist) best = { index: seg.from, t, dist }
  }
  return best
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * The point at `t` on a segment, as insertPoint splits it: linear along a
 * straight line, the cubic itself on a curve. nearestSegment, the Ctrl dot
 * and the inserted anchor all read t this way, so they agree.
 */
function segmentAt(c: Cubic, t: number): Pt {
  return isStraight(c) ? lerp(c[0], c[3], t) : cubicAt(c, t)
}

/**
 * Inserts an anchor on the segment after `index`, at `t`, without changing the
 * curve's shape — a de Casteljau split, so the neighbours' handles shorten to
 * match. A straight segment gets a plain anchor.
 */
export function insertPoint(node: CanvasVectorNode, index: number, t: number): { node: CanvasVectorNode; at: number } {
  const points = [...(node.points ?? [])]
  const n = points.length
  const a = points[index]
  const bi = (index + 1) % n
  const b = points[bi]
  if (!a || !b) return { node, at: -1 }
  const c: Cubic = [a, a.out ?? a, b.in ?? b, b]
  let inserted: VectorPoint
  if (isStraight(c)) {
    inserted = roundPoint(lerp(a, b, t))
  } else {
    const ab = lerp(c[0], c[1], t)
    const bc = lerp(c[1], c[2], t)
    const cd = lerp(c[2], c[3], t)
    const abc = lerp(ab, bc, t)
    const bcd = lerp(bc, cd, t)
    const mid = lerp(abc, bcd, t)
    points[index] = { ...a, out: ab }
    points[bi] = { ...points[bi], in: cd }
    inserted = roundPoint({ x: mid.x, y: mid.y, in: abc, out: bcd })
  }
  const at = index + 1
  points.splice(at, 0, inserted)
  return { node: { ...node, points }, at }
}

/**
 * Moves several anchors together — each with its handles — by one offset,
 * from where they were when the drag began (`from`), so a drag never drifts
 * however many frames it runs.
 */
export function moveAnchors(node: CanvasVectorNode, indices: Iterable<number>, from: VectorPoint[], dx: number, dy: number): CanvasVectorNode {
  const points = [...(node.points ?? [])]
  for (const i of indices) {
    const start = from[i]
    if (!start || !points[i]) continue
    points[i] = mapPoint(start, (q) => ({ x: num(q.x + dx), y: num(q.y + dy) }))
  }
  return { ...node, points }
}

/** Removes several anchors at once, keeping at least two (the earliest survive when it would go below). */
export function deletePoints(node: CanvasVectorNode, indices: Iterable<number>): CanvasVectorNode {
  const points = node.points ?? []
  const doomed = new Set(indices)
  const kept = points.filter((_, i) => !doomed.has(i))
  if (kept.length >= 2) return kept.length === points.length ? node : { ...node, points: kept }
  // Not enough would remain: keep the first two anchors not being deleted, topped up from the doomed ones.
  const keep = new Set(points.map((_, i) => i).filter((i) => !doomed.has(i)))
  for (let i = 0; keep.size < 2 && i < points.length; i += 1) keep.add(i)
  return { ...node, points: points.filter((_, i) => keep.has(i)) }
}

/**
 * Turns an anchor sharp (dropping both handles) or smooth (handles along the
 * line between its neighbours, a third of the way to each) — the toggle
 * Ctrl/Cmd-click gives in Figma's bend tool.
 */
export function toggleSmooth(node: CanvasVectorNode, index: number): CanvasVectorNode {
  const points = [...(node.points ?? [])]
  const p = points[index]
  if (!p) return node
  // A corner radius rides along either way: it waits on a smooth anchor
  // (a curve is already round) and applies again once the anchor is sharp.
  const radius = p.radius ? { radius: p.radius } : {}
  if (p.in || p.out) {
    points[index] = { x: p.x, y: p.y, ...radius }
    return { ...node, points }
  }
  const n = points.length
  const closed = !!node.closed && n > 2
  const prev = index > 0 ? points[index - 1] : closed ? points[n - 1] : null
  const next = index < n - 1 ? points[index + 1] : closed ? points[0] : null
  const a = prev ?? p
  const b = next ?? p
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const inLen = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) / 3 : 0
  const outLen = next ? Math.hypot(next.x - p.x, next.y - p.y) / 3 : 0
  points[index] = roundPoint({
    x: p.x,
    y: p.y,
    ...(prev ? { in: { x: p.x - ux * inLen, y: p.y - uy * inLen } } : {}),
    ...(next ? { out: { x: p.x + ux * outLen, y: p.y + uy * outLen } } : {}),
    ...radius,
  })
  return { ...node, points }
}

/** Where along segment `index` (to the next anchor) parameter `t` lands, in local space. */
export function pointOnSegment(node: CanvasVectorNode, index: number, t: number): Pt | null {
  const seg = segments(node.points ?? [], !!node.closed).find((sg) => sg.from === index)
  return seg ? segmentAt(seg.c, t) : null
}

export type PointType = 'sharp' | 'smooth'

/** Whether an anchor is a sharp corner (no handles) or smooth (a curve passes through it). */
export function pointType(p: VectorPoint): PointType {
  return p.in || p.out ? 'smooth' : 'sharp'
}

/**
 * Makes every anchor in `indices` sharp (handles dropped — any corner radius
 * is kept, and now applies) or smooth (handles along the neighbours' line;
 * already-smooth anchors are left as they are).
 */
export function setPointType(node: CanvasVectorNode, indices: Iterable<number>, type: PointType): CanvasVectorNode {
  let next = node
  for (const i of indices) {
    const p = next.points?.[i]
    if (!p || pointType(p) === type) continue
    if (type === 'sharp') {
      const points = [...(next.points ?? [])]
      points[i] = { x: p.x, y: p.y, ...(p.radius ? { radius: p.radius } : {}) }
      next = { ...next, points }
    } else {
      next = toggleSmooth(next, i)
    }
  }
  return next
}

/** Gives every anchor in `indices` a corner radius (0 removes it). */
export function setPointRadius(node: CanvasVectorNode, indices: Iterable<number>, radius: number): CanvasVectorNode {
  const points = [...(node.points ?? [])]
  for (const i of indices) {
    const p = points[i]
    if (!p) continue
    const { radius: _old, ...rest } = p
    points[i] = radius > 0 ? { ...rest, radius: num(radius) } : rest
  }
  return { ...node, points }
}

/** Removes one handle, making that side of its anchor a sharp corner. */
export function removeHandle(node: CanvasVectorNode, index: number, part: 'in' | 'out'): CanvasVectorNode {
  const points = [...(node.points ?? [])]
  const p = points[index]
  if (!p || !p[part]) return node
  const { [part]: _gone, ...rest } = p
  points[index] = rest
  return { ...node, points }
}
