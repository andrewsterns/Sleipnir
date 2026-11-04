import type { GraphNode, NodeStage } from './types'
import type { Tone } from './nodeTone'

// The status a node can be tagged with from the detail card — or by an agent
// reporting its progress — an axis independent of `kind` (built/proposed) and of
// a plan step's approval record (`status`). Persisted per node id in an overlay
// store (see backend getNodeStages/setNodeStage) so it works for *every* node,
// including the build-generated ones that aren't editable in notes.json.
//
// A status is drawn as its tone (graph/nodeTone.ts): a blue dashed ring when
// proposed, a blue ring in progress, a white dot when done. On the graph, git
// has the last word: a file with nothing uncommitted is drawn committed.
export interface StageConfig {
  id: NodeStage
  label: string
  tone: Tone
}

// Dash patterns are written against this normalized circumference (SVG
// `pathLength`), so '3 1' is exactly three dashes at any radius — graph node
// or list-row glyph alike.
export const STAGE_PATH_LENGTH = 12

// The whole lifecycle, in the order the card's toggle renders it. The ids are
// the three states an agent keeps its todo list in (see stepStatus.ts); the
// labels are what a person calls them:
//   Proposed    — drafted in a plan, waiting to be worked (the default)
//   In progress — being worked: an agent said so, a human approved it, or code
//                 was saved into it (automatic; see promoteFileStages)
//   Testing     — written, its tests running
//   Done        — finished, until reopened; committing it settles it
export const NODE_STAGES: StageConfig[] = [
  { id: 'pending', label: 'Proposed', tone: 'proposed' },
  { id: 'in_progress', label: 'In progress', tone: 'in_progress' },
  { id: 'testing', label: 'Testing', tone: 'testing' },
  { id: 'completed', label: 'Done', tone: 'done' },
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
