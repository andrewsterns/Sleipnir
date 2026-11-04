import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { mergePlaneEdit, planeEditView } from './planeEdit'
import { planeToWorld, PLANE_ROTATION } from '../../document/placement'
import type { Placement3D } from '../../document/sceneTypes'

const frame = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 200, h: 100 }, style: {}, children: [], ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })
const top: Placement3D = { position: [1, -2, 0], rotation: PLANE_ROTATION.top }

describe('plane edit', () => {
  const floor = frame('floor', { rect: { x: 100, y: 200, w: 200, h: 100 }, space: top })
  const doc = docOf([frame('front'), floor])

  it('shows the board just the open layer, flat', () => {
    const view = planeEditView(doc, 'floor')!
    expect(view.nodes.map((n) => n.id)).toEqual(['floor'])
    expect(view.nodes[0].space).toBeUndefined()
    // Nothing open, or a layer that isn't placed: the board as it is.
    expect(planeEditView(doc, null)).toBe(doc)
    expect(planeEditView(doc, 'front')).toBe(doc)
  })

  it('merges edits back, keeping the placement and every other layer', () => {
    const view = planeEditView(doc, 'floor')!
    const child = frame('chair', { rect: { x: 10, y: 10, w: 20, h: 20 } })
    const edited = { ...view, nodes: [{ ...view.nodes[0], children: [child] } as CanvasNode] }
    const merged = mergePlaneEdit(doc, edited, 'floor')
    expect(merged.nodes.map((n) => n.id)).toEqual(['front', 'floor'])
    expect(merged.nodes[1].space).toEqual(top)
    expect((merged.nodes[1] as { children: CanvasNode[] }).children[0].id).toBe('chair')
  })

  it('moves the plane along itself when the open layer is moved face on', () => {
    const view = planeEditView(doc, 'floor')!
    const moved = { ...view, nodes: [{ ...view.nodes[0], rect: { ...view.nodes[0].rect, x: 130, y: 240 } }] }
    const merged = mergePlaneEdit(doc, moved, 'floor').nodes[1]
    // 30 px across and 40 px down a Top plane: +X and -Z in the scene, height unchanged.
    const expected = planeToWorld(top, 30, 40)
    merged.space!.position.forEach((m, i) => expect(m).toBeCloseTo(expected[i], 4))
    expect(merged.space!.position[1]).toBeCloseTo(-2, 9)
    expect(merged.rect).toMatchObject({ x: 130, y: 200 })
  })

  it('removes the layer when it is deleted, and keeps what was drawn beside it', () => {
    const view = planeEditView(doc, 'floor')!
    expect(mergePlaneEdit(doc, { ...view, nodes: [] }, 'floor').nodes.map((n) => n.id)).toEqual(['front'])
    const beside = { ...view, nodes: [...view.nodes, frame('note')] }
    expect(mergePlaneEdit(doc, beside, 'floor').nodes.map((n) => n.id)).toEqual(['front', 'floor', 'note'])
  })
})
