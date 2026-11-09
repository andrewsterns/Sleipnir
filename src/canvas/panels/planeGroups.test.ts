import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { objectGroupsOf, planeGroupsOf, unusedSketchesOf } from './planeGroups'
import { setSolidOf, updateFeature, usedLayers } from '../../document/objects'

const layer = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [], ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

const scene = [
  layer('loose'),
  layer('floor', { sketch: { plane: { kind: 'default', plane: 'top' } } }),
  layer('shelf', { sketch: { plane: { kind: 'offset', from: { kind: 'default', plane: 'top' }, distance: 0.5 } } }),
  layer('tilted', { space: { position: [0, 0, 0], rotation: [10, 20, 0] } }),
  layer('label', { sketch: { plane: { kind: 'face', objectId: 'o', face: { feature: 'f', role: 'end', profile: 'p' } } } }),
  layer('card', { sketch: { plane: { kind: 'default', plane: 'front' }, link: { doc: 'checkout' } } }),
]

describe('the Planes section', () => {
  it('always lists Front, Top and Side, each holding every layer standing on it, and a custom row when one is', () => {
    expect(planeGroupsOf(docOf(scene)).map((g) => [g.label, g.nodes.map((n) => n.id)])).toEqual([
      ['Front', ['loose', 'card']],
      ['Top', ['floor', 'shelf']],
      ['Side', []],
      ['Custom plane', ['tilted']],
    ])
  })

  it('shows just the three planes in an empty environment', () => {
    expect(planeGroupsOf(docOf([])).map((g) => g.label)).toEqual(['Front', 'Top', 'Side'])
  })
})

describe('the Sketches section', () => {
  it('lists every sketch no part uses, top-most first, with where it stands and what it links to', () => {
    expect(unusedSketchesOf(docOf(scene)).map((s) => [s.node.id, s.where, s.link?.doc])).toEqual([
      ['card', 'Front', 'checkout'],
      ['label', 'On a face', undefined],
      ['tilted', 'Custom plane', undefined],
      ['shelf', 'Top + 0.5 m', undefined],
      ['floor', 'Top', undefined],
      ['loose', 'Front', undefined],
    ])
  })
})

describe('the Parts section', () => {
  it('moves a sketch a part uses out of Sketches and under the part, feature by feature', () => {
    const box = layer('box', { sketch: { plane: { kind: 'default', plane: 'top' } } })
    const lid = layer('lid', { sketch: { plane: { kind: 'default', plane: 'top' } } })
    let doc = setSolidOf(docOf([box, lid, layer('note')]), 'box', { kind: 'extrude', depth: 1 }, 'Box')
    expect(unusedSketchesOf(doc).map((s) => s.node.id)).toEqual(['note', 'lid'])
    // The plane's eye still reaches the part's sketch: it hides everything standing there.
    expect(planeGroupsOf(doc).find((g) => g.label === 'Top')!.nodes.map((n) => n.id)).toEqual(['box', 'lid'])
    const [group] = objectGroupsOf(doc)
    expect(group.object.name).toBe('Box')
    expect(group.features.map((f) => [f.feature.name, f.sketches.map((n) => n.id)])).toEqual([['Extrude 1', ['box']]])
    expect(group.layers.map((n) => n.id)).toEqual(['box'])
    // A feature turned off keeps its place in the list, and its sketch stays with it.
    doc = updateFeature(doc, group.features[0].feature.id, { hidden: true })
    expect(objectGroupsOf(doc)[0].features[0].feature.hidden).toBe(true)
    expect(usedLayers(doc).has('box')).toBe(true)
  })

  it('leaves the environment alone when there is no such feature', () => {
    const doc = docOf([layer('a')])
    expect(updateFeature(doc, 'nope', { hidden: true })).toBe(doc)
    expect(objectGroupsOf(doc)).toEqual([])
  })
})
