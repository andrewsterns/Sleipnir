import type { LensMetric } from './PlanningView.ViewModel'
import { useEffect, useMemo, useState } from 'react'
import { describePlan } from '../platform/sleipnirApi'
import { reportAge, stepActivity } from './activityLog'
import type { GraphNode, PlanActivityEvent, SavedPlan } from './graph/types'
import type { Tone } from './graph/nodeTone'
import type { SteerFlag } from './graph/steering'

export interface PlanStepsListProps {
  plan: SavedPlan
  /** The plan's steps, in order (1..n). */
  steps: GraphNode[]
  /** Step id -> the new files it plans. */
  plannedByStep: Map<string, GraphNode[]>
  toneFor: (node: GraphNode) => Tone
  selectedId: string | null
  onSelect: (stepId: string) => void
  /** The plan's activity log (usePlanActivity). */
  events: readonly PlanActivityEvent[]
  onOpenFile?: (path: string) => void
  /** The step's status picker, as the card draws it. */
  renderStatus: (step: GraphNode) => React.ReactNode
  /** Approval, for a step still waiting on it. */
  renderActions: (step: GraphNode) => React.ReactNode
  /** The moments worth a look, for the step in progress. */
  flagsFor: (stepId: string) => SteerFlag[]
  /** After the description is saved: the plans are read again. */
  onDescribed?: () => void
  /** The lens's reading for a step's [lens] column; omit while no lens is on. */
  metricFor?: (node: GraphNode) => LensMetric | null
}

// The plan in the left panel: what it's for, then its steps 1..n, each opening
// in place to everything about it — so a plan reads top to bottom, with its
// progress in the status marks down the side, and needs no second panel.
export function usePlanStepsListViewModel({ plan, steps, selectedId, toneFor, events, onDescribed }: PlanStepsListProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  // The step being worked opens by itself when work reaches it; so does one
  // picked on the graph, when it's picked. Only on those changes — a step
  // someone has closed stays closed.
  const working = steps.find((s) => toneFor(s) === 'in_progress' || toneFor(s) === 'testing')?.id
  const picked = selectedId && steps.some((s) => s.id === selectedId) ? selectedId : undefined
  const openOne = (id: string | undefined) => {
    if (id) setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }
  useEffect(() => openOne(working), [working])
  useEffect(() => openOne(picked), [picked])
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(plan.description ?? '')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setDraft(plan.description ?? '')
    setEditing(false)
  }, [plan.id, plan.description])
  const saveDescription = async () => {
    setSaving(true)
    try {
      await describePlan(plan.id, draft)
      setEditing(false)
      onDescribed?.()
    } finally {
      setSaving(false)
    }
  }

  const done = steps.filter((s) => toneFor(s) === 'done' || toneFor(s) === 'committed').length
  // Each step's history, for the time on its row and whether its changes were
  // recorded (then the files it planned to change are no longer worth listing).
  const activity = useMemo(() => new Map(steps.map((s) => [s.id, stepActivity(events, s.id)])), [steps, events])
  const lastActive = (id: string) => {
    const reports = activity.get(id)?.reports ?? []
    const at = reports[reports.length - 1]?.at
    return at === undefined ? undefined : reportAge(at)
  }
  const hasRecordedChanges = (id: string) => (activity.get(id)?.changes.length ?? 0) > 0
  return { open, toggle, editing, setEditing, draft, setDraft, saving, saveDescription, done, lastActive, hasRecordedChanges }
}
