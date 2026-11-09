import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { setSolidOf, type PlaneRef } from '../../document/objects'
import { bodyOf, faceAt, partTriangle } from '../geometry/body'
import { addSketch, attachSketch, describePlane, eulerOf, nextSketchName, resolvePlanes, sketchProblem } from './planeRefs'
import { onPlane, planeNormal, rotate, syncPlacements } from '../../document/placement'
import type { Vec3 } from '../../document/sceneTypes'

const close = (a: number[], b: number[], digits = 6) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], digits))
const frame = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, children: [], ...extra }) as CanvasNode
const box = (id: string): CanvasNode => ({ id, name: 'Box', kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {} }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })
const top: PlaneRef = { kind: 'default', plane: 'top' }

describe('turning a plane back into a rotation', () => {
  it('round-trips any rotation through its axes', () => {
    for (const r of [[0, 0, 0], [-90, 0, 0], [0, 90, 0], [35, 45, 10], [-120, 30, 75]] as Vec3[]) {
      const back = eulerOf(rotate([1, 0, 0], r), rotate([0, 1, 0], r), rotate([0, 0, 1], r))
      for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) close(rotate(axis, back), rotate(axis, r))
    }
  })
})

describe('sketches on planes', () => {
  it('lays a sketch on the Top plane where it was, and words it', () => {
    const doc = attachSketch(docOf([frame('s', { rect: { x: 100, y: -50, w: 100, h: 100 } })]), 's', top)
    const s = doc.nodes[0]
    close(planeNormal(s.space!), [0, 1, 0])
    // On the ground: height zero, kept as close to where it stood as the plane allows.
    expect(s.space!.position[1]).toBeCloseTo(0, 9)
    expect(s.space!.position[0]).toBeCloseTo(1, 9)
    expect(describePlane(doc, s.sketch!.plane)).toBe('Top plane')
  })

  it('stands an offset sketch that far out along the plane’s normal', () => {
    const doc = attachSketch(docOf([frame('s')]), 's', { kind: 'offset', from: { kind: 'default', plane: 'front' }, distance: 0.2 })
    expect(doc.nodes[0].space!.position[2]).toBeCloseTo(0.2, 9)
    expect(describePlane(doc, doc.nodes[0].sketch!.plane)).toBe('0.2 m off Front plane')
  })

  it('stands a sketch on a box’s end face, and rides along when the box gets deeper', () => {
    let doc = setSolidOf(docOf([box('box'), frame('s', { rect: { x: 20, y: 20, w: 40, h: 40 } })]), 'box', { kind: 'extrude', depth: 1 })
    const object = doc.objects![0]
    const end = bodyOf(doc, object).faces.find((f) => f.name.role === 'end')!.name
    doc = attachSketch(doc, 's', { kind: 'face', objectId: object.id, face: end })
    const on = doc.nodes[1].space!
    // The end face is 1 m out, facing the viewer, turned like the box's sketch.
    close(on.position, [0.2, -0.2, 1])
    close(planeNormal(on), [0, 0, 1])
    doc = resolvePlanes(setSolidOf(doc, 'box', { kind: 'extrude', depth: 2.5 }))
    close(doc.nodes[1].space!.position, [0.2, -0.2, 2.5])
    expect(describePlane(doc, doc.nodes[1].sketch!.plane)).toBe("Extrude 1's end face")
  })

  it('flags a sketch whose face is gone, keeping where it stood, and not one whose part is only hidden', () => {
    let doc = setSolidOf(docOf([box('box'), frame('s', { rect: { x: 20, y: 20, w: 40, h: 40 } })]), 'box', { kind: 'extrude', depth: 1 })
    const object = doc.objects![0]
    const end = bodyOf(doc, object).faces.find((f) => f.name.role === 'end')!.name
    doc = attachSketch(doc, 's', { kind: 'face', objectId: object.id, face: end })
    expect(sketchProblem(doc, doc.nodes[1])).toBeNull()
    expect(sketchProblem({ ...doc, objects: [{ ...object, hidden: true }] }, doc.nodes[1])).toBeNull()
    // The box's sketch deleted: the feature is kept but builds nothing, so its end face is gone.
    const gone = resolvePlanes({ ...doc, nodes: [doc.nodes[1]] })
    expect(sketchProblem(gone, gone.nodes[0])).toBe('The face it stood on is gone')
    expect(gone.nodes[0].space).toEqual(doc.nodes[1].space)
    expect(sketchProblem({ ...doc, objects: [] }, doc.nodes[1])).toBe('The part it stood on was deleted')
    expect(sketchProblem({ ...doc, objects: [{ ...object, features: [] }] }, doc.nodes[1])).toBe('The feature whose face it stood on was deleted')
  })

  it('refuses to stand a sketch on a face built from itself', () => {
    const doc = setSolidOf(docOf([box('box')]), 'box', { kind: 'extrude', depth: 1 })
    const end = bodyOf(doc, doc.objects![0]).faces.find((f) => f.name.role === 'end')!.name
    expect(attachSketch(doc, 'box', { kind: 'face', objectId: doc.objects![0].id, face: end })).toBe(doc)
  })

  it('slides a sketch along its plane when it is dragged on the board, never off it', () => {
    const doc = attachSketch(docOf([frame('s')]), 's', top)
    const before = doc.nodes[0]
    // Dragged 30 px right and 40 px down on the front view: a Top-plane sketch can only follow the sideways part.
    const dragged = { ...doc, nodes: [{ ...before, rect: { ...before.rect, x: before.rect.x + 30, y: before.rect.y + 40 } }] }
    const after = resolvePlanes(syncPlacements(doc, dragged)).nodes[0]
    expect(after.space!.position[0]).toBeCloseTo(before.space!.position[0] + 0.3, 9)
    expect(after.space!.position[1]).toBeCloseTo(0, 9)
    expect(after.rect.y).toBeCloseTo(before.rect.y, 9)
  })

  it('carries a board move onto a slanted plane exactly, and an edge-on one by its line', () => {
    const slanted = onPlane({ position: [0, 0, 0], rotation: [0, 60, 0] }, 25, 10)
    expect(slanted.u).toBeCloseTo(50, 9)
    expect(slanted.v).toBeCloseTo(10, 9)
    const edgeOn = onPlane({ position: [0, 0, 0], rotation: [-90, 0, 0] }, 30, 40)
    expect(edgeOn.u).toBeCloseTo(30, 9)
    expect(edgeOn.v).toBeCloseTo(0, 9)
  })

  it('lets a freed sketch keep its placement, untouched by the resolver', () => {
    const held = attachSketch(docOf([frame('s')]), 's', top)
    const freed = attachSketch(held, 's', { kind: 'custom' })
    expect(freed.nodes[0].space).toEqual(held.nodes[0].space)
    expect(resolvePlanes(freed)).toBe(freed)
  })
})

