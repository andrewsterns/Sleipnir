import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { objectsOf, setSolidOf } from '../../document/objects'
import { resolvePlanes } from '../scene3d/planeRefs'
import { bodiesOf, type Body } from '../geometry/body'
import type { Vec3 } from '../../document/sceneTypes'
import { allElements, boxSelect, clickElement, elementAt, elementOfLayerHit, selectKey, type ElementRef } from './selectionModes'

const square: CanvasNode = { id: 'sq', name: 'Square', kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, sketch: { plane: { kind: 'default', plane: 'front' }, at: { u: 0, v: 0 } } } as CanvasNode
const doc: CanvasDoc = resolvePlanes(setSolidOf({ version: 1, id: 'b', name: 'b', nodes: [square], components: [], createdAt: 0, updatedAt: 0 }, 'sq', { kind: 'extrude', depth: 1 }, 'Cube'))
const bodies = bodiesOf(doc)
const body: Body = [...bodies.values()][0]
const objectId = objectsOf(doc)[0].id
const endFace = body.faces.findIndex((f) => f.name.role === 'end')
const endTriangle = body.faces[endFace].triangles[0]

describe('picking in edit mode', () => {
  // The cube's front cap spans x 0…1, y −1…0, at z = 1.
  it('reads a click on the front cap as the face, its nearest edge, or its nearest corner', () => {
    expect(elementAt(body, 'face', endTriangle, [0.5, -0.5, 1])).toEqual({ objectId, kind: 'face', index: endFace })
    const edge = elementAt(body, 'edge', endTriangle, [0.5, -0.02, 1])!
    // The top rim of the cap: y = 0 at z = 1, along x.
    expect(body.edges[edge.index].points.every((p) => Math.abs(p[1]) < 1e-6 && Math.abs(p[2] - 1) < 1e-6)).toBe(true)
    const corner = elementAt(body, 'vertex', endTriangle, [0.95, -0.9, 1])!
    expect(body.vertices[corner.index].at.map((n) => Math.round(n * 1000) / 1000)).toEqual([1, -1, 1])
  })

  it('finds the element from a click on the layer’s own mesh, as the 3D view reports it', () => {
    expect(elementOfLayerHit(doc, bodies, 'sq', 0, [0.5, -0.5, 1], 'face')?.objectId).toBe(objectId)
    expect(elementOfLayerHit(doc, bodies, 'nothing', 0, [0, 0, 0], 'face')).toBeNull()
  })

  it('replaces on a click, toggles with Shift, and clears on a click on nothing', () => {
    const a: ElementRef = { objectId, kind: 'face', index: 0 }
    const b: ElementRef = { objectId, kind: 'face', index: 1 }
    expect(clickElement([a], b, false)).toEqual([b])
    expect(clickElement([a], b, true)).toEqual([a, b])
    expect(clickElement([a, b], a, true)).toEqual([b])
    expect(clickElement([a, b], null, false)).toEqual([])
    expect(clickElement([a, b], null, true)).toEqual([a, b])
  })

  it('picks every corner with A, and what a screen box holds with B', () => {
    expect(allElements(bodies.values(), 'vertex')).toHaveLength(8)
    // Straight on from the front, 100 px per meter: only the corners at x 0…0.5 are in the left half.
    const project = (p: Vec3) => ({ x: p[0] * 100, y: -p[1] * 100 })
    const left = boxSelect(bodies.values(), 'vertex', project, { x0: -10, y0: -10, x1: 50, y1: 110 })
    expect(left).toHaveLength(4)
    expect(left.every((r) => body.vertices[r.index].at[0] < 0.5)).toBe(true)
  })

  it('maps Blender’s keys: Tab, 1 / 2 / 3, A and Alt+A', () => {
    expect(selectKey('Tab', false, 'object', 'edge')).toEqual({ mode: 'edge' })
    expect(selectKey('Tab', false, 'face', 'face')).toEqual({ mode: 'object' })
    expect(selectKey('3', false, 'object', 'vertex')).toEqual({ mode: 'face' })
    expect(selectKey('a', false, 'vertex', 'vertex')).toEqual({ select: 'all' })
    expect(selectKey('a', true, 'vertex', 'vertex')).toEqual({ select: 'none' })
    // In object mode A isn't an edit-mode key.
    expect(selectKey('a', false, 'object', 'vertex')).toBeNull()
    expect(selectKey('r', false, 'face', 'face')).toBeNull()
  })
})
