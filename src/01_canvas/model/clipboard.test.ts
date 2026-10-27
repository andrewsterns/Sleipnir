import { describe, it, expect } from 'vitest'
import { adaptForTarget, copyPayload, detachedCopy, externalFromInstance, parseClipboard, serializeClipboard, topmostIds } from './clipboard'
import type { CanvasComponent, CanvasDoc, CanvasFrameNode, CanvasInstanceNode, CanvasNode } from './types'

function instance(id: string, componentId: string, extra: Partial<CanvasInstanceNode> = {}): CanvasInstanceNode {
  return { id, name: id, kind: 'instance', rect: { x: 5, y: 5, w: 10, h: 10 }, style: {}, componentId, ...extra }
}

function frame(id: string, x: number, y: number, children: CanvasNode[] = []): CanvasFrameNode {
  return { id, name: id, kind: 'frame', rect: { x, y, w: 100, h: 100 }, style: {}, children }
}

function component(id: string, filePath: string | undefined, children: CanvasNode[] = []): CanvasComponent {
  return {
    id,
    name: id,
    variants: [{ id: `var-${id}`, name: 'Default', values: {}, root: frame(`root-${id}`, 0, 0, children) }],
    props: [],
    variantPropIds: [],
    target: 'react',
    componentRoot: '.components',
    ...(filePath ? { filePath } : {}),
    sync: 'live',
    createdAt: 1,
    updatedAt: 1,
  }
}

function doc(id: string, nodes: CanvasNode[], components: CanvasComponent[] = []): CanvasDoc {
  return { version: 1, id, name: id, nodes, components, createdAt: 1, updatedAt: 1 }
}

describe('topmostIds', () => {
  it('drops a selected node whose ancestor is also selected', () => {
    const board = doc('a', [frame('outer', 0, 0, [frame('inner', 10, 10)])])
    expect(topmostIds(board, ['outer', 'inner'])).toEqual(['outer'])
  })
})

describe('copyPayload', () => {
  it('stores nested nodes at their board position', () => {
    const board = doc('a', [frame('outer', 100, 200, [frame('inner', 10, 20)])])
    const payload = copyPayload(board, ['inner'])!
    expect(payload.nodes[0].rect).toMatchObject({ x: 110, y: 220 })
  })

  it('carries every component the copy uses, through other components', () => {
    const card = component('card', '.components/card/card.tsx', [instance('i-btn', 'button')])
    const button = component('button', '.components/button/button.tsx')
    const unused = component('unused', '.components/unused/unused.tsx')
    const board = doc('a', [instance('i-card', 'card')], [card, button, unused])
    const payload = copyPayload(board, ['i-card'])!
    expect(payload.components.map((c) => c.id).sort()).toEqual(['button', 'card'])
  })

  it('round-trips through the clipboard text, and ignores ordinary text', () => {
    const payload = copyPayload(doc('a', [frame('f', 0, 0)]), ['f'])!
    expect(parseClipboard(serializeClipboard(payload))).toEqual(payload)
    expect(parseClipboard('hello')).toBeNull()
    expect(parseClipboard('{"marker":"sleipnir-canvas-clipboard/v1"')).toBeNull()
  })
})

describe('adaptForTarget', () => {
  it('keeps an instance whose component the target board owns', () => {
    const card = component('card', '.components/card/card.tsx')
    const source = doc('a', [instance('i', 'card')], [card])
    const { nodes, components } = adaptForTarget(source, copyPayload(source, ['i'])!)
    expect(nodes[0]).toMatchObject({ kind: 'instance', componentId: 'card' })
    expect(nodes[0].id).not.toBe('i')
    expect(components).toEqual([])
  })

  it('links to the component file on another board instead of copying the component', () => {
    const card = { ...component('card', '.components/card/card.tsx'), name: 'Profile Card' }
    card.props = [
      { id: 'p-title', name: 'title', type: 'string' },
      { id: 'p-state', name: 'state', type: 'enum', options: ['idle', 'hover'] },
    ]
    card.variantPropIds = ['p-state']
    const source = doc('a', [instance('i', 'card', { overrides: { 'p-title': 'Hi' }, variantValues: { state: 'hover' } })], [card])
    const target = doc('b', [])
    const { nodes, components } = adaptForTarget(target, copyPayload(source, ['i'])!)
    expect(components).toEqual([])
    expect(nodes[0]).toMatchObject({
      kind: 'external',
      filePath: '.components/card/card.tsx',
      exportName: 'ProfileCard',
      propValues: { title: 'Hi', state: 'hover' },
    })
  })

  it('converts instances nested inside a pasted frame too', () => {
    const card = component('card', '.components/card/card.tsx')
    const source = doc('a', [frame('f', 0, 0, [instance('i', 'card')])], [card])
    const { nodes } = adaptForTarget(doc('b', []), copyPayload(source, ['f'])!)
    expect((nodes[0] as CanvasFrameNode).children[0].kind).toBe('external')
  })

  it('detaches a link into a local copy of the variant it shows', () => {
    const card = component('card', '.components/card/card.tsx', [frame('inner', 4, 4)])
    card.props = [{ id: 'p-state', name: 'state', type: 'enum', options: ['idle', 'hover'] }]
    card.variantPropIds = ['p-state']
    card.variants.push({ id: 'var-hover', name: 'Hover', values: { state: 'hover' }, root: frame('root-hover', 0, 0, [frame('glow', 1, 1)]) })
    const link = externalFromInstance(instance('i', 'card', { variantValues: { state: 'hover' } }), card)
    const { nodes } = detachedCopy(doc('b', [link]), { ...link, name: 'My card' }, card, [card])
    const copy = nodes[0] as CanvasFrameNode
    expect(copy).toMatchObject({ kind: 'frame', name: 'My card', rect: link.rect })
    expect(copy.children.map((c) => c.name)).toEqual(['glow'])
    expect(copy.id).not.toBe('root-hover')
  })

  it('copies a component that has no file yet, since there is nothing to link to', () => {
    const draft = component('draft', undefined)
    const source = doc('a', [instance('i', 'draft')], [draft])
    const { nodes, components } = adaptForTarget(doc('b', []), copyPayload(source, ['i'])!)
    expect(nodes[0]).toMatchObject({ kind: 'instance', componentId: 'draft' })
    expect(components.map((c) => c.id)).toEqual(['draft'])
  })
})
