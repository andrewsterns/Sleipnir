import { trailInsights, type TrailInsights } from '../../../tools/agentSkills/vendor/trail.mjs'
import { nodeForPath } from './agentTrail'
import type { GraphNode, TrailEntry } from './types'

// Where an agent's effort went, on the graph: the trail's insights (computed
// in tools/agentSkills/vendor/trail.mjs, the same numbers agents read with
// `analyze.mjs trail`) with each file's effort placed on the node showing it,
// scaled 0..1 for the heat layer. Costs no agent a token.

export type { TrailInsights }

export interface EffortView {
  insights: TrailInsights
  /** Node id -> its share of the effort, 0..1 (the busiest node is 1). */
  heat: Map<string, number>
}

// Below this share a node stays dark, so the heat shows where effort went
// rather than a haze over everything touched once.
export const EFFORT_MIN = 0.15

export function effortView(entries: readonly TrailEntry[], nodes: readonly GraphNode[]): EffortView {
  const insights = trailInsights(entries)
  const toNode = nodeForPath(nodes)
  const byNode = new Map<string, number>()
  for (const { path, score } of insights.effort) {
    const id = toNode(path)
    if (id) byNode.set(id, (byNode.get(id) ?? 0) + score)
  }
  const max = Math.max(0, ...byNode.values())
  const heat = new Map<string, number>()
  if (max > 0) {
    for (const [id, score] of byNode) {
      const share = Math.sqrt(score / max)
      if (share >= EFFORT_MIN) heat.set(id, share)
    }
  }
  return { insights, heat }
}
