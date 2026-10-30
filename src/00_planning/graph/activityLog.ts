import type { FileChange, PlanActivityEvent } from './types'

// What a plan's activity log (.planning/<plan>/activity.json, see
// tools/planDoc.mjs's applyStepStatus) says about its steps: every report an
// agent made, when each step started and finished, and every file it changed.

export interface StepActivity {
  /** Every report on the step, oldest first. */
  reports: PlanActivityEvent[]
  /** When the current run of the step started: its last move to in progress. */
  startedAt?: number
  /** When it completed, if its latest report completed it. */
  finishedAt?: number
  /** Who reported last. */
  agent?: string
  /** Every file it changed, over every time it was completed. */
  changes: FileChange[]
  /** Changed files past what each report recorded. */
  moreChanges: number
  /** A completion whose start snapshot was too big to take. */
  changesUnknown: boolean
}

export function stepActivity(events: readonly PlanActivityEvent[], stepId: string): StepActivity {
  const reports = events.filter((e) => e.stepId === stepId)
  let startedAt: number | undefined
  let finishedAt: number | undefined
  const changes = new Map<string, FileChange['change']>()
  let moreChanges = 0
  let changesUnknown = false
  for (const e of reports) {
    if (e.status === 'pending') {
      startedAt = undefined
      finishedAt = undefined
    } else if (e.status === 'in_progress' || e.status === 'testing') {
      if (startedAt === undefined || finishedAt !== undefined) startedAt = e.at
      finishedAt = undefined
    } else {
      startedAt = e.since ?? startedAt
      finishedAt = e.at
      for (const c of e.changes ?? []) changes.set(c.path, mergeChange(changes.get(c.path), c.change))
      moreChanges += e.moreChanges ?? 0
      if (e.changesUnknown) changesUnknown = true
    }
  }
  return {
    reports,
    startedAt,
    finishedAt,
    agent: reports[reports.length - 1]?.agent,
    changes: [...changes].map(([path, change]) => ({ path, change })).sort((a, b) => a.path.localeCompare(b.path)),
    moreChanges,
    changesUnknown,
  }
}

// A file created in one run and edited in the next was still created by the
// step; anything it ends up deleting is deleted.
function mergeChange(earlier: FileChange['change'] | undefined, later: FileChange['change']): FileChange['change'] {
  if (later === 'deleted' || !earlier) return later
  return earlier === 'added' ? 'added' : later
}

// Step id -> the files it changed that still exist, for drawing them onto the
// architecture graph beside the step.
export function changedPathsByStep(events: readonly PlanActivityEvent[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const stepId of new Set(events.map((e) => e.stepId))) {
    const paths = stepActivity(events, stepId).changes.filter((c) => c.change !== 'deleted').map((c) => c.path)
    if (paths.length) out.set(stepId, paths)
  }
  return out
}

// "just now", "4m ago", "3h ago", "2d ago" — how long since a report.
export function reportAge(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// "40s", "12m", "1h 5m" — how long a step took.
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
