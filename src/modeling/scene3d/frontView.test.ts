import { describe, it, expect } from 'vitest'
import { apply } from '../../document/rotation'
import { boardMatrixOf } from '../../document/doc'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { frontFaces, frontMatrix, frontPoint, frontShade, isEdgeOn, resizeOnPlane } from '../../document/frontView'
import { drawsAsSolid, layerMesh, projectedSolidsOf } from './sceneMeshes'
import { migrateLayerSolids } from '../../document/objects'
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

describe('solids seen from the front', () => {
  const cube = (space?: Placement3D) =>
    ({ id: 'cube', name: 'cube', kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, solid: { kind: 'extrude', depth: 1 }, ...(space ? { space } : {}) }) as CanvasNode
  // The cube is written as boards were before Objects, and read through the migration.
  const docOf = (node: CanvasNode): CanvasDoc => migrateLayerSolids({ version: 1, id: 'b', name: 'b', nodes: [node], components: [], createdAt: 0, updatedAt: 0 })

  it('shows only the front face of an unturned cube — the same square the flat layer is', () => {
    const node = cube({ position: [0, 0, 0], rotation: [0, 0, 0] })
    const faces = frontFaces(layerMesh(node, docOf(node))!, node.space!, node.rect)
    expect(faces).toHaveLength(2)
    expect(drawsAsSolid(node, docOf(node))).toBe(false)
  })

  it('turns a cube into three faces whose outline is a hexagon, and draws it as a solid', () => {
    const node = cube({ position: [0, 0, 0], rotation: [35.264, 45, 0] })
    expect(drawsAsSolid(node, docOf(node))).toBe(true)
    const faces = frontFaces(layerMesh(node, docOf(node))!, node.space!, node.rect)
    expect(faces).toHaveLength(6)
    const facing = new Set(faces.map((f) => f.normal.map((n) => n.toFixed(3)).join()))
    expect(facing.size).toBe(3)
    // Painted far to near.
    expect(faces.map((f) => f.depth)).toEqual([...faces.map((f) => f.depth)].sort((a, b) => a - b))
    expect(projectedSolidsOf(docOf(node)).get('cube')?.[0].faces).toHaveLength(6)
  })

  it('lights a face the way the 3D view does: the top brighter than the front, unlit sides darker', () => {
    const blue: [number, number, number] = [91, 157, 255]
    const top = frontShade(blue, [0, 1, 0])
    const front = frontShade(blue, [0, 0, 1])
    const away = frontShade(blue, [-1, -1, -1].map((n) => n / Math.sqrt(3)) as [number, number, number])
    expect(top.reduce((a, b) => a + b)).toBeGreaterThan(front.reduce((a, b) => a + b))
    expect(front.reduce((a, b) => a + b)).toBeGreaterThan(away.reduce((a, b) => a + b))
    top.forEach((c) => expect(c).toBeLessThanOrEqual(255))
  })
})
