import { describe, it, expect } from 'vitest'
import {
  diffStagedFiles,
  isStagedPath,
  pruneUnreferencedComponents,
  referencedComponentIds,
  sentinelComponentId,
  stagedFilesOf,
} from './stagedFiles'
import type { CanvasComponent, CanvasDoc, CanvasInstanceNode, CanvasNode } from './types'

function instance(id: string, componentId: string): CanvasInstanceNode {
  return { id, name: id, kind: 'instance', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, componentId, overrides: {} }
}

function component(id: string, filePath: string | undefined, children: CanvasNode[] = []): CanvasComponent {
  return {
    id,
    name: id,
    variants: [{ id: `var-${id}`, name: 'Default', values: {}, root: { id: `f-${id}`, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children } }],
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

function doc(nodes: CanvasNode[], components: CanvasComponent[]): CanvasDoc {
  return { version: 1, id: 'board-1', name: 'Board', nodes, components, createdAt: 1, updatedAt: 1 }
}

describe('isStagedPath', () => {
  it('counts a component file inside .components', () => {
    expect(isStagedPath('.components/card/card.tsx')).toBe(true)
    expect(isStagedPath('.components\\card\\card.tsx')).toBe(true)
  })

  it('never counts the board store, or anything else under a dot-folder', () => {
    expect(isStagedPath('.components/.boards/canvas-1.json')).toBe(false)
    expect(isStagedPath('.components/card/.cache/x.tsx')).toBe(false)
  })

  it('never counts a promoted file, the root itself, or a lookalike prefix', () => {
    expect(isStagedPath('src/components/card.tsx')).toBe(false)
    expect(isStagedPath('.components')).toBe(false)
    expect(isStagedPath('.componentsx/card/card.tsx')).toBe(false)
  })
})

describe('stagedFilesOf / diffStagedFiles', () => {
  it('claims only staged files, keyed by normalized path', () => {
    const board = doc([], [
      component('a', '.components/a/a.tsx'),
      component('b', 'src/b.tsx'),
      component('c', undefined),
    ])
    expect([...stagedFilesOf(board).keys()]).toEqual(['.components/a/a.tsx'])
  })

  it('reports what a board gave up and what it took on', () => {
    const before = stagedFilesOf(doc([], [component('a', '.components/a/a.tsx'), component('b', '.components/b/b.tsx')]))
    const after = stagedFilesOf(doc([], [component('b', '.components/b/b.tsx'), component('c', '.components/c/c.tsx')]))
    const diff = diffStagedFiles(before, after)
    expect(diff.removed).toEqual([{ path: '.components/a/a.tsx', componentId: 'a' }])
    expect(diff.added.map((a) => a.path)).toEqual(['.components/c/c.tsx'])
  })

  it('treats a path that changed owners as both removed and added', () => {
    const before = stagedFilesOf(doc([], [component('a', '.components/x/x.tsx')]))
    const after = stagedFilesOf(doc([], [component('b', '.components/x/x.tsx')]))
    const diff = diffStagedFiles(before, after)
    expect(diff.removed).toHaveLength(1)
    expect(diff.added).toHaveLength(1)
  })
})

describe('referencedComponentIds / pruneUnreferencedComponents', () => {
  it('keeps a component nested inside a used component, and drops an unplaced one', () => {
    // `card` holds an instance of `badge` inside its own definition; `ghost`
    // lost its last instance and nothing else points at it.
    const board = doc(
      [instance('i-card', 'card')],
      [component('card', '.components/card/card.tsx', [instance('i-badge', 'badge')]), component('badge', '.components/badge/badge.tsx'), component('ghost', '.components/ghost/ghost.tsx')],
    )
    expect([...referencedComponentIds(board)].sort()).toEqual(['badge', 'card'])
    expect(pruneUnreferencedComponents(board).components.map((c) => c.id)).toEqual(['card', 'badge'])
  })

  it('finds instances nested inside plain frames on the board', () => {
    const board = doc(
      [{ id: 'f', name: 'f', kind: 'frame', rect: { x: 0, y: 0, w: 1, h: 1 }, style: {}, children: [instance('i', 'a')] }],
      [component('a', '.components/a/a.tsx')],
    )
    expect(pruneUnreferencedComponents(board)).toBe(board)
  })

  it('returns the same doc when nothing is unreferenced', () => {
    const board = doc([instance('i', 'a')], [component('a', '.components/a/a.tsx')])
    expect(pruneUnreferencedComponents(board)).toBe(board)
  })
})

describe('sentinelComponentId', () => {
  it('reads the owner off a canvas-written file', () => {
    const source = [
      'export const A = () => {',
      '  // <sleipnir:layout component="cmp_7a3f" hash="k2">',
      '  return <div />',
      '  // </sleipnir:layout>',
      '}',
    ].join('\n')
    expect(sentinelComponentId(source)).toBe('cmp_7a3f')
  })

  it('returns null for a hand-written file', () => {
    expect(sentinelComponentId('export const A = () => <div />\n')).toBeNull()
  })
})
