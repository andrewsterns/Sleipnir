import { useEffect, useState } from 'react'
import { getPlanActivity } from '../platform/sleipnirApi'
import { isPlanningWatchAvailable } from '../platform/iPlanningWatch'
import type { PlanActivityEvent } from './graph/types'

// One plan's activity log — what its agents reported, step by step — kept live:
// refetched when the plan changes and on every planning change on disk, the
// status-only batches an agent's report makes included (those are exactly the
// ones that write activity.json). No plan, or no log yet, is an empty list.
export function usePlanActivity(planId: string | undefined): PlanActivityEvent[] {
  const [events, setEvents] = useState<PlanActivityEvent[]>([])

  useEffect(() => {
    if (!planId) {
      setEvents([])
      return
    }
    let cancelled = false
    const load = () =>
      getPlanActivity(planId)
        .then(({ events: next }) => { if (!cancelled) setEvents(next) })
        .catch(() => { if (!cancelled) setEvents([]) })
    void load()
    const unwatch = isPlanningWatchAvailable()
      ? window.planningWatchAPI!.onChanged((info) => { if (!info?.canvasOnly) void load() })
      : undefined
    return () => {
      cancelled = true
      unwatch?.()
    }
  }, [planId])

  return events
}
