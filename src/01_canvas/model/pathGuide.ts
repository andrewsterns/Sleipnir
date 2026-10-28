// The geometry of an along-path frame's guide: which child it is, the curve
// flattened to a polyline, and arc-length lookups along it. Pure maths, shared
// by the layout (pathFlow.ts) and patterns (pathPattern.ts) — kept apart from
// both so neither has to import the other (they used to form an import cycle).

import { polygonPoints } from './vector'
import { isVectorNode, type CanvasFrameNode, type CanvasVectorNode } from './types'

export interface XY {
  x: number
  y: number
}

/** Samples per curved segment — enough that spacing error is well under a pixel at board scale. */
const CURVE_SAMPLES = 32
const ELLIPSE_SAMPLES = 128

/** The frame's guide curve: its bottom-most vector child, or null when it has none yet. */
export function pathGuideOf(frame: CanvasFrameNode): CanvasVectorNode | null {
  return (frame.children.find(isVectorNode) as CanvasVectorNode | undefined) ?? null
}

function cubic(a: XY, c1: XY, c2: XY, b: XY, t: number): XY {
  const u = 1 - t
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  }
}

/**
 * The guide as a polyline in its parent frame's space — the same geometry
 * model/vector.ts draws, flattened. Corner fillets on a pen path are ignored:
 * they move a point by at most the fillet radius, invisible in the spacing.
 */
export function guidePolyline(guide: CanvasVectorNode): { points: XY[]; closed: boolean } {
  const { x, y, w, h } = guide.rect
  switch (guide.shape) {
    case 'ellipse': {
      // From 12 o'clock, clockwise — where a ring of items is expected to start.
      const points = Array.from({ length: ELLIPSE_SAMPLES }, (_, i) => {
        const a = -Math.PI / 2 + (i / ELLIPSE_SAMPLES) * 2 * Math.PI
        return { x: x + w / 2 + (w / 2) * Math.cos(a), y: y + h / 2 + (h / 2) * Math.sin(a) }
      })
      return { points, closed: true }
    }
    case 'polygon':
      return { points: polygonPoints(guide.sides ?? 3, { x, y, w, h }), closed: true }
    case 'path': {
      const src = guide.points ?? []
      const vb = guide.viewBox ?? { w, h }
      const sx = w / (vb.w || 1)
      const sy = h / (vb.h || 1)
      const map = (q: XY): XY => ({ x: x + q.x * sx, y: y + q.y * sy })
      const pts = src.map((p) => ({ at: map(p), in: p.in && map(p.in), out: p.out && map(p.out) }))
      const closed = !!guide.closed && pts.length > 2
      if (pts.length === 0) return { points: [], closed: false }
      const out: XY[] = [pts[0].at]
      const segment = (from: (typeof pts)[number], to: (typeof pts)[number]) => {
        if (!from.out && !to.in) {
          out.push(to.at)
          return
        }
        const c1 = from.out ?? from.at
        const c2 = to.in ?? to.at
        for (let i = 1; i <= CURVE_SAMPLES; i += 1) out.push(cubic(from.at, c1, c2, to.at, i / CURVE_SAMPLES))
      }
      for (let i = 1; i < pts.length; i += 1) segment(pts[i - 1], pts[i])
      if (closed) {
        segment(pts[pts.length - 1], pts[0])
        out.pop() // the wrap lands back on the start, which is already point 0
      }
      return { points: out, closed }
    }
    default:
      return {
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        closed: true,
      }
  }
}

/** Arc-length lookup over a polyline: where you are, and which way it's heading, `d` px along it. */
export function measurePolyline(points: XY[], closed: boolean) {
  const pts = closed && points.length > 1 ? [...points, points[0]] : points
  const cum = [0]
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const length = cum[cum.length - 1] ?? 0
  const at = (d: number): { x: number; y: number; angle: number } => {
    if (pts.length === 1) return { ...pts[0], angle: 0 }
    const dist = closed && length > 0 ? ((d % length) + length) % length : Math.min(Math.max(d, 0), length)
    let i = 1
    while (i < cum.length - 1 && cum[i] < dist) i += 1
    // Skip zero-length segments (a duplicated point) so the heading stays defined.
    while (i < cum.length - 1 && cum[i] === cum[i - 1]) i += 1
    const seg = cum[i] - cum[i - 1]
    const t = seg > 0 ? (dist - cum[i - 1]) / seg : 0
    const a = pts[i - 1]
    const b = pts[i]
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
  }
  return { length, at }
}

