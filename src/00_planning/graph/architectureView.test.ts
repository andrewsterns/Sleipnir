import { describe, it, expect, beforeEach, vi } from 'vitest'
import { scopeArchitecture, archId, folderId, folderKeyOf } from './architectureScope'
import { composePlanView } from './composePlanView'
import {
  getWorkspaceScan,
  invalidateWorkspacePaths,
  invalidateWorkspaceListing,
  invalidateWorkspaceScan,
  resetWorkspaceScanCache,
  type ScanDeps,
  type WorkspaceScan,
} from './workspaceScanCache'
import type { GraphData, GraphNode } from './types'

describe('scopeArchitecture', () => {
  const small: WorkspaceScan = {
    files: ['src/a.ts', 'src/b.ts'],
    edges: [{ source: 'src/a.ts', target: 'src/b.ts' }],
  }

  it('keeps a small project whole', () => {
    expect(scopeArchitecture(small, { paths: [], dirs: [] })).toEqual({
      files: ['src/a.ts', 'src/b.ts'],
      folders: [],
      edges: [{ source: archId('src/a.ts'), target: archId('src/b.ts') }],
    })
  })

  // a -> b -> c -> d chain in src/core, plus two unrelated files in lib/deep/x.
  const large: WorkspaceScan = {
    files: ['src/core/a.ts', 'src/core/b.ts', 'src/core/c.ts', 'src/core/d.ts', 'lib/deep/x/e.ts', 'lib/deep/x/f.ts', 'src/feature/g.ts'],
    edges: [
      { source: 'src/core/a.ts', target: 'src/core/b.ts' },
      { source: 'src/core/b.ts', target: 'src/core/c.ts' },
      { source: 'src/core/c.ts', target: 'src/core/d.ts' },
      { source: 'lib/deep/x/e.ts', target: 'src/core/d.ts' },
      { source: 'lib/deep/x/f.ts', target: 'src/core/d.ts' },
    ],
  }

  it('keeps files within N hops of the focus and collapses the rest into folders', () => {
    const scoped = scopeArchitecture(large, { paths: ['src/core/a.ts'], dirs: [] }, { hops: 2, max: 3 })
    expect(scoped.files).toEqual(['src/core/a.ts', 'src/core/b.ts', 'src/core/c.ts'])
    expect(scoped.folders).toEqual([
      { path: 'lib/deep', count: 2 },
      { path: 'src/core', count: 1 },
      { path: 'src/feature', count: 1 },
    ])
    // c -> d rolls up to c -> src/core folder; e and f both roll up into one lib/deep -> src/core edge.
    expect(scoped.edges).toContainEqual({ source: archId('src/core/c.ts'), target: folderId('src/core') })
    expect(scoped.edges.filter((e) => e.source === folderId('lib/deep'))).toEqual([{ source: folderId('lib/deep'), target: folderId('src/core') }])
  })

  it("keeps a planned file's destination folder as context", () => {
    const scoped = scopeArchitecture(large, { paths: [], dirs: ['src/feature'] }, { hops: 0, max: 3 })
    expect(scoped.files).toEqual(['src/feature/g.ts'])
  })

  it('groups collapsed folders by their leading segments', () => {
    expect(folderKeyOf('lib/deep/x/e.ts')).toBe('lib/deep')
    expect(folderKeyOf('root.ts')).toBe('.')
  })
})

