// Every layer as a shape — the bridge between the 2D board and 3D.
//
// A frame is a rounded rectangle, an ellipse an ellipse, a polygon a polygon,
// a pen path its Bezier curves, an image or instance its box. Each of those is
// a closed outline, and an outline is all 3D needs: flatten it into polygons
// here, triangulate it in mesh.ts, and the same layer can lie flat (a 2D design
// is a 3D scene seen from the front, every layer at depth 0) or be extruded,
// revolved and swept into a solid. The outline stays the source either way, so
// going 3D never stops a layer from being edited as 2D.
//
// Pure geometry, no renderer and no three.js: the board can use it for exact
// hit-testing and boolean ops without paying for a 3D engine.
//
// Coordinates are the layer's own box space, as on the board: origin at the
// top-left, y down, units in px. mesh.ts does the turn into y-up 3D space.

import { cornerRadii, polygonPoints, rectanglePoints } from '../../document/vector'
import type { CanvasNode, CanvasVectorNode, VectorPoint } from '../../document/types'

export interface Point {
  x: number
  y: number
}

/** A closed ring of points; the last point joins back to the first (not repeated). */
export type Contour = Point[]

/**
 * Closed outlines. Solids wind one way and holes the other (see
 * normalizeWinding); each hole belongs to the solid that contains it.
 */
export interface Shape {
  contours: Contour[]
}

/**
 * The most a flattened curve may stray from the true curve, in px. A quarter
 * pixel is invisible at 1x and keeps a 200px circle to ~60 points.
 */
export const DEFAULT_TOLERANCE = 0.25

// Curves are split into at most this many pieces, whatever the tolerance.
const MAX_SEGMENTS = 256

/** The outline of any layer, or null for one with no area (open path, text for now). */
export function shapeOf(node: CanvasNode, tolerance = DEFAULT_TOLERANCE): Shape | null {
  const { w, h } = node.rect
  if (!(w > 0 && h > 0)) return null
  switch (node.kind) {
    case 'frame':
      return { contours: [flattenPath(rectanglePoints(node.style, w, h), true, tolerance)] }
    case 'vector':
      return vectorShapeOf(node, tolerance)
    case 'instance':
    case 'external':
      return { contours: [roundedRect(w, h, cornerRadii(node.style), tolerance)] }
    case 'text':
      // Glyph outlines need the font's own curves; until then text has no shape.
      return null
  }
}

function vectorShapeOf(node: CanvasVectorNode, tolerance: number): Shape | null {
  const { w, h } = node.rect
  switch (node.shape) {
    case 'rectangle':
      return { contours: [flattenPath(rectanglePoints(node.style, w, h), true, tolerance)] }
    case 'ellipse':
      return { contours: [ellipse(w / 2, h / 2, w / 2, h / 2, tolerance)] }
    case 'polygon':
      return { contours: [polygonPoints(node.sides ?? 3, { x: 0, y: 0, w, h })] }
    case 'path': {
      if (!node.closed || (node.points?.length ?? 0) < 3) return null
      const vb = node.viewBox ?? { w, h }
      const sx = w / (vb.w || 1)
      const sy = h / (vb.h || 1)
      const scaled = (node.points ?? []).map((p) => ({
        x: p.x * sx,
        y: p.y * sy,
        ...(p.in ? { in: { x: p.in.x * sx, y: p.in.y * sy } } : {}),
        ...(p.out ? { out: { x: p.out.x * sx, y: p.out.y * sy } } : {}),
        ...(p.radius ? { radius: p.radius } : {}),
      }))
      return { contours: [flattenPath(scaled, true, tolerance)] }
    }
  }
}

// ── Flattening ─────────────────────────────────────────────────────────────

/**
 * A pen path as a polyline: straight segments as they are, cubic segments split
 * finely enough to stay within `tolerance`, and sharp anchors with a `radius`
 * rounded into circular arcs (a frame's corner radius, one anchor at a time).
 */
export function flattenPath(points: VectorPoint[], closed: boolean, tolerance = DEFAULT_TOLERANCE): Point[] {
  const n = points.length
  if (n === 0) return []
  const out: Point[] = []
  const push = (p: Point) => {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - p.x) > 1e-9 || Math.abs(last.y - p.y) > 1e-9) out.push({ x: p.x, y: p.y })
  }
  const curved = (from: VectorPoint, to: VectorPoint) => !!(from.out || to.in)
  // A rounded anchor: where its arc starts and ends, set back along both
  // straight neighbours. Only sharp anchors between straight segments round.
  const fillets = points.map((p, i) => {
    if (!p.radius || p.radius <= 0) return null
    if (!closed && (i === 0 || i === n - 1)) return null
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    if (curved(prev, p) || curved(p, next)) return null
    return fillet(prev, p, next, p.radius)
  })

  for (let i = 0; i < n; i += 1) {
    const p = points[i]
    const f = fillets[i]
    if (f) {
      push(f.start)
      for (const q of arcPoints(f, tolerance)) push(q)
    } else push(p)
    const last = i === n - 1
    if (last && !closed) break
    const next = points[(i + 1) % n]
    if (curved(p, next)) {
      const from = f ? f.end : p
      for (const q of cubicPoints(from, p.out ?? p, next.in ?? next, next, tolerance)) push(q)
    }
  }
  if (closed && out.length > 1) {
    const a = out[0]
    const b = out[out.length - 1]
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop()
  }
  return out
}

