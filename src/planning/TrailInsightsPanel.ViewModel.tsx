import { useMemo, useState } from 'react'
import type { TrailInsights } from './graph/trailInsights'

export interface TrailInsightsPanelProps {
  insights: TrailInsights
  /** Select and center the node showing a file. */
  onSelectPath: (path: string) => void
}

// How many files the "most effort" list shows.
export const TOP_FILES = 8

// The effort report beside the graph: one agent session at a time (the most
// recent first), its numbers, what stands out, and the files its effort went to.
export function useTrailInsightsPanelViewModel({ insights }: TrailInsightsPanelProps) {
  const sessions = useMemo(() => [...insights.sessions].sort((a, b) => b.end - a.end), [insights])
  const [index, setIndex] = useState(0)
  const session = sessions[Math.min(index, sessions.length - 1)] ?? null
  const findings = useMemo(() => (session ? insights.findings.filter((f) => f.agent === session.agent) : []), [insights, session])
  const topFiles = insights.effort.slice(0, TOP_FILES)
  const maxScore = topFiles[0]?.score ?? 1
  return {
    sessions,
    session,
    index: Math.min(index, Math.max(0, sessions.length - 1)),
    older: () => setIndex((i) => Math.min(i + 1, sessions.length - 1)),
    newer: () => setIndex((i) => Math.max(i - 1, 0)),
    findings,
    topFiles,
    maxScore,
  }
}
