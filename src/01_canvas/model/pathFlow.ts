// The "along a path" layout (CanvasStyle.alongPath): a frame's children spaced
// along its guide curve — a row of images following a wave, icons round a
// ring, shapes strung along a pen stroke.
//
// The guide is the frame's bottom-most vector child. Every other visible child
// is centered on the guide, in layer order, and (with `orient`) turned to face
// along it — plus any turn of its own (`pathTurn`), so a piece can be spun
// freely without leaving the path. The result is written straight into each child's rect and
// style.rotate, so nothing downstream knows this layout exists: the board, the
// selection math and the emitters all see ordinary freeform children. That is
// the whole design — see AlongPath's doc comment in types.ts.
//
// reflowPaths runs on every document change (CanvasView.ViewModel's apply), so
// editing the curve, resizing it, adding a child or reordering the layers all
// re-flow immediately.

import { polygonPoints } from './vector'
import { normalizeDegrees } from './rotation'
import { carryPatternKey, isPatternCopy, syncPattern } from './pathPattern'
import { childrenOf, isFrameNode, isVectorNode, type AlongPath, type CanvasDoc, type CanvasFrameNode, type CanvasNode, type CanvasVectorNode, type NodeId } from './types'

interface XY {
  x: number
  y: number
}

/** Samples per curved segment — enough that spacing error is well under a pixel at board scale. */
const CURVE_SAMPLES = 32
const ELLIPSE_SAMPLES = 128

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/** True when this frame lays its children out along its guide path. */
export function isPathFlow(node: CanvasNode | null | undefined): node is CanvasFrameNode {
  return !!node && isFrameNode(node) && !!node.style.alongPath
}

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

/** Distance along the path of each item's center, in order. */
export function itemDistances(sizes: number[], length: number, closed: boolean, opts: AlongPath, gap: number): number[] {
  const n = sizes.length
  const offset = opts.offset ?? 0
  if (n === 0) return []
  if ((opts.spacing ?? 'even') === 'even') {
    if (closed) return sizes.map((_, i) => offset + (i * length) / n)
    if (n === 1) return [offset + length / 2]
    return sizes.map((_, i) => offset + (i * length) / (n - 1))
  }
  const out: number[] = []
  let d = offset + sizes[0] / 2
  for (let i = 0; i < n; i += 1) {
    if (i > 0) d += sizes[i - 1] / 2 + gap + sizes[i] / 2
    out.push(d)
  }
  return out
}

/** Lays one path-flow frame's children out along its guide. Returns the same frame when nothing moved. */
export function layoutAlongPath(frame: CanvasFrameNode): CanvasFrameNode {
  const opts = frame.style.alongPath
  const guide = opts ? pathGuideOf(frame) : null
  if (!opts || !guide) return frame
  const { points, closed, path } = guideOf(guide)
  if (points.length === 0) return frame
  const items = frame.children.filter((c) => c !== guide && !c.hidden)
  const distances = itemDistances(
    items.map((c) => c.rect.w),
    path.length,
    closed,
    opts,
    frame.style.gap ?? 0,
  )
  const placed = new Map<CanvasNode, CanvasNode>()
  items.forEach((item, i) => {
    const p = path.at(distances[i])
    const x = round2(p.x - item.rect.w / 2)
    const y = round2(p.y - item.rect.h / 2)
    // The path's heading (with orient), plus the piece's own free turn.
    const rotate = round1(normalizeDegrees((opts.orient ? p.angle : 0) + (item.pathTurn ?? 0))) || undefined
    if (item.rect.x === x && item.rect.y === y && item.style.rotate === rotate) return
    const style = { ...item.style }
    if (rotate === undefined) delete style.rotate
    else style.rotate = rotate
    const moved = { ...item, rect: { ...item.rect, x, y }, style } as CanvasNode
    if (item.repeatOf) carryPatternKey(item, moved)
    placed.set(item, moved)
  })
  if (placed.size === 0) return frame
  return { ...frame, children: frame.children.map((c) => placed.get(c) ?? c) }
}

// ── Caches ─────────────────────────────────────────────────────────────────
//
// Documents are immutable and share every subtree an edit doesn't touch (see
// doc.ts's rewrite), so object identity is a perfect cache key: the same guide
// object has the same curve, and the same frame object re-flows to the same
// result. With these, an edit anywhere re-flows only the path frames on the
// path from the root to what changed — a drag elsewhere on a board full of
// patterns costs nothing, and a big pattern isn't re-measured on every frame.

const guideCache = new WeakMap<CanvasVectorNode, ReturnType<typeof guidePolyline> & { path: ReturnType<typeof measurePolyline> }>()

/** The guide flattened and measured, once per guide object. */
function guideOf(guide: CanvasVectorNode) {
  let hit = guideCache.get(guide)
  if (!hit) {
    const poly = guidePolyline(guide)
    hit = { ...poly, path: measurePolyline(poly.points, poly.closed) }
    guideCache.set(guide, hit)
  }
  return hit
}

const reflowCache = new WeakMap<CanvasNode, CanvasNode>()

function reflowNode(node: CanvasNode): CanvasNode {
  if (!isFrameNode(node)) return node
  const cached = reflowCache.get(node)
  if (cached) return cached
  const result = reflowFrame(node)
  reflowCache.set(node, result)
  // A result is its own fixed point — re-flowing it again changes nothing.
  reflowCache.set(result, result)
  return result
}

