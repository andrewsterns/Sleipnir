// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  setWorkspaceRoot,
  checkPlanningPaths,
  relinkPlanningPath,
  removePlanningRef,
} from '../../../tools/sleipnir-backend.mjs'
import { parseRenameLog } from '../../../tools/git-control.mjs'

// Files renamed or deleted outside Sleipnir leave stale paths in .planning/ —
// these cover finding them, relinking them, and dropping them.
describe('parseRenameLog', () => {
  it('keeps only rename lines, newest mapping first', () => {
    const out = ['M\tsrc/x.ts', 'R100\tsrc/b.ts\tsrc/c.ts', 'R087\tsrc/a.ts\tsrc/b.ts', 'R100\tsrc/a.ts\tsrc/old.ts', 'D\tsrc/gone.ts', ''].join('\n')
    const map = parseRenameLog(out)
    expect([...map.entries()]).toEqual([
      ['src/b.ts', 'src/c.ts'],
      ['src/a.ts', 'src/b.ts'],
    ])
  })
})

describe('.planning stale path repair', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-paths-'))
    setWorkspaceRoot(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  const write = (rel: string, data: unknown) => {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, typeof data === 'string' ? data : JSON.stringify(data))
  }
  const read = (name: string) => JSON.parse(readFileSync(join(root, '.planning', name), 'utf8'))

  const seed = () => {
    write('.planning/plans.json', [
      {
        id: 'plan/p',
        label: 'P',
        nodeIds: [],
        assetPaths: ['src/a.tsx', 'src/b.tsx'],
        assetFolders: ['src/old'],
        assetEdges: [{ source: 'src/a.tsx', target: 'src/b.tsx' }],
        createdAt: 1,
      },
    ])
    write('.planning/notes.json', {
      nodes: [{ id: 'note/n', label: 'N', kind: 'proposed', map: 'todo', filePath: 'src/old/c.tsx' }],
      edges: [],
    })
    write('.planning/stages.json', { 'file:src/a.tsx': 'todo', 'file:src/old/c.tsx': 'blocked', 'note/n': 'todo' })
  }

  describe('relinkPlanningPath', () => {
    it('rewrites a file path everywhere and moves its stage tag', () => {
      seed()
      expect(relinkPlanningPath('src/a.tsx', 'src/z.tsx').changed).toBeGreaterThan(0)
      const [plan] = read('plans.json')
      expect(plan.assetPaths).toEqual(['src/z.tsx', 'src/b.tsx'])
      expect(plan.assetEdges).toEqual([{ source: 'src/z.tsx', target: 'src/b.tsx' }])
      expect(read('stages.json')).toEqual({ 'file:src/z.tsx': 'todo', 'file:src/old/c.tsx': 'blocked', 'note/n': 'todo' })
    })

    it('carries everything under a moved folder', () => {
      seed()
      relinkPlanningPath('src/old', 'src/new')
      expect(read('plans.json')[0].assetFolders).toEqual(['src/new'])
      expect(read('notes.json').nodes[0].filePath).toBe('src/new/c.tsx')
      expect(read('stages.json')['file:src/new/c.tsx']).toBe('blocked')
    })

    it('dedupes when the new path is already listed', () => {
      seed()
      relinkPlanningPath('src/a.tsx', 'src/b.tsx')
      expect(read('plans.json')[0].assetPaths).toEqual(['src/b.tsx'])
    })
  })

  describe('checkPlanningPaths', () => {
    it('reports missing paths and suggests a unique filename match', async () => {
      seed()
      write('src/b.tsx', '')
      write('src/moved/a.tsx', '')
      const { missing } = await checkPlanningPaths()
      const byPath = Object.fromEntries(missing.map((m: { path: string }) => [m.path, m]))
      expect(Object.keys(byPath).sort()).toEqual(['src/a.tsx', 'src/old', 'src/old/c.tsx'])
      expect(byPath['src/a.tsx'].suggestion).toEqual({ path: 'src/moved/a.tsx', source: 'name' })
      expect(byPath['src/old/c.tsx'].refs[0]).toMatchObject({ kind: 'note', nodeId: 'note/n' })
    })

    it('makes no suggestion when the filename is ambiguous', async () => {
      seed()
      write('src/one/a.tsx', '')
      write('src/two/a.tsx', '')
      const { missing } = await checkPlanningPaths()
      expect(missing.find((m: { path: string }) => m.path === 'src/a.tsx').suggestion).toBeUndefined()
    })
  })

  describe('removePlanningRef', () => {
    it('drops the path, its edges, its stage tag, and nodes backed by it', () => {
      seed()
      removePlanningRef('src/a.tsx')
      removePlanningRef('src/old')
      const [plan] = read('plans.json')
      expect(plan.assetPaths).toEqual(['src/b.tsx'])
      expect(plan.assetFolders).toEqual([])
      expect(plan.assetEdges).toEqual([])
      expect(read('notes.json').nodes).toEqual([])
      expect(read('stages.json')).toEqual({})
    })
  })
})
