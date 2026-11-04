import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { planeGroupsOf } from './planeGroups'

const layer = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [], ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

describe('the layers panel by plane', () => {
  it('always lists Front, Top and Side, and files each sketch under the plane it stands on', () => {
    const groups = planeGroupsOf(
      docOf([
        layer('loose'),
        layer('floor', { sketch: { plane: { kind: 'default', plane: 'top' } } }),
        layer('shelf', { sketch: { plane: { kind: 'offset', from: { kind: 'default', plane: 'top' }, distance: 0.5 } } }),
        layer('tilted', { space: { position: [0, 0, 0], rotation: [10, 20, 0] } }),
        layer('label', { sketch: { plane: { kind: 'face', objectId: 'o', face: { feature: 'f', role: 'end', profile: 'p' } } } }),
      ]),
    )
    expect(groups.map((g) => [g.label, g.nodes.map((n) => n.id)])).toEqual([
      ['Front', ['loose']],
      ['Top', ['floor', 'shelf']],
      ['Side', []],
      ['On faces', ['label']],
      ['Placed freely', ['tilted']],
    ])
  })

  it('shows just the three planes on an empty board', () => {
    expect(planeGroupsOf(docOf([])).map((g) => g.label)).toEqual(['Front', 'Top', 'Side'])
  })
})
