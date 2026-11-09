// How many polygons a curved solid is made of, per feature (document/objects.ts SMOOTHNESS):
// the 3D view's meshes and the bodies faces are picked from must flatten alike.

import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { objectsOf, setSolidOf, updateFeature } from '../../document/objects'
import { layerMesh } from '../scene3d/sceneMeshes'
import { bodyOf } from './body'
import { triangleCount } from './modifiers'

const circle = (id: string, size = 200): CanvasNode => ({ id, name: id, kind: 'vector', shape: 'ellipse', rect: { x: 0, y: 0, w: size, h: size }, style: {} }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

const cylinder = (size = 200) => setSolidOf(docOf([circle('c', size)]), 'c', { kind: 'extrude', depth: 1 }, 'Cylinder')
const withSmoothness = (doc: CanvasDoc, smoothness: 'low' | 'medium' | 'high') => updateFeature(doc, objectsOf(doc)[0].features[0].id, { smoothness })
const tris = (doc: CanvasDoc) => triangleCount(layerMesh(doc.nodes[0], doc)!)

describe('smoothness', () => {
  it('builds a curved solid from fewer polygons at Low and more at High, Medium being the default', () => {
    const doc = cylinder()
    expect(tris(withSmoothness(doc, 'medium'))).toBe(tris(doc))
    expect(tris(withSmoothness(doc, 'low'))).toBeLessThan(tris(doc))
    expect(tris(withSmoothness(doc, 'high'))).toBeGreaterThan(tris(doc))
  })

  it('builds the body faces are picked from at the same smoothness as the mesh on screen', () => {
    for (const s of ['low', 'medium', 'high'] as const) {
      const doc = withSmoothness(cylinder(), s)
      expect(bodyOf(doc, objectsOf(doc)[0]).mesh.indices.length / 3).toBe(tris(doc))
    }
  })

  it('makes a small part as round as a meter-wide one, and the body agrees', () => {
    // An 8 cm mug is 8 px across: at a fixed tolerance its circle was an octagon.
    const mug = cylinder(8)
    expect(tris(mug)).toBe(tris(cylinder(100)))
    expect(bodyOf(mug, objectsOf(mug)[0]).mesh.indices.length / 3).toBe(tris(mug))
  })

  it('keeps a feature’s smoothness, direction and visibility when its numbers change', () => {
    let doc = withSmoothness(cylinder(), 'high')
    const id = objectsOf(doc)[0].features[0].id
    doc = updateFeature(doc, id, { hidden: true, direction: 'symmetric' } as never)
    doc = setSolidOf(doc, 'c', { kind: 'extrude', depth: 2 })
    expect(objectsOf(doc)[0].features[0]).toMatchObject({ id, depth: 2, smoothness: 'high', hidden: true, direction: 'symmetric' })
  })
})
