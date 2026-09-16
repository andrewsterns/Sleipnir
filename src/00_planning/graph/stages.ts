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
  /** Draws a small solid dot inside the outline ring. */
  centerDot?: boolean
}

// Dash patterns are written against this normalized circumference (SVG
// `pathLength`), so '3 1' is exactly three dashes at any radius — graph node
// or list-row glyph alike.
export const STAGE_PATH_LENGTH = 12

// The whole lifecycle, in the order the card's toggle renders it:
//   Proposed    — created in a plan, or started in a frame/Workspace (the default)
//   In Progress — code has been saved into it (automatic; see promoteFileStages)
//   In Review   — being checked/tested, set by hand or by an AI review
//   Done        — parked until reopened or deleted
// 'completed' keeps its id so existing stages.json files stay valid.
export const NODE_STAGES: StageConfig[] = [
  // All in the theme's ink; the shape alone carries the stage:
  // three dashes → solid ring → ring with a center dot → filled dot.
  { id: 'proposed',    label: 'Proposed',    color: 'var(--text-1)', fill: 'none',  dash: '3 1',     strokeWidth: 1.5 },
  { id: 'in-progress', label: 'In Progress', color: 'var(--text-1)', fill: 'none',  dash: undefined, strokeWidth: 1.5 },
  { id: 'in-review',   label: 'In Review',   color: 'var(--text-1)', fill: 'none',  dash: undefined, strokeWidth: 1.5, centerDot: true },
  { id: 'completed',   label: 'Done',        color: 'var(--text-1)', fill: 'solid', dash: undefined, strokeWidth: 0 },
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
