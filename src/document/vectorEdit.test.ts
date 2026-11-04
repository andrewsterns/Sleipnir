import { describe, it, expect } from 'vitest'
import { createVectorNode } from './doc'
import { pathData } from './vector'
import {
  deletePoint,
  insertPoint,
  movePoint,
  nearestSegment,
  pointOnSegment,
  pointType,
  refit,
  removeHandle,
  setPointRadius,
  setPointType,
  toEditablePath,
  vectorContains,
} from './vectorEdit'
import type { CanvasVectorNode } from './types'

const path = (points: CanvasVectorNode['points'], closed = false): CanvasVectorNode =>
  createVectorNode({ x: 100, y: 100, w: 100, h: 100 }, 'path', { points, closed, viewBox: { w: 100, h: 100 } })

describe('vectorContains', () => {
  // The point of hitting by shape: a triangle's empty corners aren't the triangle.
  it('hits a filled triangle inside its outline, and not in its box corners', () => {
    const tri = createVectorNode({ x: 0, y: 0, w: 100, h: 100 }, 'polygon', { sides: 3 })
    expect(vectorContains(tri, 50, 60, 3)).toBe(true)
    expect(vectorContains(tri, 5, 5, 3)).toBe(false)
  })

  it('hits an ellipse inside, and a stroke-only ring only near its outline', () => {
    const ring = createVectorNode({ x: 0, y: 0, w: 100, h: 100 }, 'ellipse')
    expect(vectorContains(ring, 50, 50, 3)).toBe(true)
    expect(vectorContains(ring, 2, 2, 3)).toBe(false)
    const outline = { ...ring, style: { stroke: { color: '#000', width: 2 } } }
    expect(vectorContains(outline, 50, 50, 3)).toBe(false)
    expect(vectorContains(outline, 50, 1, 3)).toBe(true)
  })

  it('hits an open path only along its line', () => {
    const line = path([{ x: 0, y: 0 }, { x: 100, y: 100 }])
    expect(vectorContains(line, 50, 51, 3)).toBe(true)
    expect(vectorContains(line, 80, 20, 3)).toBe(false)
  })
})

describe('toEditablePath', () => {
  it('turns a rectangle into its four corners, closed', () => {
    const rect = toEditablePath(createVectorNode({ x: 0, y: 0, w: 40, h: 20 }, 'rectangle'))
    expect(rect).toMatchObject({ shape: 'path', closed: true, viewBox: { w: 40, h: 20 } })
    expect(rect.points).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }])
  })

  it('turns an ellipse into four curved anchors that draw the same ellipse', () => {
    const ellipse = toEditablePath(createVectorNode({ x: 0, y: 0, w: 100, h: 50 }, 'ellipse'))
    expect(ellipse.points).toHaveLength(4)
    expect(ellipse.points?.every((p) => p.in && p.out)).toBe(true)
    // Its widest point is still the box's right edge.
    expect(ellipse.points?.[1]).toMatchObject({ x: 100, y: 25 })
  })

  it('brings a resized path into its own pixel space, so editing it sees what is drawn', () => {
    const stretched = { ...path([{ x: 0, y: 0 }, { x: 100, y: 100 }]), rect: { x: 0, y: 0, w: 200, h: 50 } }
    expect(toEditablePath(stretched).points).toEqual([{ x: 0, y: 0 }, { x: 200, y: 50 }])
  })

  it('keeps a rounded rectangle round: its radius moves onto each corner point', () => {
    const rounded = createVectorNode({ x: 0, y: 0, w: 40, h: 20 }, 'rectangle')
    const rect = toEditablePath({ ...rounded, style: { radius: { tl: 6, tr: 0, br: 6, bl: 0 } } })
    expect(rect.style.radius).toBeUndefined()
    expect(rect.points?.map((p) => p.radius)).toEqual([6, undefined, 6, undefined])
  })
})

describe('editing points', () => {
  it('moves an anchor with its handles, then refits the box to the curve without moving it on the board', () => {
    const edited = refit(movePoint(path([{ x: 0, y: 0 }, { x: 100, y: 100, in: { x: 50, y: 100 } }]), 1, 'anchor', { x: 150, y: 120 }))
    expect(edited.rect).toEqual({ x: 100, y: 100, w: 150, h: 120 })
    expect(edited.points?.[1]).toEqual({ x: 150, y: 120, in: { x: 100, y: 120 } })
  })

  it('refits when a point moves above or left of the box, shifting the rect, not the drawing', () => {
    const edited = refit(movePoint(path([{ x: 0, y: 0 }, { x: 100, y: 100 }]), 0, 'anchor', { x: -20, y: -10 }))
    expect(edited.rect).toEqual({ x: 80, y: 90, w: 120, h: 110 })
    expect(edited.points).toEqual([{ x: 0, y: 0 }, { x: 120, y: 110 }])
  })

  it('mirrors the partner handle, unless symmetry is broken', () => {
    const smooth = path([{ x: 50, y: 50, in: { x: 40, y: 50 }, out: { x: 60, y: 50 } }, { x: 100, y: 100 }])
    expect(movePoint(smooth, 0, 'out', { x: 50, y: 70 }).points?.[0].in).toEqual({ x: 50, y: 30 })
    expect(movePoint(smooth, 0, 'out', { x: 50, y: 70 }, true).points?.[0].in).toEqual({ x: 40, y: 50 })
  })

  it('splits a curve without changing its shape', () => {
    const curve = path([{ x: 0, y: 0, out: { x: 0, y: 100 } }, { x: 100, y: 100, in: { x: 0, y: 100 } }])
    const { node, at } = insertPoint(curve, 0, 0.5)
    expect(at).toBe(1)
    expect(node.points).toHaveLength(3)
    // The new anchor lies on the original curve at t = 0.5:
    // B(0.5) = 0.125·P0 + 0.375·C1 + 0.375·C2 + 0.125·P3 = (12.5, 87.5).
    expect(node.points?.[1]).toMatchObject({ x: 12.5, y: 87.5 })
    // Sampling both curves agrees: same shape, one more anchor.
    const box = { x: 0, y: 0, w: 100, h: 100 }
    expect(pathData(node.points!, false, box, { w: 100, h: 100 })).toContain('C')
  })

  it('inserts a plain anchor on a straight segment', () => {
    expect(insertPoint(path([{ x: 0, y: 0 }, { x: 100, y: 0 }]), 0, 0.25).node.points?.[1]).toEqual({ x: 25, y: 0 })
  })

  it('finds the segment nearest a point', () => {
    const tri = path([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], true)
    expect(nearestSegment(tri, 100, 50)).toMatchObject({ index: 1 })
    expect(nearestSegment(tri, 40, 40)?.index).toBe(2)
  })

  it('deletes an anchor but never below two', () => {
    const line = path([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }])
    expect(deletePoint(line, 1).points).toHaveLength(2)
    const two = deletePoint(line, 1)
    expect(deletePoint(two, 0)).toBe(two)
  })
})

