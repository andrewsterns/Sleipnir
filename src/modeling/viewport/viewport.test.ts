import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasFrameNode, CanvasNode, CanvasVectorNode } from '../../document/types'
import { cameraFor, sceneBounds } from './cameraViews'
import { layerMesh, sceneTriangles, surfaceOf, sweepsAlong } from '../scene3d/sceneMeshes'
import { planeGuides } from '../scene3d/sketchPlane'
import { PLANE_ROTATION } from '../../document/placement'
import { signedVolume } from '../geometry/modifiers'
import { migrateLayerSolids } from '../../document/objects'
import { applyWheelMove, unitsPerPixel, wheelMove, type WheelCamera, type WheelInput } from './viewportControls'

const frame = (id: string, x: number, y: number, w: number, h: number, extra: Partial<CanvasFrameNode> = {}): CanvasFrameNode =>
  ({ id, name: id, kind: 'frame', rect: { x, y, w, h }, style: {}, children: [], ...extra }) as CanvasFrameNode
const vector = (id: string, extra: Partial<CanvasVectorNode>): CanvasVectorNode =>
  ({ id, name: id, kind: 'vector', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, shape: 'rectangle', ...extra }) as CanvasVectorNode
// Layers written with a `solid`, as boards were before Objects: read the way a board is, through the migration.
const docOf = (nodes: CanvasNode[]): CanvasDoc => migrateLayerSolids({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

describe('layers in 3D', () => {
  it('lays an unplaced layer flat, and builds a solid from one with a modifier', () => {
    const flat = vector('a', {})
    const box = vector('b', { solid: { kind: 'extrude', depth: 0.5 } })
    const doc = docOf([flat, box])
    expect(layerMesh(flat, doc)!.indices.length).toBe(6)
    // 100 × 100 px × 0.5 m (50 px) deep.
    expect(signedVolume(layerMesh(box, doc)!)).toBeCloseTo(100 * 100 * 50, 6)
    expect(sceneTriangles(doc)).toBe(2 + 12)
  })

  it('hands a swept profile’s tube to the path it follows', () => {
    const path = vector('path', { shape: 'path', closed: false, rect: { x: 0, y: 0, w: 200, h: 10 }, viewBox: { w: 200, h: 10 }, points: [{ x: 0, y: 5 }, { x: 200, y: 5 }] })
    const profile = vector('ring', { shape: 'ellipse', rect: { x: 0, y: 0, w: 20, h: 20 }, solid: { kind: 'sweep', pathId: 'path' } })
    const doc = docOf([path, profile])
    expect(sweepsAlong(doc).get('path')?.map((n) => n.id)).toEqual(['ring'])
    expect(layerMesh(profile, doc)).toBeNull()
    expect(sceneTriangles(doc)).toBeGreaterThan(50)
  })

  it('paints the topmost visible fill, and gives a bare solid clay', () => {
    expect(surfaceOf(vector('a', { style: { fills: [{ color: '#ff0000' }, { color: '#00ff00', visible: false }] } }))).toEqual({ css: '#ff0000', opacity: 1 })
    expect(surfaceOf(frame('f', 0, 0, 10, 10))).toBeNull()
    expect(surfaceOf(vector('s', {}), true)?.css).toMatch(/^#/)
  })
})

describe('cameras', () => {
  it('frames the scene from the front, top and side', () => {
    const doc = docOf([frame('f', 0, 0, 200, 100)])
    const b = sceneBounds(doc)!
    expect(b.min).toEqual([0, -1, 0])
    expect(b.max).toEqual([2, 0, 0])
    const front = cameraFor('front', b, { w: 800, h: 600 })
    expect(front.target).toEqual([1, -0.5, 0])
    expect(front.position[2]).toBeGreaterThan(0)
    expect(cameraFor('top', b, { w: 800, h: 600 }).up).toEqual([0, 0, -1])
    expect(cameraFor('side', b, { w: 800, h: 600 }).position[0]).toBeGreaterThan(1)
  })
})

describe('blueprint guides between planes', () => {
  it('lines the front sketch up with the top sketch’s anchors', () => {
    const front = frame('front', 0, 0, 100, 100)
    // A top-plane sketch standing at the origin, its corners 1 m apart along X.
    const top = frame('top', 400, 0, 100, 100, { space: { position: [0, 0, 0], rotation: PLANE_ROTATION.top } })
    const doc = docOf([front, top])
    const rectOf = (id: string) => (id === 'front' ? front.rect : id === 'top' ? top.rect : null)
    const guides = planeGuides(doc, 'front', rectOf)
    expect(guides.filter((g) => g.axis === 'x').map((g) => g.position).sort((a, b) => a - b)).toEqual([0, 100])
    // A layer that isn't placed in 3D casts no guides.
    expect(planeGuides(docOf([front, frame('loose', 400, 0, 50, 50)]), 'front', (id) => (id === 'front' ? front.rect : { x: 400, y: 0, w: 50, h: 50 }))).toEqual([])
  })
})

describe('the 3D wheel, in the 2D board’s terms', () => {
  // Looking down -Z from 10 m out, 1 cm per px: the Front view.
  const front: WheelCamera = { position: [0, 0, 10], target: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], unitsPerPx: 0.01 }
  const wheel = (patch: Partial<WheelInput>): WheelInput => ({ deltaX: 0, deltaY: 0, shiftKey: false, ctrlKey: false, metaKey: false, cursor: { x: 0, y: 0 }, ...patch })

  it('pans down the screen on a plain scroll, sideways with Shift or a trackpad', () => {
    // -0 and 0 move a camera the same.
    const offset = (e: WheelInput) => wheelMove(front, e).offset.map((n) => n || 0)
    expect(offset(wheel({ deltaY: 100 }))).toEqual([0, -1, 0])
    expect(offset(wheel({ deltaY: 100, shiftKey: true }))).toEqual([1, 0, 0])
    expect(offset(wheel({ deltaX: -50 }))).toEqual([-0.5, 0, 0])
    const moved = applyWheelMove({ ...front, orthographic: false, zoom: 1 }, wheelMove(front, wheel({ deltaY: 100 })))
    expect(moved).toEqual({ position: [0, -1, 10], target: [0, -1, 0], zoom: 1 })
  })

  it('zooms with Ctrl or Cmd, keeping the point under the cursor in place', () => {
    const move = wheelMove(front, wheel({ ctrlKey: true, deltaY: -200, cursor: { x: 100, y: -50 } }))
    expect(move.kind).toBe('zoom')
    if (move.kind !== 'zoom') return
    expect(move.factor).toBeGreaterThan(1)
    // The cursor sat on (1, 0.5) at the target's depth.
    const under = [1, 0.5]
    // Perspective: the camera dollies in; the cursor's point keeps its pixel.
    const persp = applyWheelMove({ ...front, orthographic: false, zoom: 1 }, move)
    const distance = persp.position[2] - persp.target[2]
    expect(distance).toBeCloseTo(10 / move.factor, 9)
    const perPx = 0.01 / move.factor
    expect((under[0] - persp.target[0]) / perPx).toBeCloseTo(100, 6)
    expect((under[1] - persp.target[1]) / perPx).toBeCloseTo(50, 6)
    // Orthographic: the zoom grows instead, and the camera keeps its distance.
    const ortho = applyWheelMove({ ...front, orthographic: true, zoom: 100 }, move)
    expect(ortho.zoom).toBeCloseTo(100 * move.factor, 9)
    expect(ortho.position[2]).toBe(10)
    expect(move).toEqual(wheelMove(front, wheel({ metaKey: true, deltaY: -200, cursor: { x: 100, y: -50 } })))
  })

  it('measures a pixel at the target for either camera', () => {
    expect(unitsPerPixel({ orthographic: true, zoom: 50, fov: 45, distance: 3 }, 600)).toBeCloseTo(0.02, 9)
    // A 90° frustum 5 m out is 10 m tall across 500 px.
    expect(unitsPerPixel({ orthographic: false, zoom: 1, fov: 90, distance: 5 }, 500)).toBeCloseTo(0.02, 9)
  })
})
