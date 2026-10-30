import { useEffect, useMemo, useState } from 'react'
import { getGitDiff } from './api/sleipnirApi'
import { stepActivity, type StepActivity } from './graph/activityLog'
import type { FileChange, PlanActivityEvent } from './graph/types'

export interface ActivityPanelProps {
  /** The plan's activity log (see usePlanActivity). */
  events: readonly PlanActivityEvent[]
  stepId: string
  onOpenFile?: (path: string) => void
}

/** How many reports the timeline shows before folding the older ones. */
export const RECENT_REPORTS = 4

// A step's activity in the node card: who worked it and when, what each report
// said, and every file it changed — each one's diff a click away. The diff is
// git's (the file against its last commit), which is the step's own change
// whenever the file was clean when the step started.
export function useActivityPanelViewModel({ events, stepId }: ActivityPanelProps) {
  const activity: StepActivity = useMemo(() => stepActivity(events, stepId), [events, stepId])
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [showAllReports, setShowAllReports] = useState(false)

  // A different step starts folded, with no diff open.
  useEffect(() => {
    setOpenPath(null)
    setShowAllReports(false)
  }, [stepId])

  useEffect(() => {
    if (!openPath) {
      setDiff('')
      return
    }
    let cancelled = false
    setDiffLoading(true)
    getGitDiff(openPath, false)
      .then(({ diff: d }) => { if (!cancelled) setDiff(d) })
      .catch((e) => { if (!cancelled) setDiff(`# Couldn't load the diff: ${e instanceof Error ? e.message : String(e)}`) })
      .finally(() => { if (!cancelled) setDiffLoading(false) })
    return () => { cancelled = true }
  }, [openPath])

  // Only a modified file has a diff to show; a new one opens, a deleted one is gone.
  const toggleDiff = (change: FileChange) => {
    if (change.change !== 'modified') return
    setOpenPath((p) => (p === change.path ? null : change.path))
  }

  const hiddenReports = showAllReports ? 0 : Math.max(0, activity.reports.length - RECENT_REPORTS)
  const reports = activity.reports.slice(hiddenReports).reverse()

  return {
    activity,
    reports,
    hiddenReports,
    showAllReports: () => setShowAllReports(true),
    openPath,
    diff,
    diffLoading,
    toggleDiff,
  }
}