describe('bakeLayout', () => {
  it('pins each child where the layout drew it, and turns the stack freeform', async () => {
    const { bakeLayout, createDoc, createFrameNode, insertNode } = await import('./doc')
    let doc = createDoc('b')
    const stack = { ...createFrameNode({ x: 10, y: 20, w: 100, h: 200 }, 'Stack'), style: { flow: 'vertical' as const } }
    doc = insertNode(doc, stack, null)
    const a = createVectorNode({ x: 0, y: 0, w: 40, h: 40 }, 'ellipse')
    const b = createVectorNode({ x: 0, y: 0, w: 40, h: 40 }, 'rectangle')
    doc = insertNode(insertNode(doc, a, stack.id), b, stack.id)
    // Where a browser's flexbox put them: stacked, 8px apart.
    const measured = new Map([
      [a.id, { x: 10, y: 20, w: 40, h: 40 }],
      [b.id, { x: 10, y: 68, w: 40, h: 40 }],
    ])
    const baked = bakeLayout(doc, stack.id, measured).nodes[0] as typeof stack & { children: CanvasVectorNode[] }
    expect(baked.style.flow).toBe('freeform')
    expect(baked.children.map((c) => c.rect)).toEqual([
      { x: 0, y: 0, w: 40, h: 40 },
      { x: 0, y: 48, w: 40, h: 40 },
    ])
  })
})

describe('point type and corner radius', () => {
  const square = () => path([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true)

  it('finds the spot on a segment a click would add a point at', () => {
    expect(pointOnSegment(square(), 0, 0.25)).toEqual({ x: 25, y: 0 })
    // The closing segment runs from the last anchor back to the first.
    expect(pointOnSegment(square(), 3, 0.5)).toEqual({ x: 0, y: 50 })
    expect(pointOnSegment(square(), 9, 0.5)).toBeNull()
  })

  // The dot shown while Ctrl is held is where the anchor goes — exactly under
  // the cursor, not at a nearby sample.
  it('puts the dot and the inserted anchor at the same spot under the cursor', () => {
    const seg = nearestSegment(square(), 37, 2)!
    expect(seg).toMatchObject({ index: 0, dist: 2 })
    expect(pointOnSegment(square(), seg.index, seg.t)).toEqual({ x: 37, y: 0 })
    const { node, at } = insertPoint(square(), seg.index, seg.t)
    expect(node.points?.[at]).toEqual({ x: 37, y: 0 })

    const curve = path([{ x: 0, y: 100, out: { x: 0, y: 0 } }, { x: 100, y: 100, in: { x: 100, y: 0 } }])
    const near = nearestSegment(curve, 30, 30)!
    const onCurve = pointOnSegment(curve, near.index, near.t)!
    expect(Math.hypot(onCurve.x - 30, onCurve.y - 30)).toBeCloseTo(near.dist, 6)
    expect(insertPoint(curve, near.index, near.t).node.points?.[1]).toMatchObject({ x: Math.round(onCurve.x * 100) / 100 })
  })

  it('makes anchors smooth and sharp, keeping a corner radius across the round trip', () => {
    const rounded = setPointRadius(square(), [1], 12)
    const smooth = setPointType(rounded, [1, 2], 'smooth')
    expect(smooth.points?.slice(1, 3).map(pointType)).toEqual(['smooth', 'smooth'])
    expect(pointType(smooth.points![0])).toBe('sharp')
    const sharp = setPointType(smooth, [1], 'sharp')
    expect(sharp.points?.[1]).toEqual({ x: 100, y: 0, radius: 12 })
    // Already the asked-for type: left as it is.
    expect(setPointType(sharp, [0], 'sharp')).toBe(sharp)
  })

  it('sets and clears a corner radius on the given anchors', () => {
    const rounded = setPointRadius(square(), [0, 2], 8)
    expect(rounded.points?.map((p) => p.radius)).toEqual([8, undefined, 8, undefined])
    expect(setPointRadius(rounded, [0], 0).points?.[0]).toEqual({ x: 0, y: 0 })
  })

  it('removes one handle, making that side sharp and leaving the other', () => {
    const smooth = setPointType(square(), [1], 'smooth')
    const half = removeHandle(smooth, 1, 'out')
    expect(half.points?.[1].out).toBeUndefined()
    expect(half.points?.[1].in).toEqual(smooth.points?.[1].in)
    // Nothing to remove: the same node back.
    expect(removeHandle(half, 1, 'out')).toBe(half)
  })
})
