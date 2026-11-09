// G / R / S: the pointer and keys turned into a move, and the move applied —
// to a part as a whole, or through the editing rules to its faces and points.

import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode, CanvasVectorNode } from '../../document/types'
import { objectsOf, setSolidOf } from '../../document/objects'
import type { Vec3 } from '../../document/sceneTypes'
import { resolvePlanes } from '../scene3d/planeRefs'
import { bodyOf, sceneToLayer } from '../geometry/body'
import { applyMove, elementsAfter, modalKey, modalTargetOf, moveOf, movePlacement, pivotOf, pushNormalOf, startModal, type Modal, type ScreenView } from './modalTransform'
import { sceneBounds } from './cameraViews'

/** Looking down -Z at the origin, 100 px to the meter, the origin at (400, 300). */
const front: ScreenView = {
  ray: (x, y) => ({ origin: [(x - 400) / 100, -(y - 300) / 100, 10], dir: [0, 0, -1] }),
  project: (p) => ({ x: 400 + p[0] * 100, y: 300 - p[1] * 100 }),
  forward: [0, 0, -1],
}
const keys = (modal: Modal, ...ks: string[]) => ks.reduce((m, k) => modalKey(m, k) as Modal, modal)
const near = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

const square = (extra: Partial<CanvasVectorNode> = {}): CanvasNode =>
  ({ id: 'sq', name: 'Square', kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })
/** A 1 m cube on the Front plane, from (0, -1, 0) to (1, 0, 1). */
const cube = () => resolvePlanes(setSolidOf(docOf([square({ sketch: { plane: { kind: 'default', plane: 'front' }, at: { u: 0, v: 0 } } })]), 'sq', { kind: 'extrude', depth: 1 }, 'Cube'))
const partId = (doc: CanvasDoc) => objectsOf(doc)[0].id
const bodyIn = (doc: CanvasDoc) => bodyOf(doc, objectsOf(doc)[0])
const bounds = (doc: CanvasDoc) => sceneBounds(doc)!

describe('the pointer and keys make the move', () => {
  it('grabs in the view plane, or along a locked axis, or by a typed amount', () => {
    const modal = startModal('grab', [0, 0, 0], { x: 400, y: 300 })
    near((moveOf(modal, { x: 450, y: 250 }, front) as { by: Vec3 }).by, [0.5, 0.5, 0])
    near((moveOf(keys(modal, 'y'), { x: 450, y: 250 }, front) as { by: Vec3 }).by, [0, 0.5, 0])
    near((moveOf(keys(modal, 'x', '2', '.', '5'), { x: 0, y: 0 }, front) as { by: Vec3 }).by, [2.5, 0, 0])
    near((moveOf(keys(modal, 'z', '3', '-'), { x: 0, y: 0 }, front) as { by: Vec3 }).by, [0, 0, -3])
    // The same axis again frees it; Ctrl snaps to centimeters.
    expect(keys(modal, 'x', 'x').axis).toBeNull()
    near((moveOf(modal, { x: 412.34, y: 300 }, front, true) as { by: Vec3 }).by, [0.12, 0, 0])
  })

  it('turns about the view axis as the pointer goes round the pivot, and scales by its distance', () => {
    const turn = moveOf(startModal('rotate', [0, 0, 0], { x: 500, y: 300 }), { x: 400, y: 200 }, front)
    expect(turn).toMatchObject({ kind: 'rotate', axis: [0, 0, 1] })
    expect((turn as { deg: number }).deg).toBeCloseTo(90, 6)
    const scale = moveOf(startModal('scale', [0, 0, 0], { x: 500, y: 300 }), { x: 600, y: 300 }, front)
    near((scale as { by: Vec3 }).by, [2, 2, 2])
    near((moveOf(keys(startModal('scale', [0, 0, 0], { x: 500, y: 300 }), 'y', '3'), { x: 0, y: 0 }, front) as { by: Vec3 }).by, [1, 3, 1])
  })

  it('keeps with Enter, puts back with Esc, and switches between G, R and S', () => {
    const modal = startModal('grab', [0, 0, 0], { x: 0, y: 0 })
    expect(modalKey(modal, 'Enter')).toBe('keep')
    expect(modalKey(modal, 'Escape')).toBe('cancel')
    expect((modalKey(keys(modal, '4'), 'r') as Modal)).toMatchObject({ kind: 'rotate', typed: '' })
    expect(modalKey(modal, 'q')).toBeNull()
  })

  it('turns a placement about the pivot, and scales a turned one along its own axes', () => {
    const turned = movePlacement({ kind: 'rotate', axis: [0, 0, 1], deg: 90 }, [1, 0, 0], { position: [2, 0, 0], rotation: [0, 0, 0] })
    near(turned.position, [1, 1, 0])
    near(turned.rotation, [0, 0, 90])
    const scaled = movePlacement({ kind: 'scale', by: [2, 1, 1] }, [0, 0, 0], { position: [0, 0, 0], rotation: [0, 0, 90] })
    expect(scaled.scale).toEqual([2, 1, 1])
  })
})

