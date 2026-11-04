// Types for the parts of trail.mjs the renderer imports (src/planning/graph/trailInsights.ts).
export interface TrailLine {
  at: number
  agent?: string
  session?: string
  kind: string
  paths?: string[]
  ok?: boolean
}

export interface TrailSession {
  agent: string
  session: string | null
  start: number
  end: number
  calls: number
  reads: number
  searches: number
  edits: number
  runs: number
  tests: number
  testFailures: number
  fixLoops: number
  readsBeforeFirstEdit: number
  longestSearchStreak: number
  rereads: { path: string; count: number }[]
}

export interface TrailFinding {
  agent: string
  path?: string
  text: string
}

export interface TrailInsights {
  sessions: TrailSession[]
  effort: { path: string; score: number }[]
  findings: TrailFinding[]
}

export declare const TRAIL_FILE: string
export declare function trailInsights(entries: readonly TrailLine[]): TrailInsights
