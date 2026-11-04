import { describe, it, expect } from 'vitest'
import { defaultPlacement, planeNormal, planeOf, planeToWorld, PLANE_ROTATION, placementOf, syncPlacements, worldToPlane } from './placement'
import type { Placement3D } from './sceneTypes'
import type { CanvasDoc, CanvasNode } from './types'

const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 9))

describe('drafting planes', () => {
  it('faces front, up and right', () => {
    close(planeNormal({ position: [0, 0, 0], rotation: PLANE_ROTATION.front }), [0, 0, 1])
    close(planeNormal({ position: [0, 0, 0], rotation: PLANE_ROTATION.top }), [0, 1, 0])
    close(planeNormal({ position: [0, 0, 0], rotation: PLANE_ROTATION.side }), [1, 0, 0])
  })

  it('names a rotation by its plane, whatever turns it took to get there', () => {
    expect(planeOf([0, 0, 0])).toBe('front')
    expect(planeOf([270, 0, 0])).toBe('top')
    expect(planeOf([0, 90, 0])).toBe('side')
    expect(planeOf([15, 0, 0])).toBe('custom')
  })

  it('lays a top sketch flat, its top edge pointing away', () => {
    const top: Placement3D = { position: [0, 0, 0], rotation: PLANE_ROTATION.top }
    // 100 px right and 100 px down the sketch: 1 m along X, 1 m toward the viewer.
    close(planeToWorld(top, 100, 100), [1, 0, 1])
  })
})

describe('plane ⇄ space', () => {
  it('maps the board onto the front plane at 1 px = 1 cm, y up', () => {
    expect(defaultPlacement({ x: 200, y: 50 })).toEqual({ position: [2, -0.5, 0], rotation: [0, 0, 0] })
    close(planeToWorld(placementOf({ rect: { x: 200, y: 50, w: 10, h: 10 } }), 100, 100), [3, -1.5, 0])
  })

  it('round-trips through any placement', () => {
    const p: Placement3D = { position: [1, 2, 3], rotation: [30, -45, 60], scale: [2, 1, 0.5] }
    const world = planeToWorld(p, 37, -12, 5)
    const back = worldToPlane(p, world)
    expect(back.u).toBeCloseTo(37, 9)
    expect(back.v).toBeCloseTo(-12, 9)
    expect(back.out).toBeCloseTo(5, 9)
  })
})

describe('one position for 2D and 3D', () => {
  const doc = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })
  const layer = (rect: { x: number; y: number }, space?: Placement3D): CanvasNode =>
    ({ id: 'a', name: 'a', kind: 'frame', rect: { ...rect, w: 100, h: 50 }, style: {}, children: [], ...(space ? { space } : {}) }) as CanvasNode
  const turned = (position: [number, number, number]): Placement3D => ({ position, rotation: [30, 45, 0] })

  it('carries the 2D rect along when the layer moves in 3D', () => {
    const before = doc([layer({ x: 100, y: 200 }, turned([1, -2, 3]))])
    const after = syncPlacements(before, doc([layer({ x: 100, y: 200 }, turned([2.5, -1, 3]))]))
    expect(after.nodes[0].rect).toEqual({ x: 250, y: 100, w: 100, h: 50 })
    expect(after.nodes[0].space?.position).toEqual([2.5, -1, 3])
  })

  it('writes a 2D move back into the placement, keeping its depth', () => {
    const before = doc([layer({ x: 100, y: 200 }, turned([1, -2, 3]))])
    const after = syncPlacements(before, doc([layer({ x: 130, y: 180 }, turned([1, -2, 3]))]))
    expect(after.nodes[0].space).toEqual({ position: [1.3, -1.8, 3], rotation: [30, 45, 0] })
    expect(after.nodes[0].rect).toEqual({ x: 130, y: 180, w: 100, h: 50 })
  })

  it('trusts the placement on a board just read from disk, and leaves agreeing or unplaced layers alone', () => {
    const stale = doc([layer({ x: 0, y: 0 }, turned([1, -2, 3]))])
    expect(syncPlacements(null, stale).nodes[0].rect).toMatchObject({ x: 100, y: 200 })
    const agreeing = doc([layer({ x: 100, y: 200 }, turned([1, -2, 3])), { ...layer({ x: 5, y: 5 }), id: 'b' }])
    expect(syncPlacements(null, agreeing)).toBe(agreeing)
  })
})
