// Sketch mode in an environment lays the 2D board over the 3D view: the sketch
// camera must put every point of the plane under the board pixel drawing it.

import { describe, it, expect } from 'vitest'
import { cameraFor, planeOfView, sketchCameraPose, viewOfAxis, type SketchView } from './cameraViews'
import { planeToWorld, rotate } from '../../document/placement'
import type { Vec3 } from '../../document/sceneTypes'

const size = { w: 800, h: 600 }
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Where an orthographic camera at `pose` draws world point `p`, in screen px from the top-left. */
function onScreen(pose: ReturnType<typeof sketchCameraPose>, p: Vec3) {
  const forward: Vec3 = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]]
  const right = cross(forward, pose.up)
  const len = Math.hypot(...right)
  const r: Vec3 = [right[0] / len, right[1] / len, right[2] / len]
  const d: Vec3 = [p[0] - pose.target[0], p[1] - pose.target[1], p[2] - pose.target[2]]
  return { x: size.w / 2 + dot(d, r) * pose.zoom, y: size.h / 2 - dot(d, pose.up) * pose.zoom }
}

describe('views from the axis gizmo', () => {
  it('looks straight down each axis end, with the grid in the plane it faces', () => {
    expect([viewOfAxis('z', true), viewOfAxis('y', true), viewOfAxis('x', true)]).toEqual(['front', 'top', 'side'])
    expect([viewOfAxis('z', false), viewOfAxis('y', false), viewOfAxis('x', false)]).toEqual(['back', 'bottom', 'left'])
    expect(['back', 'bottom', 'left', 'perspective'].map((v) => planeOfView(v as never))).toEqual(['front', 'top', 'side', null])
    const bounds = { min: [-1, -1, -1] as Vec3, max: [1, 1, 1] as Vec3 }
    expect(cameraFor('back', bounds, size).position[2]).toBeLessThan(0)
    expect(cameraFor('bottom', bounds, size).position[1]).toBeLessThan(0)
    expect(cameraFor('left', bounds, size).position[0]).toBeLessThan(0)
  })
})

describe('the sketch camera under the board', () => {
  it('faces the Front plane from in front, a board pixel to a plane pixel', () => {
    const pose = sketchCameraPose({ placement: { position: [0, 0, 0], rotation: [0, 0, 0] }, origin: { x: 0, y: 0 }, camera: { x: 400, y: 300, k: 1 } }, size)
    expect(pose.target).toEqual([0, 0, 0])
    expect(pose.position[2]).toBeGreaterThan(0)
    expect(pose.up).toEqual([0, 1, 0])
    expect(pose.zoom).toBe(100)
  })

  it('puts any point of a tilted plane exactly where the panned, zoomed board draws it', () => {
    const view: SketchView = { placement: { position: [1.2, 0.4, -0.7], rotation: [-90, 30, 0] }, origin: { x: 150, y: -40 }, camera: { x: 120, y: 80, k: 1.75 } }
    const pose = sketchCameraPose(view, size)
    for (const [u, v] of [[0, 0], [240, 0], [0, 160], [37, 91]]) {
      const board = { x: (view.origin.x + u) * view.camera.k + view.camera.x, y: (view.origin.y + v) * view.camera.k + view.camera.y }
      const seen = onScreen(pose, planeToWorld(view.placement, u, v))
      expect(seen.x).toBeCloseTo(board.x, 6)
      expect(seen.y).toBeCloseTo(board.y, 6)
    }
    // It looks at the plane from its front, the side the board draws.
    const normal = rotate([0, 0, 1], view.placement.rotation)
    expect(dot([pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]], normal)).toBeGreaterThan(0)
  })
})
