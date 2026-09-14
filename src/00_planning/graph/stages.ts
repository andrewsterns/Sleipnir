import type { GraphNode, NodeStage } from './types'

// The sprint-ticket "stage" a node can be tagged with from the detail card —
// an axis independent of `kind` (built/proposed) and of the AI plan-step
// `status` (draft/approved/done). Persisted per node id in an overlay store
// (see backend getNodeStages/setNodeStage) so it works for *every* node,
// including the build-generated ones that aren't editable in notes.json.
//
// Each stage owns a full graph look — color plus a stroke style (solid fill /
// solid outline / dashed / dotted) — so a node's state reads at a glance even
// zoomed out. When no stage is set a node falls back to its `kind` visual
// (built = solid grey dot, proposed = dashed grey ring), unchanged from before
// this feature.
export interface StageConfig {
  id: NodeStage
  label: string
  /** Stroke (and fill, when `fill: 'solid'`) color. */
  color: string
  /** 'solid' fills the circle; 'none' draws an outline-only ring in `color`. */
  fill: 'solid' | 'none'
  /** SVG strokeDasharray for the outline — undefined = an unbroken solid line. Ignored when `fill: 'solid'`. */
  dash?: string
  /** Outline width in graph units. Ignored when `fill: 'solid'`. */
  strokeWidth: number
}

// Ordered as a ticket typically flows (Proposed → To Do → In Progress → In
// Review → Completed), with Blocked as the off-path exception right before
// Completed. This order is what the card's toggle renders left-to-right.
export const NODE_STAGES: StageConfig[] = [
  // Proposed is the universal default (every untagged node/file reads as this).
  // A simple outline circle in the theme's ink — near-black on light, near-white
  // on dark — the quiet baseline state (an empty ring, not a filled dot).
  { id: 'proposed',    label: 'Proposed',    color: 'var(--text-1)', fill: 'none', dash: undefined, strokeWidth: 1.5 },
  { id: 'todo',        label: 'To Do',       color: '#6fa8dc', fill: 'none',  dash: '1 2.5', strokeWidth: 1.5 },
  { id: 'in-progress', label: 'In Progress', color: '#e0a040', fill: 'none',  dash: undefined, strokeWidth: 2 },
  { id: 'in-review',   label: 'In Review',   color: '#b48ead', fill: 'none',  dash: '5 3',   strokeWidth: 1.5 },
  { id: 'blocked',     label: 'Blocked',     color: '#e07a7a', fill: 'none',  dash: undefined, strokeWidth: 2 },
  { id: 'completed',   label: 'Completed',   color: '#7fbf7f', fill: 'solid', dash: undefined, strokeWidth: 0 },
]

const STAGE_BY_ID = new Map(NODE_STAGES.map((s) => [s.id, s]))

export function stageConfig(id?: NodeStage | null): StageConfig | undefined {
  return id ? STAGE_BY_ID.get(id) : undefined
}

// Synthetic stages.json key for a file with no backing plan/note node — lets
// any Workspace file carry a status without requiring it to be scaffolded
// into the planning graph first. Never collides with a real node id (those
// are always `note/...`, `plan/...`, `workspace-asset/...`; see
// sleipnirApi/tools/sleipnir-backend.mjs's id generation).
export function fileStageKey(path: string): string {
  return `file:${path}`
}

// The key a given node's stage is actually stored under. An asset-plan node
// (type: 'workspace-file' — a Workspace file pulled into a plan via "Add
// Assets" or the reference walk, see resolveAssetPlan.ts) is keyed by its
// FILE PATH, not its own id: that id is `workspace-asset/<planId>/<path>`,
// re-derived fresh (and re-namespaced per plan) on every resolve, so keying
// by it would silo the same file's status separately per plan and never
// agree with Workspace/Source Control's own `file:<path>` lookups (see
// useFileStages.ts) — editing a file's status in Workspace would then never
// show up in Planning, and vice versa. Every other node kind (scaffolded,
// note, AI plan-step) has a real, stable, plan-independent id and is keyed
// by that as before.
export function nodeStageKey(node: Pick<GraphNode, 'id' | 'type' | 'filePath'>): string {
  return node.type === 'workspace-file' && node.filePath ? fileStageKey(node.filePath) : node.id
}
