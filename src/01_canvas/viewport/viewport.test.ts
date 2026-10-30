import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasFrameNode, CanvasNode, CanvasVectorNode } from '../model/types'
import { cameraFor, sceneBounds } from './cameraViews'
import { layerMesh, sceneTriangles, surfaceOf, sweepsAlong } from './Viewport3D.ViewModel'
import { planeGuides } from '../scene3d/sketchPlane'
import { PLANE_ROTATION } from '../scene3d/placement'
import { signedVolume } from '../geometry/modifiers'

const frame = (id: string, x: number, y: number, w: number, h: number, extra: Partial<CanvasFrameNode> = {}): CanvasFrameNode =>
  ({ id, name: id, kind: 'frame', rect: { x, y, w, h }, style: {}, children: [], ...extra }) as CanvasFrameNode
const vector = (id: string, extra: Partial<CanvasVectorNode>): CanvasVectorNode =>
  ({ id, name: id, kind: 'vector', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, shape: 'rectangle', ...extra }) as CanvasVectorNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

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
    expect(surfaceOf(vector('s', { solid: { kind: 'extrude', depth: 1 } }))?.css).toMatch(/^#/)
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
