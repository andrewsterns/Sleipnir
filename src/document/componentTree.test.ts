import { describe, it, expect } from 'vitest'
import {
  addComponentFolder,
  allFolderPaths,
  buildComponentTree,
  componentDir,
  removeComponentFolder,
  type ComponentTreeFolder,
} from './componentTree'
import { createDoc } from './doc'
import type { CanvasComponent, CanvasDoc } from './types'

const ROOT = 'src/canvas'

function component(name: string, filePath?: string): CanvasComponent {
  return {
    id: `cmp-${name}`,
    name,
    variants: [
      {
        id: `var-${name}`,
        name: 'Default',
        values: {},
        root: { id: `r-${name}`, name, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [] },
      },
    ],
    props: [],
    variantPropIds: [],
    target: 'react',
    componentRoot: ROOT,
    filePath,
    sync: 'live',
    createdAt: 0,
    updatedAt: 0,
  }
}

function docWith(components: CanvasComponent[], folders?: string[]): CanvasDoc {
  return { ...createDoc('board'), components, componentFolders: folders }
}

function folderNamed(parent: ComponentTreeFolder, name: string): ComponentTreeFolder {
  const found = parent.children.find((c) => c.kind === 'folder' && c.name === name)
  if (!found || found.kind !== 'folder') throw new Error(`no folder "${name}"`)
  return found
}

describe('componentDir', () => {
  it('is the folder chain beneath the component root', () => {
    expect(componentDir(component('Card', `${ROOT}/cards/card.tsx`))).toBe('cards')
    expect(componentDir(component('Deep', `${ROOT}/a/b/c/deep.tsx`))).toBe('a/b/c')
  })

  it('is the empty string for a component sitting directly in the root', () => {
    expect(componentDir(component('Flat', `${ROOT}/flat.tsx`))).toBe('')
  })

  it('is null for a component with no file — it has no place on disk to belong to', () => {
    expect(componentDir(component('Unwritten'))).toBeNull()
  })
})

describe('buildComponentTree', () => {
  it('nests components under their real folder chain', () => {
    const tree = buildComponentTree(
      docWith([
        component('Card', `${ROOT}/cards/card.tsx`),
        component('Badge', `${ROOT}/cards/badge.tsx`),
        component('Root', `${ROOT}/root.tsx`),
      ]),
    )

    const cards = folderNamed(tree.root, 'cards')
    expect(cards.path).toBe('cards')
    expect(cards.children.map((c) => c.name)).toEqual(['badge.tsx', 'card.tsx'])
    expect(tree.root.children.some((c) => c.kind === 'component' && c.name === 'root.tsx')).toBe(true)
  })

  it('creates the whole intermediate chain for a deep path', () => {
    const tree = buildComponentTree(docWith([component('Deep', `${ROOT}/a/b/c/deep.tsx`)]))
    const c = folderNamed(folderNamed(folderNamed(tree.root, 'a'), 'b'), 'c')
    expect(c.path).toBe('a/b/c')
    expect(c.children).toHaveLength(1)
  })

  it('groups unwritten components separately rather than faking a location', () => {
    const tree = buildComponentTree(docWith([component('Draft'), component('Card', `${ROOT}/card.tsx`)]))
    expect(tree.unplaced.map((c) => c.name)).toEqual(['Draft'])
    expect(tree.root.children.map((c) => c.name)).toEqual(['card.tsx'])
  })

  it('keeps empty folders that were created up front', () => {
    const tree = buildComponentTree(docWith([], ['buttons', 'forms/inputs']))
    expect(folderNamed(tree.root, 'buttons').children).toEqual([])
    expect(folderNamed(folderNamed(tree.root, 'forms'), 'inputs').path).toBe('forms/inputs')
  })

  it('merges an explicit folder with one derived from a component path', () => {
    const tree = buildComponentTree(
      docWith([component('Card', `${ROOT}/cards/card.tsx`)], ['cards']),
    )
    // One "cards" folder, not two.
    expect(tree.root.children.filter((c) => c.kind === 'folder' && c.name === 'cards')).toHaveLength(1)
    expect(folderNamed(tree.root, 'cards').children).toHaveLength(1)
  })

  it('sorts folders before components, each alphabetically', () => {
    const tree = buildComponentTree(
      docWith(
        [component('Zed', `${ROOT}/zed.tsx`), component('Alpha', `${ROOT}/alpha.tsx`), component('In', `${ROOT}/zzz/in.tsx`)],
        ['aaa'],
      ),
    )
    expect(tree.root.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
      'folder:aaa',
      'folder:zzz',
      'component:alpha.tsx',
      'component:zed.tsx',
    ])
  })

  it('handles an empty board', () => {
    const tree = buildComponentTree(docWith([]))
    expect(tree.root.children).toEqual([])
    expect(tree.unplaced).toEqual([])
  })

  it('carries the component through on each leaf, so the panel can act on it', () => {
    const card = component('Card', `${ROOT}/card.tsx`)
    const tree = buildComponentTree(docWith([card]))
    const leaf = tree.root.children[0]
    expect(leaf.kind).toBe('component')
    if (leaf.kind === 'component') expect(leaf.component.id).toBe(card.id)
  })
})

describe('addComponentFolder', () => {
  it('adds a normalized folder', () => {
    expect(addComponentFolder(docWith([]), 'buttons/')).toEqual(['buttons'])
    expect(addComponentFolder(docWith([]), 'a\\b')).toEqual(['a/b'])
  })

  it('is idempotent', () => {
    const doc = docWith([], ['buttons'])
    expect(addComponentFolder(doc, 'buttons')).toEqual(['buttons'])
  })

  it('refuses traversal, which would point the tree outside the sandbox', () => {
    const doc = docWith([], [])
    expect(addComponentFolder(doc, '../escape')).toEqual([])
    expect(addComponentFolder(doc, 'a/../../b')).toEqual([])
  })

  it('ignores an empty or whitespace-only name', () => {
    const doc = docWith([], [])
    expect(addComponentFolder(doc, '')).toEqual([])
    expect(addComponentFolder(doc, '   ')).toEqual([])
  })
})

describe('removeComponentFolder', () => {
  it('removes the folder and everything nested beneath it', () => {
    const doc = docWith([], ['a', 'a/b', 'a/b/c', 'other'])
    expect(removeComponentFolder(doc, 'a')).toEqual(['other'])
  })

  it('leaves unrelated folders that merely share a name prefix', () => {
    const doc = docWith([], ['a', 'ab'])
    expect(removeComponentFolder(doc, 'a')).toEqual(['ab'])
  })
})

describe('allFolderPaths', () => {
  it('lists every folder path for the move-to autocomplete', () => {
    const tree = buildComponentTree(
      docWith([component('Deep', `${ROOT}/a/b/deep.tsx`)], ['z']),
    )
    expect(allFolderPaths(tree)).toEqual(['a', 'a/b', 'z'])
  })
})
