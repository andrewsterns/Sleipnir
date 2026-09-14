import { describe, it, expect } from 'vitest'
import { relinkAfterMove, movedComponents, reconcileDeletedPath, remapPath } from './relink'
import type { CanvasComponent, CanvasDoc } from './types'

function component(id: string, filePath: string | undefined, componentRoot = '.canvas'): CanvasComponent {
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
    expect(remapPath('.canvas/card/card.tsx', '.canvas/card/card.tsx', 'src/components/card.tsx')).toBe(
      'src/components/card.tsx',
    )
  })

  it('remaps a file carried inside a moved folder', () => {
    expect(remapPath('.canvas/card/card.tsx', '.canvas/card', 'src/components/card')).toBe(
      'src/components/card/card.tsx',
    )
  })

  it('remaps through several levels of nesting', () => {
    expect(remapPath('.canvas/a/b/c/deep.tsx', '.canvas/a', 'src/lib/a')).toBe('src/lib/a/b/c/deep.tsx')
  })

  it('returns null for a file the move does not touch', () => {
    expect(remapPath('.canvas/badge/badge.tsx', '.canvas/card', 'src/components/card')).toBeNull()
  })

  it('does NOT capture a sibling that merely shares a name prefix', () => {
    // The classic prefix bug, the same one isContained guards against:
    // moving ".canvas/card" must not drag ".canvas/card-2/..." along with it.
    expect(remapPath('.canvas/card-2/card.tsx', '.canvas/card', 'src/components/card')).toBeNull()
  })

  it('normalizes separators and stray slashes on both ends', () => {
    expect(remapPath('.canvas\\card\\card.tsx', '.canvas/card/', 'src/components/card')).toBe(
      'src/components/card/card.tsx',
    )
  })

  it('returns null rather than guessing when an end is empty', () => {
    expect(remapPath('', '.canvas/card', 'src/x')).toBeNull()
    expect(remapPath('.canvas/card/card.tsx', '', 'src/x')).toBeNull()
    expect(remapPath('.canvas/card/card.tsx', '.canvas/card', '')).toBeNull()
  })
})

describe('relinkAfterMove', () => {
  it('repoints filePath and widens componentRoot to the destination parent', () => {
    const before = doc([component('a', '.canvas/card/card.tsx')])
    const after = relinkAfterMove(before, '.canvas/card', 'src/components/card')

    expect(after.components[0].filePath).toBe('src/components/card/card.tsx')
    // The parent of the MOVED ENTRY — the folder the human pasted into — so a
    // moved file and a moved folder agree on the resulting sandbox.
    expect(after.components[0].componentRoot).toBe('src/components')
  })

  it('derives the same root when the file itself is what moved', () => {
    const before = doc([component('a', '.canvas/card/card.tsx')])
    const after = relinkAfterMove(before, '.canvas/card/card.tsx', 'src/components/card.tsx')

    expect(after.components[0].filePath).toBe('src/components/card.tsx')
    expect(after.components[0].componentRoot).toBe('src/components')
  })

  it('relinks every component under a folder that moved together', () => {
    const before = doc([
      component('a', '.canvas/pack/one.tsx'),
      component('b', '.canvas/pack/nested/two.tsx'),
    ])
    const after = relinkAfterMove(before, '.canvas/pack', 'src/pack')

    expect(after.components.map((c) => c.filePath)).toEqual(['src/pack/one.tsx', 'src/pack/nested/two.tsx'])
    expect(after.components.every((c) => c.componentRoot === 'src')).toBe(true)
  })

  it('leaves untouched components exactly as they were', () => {
    const before = doc([component('a', '.canvas/card/card.tsx'), component('b', '.canvas/badge/badge.tsx')])
    const after = relinkAfterMove(before, '.canvas/card', 'src/components/card')

    expect(after.components[1]).toBe(before.components[1]) // same object, not a copy
  })

  it('ignores components that have no file yet', () => {
    const before = doc([component('a', undefined)])
    expect(relinkAfterMove(before, '.canvas/card', 'src/card')).toBe(before)
  })

  it('returns the SAME doc object when nothing matched, so callers can skip the write', () => {
    const before = doc([component('a', '.canvas/card/card.tsx')])
    expect(relinkAfterMove(before, '.canvas/elsewhere', 'src/elsewhere')).toBe(before)
  })
})

describe('movedComponents', () => {
  it('reports each moved component with both ends of its move', () => {
    const before = doc([component('a', '.canvas/card/card.tsx'), component('b', '.canvas/badge/badge.tsx')])
    const moved = movedComponents(before, '.canvas/card', 'src/components/card')

    expect(moved).toHaveLength(1)
    expect(moved[0].component.id).toBe('a')
    expect(moved[0].fromPath).toBe('.canvas/card/card.tsx')
    expect(moved[0].toPath).toBe('src/components/card/card.tsx')
  })

  it('is empty for a move that touches nothing', () => {
    const before = doc([component('a', '.canvas/card/card.tsx')])
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
    const before = withInstance(component('a', '.canvas/card/card.tsx'), 1)
    const after = reconcileDeletedPath(before, '.canvas/card/card.tsx')

    // The component is gone and its instance is a frame — which is what it was
    // before promotion, so nothing was lost.
    expect(after.components).toHaveLength(0)
    expect(after.nodes).toHaveLength(1)
    expect(after.nodes[0].kind).toBe('frame')
    // The instance's own placement survives, not the component root's origin.
    expect(after.nodes[0].rect).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })

  it('keeps and flags a component carrying variants', () => {
    const rich = component('a', '.canvas/card/card.tsx')
    rich.variants = [...rich.variants, { ...rich.variants[0], id: 'var-2', name: 'Hover' }]
    const after = reconcileDeletedPath(withInstance(rich, 1), '.canvas/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
    expect(after.components[0].filePath).toBeUndefined()
    expect(after.components[0].ejectReason).toMatch(/deleted/i)
    expect(after.nodes[0].kind).toBe('instance')
  })

  it('keeps and flags a component carrying props', () => {
    const rich = component('a', '.canvas/card/card.tsx')
    rich.props = [{ id: 'p1', name: 'state', type: 'text' }] as CanvasComponent['props']
    const after = reconcileDeletedPath(withInstance(rich, 1), '.canvas/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
  })

  it('keeps and flags a component used more than once', () => {
    // Dissolving would silently unlink copies that were tracking each other.
    const after = reconcileDeletedPath(withInstance(component('a', '.canvas/card/card.tsx'), 3), '.canvas/card/card.tsx')

    expect(after.components).toHaveLength(1)
    expect(after.components[0].sync).toBe('detached')
    expect(after.nodes.every((n) => n.kind === 'instance')).toBe(true)
  })

  it('cascades to everything under a deleted folder', () => {
    const before = withInstance(component('a', '.canvas/card/card.tsx'), 1)
    const after = reconcileDeletedPath(before, '.canvas/card')
    expect(after.components).toHaveLength(0)
  })

  it('does not capture a sibling sharing a name prefix', () => {
    const before = withInstance(component('a', '.canvas/card-2/card.tsx'), 1)
    expect(reconcileDeletedPath(before, '.canvas/card')).toBe(before)
  })

  it('returns the SAME doc when the delete touches nothing it owns', () => {
    const before = withInstance(component('a', '.canvas/card/card.tsx'), 1)
    expect(reconcileDeletedPath(before, 'README.md')).toBe(before)
  })
})
