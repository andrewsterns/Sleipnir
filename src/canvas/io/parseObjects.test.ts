import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { featureOf, migrateLayerSolids, objectsOf, pruneObjects, setSolidOf, solidOf } from '../../document/objects'
import { parseDoc } from './store'

const shape = (id: string, extra: Record<string, unknown> = {}): CanvasNode =>
  ({ id, name: id, kind: 'vector', shape: 'rectangle', rect: { x: 0, y: 0, w: 100, h: 100 }, style: {}, ...extra }) as CanvasNode
const frame = (id: string, children: CanvasNode[], extra: Record<string, unknown> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 300, h: 200 }, style: {}, children, ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

describe('boards from before Objects', () => {
  it('turns every layer solid into an Object with one feature, and strips the field', () => {
    const doc = migrateLayerSolids(
      docOf([
        shape('box', { name: 'Box', solid: { kind: 'extrude', depth: 0.5 } }),
        frame('card', [shape('knob', { solid: { kind: 'revolve', axis: 'center', angle: 360, steps: 32 } })]),
        shape('ring', { solid: { kind: 'sweep', pathId: 'box' } }),
      ]),
    )
    expect(JSON.stringify(doc.nodes)).not.toContain('"solid"')
    expect(objectsOf(doc).map((o) => [o.name, o.features.map((f) => `${f.name}:${f.kind}`)])).toEqual([
      ['Box', ['Extrude 1:extrude']],
      ['knob', ['Revolve 1:revolve']],
      ['ring', ['Sweep 1:sweep']],
    ])
    expect(solidOf(doc, 'box')).toEqual({ kind: 'extrude', depth: 0.5 })
    expect(solidOf(doc, 'knob')).toEqual({ kind: 'revolve', axis: 'center', angle: 360, steps: 32 })
    expect(solidOf(doc, 'ring')).toEqual({ kind: 'sweep', pathId: 'box' })
  })

  it('leaves a board alone the second time, and one with nothing to move', () => {
    const once = migrateLayerSolids(docOf([shape('box', { solid: { kind: 'extrude', depth: 1 } })]))
    expect(migrateLayerSolids(once)).toBe(once)
    const plain = docOf([shape('a')])
    expect(migrateLayerSolids(plain)).toBe(plain)
  })

  it('migrates as a board file is read, and keeps objects across a save', () => {
    const read = parseDoc(JSON.stringify(docOf([shape('box', { solid: { kind: 'extrude', depth: 1 } })])))!
    expect(objectsOf(read)).toHaveLength(1)
    expect(parseDoc(JSON.stringify(read))!.objects).toEqual(read.objects)
  })
})

describe("a layer's solid as a feature", () => {
  it('adds, changes and removes the feature, keeping its name and id while the kind stays', () => {
    let doc = setSolidOf(docOf([shape('box')]), 'box', { kind: 'extrude', depth: 1 }, 'Box')
    const first = featureOf(doc, 'box')!.feature
    doc = setSolidOf(doc, 'box', { kind: 'extrude', depth: 2 })
    expect(featureOf(doc, 'box')!.feature).toMatchObject({ id: first.id, name: 'Extrude 1', depth: 2 })
    doc = setSolidOf(doc, 'box', undefined)
    expect(objectsOf(doc)).toEqual([])
  })

  it('numbers features across the board, as Onshape does', () => {
    let doc = docOf([shape('a'), shape('b')])
    doc = setSolidOf(doc, 'a', { kind: 'extrude', depth: 1 })
    doc = setSolidOf(doc, 'b', { kind: 'extrude', depth: 1 })
    expect(objectsOf(doc).map((o) => o.features[0].name)).toEqual(['Extrude 1', 'Extrude 2'])
  })

  it('drops what was built from a deleted sketch or path', () => {
    const doc = migrateLayerSolids(docOf([shape('box', { solid: { kind: 'extrude', depth: 1 } }), shape('ring', { solid: { kind: 'sweep', pathId: 'path' } }), shape('path')]))
    const withoutPath = pruneObjects({ ...doc, nodes: doc.nodes.filter((n) => n.id !== 'path') })
    expect(objectsOf(withoutPath).map((o) => o.name)).toEqual(['box'])
    expect(pruneObjects(doc)).toBe(doc)
  })
})
