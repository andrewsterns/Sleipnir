import { describe, it, expect } from 'vitest'
import { relinkAfterMove, relinkRelocated, movedComponents, reconcileDeletedPath, remapPath } from './relink'
import type { CanvasComponent, CanvasDoc } from './types'

function component(id: string, filePath: string | undefined, componentRoot = '.components'): CanvasComponent {
  return {
    id,
    name: id,
    variants: [{ id: `var-${id}`, name: 'Default', values: {}, root: { id: `f-${id}`, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [] } }],
    props: [],
    variantPropIds: [],
    target: 'react',
    componentRoot,
    ...(filePath ? { filePath } : {}),
    sync: 'live',
    createdAt: 1,
    updatedAt: 1,
  }
}

function doc(components: CanvasComponent[]): CanvasDoc {
  return { version: 1, id: 'board-1', name: 'Board', nodes: [], components, createdAt: 1, updatedAt: 1 }
}

describe('remapPath', () => {
  it('remaps a file moved directly', () => {
    expect(remapPath('.components/card/card.tsx', '.components/card/card.tsx', 'src/components/card.tsx')).toBe(
      'src/components/card.tsx',
    )
  })

  it('remaps a file carried inside a moved folder', () => {
    expect(remapPath('.components/card/card.tsx', '.components/card', 'src/components/card')).toBe(
      'src/components/card/card.tsx',
    )
  })

  it('remaps through several levels of nesting', () => {
    expect(remapPath('.components/a/b/c/deep.tsx', '.components/a', 'src/lib/a')).toBe('src/lib/a/b/c/deep.tsx')
  })

  it('returns null for a file the move does not touch', () => {
    expect(remapPath('.components/badge/badge.tsx', '.components/card', 'src/components/card')).toBeNull()
  })

  it('does NOT capture a sibling that merely shares a name prefix', () => {
    // The classic prefix bug, the same one isContained guards against:
    // moving ".components/card" must not drag ".components/card-2/..." along with it.
    expect(remapPath('.components/card-2/card.tsx', '.components/card', 'src/components/card')).toBeNull()
  })

  it('normalizes separators and stray slashes on both ends', () => {
    expect(remapPath('.components\\card\\card.tsx', '.components/card/', 'src/components/card')).toBe(
      'src/components/card/card.tsx',
    )
  })

  it('returns null rather than guessing when an end is empty', () => {
    expect(remapPath('', '.components/card', 'src/x')).toBeNull()
    expect(remapPath('.components/card/card.tsx', '', 'src/x')).toBeNull()
    expect(remapPath('.components/card/card.tsx', '.components/card', '')).toBeNull()
  })
})

describe('relinkAfterMove', () => {
  it('repoints filePath and widens componentRoot to the destination parent', () => {
    const before = doc([component('a', '.components/card/card.tsx')])
    const after = relinkAfterMove(before, '.components/card', 'src/components/card')

    expect(after.components[0].filePath).toBe('src/components/card/card.tsx')
    // The parent of the MOVED ENTRY — the folder the human pasted into — so a
    // moved file and a moved folder agree on the resulting sandbox.
    expect(after.components[0].componentRoot).toBe('src/components')
  })

  it('derives the same root when the file itself is what moved', () => {
    const before = doc([component('a', '.components/card/card.tsx')])
    const after = relinkAfterMove(before, '.components/card/card.tsx', 'src/components/card.tsx')

    expect(after.components[0].filePath).toBe('src/components/card.tsx')
    expect(after.components[0].componentRoot).toBe('src/components')
  })

  it('relinks every component under a folder that moved together', () => {
    const before = doc([
      component('a', '.components/pack/one.tsx'),
      component('b', '.components/pack/nested/two.tsx'),
    ])
    const after = relinkAfterMove(before, '.components/pack', 'src/pack')

    expect(after.components.map((c) => c.filePath)).toEqual(['src/pack/one.tsx', 'src/pack/nested/two.tsx'])
    expect(after.components.every((c) => c.componentRoot === 'src')).toBe(true)
  })

  it('leaves untouched components exactly as they were', () => {
    const before = doc([component('a', '.components/card/card.tsx'), component('b', '.components/badge/badge.tsx')])
    const after = relinkAfterMove(before, '.components/card', 'src/components/card')

    expect(after.components[1]).toBe(before.components[1]) // same object, not a copy
  })

  it('ignores components that have no file yet', () => {
    const before = doc([component('a', undefined)])
    expect(relinkAfterMove(before, '.components/card', 'src/card')).toBe(before)
  })

  it('returns the SAME doc object when nothing matched, so callers can skip the write', () => {
    const before = doc([component('a', '.components/card/card.tsx')])
    expect(relinkAfterMove(before, '.components/elsewhere', 'src/elsewhere')).toBe(before)
  })
})

