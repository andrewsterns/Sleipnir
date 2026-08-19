import { describe, it, expect, vi } from 'vitest'
import type { FileTreeNode } from '../api/PlatformAPI'
import type { SavedPlan } from './types'

// In-memory fake workspace — enough of listWorkspaceDir/readWorkspaceFile's
// shape for resolveAssetPlanGraph to walk a real import chain end to end,
// without touching disk. Registered before importing the module under test
// so its top-level `import { listWorkspaceDir, readWorkspaceFile } from
// '../api/sleipnirApi'` binds to these fakes.
const files = new Map<string, string>()

function toTree(paths: string[]): FileTreeNode[] {
  // Flat is enough here — resolveAssetPlanGraph only ever reads the
  // flattened file list back out (see flattenFilePaths), never the shape.
  return paths.map((path) => ({ name: path.split('/').pop() ?? path, path, type: 'file', createdAt: 0 }))
}

vi.mock('../api/sleipnirApi', () => ({
  listWorkspaceDir: vi.fn(async () => ({ tree: toTree([...files.keys()]) })),
  readWorkspaceFile: vi.fn(async (path: string) => {
    if (!files.has(path)) throw new Error(`no such file: ${path}`)
    return { content: files.get(path)! }
  }),
}))

const { resolveAssetPlanGraph } = await import('./resolveAssetPlan')

function plan(overrides: Partial<SavedPlan>): SavedPlan {
  return { id: 'plan-1', label: 'Test Plan', nodeIds: [], createdAt: 0, ...overrides }
}

describe('resolveAssetPlanGraph', () => {
  it('follows a multi-hop import chain beyond the explicitly-added file, marking pulled-in files as discovered', async () => {
    files.clear()
    files.set('src/A.tsx', `import { B } from './B'\nexport const A = () => B\n`)
    files.set('src/B.tsx', `import { C } from './C'\nexport const B = () => C\n`)
    files.set('src/C.tsx', `export const C = 1\n`)

    const result = await resolveAssetPlanGraph(plan({ assetPaths: ['src/A.tsx'] }))

    const byPath = new Map(result.nodes.map((n) => [n.filePath, n]))
    expect(byPath.has('src/A.tsx')).toBe(true)
    expect(byPath.has('src/B.tsx')).toBe(true)
    expect(byPath.has('src/C.tsx')).toBe(true)

    // The seed file is explicit; everything the walk pulled in is flagged.
    expect(byPath.get('src/A.tsx')?.discovered).toBeUndefined()
    expect(byPath.get('src/B.tsx')?.discovered).toBe(true)
    expect(byPath.get('src/C.tsx')?.discovered).toBe(true)

    const idFor = (p: string) => byPath.get(p)!.id
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { source: idFor('src/A.tsx'), target: idFor('src/B.tsx'), kind: 'borrows' },
        { source: idFor('src/B.tsx'), target: idFor('src/C.tsx'), kind: 'borrows' },
      ]),
    )
  })

  it('never re-reads a file already discovered, even in an import cycle', async () => {
    files.clear()
    files.set('src/A.tsx', `import { B } from './B'\nexport const A = () => B\n`)
    files.set('src/B.tsx', `import { A } from './A'\nexport const B = () => A\n`)

    const result = await resolveAssetPlanGraph(plan({ assetPaths: ['src/A.tsx'] }))

    expect(result.nodes).toHaveLength(2)
    // A<->B is only two directed edges (one each way), not an infinite walk.
    expect(result.edges).toHaveLength(2)
  })

  it('connects a leaf asset (no imports of its own) to the component that imports it, via a reverse lookup', async () => {
    files.clear()
    // Hero.tsx is NOT in the plan — only the image is. The image has zero
    // outgoing imports (it's a leaf), so the only way to draw this edge is
    // by scanning Hero.tsx's content for a reference back to the image.
    files.set('src/assets/hero.png', '')
    files.set('src/Hero.tsx', `import heroImg from './assets/hero.png'\nexport const Hero = () => heroImg\n`)

    const result = await resolveAssetPlanGraph(plan({ assetPaths: ['src/assets/hero.png'] }))

    const byPath = new Map(result.nodes.map((n) => [n.filePath, n]))
    expect(byPath.has('src/Hero.tsx')).toBe(true)
    expect(byPath.get('src/Hero.tsx')?.discovered).toBe(true)

    const idFor = (p: string) => byPath.get(p)!.id
    expect(result.edges).toEqual(
      expect.arrayContaining([{ source: idFor('src/Hero.tsx'), target: idFor('src/assets/hero.png'), kind: 'borrows' }]),
    )
  })

  it('never reads a binary asset as text when building the whole-project scan', async () => {
    files.clear()
    files.set('src/assets/hero.png', 'BINARYGARBAGE\x00\x01')
    files.set('src/Hero.tsx', `import heroImg from './assets/hero.png'\n`)

    const readWorkspaceFile = (await import('../api/sleipnirApi')).readWorkspaceFile as unknown as {
      mock: { calls: unknown[][] }
    }
    await resolveAssetPlanGraph(plan({ assetPaths: ['src/assets/hero.png'] }))

    const readPaths = readWorkspaceFile.mock.calls.map((args) => args[0])
    expect(readPaths).not.toContain('src/assets/hero.png')
  })

  it('still detects edges within an explicit set whose size alone already exceeds the discovery cap', async () => {
    // Regression test for the actual bug reported live: a whole-folder pick
    // (assetFolders: ['src'], hundreds of files) put `visited.size` at/over
    // MAX_DISCOVERED_NODES before the BFS loop's first check ever ran, so
    // the loop body — where every addEdge() call lives — never executed even
    // once, silently dropping every edge, including ones purely between the
    // user's own explicitly-added files. Reproduces that shape at a smaller
    // scale: an explicit set of 305 files (over the 300 cap) that includes
    // two files which import each other.
    files.clear()
    const explicit: string[] = []
    for (let i = 0; i < 303; i++) {
      files.set(`src/filler${i}.ts`, `export const filler${i} = ${i}\n`)
      explicit.push(`src/filler${i}.ts`)
    }
    files.set('src/A.tsx', `import { B } from './B'\n`)
    files.set('src/B.tsx', `export const B = 1\n`)
    explicit.push('src/A.tsx', 'src/B.tsx')

    const result = await resolveAssetPlanGraph(plan({ assetPaths: explicit }))

    expect(explicit.length).toBeGreaterThan(300)
    const byPath = new Map(result.nodes.map((n) => [n.filePath, n]))
    const idFor = (p: string) => byPath.get(p)!.id
    expect(result.edges).toEqual(
      expect.arrayContaining([{ source: idFor('src/A.tsx'), target: idFor('src/B.tsx'), kind: 'borrows' }]),
    )
  })

  it('resolves an aliased import that points outside the explicitly-added set', async () => {
    files.clear()
    files.set(
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { baseUrl: 'src', paths: { '@atoms/*': ['components/atoms/*'] } } }),
    )
    files.set('src/feature/Card.tsx', `import { Section } from '@atoms/Section'\n`)
    files.set('src/components/atoms/Section.tsx', `export const Section = () => null\n`)

    const result = await resolveAssetPlanGraph(plan({ assetPaths: ['src/feature/Card.tsx'] }))

    const paths = result.nodes.map((n) => n.filePath)
    expect(paths).toContain('src/components/atoms/Section.tsx')
  })
})