/**
 * Points along a cubic Bezier, excluding the start. The count comes from
 * Wang's formula: enough pieces that no chord strays more than `tolerance`.
 */
export function cubicPoints(p0: Point, p1: Point, p2: Point, p3: Point, tolerance = DEFAULT_TOLERANCE): Point[] {
  const dd = Math.max(
    Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
    Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y),
  )
  const segments = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tolerance))))
  const out: Point[] = []
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return out
}

interface Fillet {
  start: Point
  end: Point
  center: Point
  radius: number
  startAngle: number
  sweep: number
}

// The arc that rounds corner `p` between straight segments from `a` and to `b`.
// The radius shrinks when the corner can't fit it (both legs are shared with
// the neighbouring corners, so each gets at most half).
function fillet(a: Point, p: Point, b: Point, radius: number): Fillet | null {
  const la = Math.hypot(a.x - p.x, a.y - p.y)
  const lb = Math.hypot(b.x - p.x, b.y - p.y)
  if (la === 0 || lb === 0) return null
  const u = { x: (a.x - p.x) / la, y: (a.y - p.y) / la }
  const v = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb }
  const cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))
  const half = Math.acos(cos) / 2
  if (half < 1e-6 || Math.PI / 2 - half < 1e-6) return null // a straight line: nothing to round
  const setback = Math.min(radius / Math.tan(half), la / 2, lb / 2)
  const r = setback * Math.tan(half)
  const bis = { x: u.x + v.x, y: u.y + v.y }
  const bl = Math.hypot(bis.x, bis.y)
  const dist = r / Math.sin(half)
  const center = { x: p.x + (bis.x / bl) * dist, y: p.y + (bis.y / bl) * dist }
  const start = { x: p.x + u.x * setback, y: p.y + u.y * setback }
  const end = { x: p.x + v.x * setback, y: p.y + v.y * setback }
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  let sweep = Math.atan2(end.y - center.y, end.x - center.x) - startAngle
  // The short way round — a fillet never turns more than half a circle.
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  return { start, end, center, radius: r, startAngle, sweep }
}

// An arc's points after its start, ending exactly on its end point.
function arcPoints(f: Fillet, tolerance: number): Point[] {
  const steps = arcSegments(f.radius, Math.abs(f.sweep), tolerance)
  const out: Point[] = []
  for (let i = 1; i < steps; i += 1) {
    const a = f.startAngle + (f.sweep * i) / steps
    out.push({ x: f.center.x + f.radius * Math.cos(a), y: f.center.y + f.radius * Math.sin(a) })
  }
  out.push(f.end)
  return out
}

// How many chords an arc of `radius` spanning `angle` needs to stay within tolerance.
function arcSegments(radius: number, angle: number, tolerance: number): number {
  if (radius <= tolerance) return 1
  const perChord = 2 * Math.acos(1 - tolerance / radius)
  return Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(angle / perChord)))
}

/** An ellipse as a polygon, from 12 o'clock clockwise (on screen), within `tolerance`. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, tolerance = DEFAULT_TOLERANCE): Contour {
  const steps = Math.max(8, arcSegments(Math.max(rx, ry), 2 * Math.PI, tolerance))
  return Array.from({ length: steps }, (_, i) => {
    const a = -Math.PI / 2 + (i / steps) * 2 * Math.PI
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
}

/** A box with per-corner radii [tl, tr, br, bl] as a polygon. */
export function roundedRect(w: number, h: number, radii: [number, number, number, number], tolerance = DEFAULT_TOLERANCE): Contour {
  const [tl, tr, br, bl] = radii
  const corner = (x: number, y: number, radius: number): VectorPoint => (radius > 0 ? { x, y, radius } : { x, y })
  return flattenPath([corner(0, 0, tl), corner(w, 0, tr), corner(w, h, br), corner(0, h, bl)], true, tolerance)
}

// ── Measuring and orienting ────────────────────────────────────────────────

/** Shoelace area: positive for a ring that runs clockwise on screen (y down), negative counter-clockwise. */
export function signedArea(contour: Contour): number {
  let sum = 0
  for (let i = 0, n = contour.length; i < n; i += 1) {
    const a = contour[i]
    const b = contour[(i + 1) % n]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/** Whether `p` lies inside `contour` (even-odd rule). */
export function containsPoint(contour: Contour, p: Point): boolean {
  let inside = false
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i, i += 1) {
    const a = contour[i]
    const b = contour[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Solids clockwise on screen, holes counter-clockwise — what extrusion needs
 * so every side wall faces out. A contour is a hole when an odd number of the
 * others contain it.
 */
export function normalizeWinding(shape: Shape): Shape {
  const contours = shape.contours.filter((c) => c.length >= 3)
  return {
    contours: contours.map((c) => {
      const depth = contours.filter((other) => other !== c && containsPoint(other, c[0])).length
      const wantSolid = depth % 2 === 0
      return signedArea(c) > 0 === wantSolid ? c : [...c].reverse()
    }),
  }
}

/** The shape's area — solids minus holes. */
export function shapeArea(shape: Shape): number {
  return normalizeWinding(shape).contours.reduce((sum, c) => sum + signedArea(c), 0)
}
