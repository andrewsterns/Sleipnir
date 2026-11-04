import type { IconName } from '../../app/UIKit/Icon/Icon'
import type { PlanViewMode } from './composePlanView'
import type { GraphMapId, GraphNode, SavedPlan } from './types'

// The Agent area's permanent tabs: what's always there to look at, beside the
// plans that come and go. Each is a whole-project view with no plan of its own —
// the project's architecture, and the instructions and skills its agents read.
// They open and close like any tab, but can't be renamed or deleted. (Health
// isn't one: it's an overlay, laid over the architecture or a plan.)
export interface PinnedView {
  id: GraphMapId
  label: string
  mode: Exclude<PlanViewMode, 'plan' | 'health'>
  icon: IconName
  /** One line for the picker and the tab's tooltip. */
  hint: string
}

export const PINNED_VIEWS: readonly PinnedView[] = [
  { id: 'view:architecture', label: 'Architecture', mode: 'architecture', icon: 'network', hint: 'The project: every file and what it imports' },
  { id: 'view:skills', label: 'Skills', mode: 'skills', icon: 'sparkle', hint: 'The instructions and skills your agents read, and where an agent is in them now' },
]

export function pinnedViewFor(id: GraphMapId | null | undefined): PinnedView | undefined {
  return PINNED_VIEWS.find((v) => v.id === id)
}

export interface PlanHistoryRow {
  id: string
  label: string
  /** "today · 2/3", "Oct 31 · 9/9". */
  meta: string
}

// The plans as a history: newest first, each with when it was made and how far
// it got (its steps marked completed, of all its steps).
export function planHistory(
  plans: readonly SavedPlan[],
  nodes: readonly GraphNode[],
  stages: Readonly<Record<string, string | undefined>>,
  now = Date.now(),
): PlanHistoryRow[] {
  const steps = new Map<string, GraphNode[]>()
  for (const n of nodes) if (n.type === 'plan-step' && n.planId) steps.set(n.planId, [...(steps.get(n.planId) ?? []), n])
  return [...plans]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => {
      const own = steps.get(p.id) ?? []
      const done = own.filter((s) => stages[s.id] === 'completed').length
      const parts = [dayLabel(p.createdAt, now), own.length ? `${done}/${own.length}` : '']
      return { id: p.id, label: p.label, meta: parts.filter(Boolean).join(' · ') }
    })
}

/** "today", "yesterday", or "Oct 31" (with the year once it isn't this one). */
export function dayLabel(at: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((day(now) - day(at)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  const d = new Date(at)
  const month = d.toLocaleString('en-US', { month: 'short' })
  return d.getFullYear() === new Date(now).getFullYear() ? `${month} ${d.getDate()}` : `${month} ${d.getDate()} ${d.getFullYear()}`
}
