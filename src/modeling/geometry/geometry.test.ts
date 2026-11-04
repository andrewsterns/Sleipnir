import { describe, it, expect } from 'vitest'
import { DEFAULT_TOLERANCE, cubicPoints, ellipse, normalizeWinding, shapeArea, shapeOf, signedArea, type Shape } from './shape'
import { facesFront, flatMesh, meshArea, triangulate } from './mesh'
import type { CanvasFrameNode, CanvasNode, CanvasVectorNode } from '../../document/types'

const frame = (w: number, h: number, radius?: CanvasFrameNode['style']['radius']): CanvasFrameNode =>
  ({ id: 'f', kind: 'frame', name: 'Frame', rect: { x: 0, y: 0, w, h }, style: radius === undefined ? {} : { radius }, children: [] }) as unknown as CanvasFrameNode
const vector = (shape: CanvasVectorNode['shape'], w: number, h: number, extra: Partial<CanvasVectorNode> = {}): CanvasVectorNode =>
  ({ id: 'v', kind: 'vector', name: 'Vector', rect: { x: 0, y: 0, w, h }, style: {}, shape, ...extra }) as unknown as CanvasVectorNode

// Flattening keeps every chord within the tolerance of the curve, so a curved
// outline can come up short of the true area by at most its curved length ×
// the tolerance — never more.
const expectWithinFlattening = (area: number, exact: number, curvedLength: number) => {
  expect(area).toBeLessThanOrEqual(exact + 1e-6)
  expect(exact - area).toBeLessThanOrEqual(curvedLength * DEFAULT_TOLERANCE)
}

describe('shapeOf: every layer as an outline', () => {
  it('turns a plain frame into its box', () => {
    const s = shapeOf(frame(100, 60))!
    expect(s.contours).toHaveLength(1)
    expect(s.contours[0]).toHaveLength(4)
    expect(shapeArea(s)).toBe(6000)
  })

  it('rounds every corner by its own radius, capped to what fits', () => {
    const r = 10
    const quarter = (radius: number) => (Math.PI / 2) * radius
    expectWithinFlattening(shapeArea(shapeOf(frame(100, 60, r))!), 6000 - (4 - Math.PI) * r * r, 4 * quarter(r))
    expectWithinFlattening(shapeArea(shapeOf(frame(100, 60, { tl: r }))!), 6000 - (1 - Math.PI / 4) * r * r, quarter(r))
    // A radius bigger than the short side's half makes a stadium, not a mess.
    expectWithinFlattening(shapeArea(shapeOf(frame(100, 60, 1000))!), 6000 - (4 - Math.PI) * 30 * 30, 4 * quarter(30))
  })

  it('reads ellipses, polygons and closed pen paths', () => {
    // Ramanujan's perimeter of a 50 × 25 ellipse ≈ 242.2.
    expectWithinFlattening(shapeArea(shapeOf(vector('ellipse', 100, 50))!), Math.PI * 50 * 25, 242.2)
    expect(shapeArea(shapeOf(vector('polygon', 100, 100, { sides: 3 }))!)).toBeCloseTo(5000, 0)
    // A circle of radius 50 drawn as four cubic arcs (the standard 0.5523 handle length).
    const k = 50 * 0.5523
    const circle = vector('path', 100, 100, {
      closed: true,
      viewBox: { w: 100, h: 100 },
      points: [
        { x: 50, y: 0, in: { x: 50 - k, y: 0 }, out: { x: 50 + k, y: 0 } },
        { x: 100, y: 50, in: { x: 100, y: 50 - k }, out: { x: 100, y: 50 + k } },
        { x: 50, y: 100, in: { x: 50 + k, y: 100 }, out: { x: 50 - k, y: 100 } },
        { x: 0, y: 50, in: { x: 0, y: 50 + k }, out: { x: 0, y: 50 - k } },
      ],
    })
    // Four-arc Beziers are a hair outside the true circle, so allow that too.
    expect(Math.abs(shapeArea(shapeOf(circle)!) - Math.PI * 2500)).toBeLessThanOrEqual(2 * Math.PI * 50 * DEFAULT_TOLERANCE)
  })

  it('gives no shape to what has no area', () => {
    expect(shapeOf(vector('path', 100, 100, { closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] }))).toBeNull()
    expect(shapeOf({ id: 't', kind: 'text', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {} } as unknown as CanvasNode)).toBeNull()
    expect(shapeOf(frame(0, 10))).toBeNull()
  })

  it('stays within tolerance of the true curve', () => {
    const r = 100
    const ring = ellipse(0, 0, r, r)
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      expect(r - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2)).toBeLessThanOrEqual(DEFAULT_TOLERANCE + 1e-9)
    }
    // An evenly spaced straight "curve" is one segment, however long.
    expect(cubicPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 })).toHaveLength(1)
  })
})

describe('triangles and meshes', () => {
  const square = (x: number, y: number, s: number) => [
    { x, y },
    { x: x + s, y },
    { x: x + s, y: y + s },
    { x, y: y + s },
  ]

  it('orients solids one way and holes the other', () => {
    const [outer, hole] = normalizeWinding({ contours: [square(0, 0, 100), square(25, 25, 50)] }).contours
    expect(signedArea(outer)).toBeGreaterThan(0)
    expect(signedArea(hole)).toBeLessThan(0)
  })

  it('keeps holes open, and fills a solid sitting inside a hole', () => {
    const ring: Shape = { contours: [square(0, 0, 100), square(25, 25, 50)] }
    expect(meshArea(flatMesh(ring, { w: 100, h: 100 }))).toBeCloseTo(7500, 6)
    const target: Shape = { contours: [square(0, 0, 100), square(25, 25, 50), square(40, 40, 20)] }
    expect(meshArea(flatMesh(target, { w: 100, h: 100 }))).toBeCloseTo(7900, 6)
    expect(triangulate(target).triangles.length % 3).toBe(0)
  })

  it('lays a layer flat in 3D: same area, facing the viewer, y up, UVs across its box', () => {
    const s = shapeOf(frame(120, 80, 16))!
    const mesh = flatMesh(s, { w: 120, h: 80 }, { z: 5 })
    expect(meshArea(mesh)).toBeCloseTo(shapeArea(s), 6)
    expect(facesFront(mesh)).toBe(true)
    const ys = mesh.positions.filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeLessThanOrEqual(0)
    expect(Math.min(...ys)).toBeCloseTo(-80, 6)
    expect(mesh.positions.filter((_, i) => i % 3 === 2).every((z) => z === 5)).toBe(true)
    expect(mesh.uvs.every((v) => v >= -1e-9 && v <= 1 + 1e-9)).toBe(true)
  })
})
