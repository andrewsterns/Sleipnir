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
