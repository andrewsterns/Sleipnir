import { useCallback, useEffect, useRef } from 'react'
import { isPlanningWatchAvailable } from './api/iPlanningWatch'
import { settleCommittedStages } from './api/sleipnirApi'
import { promoteFileStages } from './useFileStages'
import { refreshGitChanges } from './gitChangesStore'
import { refreshStages } from './stagesStore'

// Keeps file statuses in step with git — whatever changed the files: VS Code,
// an agent, `git pull`, a commit. A Proposed file git sees as modified/added
// moves to In Progress; an untracked one only if a plan node backs it, so a
// fresh repo (everything untracked) doesn't flip every file at once. A file
// that's in progress or done but has nothing uncommitted any more has been
// committed (or reverted): its status is cleared, so the next change to it
// starts in progress again rather than reading as done. Same triggers as
// usePlanningHealth: mount/project change, window focus, and real planning
// edits (stagesOnly events are our own writes).
export function useStatusReconciler(projectKey?: string | null) {
  const running = useRef(false)

  const reconcile = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const changes = await refreshGitChanges()
      if (!changes) return
      const { tracked, untracked } = changes
      await promoteFileStages(tracked)
      await promoteFileStages(untracked, { plannedOnly: true })
      const { cleared } = await settleCommittedStages([...tracked, ...untracked])
      if (cleared > 0) await refreshStages()
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
          if (!info?.stagesOnly && !info?.canvasOnly) void reconcile()
        })
      : undefined
    return () => {
      window.removeEventListener('focus', onFocus)
      unwatch?.()
    }
  }, [reconcile, projectKey])
}
