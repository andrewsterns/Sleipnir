import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { setSolidOf } from '../../document/objects'
import { planeToWorld } from '../../document/placement'
import type { Placement3D, SolidSpec } from '../../document/sceneTypes'
import { bodyOf, faceAt, outlineOfFace, sameFace } from './body'
import { extrude, revolve, sweep } from './modifiers'
import { shapeOf } from './shape'

const shape = (id: string, kind: 'rectangle' | 'ellipse', extra: Record<string, unknown> = {}): CanvasNode =>
  ({ id, name: id, kind: 'vector', shape: kind, rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, ...extra }) as CanvasNode
const withSolid = (node: CanvasNode, solid: SolidSpec): CanvasDoc => setSolidOf({ version: 1, id: 'b', name: 'b', nodes: [node], components: [], createdAt: 0, updatedAt: 0 }, node.id, solid)
const bodyIn = (doc: CanvasDoc) => bodyOf(doc, doc.objects![0])

describe('meshes know their faces', () => {
  it('tags every triangle of every builder', () => {
    const square = shapeOf(shape('s', 'rectangle'))!
    const box = { w: 100, h: 100 }
    for (const mesh of [extrude(square, box, 50), revolve(square, box, 'center', 360, 16), sweep(square, box, [{ x: 0, y: 0 }, { x: 200, y: 0 }], false)]) {
      expect(mesh.faceOf).toHaveLength(mesh.indices.length / 3)
      expect(mesh.faceOf!.every((f) => f >= 0 && f < mesh.faces!.length)).toBe(true)
    }
  })
})

describe('a body, the CAD way', () => {
  it('gives a box six faces, twelve edges and eight corners', () => {
    const body = bodyIn(withSolid(shape('box', 'rectangle'), { kind: 'extrude', depth: 1 }))
    expect(body.faces.map((f) => f.name.role).sort()).toEqual(['end', 'side', 'side', 'side', 'side', 'start'])
    expect(body.edges).toHaveLength(12)
    expect(body.vertices).toHaveLength(8)
    // Every corner is where three edges meet.
    expect(body.vertices.every((v) => v.edges.length === 3)).toBe(true)
  })

  it('gives a cylinder three faces, two round edges and no corners', () => {
    const body = bodyIn(withSolid(shape('can', 'ellipse'), { kind: 'extrude', depth: 1 }))
    expect(body.faces).toHaveLength(3)
    expect(body.edges).toHaveLength(2)
    for (const edge of body.edges) expect(edge.points[0]).toEqual(edge.points[edge.points.length - 1])
    expect(body.vertices).toHaveLength(0)
  })

  it('stands the body where its sketch is placed, in meters', () => {
    const space: Placement3D = { position: [1, 2, 3], rotation: [30, 45, 0] }
    const body = bodyIn(withSolid(shape('box', 'rectangle', { space }), { kind: 'extrude', depth: 0.5 }))
    const corner = planeToWorld(space, 100, 100, 50)
    const p = body.mesh.positions
    const near = Array.from({ length: p.length / 3 }, (_, i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]).some((q) => Math.hypot(q[0] - corner[0], q[1] - corner[1], q[2] - corner[2]) < 1e-9)
    expect(near).toBe(true)
  })

  it('names each face for its source, so a click on a triangle finds the face and its outline', () => {
    const doc = withSolid(shape('box', 'rectangle'), { kind: 'extrude', depth: 1 })
    const body = bodyIn(doc)
    const feature = doc.objects![0].features[0]
    const top = body.faces.findIndex((f) => f.name.role === 'end')
    expect(body.faces[top].name).toEqual({ feature: feature.id, role: 'end', profile: 'box' })
    const triangle = body.faces[top].triangles[0]
    expect(faceAt(body, triangle)?.index).toBe(top)
    const { edges, vertices } = outlineOfFace(body, top)
    expect(edges).toHaveLength(4)
    expect(vertices).toHaveLength(4)
    expect(sameFace(body.faces[top].name, { ...body.faces[top].name })).toBe(true)
  })

  it('keeps a face’s name through an edit that keeps its source, and rebuilds only when something changed', () => {
    const doc = withSolid(shape('box', 'rectangle'), { kind: 'extrude', depth: 1 })
    const before = bodyIn(doc)
    expect(bodyIn(doc)).toBe(before)
    const deeper = setSolidOf(doc, 'box', { kind: 'extrude', depth: 2 })
    const after = bodyIn(deeper)
    expect(after).not.toBe(before)
    const name = (b: typeof before) => b.faces.find((f) => f.name.role === 'end')!.name
    expect(sameFace(name(before), name(after))).toBe(true)
  })
})
