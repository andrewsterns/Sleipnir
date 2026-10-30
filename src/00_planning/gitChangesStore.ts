import { useSyncExternalStore } from 'react'
import { getGitStatus, getWorkspaceInfo } from './api/sleipnirApi'
import type { GitFileStatus } from './api/PlatformAPI'

// Which workspace files git sees as changed or new, shared app-wide like
// stagesStore: the Planning graph draws everything else as committed (see
// graph/nodeTone.ts). Refreshed by useStatusReconciler on its triggers (opening
// a project, window focus, planning changes) and after the editor saves a file.
// null until the first answer, and whenever there's no repo or no git — then
// the graph goes by status alone.
export interface GitChanges {
  tracked: string[]
  untracked: string[]
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

// git reports paths relative to its top-level dir; stages are keyed by
// Workspace-relative path. When the Workspace sits inside a larger repo, strip
// the Workspace's offset under the repo root and drop anything outside it.
// Deleted files are skipped — usePlanningHealth already reports those.
export function changedWorkspacePaths(
  files: GitFileStatus[],
  gitRoot: string | null | undefined,
  workspaceRoot: string | null | undefined,
): { tracked: string[]; untracked: string[] } {
  const out = { tracked: [] as string[], untracked: [] as string[] }
  let prefix = ''
  if (gitRoot && workspaceRoot) {
    const g = norm(gitRoot).toLowerCase()
    const w = norm(workspaceRoot)
    if (w.toLowerCase() !== g) {
      if (!w.toLowerCase().startsWith(`${g}/`)) return out
      prefix = `${w.slice(g.length + 1)}/`
    }
  }
  for (const f of files) {
    if (f.indexStatus === 'D' || f.worktreeStatus === 'D') continue
    const p = norm(f.path)
    if (!p.startsWith(prefix)) continue
    ;(f.untracked ? out.untracked : out.tracked).push(p.slice(prefix.length))
  }
  return out
}

let dirty: ReadonlySet<string> | null = null
let inflight: Promise<GitChanges | null> | null = null
let queued = false
const subscribers = new Set<() => void>()

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

function sameSet(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null) {
  if (a === b) return true
  if (!a || !b || a.size !== b.size) return false
  for (const p of a) if (!b.has(p)) return false
  return true
}

async function read(): Promise<GitChanges | null> {
  try {
    const [status, info] = await Promise.all([getGitStatus(), getWorkspaceInfo()])
    return changedWorkspacePaths(status.files, status.root, info.root)
  } catch {
    return null
  }
}

// Re-reads git status. Calls while one is running share it, plus at most one
// more afterwards, so a burst of saves costs two reads, not one per save. Only
// an actual change notifies, so the graph doesn't redraw for nothing.
export async function refreshGitChanges(): Promise<GitChanges | null> {
  if (inflight) {
    queued = true
    return inflight
  }
  inflight = read()
  const changes = await inflight
  inflight = null
  const next = changes ? new Set([...changes.tracked, ...changes.untracked]) : null
  if (!sameSet(dirty, next)) {
    dirty = next
    for (const fn of subscribers) fn()
  }
  if (queued) {
    queued = false
    void refreshGitChanges()
  }
  return changes
}

export function useGitDirtyPaths(): ReadonlySet<string> | null {
  return useSyncExternalStore(subscribe, () => dirty)
}
