import { describe, it, expect } from 'vitest'
import { defaultPlacement, planeNormal, planeOf, planeToWorld, PLANE_ROTATION, placementOf, worldToPlane } from './placement'
import type { Placement3D } from './sceneTypes'

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
