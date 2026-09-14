// Promote-by-move, end to end at the model layer.
//
// relink.test.ts covers the pure remapping; this covers the half that touches
// files: the board is rewritten, and the moved component's imports are repaired
// so a component that instances another still compiles after only one of them
// is promoted out of `.canvas`.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const files = new Map<string, string>()

vi.mock('../../00_planning/api/sleipnirApi', () => ({
  listWorkspaceDir: vi.fn(async (dir: string) => ({
    tree: [...files.keys()]
      .filter((p) => p.startsWith(`${dir}/`))
      .map((p) => ({ name: p.slice(dir.length + 1), path: p, type: 'file' as const, createdAt: 0 })),
  })),
  readWorkspaceFile: vi.fn(async (p: string) => {
    if (!files.has(p)) throw new Error(`ENOENT ${p}`)
    return { content: files.get(p)! }
  }),
  writeWorkspaceFile: vi.fn(async (p: string, content: string) => {
    files.set(p, content)
  }),
  deleteWorkspacePath: vi.fn(async (p: string) => {
    files.delete(p)
  }),
  createWorkspaceFile: vi.fn(async (p: string, content: string) => {
    if (files.has(p)) throw new Error(`${p} already exists`)
    files.set(p, content ?? '')
  }),
}))

import { reconcileMove } from './store'
import type { CanvasComponent, CanvasDoc } from './types'

const BOARD = '.planning/canvas/canvas-1.json'

function frameRoot(id: string, children: CanvasComponent['variants'][0]['root']['children'] = []) {
  return { id: `f-${id}`, name: id, kind: 'frame' as const, rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children }
}

function component(id: string, name: string, filePath: string, children: never[] | object[] = []): CanvasComponent {
  return {
    id,
    name,
    variants: [{ id: `var-${id}`, name: 'Default', values: {}, root: frameRoot(id, children as never) }],
    props: [],
    variantPropIds: [],
    target: 'react',
    componentRoot: '.canvas',
    filePath,
    sync: 'live',
    createdAt: 1,
    updatedAt: 1,
  }
}

function writeBoard(components: CanvasComponent[]) {
  const doc: CanvasDoc = {
    version: 1,
    id: 'canvas-1',
    name: 'Board',
    nodes: [],
    components,
    createdAt: 1,
    updatedAt: 1,
  }
  files.set(BOARD, JSON.stringify(doc, null, 2))
}

function board(): CanvasDoc {
  return JSON.parse(files.get(BOARD)!)
}

beforeEach(() => {
  files.clear()
})

describe('reconcileMove', () => {
  it('repoints the board and widens the sandbox when a component is promoted out', async () => {
    writeBoard([component('a', 'Card', '.canvas/card/card.tsx')])
    files.set('src/components/card/card.tsx', 'export const Card = () => null\n')

    await reconcileMove('.canvas/card', 'src/components/card')

    expect(board().components[0].filePath).toBe('src/components/card/card.tsx')
    expect(board().components[0].componentRoot).toBe('src/components')
  })

  it('leaves a board alone when the move touches nothing it owns', async () => {
    writeBoard([component('a', 'Card', '.canvas/card/card.tsx')])
    const before = files.get(BOARD)

    await reconcileMove('README.md', 'docs/README.md')

    expect(files.get(BOARD)).toBe(before)
  })

  it('rewrites the imports of a component promoted away from one still staged', async () => {
    // Card instances Badge. Promoting only Card breaks the relative specifier
    // it emitted — this is the fork the whole feature exists to prevent.
    const card = component('a', 'Card', '.canvas/card/card.tsx', [
      { id: 'inst-1', name: 'Badge', kind: 'instance', rect: { x: 0, y: 0, w: 5, h: 5 }, style: {}, componentId: 'b' },
    ])
    writeBoard([card, component('b', 'Badge', '.canvas/badge/badge.tsx')])

    files.set(
      'src/components/card/card.tsx',
      [
        `import { Badge } from '../badge/badge'`,
        ``,
        `export interface CardProps {}`,
        ``,
        `export const Card = ({}: CardProps) => {`,
        `  const own = useThing()`,
        `  // <sleipnir:layout component="a" hash="h">`,
        `  return <Badge />`,
        `  // </sleipnir:layout>`,
        `}`,
        ``,
      ].join('\n'),
    )

    await reconcileMove('.canvas/card', 'src/components/card')

    const source = files.get('src/components/card/card.tsx')!
    // Recomputed from where each component lives NOW: Badge is still staged.
    expect(source).toContain(`import { Badge } from '../../../.canvas/badge/badge'`)
    expect(source).not.toContain(`from '../badge/badge'`)
    // And nothing else in the file moved.
    expect(source).toContain('const own = useThing()')
    expect(source).toContain('// <sleipnir:layout component="a" hash="h">')
    expect(source).toContain('return <Badge />')
  })

  it('relinks every component carried along when a whole folder moves', async () => {
    writeBoard([
      component('a', 'One', '.canvas/pack/one.tsx'),
      component('b', 'Two', '.canvas/pack/two.tsx'),
    ])
    files.set('src/pack/one.tsx', 'export const One = () => null\n')
    files.set('src/pack/two.tsx', 'export const Two = () => null\n')

    await reconcileMove('.canvas/pack', 'src/pack')

    expect(board().components.map((c) => c.filePath)).toEqual(['src/pack/one.tsx', 'src/pack/two.tsx'])
  })

  it('still saves the relink when the moved file cannot be read back', async () => {
    // The bytes have already moved by the time this runs. A board left pointing
    // at the old path is the unrecoverable outcome; a stale import is not.
    writeBoard([component('a', 'Card', '.canvas/card/card.tsx')])
    // Deliberately do NOT create the destination file.

    await reconcileMove('.canvas/card', 'src/components/card')

    expect(board().components[0].filePath).toBe('src/components/card/card.tsx')
  })

  it('survives a corrupt board without abandoning the sweep', async () => {
    files.set('.planning/canvas/broken.json', '{ not json')
    writeBoard([component('a', 'Card', '.canvas/card/card.tsx')])
    files.set('src/components/card/card.tsx', 'export const Card = () => null\n')

    await expect(reconcileMove('.canvas/card', 'src/components/card')).resolves.toBeUndefined()
    expect(board().components[0].filePath).toBe('src/components/card/card.tsx')
  })
})
