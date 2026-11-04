import type { PlanActivityEvent, TrailEntry } from './types'

// Steering: making it cheap for a person to help an agent at the moments that
// matter. Two halves —
//
//   marks  a person marks files 'focus' or 'avoid' for the step in progress
//          (stored like comments; agents read them in list-steps and plan.md)
//   flags  Sleipnir raises, from the trail alone, the moments worth a look:
//            avoided    an edit to a file marked avoid
//            looping    the same file edited again and again while tests fail
//            off-step   edits outside the step's files
//            stalled    a long stretch of reading with no edit
//
// None of it costs an agent a token: marks reach it only when it reads its step,
// and flags are for the person watching.

export interface StepMarks {
  focus: string[]
  avoid: string[]
}

// A step's focus and avoid files now (the same replay as tools/planDoc.mjs's
// stepSteering, which writes them into plan.md).
export function stepMarks(events: readonly PlanActivityEvent[], stepId: string): StepMarks {
  const marks = new Map<string, 'focus' | 'avoid'>()
  for (const e of events) {
    if (e.stepId !== stepId || !e.steer || !e.path) continue
    if (e.steer === 'clear') marks.delete(e.path)
    else marks.set(e.path, e.steer)
  }
  return {
    focus: [...marks].filter(([, v]) => v === 'focus').map(([p]) => p),
    avoid: [...marks].filter(([, v]) => v === 'avoid').map(([p]) => p),
  }
}

export type FlagKind = 'avoided' | 'looping' | 'off-step' | 'stalled'
export interface SteerFlag {
  kind: FlagKind
  text: string
  path?: string
}

export const LOOP_EDITS_AT = 3
export const STALL_READS_AT = 15
const SEVERITY: Record<FlagKind, number> = { avoided: 3, looping: 2, 'off-step': 1, stalled: 0 }
// Bookkeeping files an agent edits as a matter of course: never "off-step".
const OFF_STEP_EXEMPT = /^(\.planning|\.sleipnir|\.claude|\.codex|\.gemini)\/|(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/

export function steeringFlags({
  entries,
  since,
  stepFiles,
  marks,
}: {
  entries: readonly TrailEntry[]
  /** When the step went in progress: only what happened after counts. */
  since: number
  /** The files the step plans, edits or has changed. */
  stepFiles: readonly string[]
  marks: StepMarks
}): SteerFlag[] {
  const own = new Set(stepFiles)
  const avoid = new Set(marks.avoid)
  const flags: SteerFlag[] = []
  const seen = new Set<string>()
  const flag = (f: SteerFlag) => {
    const key = `${f.kind}:${f.path ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    flags.push(f)
  }
  const editsWhileFailing = new Map<string, number>()
  let failing = false
  let readsSinceEdit = 0
  for (const e of entries) {
    if (e.at < since) continue
    if (e.kind === 'tested') failing = e.ok === false ? true : e.ok === true ? false : failing
    if (e.kind === 'read' || e.kind === 'search') readsSinceEdit++
    if (e.kind !== 'edit') continue
    readsSinceEdit = 0
    for (const p of e.paths ?? []) {
      if (avoid.has(p)) flag({ kind: 'avoided', path: p, text: `Edited ${p}, which you marked don't touch` })
      if (failing) {
        const n = (editsWhileFailing.get(p) ?? 0) + 1
        editsWhileFailing.set(p, n)
        if (n >= LOOP_EDITS_AT) flag({ kind: 'looping', path: p, text: `Stuck? ${p} edited ${n} times while tests keep failing` })
      }
      if (own.size && !own.has(p) && !OFF_STEP_EXEMPT.test(p)) flag({ kind: 'off-step', path: p, text: `Working outside its step: ${p}` })
    }
  }
  if (readsSinceEdit >= STALL_READS_AT) flag({ kind: 'stalled', text: `${readsSinceEdit} reads and searches without an edit` })
  return flags.sort((a, b) => SEVERITY[b.kind] - SEVERITY[a.kind])
}