describe('composePlanView', () => {
  const scan: WorkspaceScan = {
    files: ['src/App.tsx', 'src/cart/cartView.tsx', 'src/util.ts'],
    edges: [{ source: 'src/App.tsx', target: 'src/util.ts' }],
  }
  const n = (id: string, extra: Partial<GraphNode>): GraphNode => ({ id, label: id, kind: 'proposed', map: 'claude', ...extra })
  const planGraph: GraphData = {
    nodes: [
      n('step-1', { type: 'plan-step', order: 1, editsPaths: ['src/App.tsx'] }),
      n('step-2', { type: 'plan-step', order: 2 }),
      // Already approved: exists on disk now.
      n('planned/view', { type: 'planned-file', planned: true, stepId: 'step-1', filePath: 'src/cart/cartView.tsx', role: 'view' }),
      // Not built yet.
      n('planned/vm', { type: 'planned-file', planned: true, stepId: 'step-2', filePath: 'src/cart/cartViewModel.tsx', role: 'view-model' }),
    ],
    edges: [
      { source: 'step-1', target: 'step-2', kind: 'sequence' },
      { source: 'step-1', target: 'planned/view', kind: 'plan-step' },
      { source: 'planned/view', target: 'planned/vm', kind: 'borrows' },
    ],
  }

  it('returns the plan untouched, with nothing dimmed, in plan mode', () => {
    expect(composePlanView(planGraph, 'plan/x', scan, 'plan')).toEqual({ data: planGraph, overlay: new Set() })
    expect(composePlanView(planGraph, 'plan/x', null, 'architecture').data).toBe(planGraph)
  })

  it('lays the plan over the architecture and highlights what the plan touches', () => {
    const { data, overlay } = composePlanView(planGraph, 'plan/x', scan, 'architecture')
    const ids = data.nodes.map((node) => node.id)
    expect(ids).toEqual(expect.arrayContaining([archId('src/App.tsx'), archId('src/util.ts'), archId('src/cart/cartView.tsx'), 'step-1', 'step-2', 'planned/vm']))
    // The built planned file became its real node.
    expect(ids).not.toContain('planned/view')
    expect(data.edges).toContainEqual({ source: 'step-1', target: archId('src/cart/cartView.tsx'), kind: 'plan-step' })
    expect(data.edges).toContainEqual({ source: archId('src/cart/cartView.tsx'), target: 'planned/vm', kind: 'borrows' })
    // The edit is linked from its step.
    expect(data.edges).toContainEqual({ source: 'step-1', target: archId('src/App.tsx'), kind: 'plan-step' })
    expect(data.edges).toContainEqual({ source: 'step-1', target: 'step-2', kind: 'sequence' })

    expect([...overlay].sort()).toEqual(['planned/vm', 'step-1', 'step-2', archId('src/App.tsx'), archId('src/cart/cartView.tsx')].sort())
    expect(overlay.has(archId('src/util.ts'))).toBe(false)
  })
})

describe('workspaceScanCache', () => {
  let files: Record<string, string>
  let reads: string[]
  const deps = (): ScanDeps => ({
    rootKey: async () => '/project',
    listFiles: async () => Object.keys(files),
    readFile: async (p) => {
      reads.push(p)
      return files[p]
    },
  })

  beforeEach(() => {
    resetWorkspaceScanCache()
    files = {
      'src/a.ts': "import { b } from './b'\n",
      'src/b.ts': 'export const b = 1\n',
      'src/logo.png': '',
    }
    reads = []
  })

  const edgeList = (scan: WorkspaceScan) => scan.edges.map((e) => `${e.source}>${e.target}`).sort()
  // Import detection also reads tsconfig/jsconfig for path aliases; these tests
  // are about which source files get (re-)read.
  const sourceReads = () => reads.filter((p) => p.startsWith('src/')).sort()

  it('scans once and serves repeat calls from the cache', async () => {
    const first = await getWorkspaceScan(deps())
    expect(edgeList(first)).toEqual(['src/a.ts>src/b.ts'])
    expect(sourceReads()).toEqual(['src/a.ts', 'src/b.ts'])
    reads = []
    expect(await getWorkspaceScan(deps())).toBe(first)
    expect(reads).toEqual([])
  })

  it('re-reads only invalidated files', async () => {
    await getWorkspaceScan(deps())
    reads = []
    files['src/b.ts'] = "import { a } from './a'\n"
    invalidateWorkspacePaths(['src/b.ts'])
    const next = await getWorkspaceScan(deps())
    expect(sourceReads()).toEqual(['src/b.ts'])
    expect(edgeList(next)).toEqual(['src/a.ts>src/b.ts', 'src/b.ts>src/a.ts'])
  })

  it('picks up added and removed files on a listing refresh without re-reading the rest', async () => {
    await getWorkspaceScan(deps())
    reads = []
    files['src/c.ts'] = "import { b } from './b'\n"
    delete files['src/a.ts']
    invalidateWorkspaceListing()
    const next = await getWorkspaceScan(deps())
    expect(sourceReads()).toEqual(['src/c.ts'])
    expect(edgeList(next)).toEqual(['src/c.ts>src/b.ts'])
  })

  it('rescans everything after a full invalidation', async () => {
    await getWorkspaceScan(deps())
    reads = []
    invalidateWorkspaceScan()
    await getWorkspaceScan(deps())
    expect(sourceReads()).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('starts fresh for a different workspace root', async () => {
    await getWorkspaceScan(deps())
    reads = []
    await getWorkspaceScan({ ...deps(), rootKey: async () => '/other' })
    expect(sourceReads()).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('shares one in-flight scan between concurrent callers', async () => {
    const spy = vi.fn(async () => Object.keys(files))
    const d = { ...deps(), listFiles: spy }
    await Promise.all([getWorkspaceScan(d), getWorkspaceScan(d)])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