function reflowFrame(node: CanvasFrameNode): CanvasNode {
  let children = node.children
  const next = children.map(reflowNode)
  if (next.some((c, i) => c !== children[i])) children = next
  const frame = children === node.children ? node : { ...node, children }
  // Patterns first (their copies are children to lay out), then the layout.
  // A frame that stopped being a pattern still syncs once, to drop its copies.
  if (frame.style.alongPath) return layoutAlongPath(syncPattern(frame))
  return frame.children.some(isPatternCopy) ? syncPattern(frame) : frame
}

/**
 * Re-flows every path-flow frame on the board and in every component variant.
 * Returns the same doc when nothing changed, so it's free on the common board
 * that has none.
 */
export function reflowPaths(doc: CanvasDoc): CanvasDoc {
  const nodes = doc.nodes.map(reflowNode)
  const nodesChanged = nodes.some((n, i) => n !== doc.nodes[i])
  let componentsChanged = false
  const components = doc.components.map((component) => {
    let variantsChanged = false
    const variants = component.variants.map((variant) => {
      const root = reflowNode(variant.root) as CanvasFrameNode
      if (root === variant.root) return variant
      variantsChanged = true
      return { ...variant, root }
    })
    if (!variantsChanged) return component
    componentsChanged = true
    return { ...component, variants }
  })
  if (!nodesChanged && !componentsChanged) return doc
  return { ...doc, nodes: nodesChanged ? nodes : doc.nodes, components: componentsChanged ? components : doc.components }
}

/** True when the node is placed by a path-flow parent (it isn't that parent's guide). */
export function isOnPath(parent: CanvasNode | null | undefined, node: CanvasNode): boolean {
  return isPathFlow(parent) && pathGuideOf(parent) !== node && childrenOf(parent).includes(node)
}

/**
 * How far along a polyline the point nearest `p` lies — what dragging an item
 * along the curve reads, so the item follows the pointer's projection onto it.
 */
export function distanceAlong(points: XY[], closed: boolean, p: XY): number {
  const pts = closed && points.length > 1 ? [...points, points[0]] : points
  let best = Infinity
  let bestD = 0
  let walked = 0
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]
    const b = pts[i]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0
    const qx = a.x + vx * t
    const qy = a.y + vy * t
    const dist = (p.x - qx) ** 2 + (p.y - qy) ** 2
    const seg = Math.sqrt(len2)
    if (dist < best) {
      best = dist
      bestD = walked + seg * t
    }
    walked += seg
  }
  return bestD
}

/**
 * Sliding a path frame's items along its curve by a drag: the offset the frame
 * should take when the pointer has moved from `from` to `to` (both in the
 * frame's own space). On a closed path the move is the short way round, so
 * crossing the seam doesn't jump the whole ring back.
 */
export function slideOffset(frame: CanvasFrameNode, startOffset: number, from: XY, to: XY): number {
  const guide = pathGuideOf(frame)
  if (!guide) return startOffset
  const { points, closed, path } = guideOf(guide)
  if (points.length < 2) return startOffset
  let delta = distanceAlong(points, closed, to) - distanceAlong(points, closed, from)
  if (closed && path.length > 0) {
    if (delta > path.length / 2) delta -= path.length
    if (delta < -path.length / 2) delta += path.length
  }
  return Math.round((startOffset + delta) * 10) / 10
}

/**
 * Where a path frame's run starts and which way it heads, in the frame's own
 * space — drawn on the board while the frame (or an item on it) is selected,
 * so "which end is first" is never a guess.
 */
export function pathStartOf(frame: CanvasFrameNode): { x: number; y: number; angle: number; closed: boolean } | null {
  const guide = pathGuideOf(frame)
  if (!guide || !frame.style.alongPath) return null
  const { points, closed, path } = guideOf(guide)
  if (points.length < 2) return null
  const at = path.at(frame.style.alongPath.offset ?? 0)
  return { x: at.x, y: at.y, angle: at.angle, closed }
}

/**
 * Reorders a path frame's pieces so `id` takes the slot nearest `p` (a point in
 * the frame's own space, projected onto the guide) — what dragging one piece
 * along the curve does. Returns the same frame when it's already there.
 */
export function moveToPathSlot(frame: CanvasFrameNode, id: NodeId, p: XY): CanvasFrameNode {
  const guide = pathGuideOf(frame)
  const opts = frame.style.alongPath
  if (!guide || !opts) return frame
  const { points, closed, path } = guideOf(guide)
  if (points.length < 2) return frame
  const items = frame.children.filter((c) => c !== guide && !c.hidden)
  const from = items.findIndex((c) => c.id === id)
  if (from === -1) return frame
  const slots = itemDistances(items.map((c) => c.rect.w), path.length, closed, opts, frame.style.gap ?? 0)
  const d = distanceAlong(points, closed, p)
  const gapTo = (s: number) => {
    const raw = Math.abs(s - d)
    if (!closed || path.length <= 0) return raw
    const wrapped = raw % path.length
    return Math.min(wrapped, path.length - wrapped)
  }
  let to = 0
  for (let i = 1; i < slots.length; i += 1) if (gapTo(slots[i]) < gapTo(slots[to])) to = i
  if (to === from) return frame
  const reordered = [...items]
  const [moving] = reordered.splice(from, 1)
  reordered.splice(to, 0, moving)
  // Write the new order back into the same child positions the pieces held,
  // so the guide and any hidden layers stay exactly where they were.
  let k = 0
  const children = frame.children.map((c) => (items.includes(c) ? reordered[k++] : c))
  return { ...frame, children }
}
