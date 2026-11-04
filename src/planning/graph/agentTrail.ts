import type { GraphNode, TrailEntry } from './types'
import { folderId, folderKeyOf } from './architectureScope'

// The agent trail drawn on the graph: what agents are doing right now, from
// .planning/trail.jsonl (see tools/agentSkills/vendor/trail.mjs). Nothing here
// costs an agent a token — it's all read from what they already did.
//
//   read / search  a white corner box where its attention is
//   edit           a blue box on the file it's writing
//   test           a quick-blinking blue box on what it changed, while tests run
//
// The box it's on right now blinks (see FocusBox.tsx); the ones it left fade on
// their own clock, and a thin line follows the order it went from file to file:
// the shape of its thinking, a few seconds behind.

export type TrailKind = 'read' | 'edit' | 'test'

export interface TrailMark {
  kind: TrailKind
  /** 1 the moment it happened, fading to 0. */
  strength: number
  /** What the agent is on right now — its latest move, while it's fresh. */
  current?: boolean
}

// How long each kind of mark stays on the graph.
export const FADE_MS: Record<TrailKind, number> = { read: 8_000, edit: 20_000, test: 15_000 }
// When marks on the same file collide, the stronger signal shows.
const PRIORITY: Record<TrailKind, number> = { read: 0, edit: 1, test: 2 }
// How long the box holds on the agent's last move with nothing new after it.
export const HOLD_MS = 5 * 60_000
// The path line: the agent's last few stops, and how far back it reaches.
export const PATH_STEPS = 8
export const PATH_WINDOW_MS = 45_000
// What a test run lights: the files the agent changed in the minutes before.
const TESTED_WINDOW_MS = 180_000

function kindOf(entry: TrailEntry): TrailKind | null {
  if (entry.kind === 'read' || entry.kind === 'search' || entry.kind === 'instruction' || entry.kind === 'session') return 'read'
  if (entry.kind === 'edit') return 'edit'
  if (entry.kind === 'test') return 'test'
  return null
}

// Workspace path -> its mark now.
export function trailMarks(entries: readonly TrailEntry[], now: number): Map<string, TrailMark> {
  const marks = new Map<string, TrailMark>()
  const put = (path: string, kind: TrailKind, at: number) => {
    const strength = 1 - (now - at) / FADE_MS[kind]
    if (strength <= 0) return
    const current = marks.get(path)
    if (!current || PRIORITY[kind] > PRIORITY[current.kind] || (kind === current.kind && strength > current.strength)) {
      marks.set(path, { kind, strength: Math.min(1, strength) })
    }
  }
  let latest: string[] = []
  let latestKind: TrailKind | null = null
  let latestAt = 0
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const kind = kindOf(e)
    if (e.kind === 'idle') latestKind = null
    if (!kind) continue
    let paths = (e.paths ?? []).filter((p) => p !== '.')
    if (kind === 'test') {
      // A test run lights what this agent changed just before it.
      paths = []
      for (let j = i - 1; j >= 0 && e.at - entries[j].at <= TESTED_WINDOW_MS; j--) {
        const before = entries[j]
        if (before.kind === 'edit' && before.agent === e.agent) paths.push(...(before.paths ?? []))
      }
    }
    for (const p of paths) put(p, kind, e.at)
    latest = paths
    latestKind = kind
    latestAt = e.at
  }
  // The agent's latest move is where it is now: the box holds there until it
  // moves on or stops (or goes quiet for HOLD_MS).
  if (latestKind && now - latestAt < HOLD_MS) {
    for (const p of latest) {
      const mark = marks.get(p)
      if (mark) mark.current = true
      else marks.set(p, { kind: latestKind, strength: 0, current: true })
    }
  }
  return marks
}

// The agent's last few stops, oldest first, each file once.
export function trailPath(entries: readonly TrailEntry[], now: number): string[] {
  const path: string[] = []
  for (let i = entries.length - 1; i >= 0 && path.length < PATH_STEPS; i--) {
    const e = entries[i]
    if (now - e.at > PATH_WINDOW_MS) break
    if (e.kind !== 'read' && e.kind !== 'edit') continue
    for (const p of e.paths ?? []) if (p !== '.' && !path.includes(p)) path.push(p)
  }
  return path.slice(0, PATH_STEPS).reverse()
}

// What the most recent agent is doing, for the caption — while it's recent.
export function currentActivity(entries: readonly TrailEntry[], now: number, recentMs = 30_000): TrailEntry | null {
  const last = entries[entries.length - 1]
  if (!last || last.kind === 'idle' || now - last.at > recentMs) return null
  return last
}

// A workspace path -> the graph node showing it: the file's own node, or the
// folder it's collapsed into. Null when the graph doesn't show it at all.
export function nodeForPath(nodes: readonly GraphNode[]): (path: string) => string | null {
  const byPath = new Map<string, string>()
  const ids = new Set<string>()
  for (const n of nodes) {
    ids.add(n.id)
    if (n.filePath && !byPath.has(n.filePath)) byPath.set(n.filePath, n.id)
  }
  return (path) => {
    const own = byPath.get(path)
    if (own) return own
    const folder = folderId(folderKeyOf(path))
    return ids.has(folder) ? folder : null
  }
}

// Marks and path in node ids, ready for the canvas.
export interface TrailView {
  marks: Map<string, TrailMark>
  path: string[]
}

export function trailView(entries: readonly TrailEntry[], nodes: readonly GraphNode[], now: number): TrailView {
  const toNode = nodeForPath(nodes)
  const marks = new Map<string, TrailMark>()
  for (const [p, mark] of trailMarks(entries, now)) {
    const id = toNode(p)
    if (!id) continue
    const shown = marks.get(id)
    if (!shown || PRIORITY[mark.kind] > PRIORITY[shown.kind] || mark.strength > shown.strength) {
      marks.set(id, { ...mark, current: mark.current || shown?.current })
    } else if (mark.current) {
      shown.current = true
    }
  }
  const path: string[] = []
  for (const p of trailPath(entries, now)) {
    const id = toNode(p)
    if (id && path[path.length - 1] !== id) path.push(id)
  }
  return { marks, path }
}
