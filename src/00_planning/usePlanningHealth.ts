import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkPlanningPaths, relinkPlanningPath, removePlanningRef } from './api/sleipnirApi'
import type { MissingPlanningRef } from './api/PlatformAPI'
import { isPlanningWatchAvailable } from './api/iPlanningWatch'

// Keeps a live list of `.planning/` paths that no longer exist on disk. Files
// renamed or deleted in another editor never touch `.planning/`, so the
// planning watcher alone can't notice — the trigger that matches the real
// workflow is this window regaining focus (coming back from VS Code), same
// approach as SourceControlView.ViewModel's focus reload. Also re-checks on
// real planning edits so a relink/remove clears itself from the list.
// Owned by App.tsx (the Problems dock lists these; Planning marks the nodes),
// so `projectKey` re-runs the check when the open project changes.
export function usePlanningHealth(projectKey?: string | null) {
  const [missing, setMissing] = useState<MissingPlanningRef[]>([])
  // Drops a slow check's result if a newer one has started since.
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++seq.current
    try {
      const { missing: next } = await checkPlanningPaths()
      if (id === seq.current) setMissing(next)
    } catch {
      if (id === seq.current) setMissing([])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    const unwatch = isPlanningWatchAvailable()
      ? window.planningWatchAPI!.onChanged((info) => {
          if (!info?.stagesOnly && !info?.canvasOnly) void refresh()
        })
      : undefined
    return () => {
      window.removeEventListener('focus', onFocus)
      unwatch?.()
    }
  }, [refresh, projectKey])

  const relink = useCallback(
    async (from: string, to: string) => {
      await relinkPlanningPath(from, to)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (path: string) => {
      await removePlanningRef(path)
      await refresh()
    },
    [refresh],
  )

  // Only git-recorded renames — a filename match is a guess and always needs
  // its own click.
  const relinkAll = useCallback(async () => {
    for (const m of missing) {
      if (m.suggestion?.source === 'git') await relinkPlanningPath(m.path, m.suggestion.path)
    }
    await refresh()
  }, [missing, refresh])

  const missingPaths = useMemo(() => new Set(missing.map((m) => m.path)), [missing])

  return { missing, missingPaths, relink, relinkAll, remove, refresh }
}