describe('the move applied', () => {
  it('moves a part as a whole: its sketch keeps its plane, and its body, bounds and edits follow', () => {
    const doc = cube()
    const target = modalTargetOf(doc, new Set(['sq']), 'object', [])!
    expect(target).toEqual({ kind: 'parts', parts: [partId(doc)], layers: [] })
    near(pivotOf(doc, target)!, [0.5, -0.5, 0.5])
    const moved = applyMove(doc, target, { kind: 'translate', by: [2, 0, 0] }, [0.5, -0.5, 0.5]).doc
    expect(objectsOf(moved)[0].placement).toEqual({ position: [2, 0, 0], rotation: [0, 0, 0] })
    expect(moved.nodes[0].sketch!.plane).toEqual({ kind: 'default', plane: 'front' })
    near(bounds(moved).min, [2, -1, 0])
    // A point of the moved part reads back to the same spot on its sketch.
    near(Object.values(sceneToLayer(moved, moved.nodes[0])([2.25, -0.5, 0])) as Vec3, [25, 50, 0])
  })

  it('swings a part about its middle, and pulling its turned end cap still deepens the extrude', () => {
    const doc = cube()
    const target = modalTargetOf(doc, new Set(['sq']), 'object', [])!
    const pivot = pivotOf(doc, target)!
    const turned = applyMove(doc, target, { kind: 'rotate', axis: [0, 1, 0], deg: 90 }, pivot).doc
    near(objectsOf(turned)[0].placement!.rotation, [0, 90, 0])
    // The end cap faced +Z; turned a quarter about Y it faces +X.
    const end = bodyIn(turned).faces.findIndex((f) => f.name.role === 'end')
    const pulled = applyMove(turned, { kind: 'elements', elements: [{ objectId: partId(doc), kind: 'face', index: end }] }, { kind: 'translate', by: [0.5, 0, 0] }, pivot)
    expect(pulled.said).toBe('Extrude 1 is 1.5 m deep')
  })

  it('pushes and pulls a lone flat face along its normal', () => {
    const doc = cube()
    const end = bodyIn(doc).faces.findIndex((f) => f.name.role === 'end')
    const target = modalTargetOf(doc, new Set(), 'face', [{ objectId: partId(doc), kind: 'face', index: end }])!
    near(pushNormalOf(doc, target)!, [0, 0, 1])
    // Seen from the front the normal points at the viewer: the pointer can't say how far, so nothing moves.
    const modal = startModal('grab', pivotOf(doc, target)!, { x: 400, y: 300 }, pushNormalOf(doc, target))
    near((moveOf(modal, { x: 500, y: 300 }, front) as { by: Vec3 }).by, [0, 0, 0])
    // Typed, it goes along the face.
    const typed = moveOf(keys(modal, '0', '.', '2', '5'), { x: 0, y: 0 }, front)
    expect(objectsOf(applyMove(doc, target, typed, modal.pivot).doc)[0].features[0]).toMatchObject({ depth: 1.25 })
  })

  it('extrudes a lone face along its normal, picking the new end to go again', () => {
    const doc = cube()
    const end = bodyIn(doc).faces.findIndex((f) => f.name.role === 'end')
    const target = modalTargetOf(doc, new Set(), 'face', [{ objectId: partId(doc), kind: 'face', index: end }])!
    const modal = startModal('extrude', pivotOf(doc, target)!, { x: 400, y: 300 }, pushNormalOf(doc, target))
    const move = moveOf(keys(modal, '0', '.', '5'), { x: 0, y: 0 }, front)
    expect(move).toEqual({ kind: 'extrude', amount: 0.5 })
    const result = applyMove(doc, target, move, modal.pivot)
    expect(objectsOf(result.doc)[0].features).toHaveLength(2)
    const body = bodyOf(result.doc, objectsOf(result.doc)[0])
    const picked = body.faces[result.elements![0].index].name
    expect(picked).toMatchObject({ feature: objectsOf(result.doc)[0].features[1].id, role: 'end' })
  })

  it('moves several corners once each, and keeps the pick for the next move', () => {
    const doc = cube()
    const body = bodyIn(doc)
    // Both ends of one upright edge, each moved once.
    const corners = body.vertices.map((v, index) => ({ v, index })).filter(({ v }) => Math.abs(v.at[0] - 1) < 1e-6 && Math.abs(v.at[1]) < 1e-6)
    expect(corners).toHaveLength(2)
    const elements = corners.map(({ index }) => ({ objectId: partId(doc), kind: 'vertex' as const, index }))
    const result = applyMove(doc, { kind: 'elements', elements }, { kind: 'translate', by: [0.5, 0, 0] }, [1, 0, 0.5])
    expect(result.blocked).toBeFalsy()
    const moved = bodyIn(result.doc).vertices.filter((v) => Math.abs(v.at[0] - 1.5) < 1e-6 && Math.abs(v.at[1]) < 1e-6)
    expect(moved).toHaveLength(2)
    expect(elementsAfter(doc, result.doc, elements)).toEqual(elements)
  })

  it('says why when nothing there can move, and moves nothing', () => {
    const doc = cube()
    const gone = applyMove(doc, { kind: 'elements', elements: [{ objectId: 'nope', kind: 'vertex', index: 0 }, { objectId: 'nope', kind: 'vertex', index: 1 }] }, { kind: 'translate', by: [1, 0, 0] }, [0, 0, 0])
    expect(gone).toMatchObject({ doc, blocked: true, said: 'Nothing there moves that way' })
    expect(modalTargetOf(doc, new Set(), 'vertex', [])).toBeNull()
  })
})