describe('movedComponents', () => {
  it('reports each moved component with both ends of its move', () => {
    const before = doc([component('a', '.components/card/card.tsx'), component('b', '.components/badge/badge.tsx')])
    const moved = movedComponents(before, '.components/card', 'src/components/card')

    expect(moved).toHaveLength(1)
    expect(moved[0].component.id).toBe('a')
    expect(moved[0].fromPath).toBe('.components/card/card.tsx')
    expect(moved[0].toPath).toBe('src/components/card/card.tsx')
  })

  it('is empty for a move that touches nothing', () => {
    const before = doc([component('a', '.components/card/card.tsx')])
    expect(movedComponents(before, 'README.md', 'docs/README.md')).toEqual([])
  })
})

describe('reconcileDeletedPath', () => {
  function withInstance(c: CanvasComponent, count: number): CanvasDoc {
    const nodes = Array.from({ length: count }, (_, i) => ({
      id: `inst-${c.id}-${i}`,
      name: c.name,
      kind: 'instance' as const,
      rect: { x: i * 20, y: 0, w: 10, h: 10 },
      style: {},
      componentId: c.id,
    }))
    return { version: 1, id: 'board-1', name: 'Board', nodes, components: [c], createdAt: 1, updatedAt: 1 }
  }

  it('dissolves a bare component back into a frame, in place', () => {
    const before = withInstance(component('a', '.components/card/card.tsx'), 1)
    const after = reconcileDeletedPath(before, '.components/card/card.tsx')

    // The component is gone and its instance is a frame — which is what it was
    // before promotion, so nothing was lost.
    expect(after.components).toHaveLength(0)
    expect(after.nodes).toHaveLength(1)
    expect(after.nodes[0].kind).toBe('frame')
    // The instance's own placement survives, not the component root's origin.
    expect(after.nodes[0].rect).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })

  it('keeps and flags a component carrying variants', () => {
    const rich = component('a', '.components/card/card.tsx')
    rich.variants = [...rich.variants, { ...rich.variants[0], id: 'var-2', name: 'Hover' }]
    const after = reconcileDeletedPath(withInstance(rich, 1), '.components/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
    expect(after.components[0].filePath).toBeUndefined()
    expect(after.components[0].ejectReason).toMatch(/deleted/i)
    expect(after.nodes[0].kind).toBe('instance')
  })

  it('keeps and flags a component carrying props', () => {
    const rich = component('a', '.components/card/card.tsx')
    rich.props = [{ id: 'p1', name: 'state', type: 'text' }] as CanvasComponent['props']
    const after = reconcileDeletedPath(withInstance(rich, 1), '.components/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
  })

  it('keeps and flags a component used more than once', () => {
    // Dissolving would silently unlink copies that were tracking each other.
    const after = reconcileDeletedPath(withInstance(component('a', '.components/card/card.tsx'), 3), '.components/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
    expect(after.nodes.every((n) => n.kind === 'instance')).toBe(true)
  })

  it('cascades to everything under a deleted folder', () => {
    const before = withInstance(component('a', '.components/card/card.tsx'), 1)
    const after = reconcileDeletedPath(before, '.components/card')
    expect(after.components).toHaveLength(0)
  })

  it('does not capture a sibling sharing a name prefix', () => {
    const before = withInstance(component('a', '.components/card-2/card.tsx'), 1)
    expect(reconcileDeletedPath(before, '.components/card')).toBe(before)
  })

  it('returns the SAME doc when the delete touches nothing it owns', () => {
    const before = withInstance(component('a', '.components/card/card.tsx'), 1)
    expect(reconcileDeletedPath(before, 'README.md')).toBe(before)
  })
})

describe('relinkRelocated', () => {
  it('takes the folder\'s new parent as the root when the folder moved with the file', () => {
    const next = relinkRelocated(doc([component('a', '.components/card/card.tsx')]), new Map([['a', 'src/ui/card/card.tsx']]))
    expect(next.components[0]).toMatchObject({ filePath: 'src/ui/card/card.tsx', componentRoot: 'src/ui' })
  })

  it('takes the new folder as the root when the file moved alone', () => {
    const next = relinkRelocated(doc([component('a', '.components/card/card.tsx')]), new Map([['a', 'src/widgets/card.tsx']]))
    expect(next.components[0]).toMatchObject({ filePath: 'src/widgets/card.tsx', componentRoot: 'src/widgets' })
  })

  it('clears the "is gone" flag a board was saved with', () => {
    const flagged = { ...component('a', '.components/card/card.tsx'), sync: 'detached' as const, ejectReason: 'gone' }
    const next = relinkRelocated(doc([flagged]), new Map([['a', 'src/card.tsx']]))
    expect(next.components[0].sync).toBe('live')
    expect(next.components[0].ejectReason).toBeUndefined()
  })

  it('returns the same doc when nothing moved', () => {
    const board = doc([component('a', '.components/card/card.tsx'), component('b', undefined)])
    expect(relinkRelocated(board, new Map([['a', '.components/card/card.tsx'], ['b', 'src/b.tsx']]))).toBe(board)
  })
})
