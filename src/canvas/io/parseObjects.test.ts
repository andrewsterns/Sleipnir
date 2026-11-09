import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { brokenFeatures, featureOf, migrateLayerSolids, moveFeature, objectsOf, removeFeature, removeObject, repickFeatureInput, setSolidOf, solidOf } from '../../document/objects'
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

  it('keeps what was built from a deleted sketch or path, marked broken with why', () => {
    const doc = migrateLayerSolids(docOf([shape('box', { solid: { kind: 'extrude', depth: 1 } }), shape('ring', { solid: { kind: 'sweep', pathId: 'path' } }), shape('path')]))
    expect(brokenFeatures(doc).size).toBe(0)
    const withoutPath = { ...doc, nodes: doc.nodes.filter((n) => n.id !== 'path') }
    expect(objectsOf(withoutPath).map((o) => o.name)).toEqual(['box', 'ring'])
    const ring = objectsOf(withoutPath)[1].features[0]
    expect([...brokenFeatures(withoutPath)]).toEqual([[ring.id, 'The path it follows was deleted']])
    const withoutBox = { ...doc, nodes: doc.nodes.filter((n) => n.id !== 'box') }
    expect([...brokenFeatures(withoutBox).values()]).toEqual(['Its sketch was deleted'])
  })

  it('repairs a broken feature by re-picking what it reads, or deletes it and its emptied part', () => {
    const doc = migrateLayerSolids(docOf([shape('ring', { solid: { kind: 'sweep', pathId: 'path' } }), shape('path'), shape('rail')]))
    const broken = { ...doc, nodes: doc.nodes.filter((n) => n.id !== 'path') }
    const id = objectsOf(broken)[0].features[0].id
    const fixed = repickFeatureInput(broken, id, 'path', 'rail')
    expect(brokenFeatures(fixed).size).toBe(0)
    expect(objectsOf(fixed)[0].features[0]).toMatchObject({ kind: 'sweep', pathId: 'rail', sketchId: 'ring' })
    expect(objectsOf(removeFeature(broken, id))).toEqual([])
    expect(removeFeature(broken, 'nope')).toBe(broken)
  })
})

describe('the part list, edited', () => {
  it('reorders a part’s features, the first one always starting the part', () => {
    let doc = docOf([shape('a'), shape('b')])
    doc = setSolidOf(doc, 'a', { kind: 'extrude', depth: 1 }, 'Part')
    const part = objectsOf(doc)[0]
    doc = { ...doc, objects: [{ ...part, features: [...part.features, { ...part.features[0], id: 'f2', name: 'Extrude 2', sketchId: 'b', op: 'add' as const }] }] }
    const moved = moveFeature(doc, 'f2', 0)
    expect(objectsOf(moved)[0].features.map((f) => [f.name, f.op])).toEqual([['Extrude 2', 'new'], ['Extrude 1', 'add']])
    expect(moveFeature(doc, 'f2', 1)).toBe(doc)
  })

  it('deletes a part and keeps its sketches', () => {
    const doc = setSolidOf(docOf([shape('a')]), 'a', { kind: 'extrude', depth: 1 }, 'Part')
    const gone = removeObject(doc, objectsOf(doc)[0].id)
    expect(objectsOf(gone)).toEqual([])
    expect(gone.nodes.map((n) => n.id)).toEqual(['a'])
  })
})
