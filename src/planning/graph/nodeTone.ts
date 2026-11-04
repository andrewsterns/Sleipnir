import type { GraphNode, NodeStage } from './types'
import { nodeStageKey } from './stages'

// How a node and its lines are drawn: one tone that combines its status with
// git, told apart by shape alone — every graph mark is the one ink (white on
// dark themes, black on light), at full strength:
//
//   proposed     dashed ring  — a plan step, or a file a plan will create
//   in progress  ring         — being worked; uncommitted changes
//   testing      ring, boxed  — written, its tests running
//   done         dot          — finished, not yet committed
//   committed    small dot    — nothing uncommitted
export type Tone = 'proposed' | 'in_progress' | 'testing' | 'done' | 'committed'

export interface ToneStyle {
  label: string
  color: string
  /** 'solid' fills the dot; 'none' draws a ring. */
  fill: 'solid' | 'none'
  /** Ring dashes, against STAGE_PATH_LENGTH (graph/stages.ts). */
  dash?: string
}

const INK = 'var(--graph-node, #ffffff)'
export const TONE_STYLE: Record<Tone, ToneStyle> = {
  proposed: { label: 'Proposed', color: INK, fill: 'none', dash: '3 1' },
  in_progress: { label: 'In progress', color: INK, fill: 'none' },
  testing: { label: 'Testing', color: INK, fill: 'none' },
  done: { label: 'Done', color: INK, fill: 'solid' },
  committed: { label: 'Committed', color: INK, fill: 'solid' },
}

// The order the legend reads in, and how "active" each tone is: a line takes
// the more active of its two ends.
export const TONES: readonly Tone[] = ['proposed', 'in_progress', 'testing', 'done', 'committed']
// Testing outranks everything: while tests run, their paths are what to watch.
const RANK: Record<Tone, number> = { committed: 0, done: 1, in_progress: 2, proposed: 3, testing: 4 }

// A status alone, with nothing known about git: no status reads as settled.
export function toneOfStage(stage: NodeStage | null | undefined): Tone {
  if (stage === 'pending') return 'proposed'
  if (stage === 'in_progress') return 'in_progress'
  if (stage === 'testing') return 'testing'
  if (stage === 'completed') return 'done'
  return 'committed'
}

export interface ToneContext {
  stages: Readonly<Record<string, NodeStage>>
  /** Workspace paths git sees as changed or new. null when git isn't available: then status alone decides. */
  dirty: ReadonlySet<string> | null
  /** Whether a path exists on disk — known once the workspace is scanned. */
  exists?: (path: string) => boolean
  /** Step id -> every file it touches: the files it plans, edits and changed. */
  stepFiles?: ReadonlyMap<string, readonly string[]>
  /** Files a step in progress touches, in any plan: their uncommitted changes are that work. */
  workingFiles?: ReadonlySet<string>
  /** Files a step being tested touches, in any plan. */
  testingFiles?: ReadonlySet<string>
  /** Files only finished steps touch, in any plan: their uncommitted changes are done work waiting for a commit. */
  doneFiles?: ReadonlySet<string>
}

// From every plan's steps and statuses: the files each step touches, and which
// are being worked on or finished. A file both a working and a finished step
// touch is being worked on.
export function stepFileSets(
  steps: readonly GraphNode[],
  filesOf: (step: GraphNode) => readonly string[],
  stages: Readonly<Record<string, NodeStage>>,
): { workingFiles: Set<string>; testingFiles: Set<string>; doneFiles: Set<string> } {
  const workingFiles = new Set<string>()
  const testingFiles = new Set<string>()
  const doneFiles = new Set<string>()
  for (const s of steps) {
    const status = stages[s.id]
    if (status === 'in_progress') for (const p of filesOf(s)) workingFiles.add(p)
    else if (status === 'testing') for (const p of filesOf(s)) testingFiles.add(p)
    else if (status === 'completed') for (const p of filesOf(s)) doneFiles.add(p)
  }
  for (const p of [...workingFiles, ...testingFiles]) doneFiles.delete(p)
  return { workingFiles, testingFiles, doneFiles }
}

export function nodeTone(node: GraphNode, ctx: ToneContext): Tone {
  const stage = ctx.stages[nodeStageKey(node)]
  if (node.type === 'plan-step') {
    if (stage === 'in_progress') return 'in_progress'
    if (stage === 'testing') return 'testing'
    if (stage !== 'completed') return 'proposed'
    // Done until everything it touched is committed.
    const files = ctx.stepFiles?.get(node.id) ?? []
    return ctx.dirty && files.length > 0 && files.every((p) => !isUncommitted(ctx.dirty!, p)) ? 'committed' : 'done'
  }
  const path = node.filePath
  if (!path) return toneOfStage(stage)
  if (!ctx.dirty) return node.planned && !ctx.exists?.(path) ? 'proposed' : toneOfStage(stage)
  if (isUncommitted(ctx.dirty, path)) {
    // Uncommitted: done if it says so, or if only finished steps touch it.
    if (stage === 'completed') return 'done'
    if (stage === 'testing' || ctx.testingFiles?.has(path)) return 'testing'
    if (ctx.workingFiles?.has(path)) return 'in_progress'
    return ctx.doneFiles?.has(path) ? 'done' : 'in_progress'
  }
  // Clean: committed — unless it's a planned file that doesn't exist yet.
  return node.planned && !ctx.exists?.(path) ? 'proposed' : 'committed'
}

// Whether git sees a path as changed or new. git lists a new folder once, not
// each file in it, so a file under a listed folder counts too.
export function isUncommitted(dirty: ReadonlySet<string>, path: string): boolean {
  if (dirty.has(path)) return true
  for (let i = path.lastIndexOf('/'); i > 0; i = path.lastIndexOf('/', i - 1)) {
    if (dirty.has(path.slice(0, i))) return true
  }
  return false
}

export function edgeTone(a: Tone, b: Tone): Tone {
  return RANK[a] >= RANK[b] ? a : b
}
