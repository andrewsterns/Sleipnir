import { useCallback, useEffect, useRef } from 'react'
import { getGitStatus, getWorkspaceInfo } from './api/sleipnirApi'
import type { GitFileStatus } from './api/PlatformAPI'
import { isPlanningWatchAvailable } from './api/iPlanningWatch'
import { promoteFileStages } from './useFileStages'

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

// Keeps file statuses in step with changes made outside Sleipnir's editor —
// VS Code, an agent, `git pull`. A Proposed file git sees as modified/added
// moves to In Progress; an untracked one only if a plan node backs it, so a
// fresh repo (everything untracked) doesn't flip every file at once. Same triggers as usePlanningHealth: mount/project change,
// window focus, and real planning edits (stagesOnly events are our own writes).
export function useStatusReconciler(projectKey?: string | null) {
  const running = useRef(false)

  const reconcile = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const [status, info] = await Promise.all([getGitStatus(), getWorkspaceInfo()])
      const { tracked, untracked } = changedWorkspacePaths(status.files, status.root, info.root)
      await promoteFileStages(tracked)
      await promoteFileStages(untracked, { plannedOnly: true })
    } catch {
      /* not a git repo / no project open — open & save still promote */
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    void reconcile()
    const onFocus = () => void reconcile()
    window.addEventListener('focus', onFocus)
    const unwatch = isPlanningWatchAvailable()
      ? window.planningWatchAPI!.onChanged((info) => {
          if (!info?.stagesOnly) void reconcile()
        })
      : undefined
    return () => {
      window.removeEventListener('focus', onFocus)
      unwatch?.()
    }
  }, [reconcile, projectKey])
}
