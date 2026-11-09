import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode, CanvasVectorNode } from '../../document/types'
import { objectsOf, setSolidOf, updateFeature } from '../../document/objects'
import { resolvePlanes } from '../scene3d/planeRefs'
import { bodyOf, type Body } from './body'
import { editBody, extrudeFace, type BodyEdit } from './editBody'
import { layerMesh } from '../scene3d/sceneMeshes'

const square = (extra: Partial<CanvasVectorNode> = {}): CanvasNode =>
  ({ id: 'sq', name: 'Square', kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

/** A 1 m cube: a 100 px square on the Front plane, extruded 1 m toward the viewer. */
const cube = (extra: Partial<CanvasVectorNode> = {}) =>
  resolvePlanes(setSolidOf(docOf([square({ sketch: { plane: { kind: 'default', plane: 'front' }, at: { u: 0, v: 0 } }, ...extra })]), 'sq', { kind: 'extrude', depth: 1 }, 'Cube'))
const bodyIn = (doc: CanvasDoc): Body => bodyOf(doc, objectsOf(doc)[0])
const faceWhere = (body: Body, role: 'start' | 'end' | 'side', test?: (n: [number, number, number]) => boolean) =>
  body.faces.findIndex((f) => {
    if (f.name.role !== role) return false
    if (!test) return true
    const t = f.triangles[0]
    const i = body.mesh.indices[t * 3]
    const n: [number, number, number] = [body.mesh.normals[i * 3], body.mesh.normals[i * 3 + 1], body.mesh.normals[i * 3 + 2]]
    return test(n)
  })
const cornerAt = (body: Body, c: [number, number, number]) => body.vertices.findIndex((v) => Math.hypot(v.at[0] - c[0], v.at[1] - c[1], v.at[2] - c[2]) < 1e-6)
const done = (edit: BodyEdit) => {
  if ('blocked' in edit) throw new Error(edit.blocked)
  return edit
}
const outline = (doc: CanvasDoc) => {
  const node = doc.nodes[0] as CanvasVectorNode
  return { rect: node.rect, points: node.points?.map((p) => [Math.round(p.x), Math.round(p.y)]) }
}

describe('editing a part changes what made it', () => {
  it('turns pulling the end cap along its normal into the extrude’s depth', () => {
    const doc = cube()
    const end = faceWhere(bodyIn(doc), 'end')
    const edit = done(editBody(doc, objectsOf(doc)[0].id, { kind: 'face', face: end }, [0, 0, 0.5]))
    expect(objectsOf(edit.doc)[0].features[0]).toMatchObject({ depth: 1.5 })
    expect(edit.did).toBe('Extrude 1 is 1.5 m deep')
    // Sideways motion doesn't reach depth.
    expect(objectsOf(done(editBody(doc, objectsOf(doc)[0].id, { kind: 'face', face: end }, [0.3, 0.2, 0])).doc)[0].features[0]).toMatchObject({ depth: 1 })
  })

  it('pulls a reversed extrude’s far cap the other way', () => {
    let doc = cube()
    doc = updateFeature(doc, objectsOf(doc)[0].features[0].id, { direction: 'reverse' } as never)
    const end = faceWhere(bodyIn(doc), 'end')
    expect(objectsOf(done(editBody(doc, objectsOf(doc)[0].id, { kind: 'face', face: end }, [0, 0, -0.25])).doc)[0].features[0]).toMatchObject({ depth: 1.25 })
  })

  it('moves the sketch off its plane when the start cap is pulled, the end cap staying put', () => {
    const doc = cube()
    const start = faceWhere(bodyIn(doc), 'start')
    const edit = done(editBody(doc, objectsOf(doc)[0].id, { kind: 'face', face: start }, [0, 0, 0.25]))
    expect(edit.doc.nodes[0].sketch!.plane).toEqual({ kind: 'offset', from: { kind: 'default', plane: 'front' }, distance: 0.25 })
    expect(objectsOf(edit.doc)[0].features[0]).toMatchObject({ depth: 0.75 })
  })

  it('pushes a side face by moving its outline segment, in the plane only', () => {
    const doc = cube()
    const right = faceWhere(bodyIn(doc), 'side', (n) => n[0] > 0.9)
    const edit = done(editBody(doc, objectsOf(doc)[0].id, { kind: 'face', face: right }, [0.2, 0, 0.7]))
    expect(edit.did).toBe('Moved a side of Square')
    expect(outline(edit.doc).rect).toMatchObject({ w: 120, h: 100 })
    // It stays where it stood: its left edge didn't move.
    expect(edit.doc.nodes[0].sketch!.at).toEqual({ u: 0, v: 0 })
  })

  it('moves a corner alone, in any direction, leaving the sketch and every other corner where they were', () => {
    const doc = cube()
    const body = bodyIn(doc)
    const id = objectsOf(doc)[0].id
    // The front cap's corner at x 0, y 0, 1 m out.
    const corner = cornerAt(body, [0, 0, 1])
    const edit = done(editBody(doc, id, { kind: 'vertex', vertex: corner }, [-0.1, 0.2, 0.3]))
    expect(edit.did).toBe('Moved a point of Square')
    expect(outline(edit.doc).rect).toMatchObject({ w: 100, h: 100 })
    const after = bodyIn(edit.doc)
    expect(cornerAt(after, [-0.1, 0.2, 1.3])).toBeGreaterThanOrEqual(0)
    // Its partner at the other end of the same outline point stayed.
    expect(cornerAt(after, [0, 0, 0])).toBeGreaterThanOrEqual(0)
    expect(after.vertices).toHaveLength(8)
    // And it can be picked and moved again from where it now is.
    const again = done(editBody(edit.doc, id, { kind: 'vertex', vertex: cornerAt(after, [-0.1, 0.2, 1.3]) }, [0.1, 0, 0]))
    expect(cornerAt(bodyIn(again.doc), [0, 0.2, 1.3])).toBeGreaterThanOrEqual(0)
  })

  it('slants a rim on its own, and moves an upright edge in the plane through the sketch', () => {
    const doc = cube()
    const body = bodyIn(doc)
    const id = objectsOf(doc)[0].id
    const edgeBetween = (p: [number, number, number], q: [number, number, number]) =>
      body.edges.findIndex((e) => [p, q].every((c) => e.points.some((x) => Math.hypot(x[0] - c[0], x[1] - c[1], x[2] - c[2]) < 1e-6)))
    // The front cap's top rim, lifted out along Z: only its two corners go.
    const rim = done(editBody(doc, id, { kind: 'edge', edge: edgeBetween([0, 0, 1], [1, 0, 1]) }, [0, 0, 0.5]))
    expect(rim.did).toBe('Moved 2 points of Square')
    expect(cornerAt(bodyIn(rim.doc), [1, 0, 1.5])).toBeGreaterThanOrEqual(0)
    expect(cornerAt(bodyIn(rim.doc), [1, 0, 0])).toBeGreaterThanOrEqual(0)
    // An upright edge moved within the plane is that point of the sketch.
    const upright = done(editBody(doc, id, { kind: 'edge', edge: edgeBetween([1, 0, 0], [1, 0, 1]) }, [0.2, 0, 0]))
    expect(upright.did).toBe('Moved a point of Square')
    expect(outline(upright.doc).rect.w).toBe(120)
    expect(objectsOf(upright.doc)[0].features[0]).not.toHaveProperty('tweaks')
    // Moved out of the plane instead, it can't be the sketch: both its corners go on their own.
    const lifted = done(editBody(doc, id, { kind: 'edge', edge: edgeBetween([1, 0, 0], [1, 0, 1]) }, [0.2, 0, 0.1]))
    expect(cornerAt(bodyIn(lifted.doc), [1.2, 0, 1.1])).toBeGreaterThanOrEqual(0)
    expect(cornerAt(bodyIn(lifted.doc), [1.2, 0, 0.1])).toBeGreaterThanOrEqual(0)
  })

  it('draws what it picks: reversed and both-ways extrudes, and moved corners, on the mesh shown', () => {
    let doc = cube()
    const featureId = objectsOf(doc)[0].features[0].id
    doc = updateFeature(doc, featureId, { direction: 'symmetric', tweaks: { '0:end': [0, 0, 20] } } as never)
    const shown = layerMesh(doc.nodes[0], doc)!
    const zs = shown.positions.filter((_, i) => i % 3 === 2)
    // Centered on the plane (±50 px), and one corner carried 20 px further out.
    expect(Math.min(...zs)).toBeCloseTo(-50, 6)
    expect(Math.max(...zs)).toBeCloseTo(70, 6)
    const body = bodyIn(doc)
    expect(cornerAt(body, [0, 0, 0.7])).toBeGreaterThanOrEqual(0)
  })

  it('extrudes one face into new material on the same part, leaving the rest alone', () => {
    const doc = cube()
    const id = objectsOf(doc)[0].id
    const right = faceWhere(bodyIn(doc), 'side', (n) => n[0] > 0.9)
    const edit = extrudeFace(doc, id, right, 0.5)
    if ('blocked' in edit) throw new Error(edit.blocked)
    const part = objectsOf(edit.doc)[0]
    expect(part.features.map((f) => [f.kind, f.op])).toEqual([['extrude', 'new'], ['extrude', 'add']])
    // The cube is as it was: same sketch, same depth.
    expect(outline(edit.doc).rect).toMatchObject({ w: 100, h: 100 })
    expect(part.features[0]).toMatchObject({ depth: 1 })
    // The new block runs from the face out along +X, the face's size.
    const p = bodyOf(edit.doc, part).mesh.positions
    const xs = p.filter((_, i) => i % 3 === 0)
    expect(Math.max(...xs)).toBeCloseTo(1.5, 5)
    const added = edit.doc.nodes[1]
    expect(added.sketch!.plane).toMatchObject({ kind: 'face', objectId: id })
    expect(added.rect).toMatchObject({ w: 100, h: 100 })
    // Pushed the other way, it's the face moving in, not a cut.
    const inward = extrudeFace(doc, id, right, -0.2)
    if ('blocked' in inward) throw new Error(inward.blocked)
    expect(objectsOf(inward.doc)[0].features).toHaveLength(1)
    expect(outline(inward.doc).rect.w).toBe(80)
  })

  it('says why instead of editing a placed sketch’s copy, or a revolve', () => {
    const linked = cube({ sketch: { plane: { kind: 'default', plane: 'front' }, at: { u: 0, v: 0 }, link: { doc: 'card' } } })
    const end = faceWhere(bodyIn(linked), 'end')
    expect(editBody(linked, objectsOf(linked)[0].id, { kind: 'face', face: end }, [0, 0, 1])).toEqual({ blocked: 'Placed from a sketch — edit “Square” there', sketch: 'card' })

    const spun = setSolidOf(docOf([square()]), 'sq', { kind: 'revolve', axis: 'center', angle: 360, steps: 24 })
    const edit = editBody(spun, objectsOf(spun)[0].id, { kind: 'face', face: 0 }, [0, 0, 1])
    expect('blocked' in edit && edit.blocked).toMatch(/^Revolve 1 spins its sketch/)
  })
})
