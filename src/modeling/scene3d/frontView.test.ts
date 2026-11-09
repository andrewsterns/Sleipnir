import { describe, it, expect } from 'vitest'
import { apply } from '../../document/rotation'
import { boardMatrixOf } from '../../document/doc'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { frontMatrix, frontPoint, isEdgeOn, resizeOnPlane } from '../../document/frontView'
import { planeToWorld, PLANE_ROTATION } from '../../document/placement'
import type { Placement3D } from '../../document/sceneTypes'

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9)
  expect(a.y).toBeCloseTo(b.y, 9)
}

describe('the 2D board is the front view', () => {
  it('leaves an unturned plane exactly where its rect is', () => {
    expect(frontMatrix({ position: [1, -2, 5], rotation: [0, 0, 0] })).toEqual({ a: 1, b: -0, c: 0, d: 1, e: 100, f: 200 })
  })

  it('lands every point of a turned plane where the front camera sees it', () => {
    const placements: Placement3D[] = [
      { position: [0.5, 1, -2], rotation: [0, 45, 0] },
      { position: [0, 0, 0], rotation: [35, 45, 0] },
      { position: [2, -1, 0.3], rotation: [10, -70, 25], scale: [1.5, 0.5, 2] },
    ]
    for (const p of placements) {
      const m = frontMatrix(p)
      for (const [u, v] of [[0, 0], [100, 0], [0, 60], [37, 81]]) near(apply(m, { x: u, y: v }), frontPoint(planeToWorld(p, u, v)))
    }
  })

  it('squashes a plane turned about Y, and shears one turned about X and Y into a rhombus', () => {
    const squashed = frontMatrix({ position: [0, 0, 0], rotation: [0, 60, 0] })
    expect(squashed.a).toBeCloseTo(0.5, 9)
    expect(squashed.d).toBeCloseTo(1, 9)
    const rhombus = frontMatrix({ position: [0, 0, 0], rotation: [35, 45, 0] })
    // The plane's right and down edges no longer meet at a right angle on the board.
    expect(Math.abs(rhombus.a * rhombus.c + rhombus.b * rhombus.d)).toBeGreaterThan(0.1)
  })

  it('knows a Top or Side plane is edge-on to it', () => {
    expect(isEdgeOn(frontMatrix({ position: [0, 0, 0], rotation: PLANE_ROTATION.top }))).toBe(true)
    expect(isEdgeOn(frontMatrix({ position: [0, 0, 0], rotation: PLANE_ROTATION.side }))).toBe(true)
    expect(isEdgeOn(frontMatrix({ position: [0, 0, 0], rotation: [0, 80, 0] }))).toBe(false)
  })
})

describe('the board follows a placed layer', () => {
  it('draws a placed layer and its children through the front view', () => {
    const space: Placement3D = { position: [1, -1, 0], rotation: [30, 45, 0] }
    const child = { id: 'c', name: 'c', kind: 'frame', rect: { x: 20, y: 10, w: 30, h: 30 }, style: {}, children: [] } as CanvasNode
    const parent = { id: 'p', name: 'p', kind: 'frame', rect: { x: 100, y: 100, w: 200, h: 100 }, style: {}, children: [child], space } as CanvasNode
    const doc: CanvasDoc = { version: 1, id: 'b', name: 'b', nodes: [parent], components: [], createdAt: 0, updatedAt: 0 }
    near(apply(boardMatrixOf(doc, 'p')!, { x: 0, y: 0 }), { x: 100, y: 100 })
    // The child's corner is the plane point (20, 10), wherever the plane is turned.
    near(apply(boardMatrixOf(doc, 'c')!, { x: 0, y: 0 }), frontPoint(planeToWorld(space, 20, 10)))
  })
})

describe('resizing on a placed plane', () => {
  const grow = (start: { x: number; y: number; w: number; h: number }, d: { x: number; y: number }) => ({ ...start, x: start.x + d.x, w: start.w - d.x, h: start.h + d.y })

  it('resizes an unturned plane exactly as the board would', () => {
    const r = resizeOnPlane({ position: [1, -1, 0], rotation: [0, 0, 0] }, { w: 100, h: 50 }, { x: 10, y: 20 }, grow)!
    expect(r.rect).toEqual({ x: 110, y: 100, w: 90, h: 70 })
    expect(r.space.position).toEqual([1.1, -1, 0])
  })

  it('moves a turned plane’s origin along the plane, depth included', () => {
    const space: Placement3D = { position: [0, 0, 0], rotation: [0, 60, 0] }
    // Dragging the west edge 25 px right on screen is 50 px along a plane squashed to half.
    const r = resizeOnPlane(space, { w: 100, h: 50 }, { x: 25, y: 0 }, grow)!
    expect(r.rect.w).toBeCloseTo(50, 9)
    const moved = planeToWorld(space, 50, 0)
    r.space.position.forEach((m, i) => expect(m).toBeCloseTo(moved[i], 4))
    expect(Math.abs(r.space.position[2])).toBeGreaterThan(0.1)
    near(r.rect, frontPoint(r.space.position))
  })

  it('refuses an edge-on plane', () => {
    expect(resizeOnPlane({ position: [0, 0, 0], rotation: PLANE_ROTATION.top }, { w: 100, h: 50 }, { x: 5, y: 5 }, grow)).toBeNull()
  })
})