describe('+ Sketch', () => {
  const sketch = (name: string) => ({ id: name, name, kind: 'frame', rect: { x: 0, y: 0, w: 240, h: 160 }, style: {}, children: [] }) as CanvasNode

  it('centers a new sketch on a default plane, and numbers them', () => {
    const doc = addSketch(docOf([]), top, sketch(nextSketchName(docOf([]))))!
    const s = doc.nodes[0]
    expect(s.name).toBe('Sketch 1')
    // Its middle on the plane's origin: the top-left is half its size back along the plane.
    close(s.space!.position, [-1.2, 0, -0.8])
    expect(nextSketchName(doc)).toBe('Sketch 2')
  })

  it('centers a sketch on a face picked by one of its triangles', () => {
    const doc = setSolidOf(docOf([box('box')]), 'box', { kind: 'extrude', depth: 1 })
    const object = doc.objects![0]
    const body = bodyOf(doc, object)
    // The box's own mesh triangle 0 is on its end cap, as the 3D view's per-layer mesh numbers it.
    const t = partTriangle(body, object.features[0].id, 'box', 0)!
    const face = faceAt(body, t)!.face.name
    expect(face.role).toBe('end')
    const s = addSketch(doc, { kind: 'face', objectId: object.id, face }, sketch('s'))!.nodes[1]
    // Centered on the 100 × 100 px end face, 1 m out.
    close(s.space!.position, [0.5 - 1.2, -0.5 + 0.8, 1])
  })
})
