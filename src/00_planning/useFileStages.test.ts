import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitFileStatus } from './api/PlatformAPI'

const api = vi.hoisted(() => ({
  stages: {} as Record<string, string>,
  notes: [] as { id: string; filePath?: string }[],
}))

vi.mock('./api/sleipnirApi', () => ({
  getNotes: vi.fn(async () => ({ nodes: api.notes })),
  getNodeStages: vi.fn(async () => ({ stages: { ...api.stages } })),
  setNodeStage: vi.fn(async (id: string, stage: string) => {
    api.stages[id] = stage
    return { stages: { ...api.stages } }
  }),
  getGitStatus: vi.fn(),
  getWorkspaceInfo: vi.fn(),
}))

import { shouldPromote, promoteFileStages } from './useFileStages'
import { changedWorkspacePaths } from './useStatusReconciler'
import { refreshStages, getStage } from './stagesStore'

describe('shouldPromote', () => {
  it('promotes proposed and untagged files', () => {
    expect(shouldPromote(undefined)).toBe(true)
    expect(shouldPromote('proposed')).toBe(true)
  })

  it('never touches in-progress, in-review or done', () => {
    for (const s of ['in-progress', 'in-review', 'completed'] as const) expect(shouldPromote(s)).toBe(false)
  })
})

describe('promoteFileStages', () => {
  beforeEach(async () => {
    api.stages = {}
    api.notes = []
    await refreshStages()
  })

  it('keys by the backing node id when a plan node owns the file, else file:<path>', async () => {
    api.notes = [{ id: 'note/a', filePath: 'src/a.ts' }]
    await promoteFileStages(['src/a.ts', 'src/b.ts'])
    expect(api.stages).toEqual({ 'note/a': 'in-progress', 'file:src/b.ts': 'in-progress' })
  })

  it('leaves review and done files alone', async () => {
    api.stages = { 'file:done.ts': 'completed', 'file:rev.ts': 'in-review' }
    await refreshStages()
    await promoteFileStages(['done.ts', 'rev.ts', 'new.ts'])
    expect(await getStage('file:done.ts')).toBe('completed')
    expect(await getStage('file:rev.ts')).toBe('in-review')
    expect(await getStage('file:new.ts')).toBe('in-progress')
  })

  it('plannedOnly skips files no plan node backs', async () => {
    api.notes = [{ id: 'note/p', filePath: 'planned.ts' }]
    await promoteFileStages(['planned.ts', 'stray.ts'], { plannedOnly: true })
    expect(api.stages).toEqual({ 'note/p': 'in-progress' })
  })
})

describe('changedWorkspacePaths', () => {
  const f = (path: string, indexStatus = ' ', worktreeStatus = 'M'): GitFileStatus => ({
    path, indexStatus, worktreeStatus, staged: false, untracked: indexStatus === '?', conflicted: false, mtime: 0,
  })

  it('splits tracked and untracked, using git paths as-is at the repo root', () => {
    expect(changedWorkspacePaths([f('src/a.ts'), f('b.ts', '?', '?')], 'C:/repo', 'C:\\repo\\')).toEqual({
      tracked: ['src/a.ts'],
      untracked: ['b.ts'],
    })
  })

  it('strips the workspace offset and drops files outside it', () => {
    const files = [f('app/src/a.ts'), f('other/x.ts'), f('app/b.ts', 'A', ' ')]
    expect(changedWorkspacePaths(files, 'C:/repo', 'C:\\Repo\\app').tracked).toEqual(['src/a.ts', 'b.ts'])
  })

  it('skips deleted files', () => {
    expect(changedWorkspacePaths([f('gone.ts', ' ', 'D'), f('staged-gone.ts', 'D', ' ')], '/r', '/r').tracked).toEqual([])
  })

  it('returns nothing when the workspace is not inside the git root', () => {
    expect(changedWorkspacePaths([f('a.ts')], '/elsewhere', '/r')).toEqual({ tracked: [], untracked: [] })
  })
})
