import type { ArchitectureId, LanguageId, NodeRole } from './architectures'

// The 5 fixed maps — always exist, never created/deleted by the user.
export type FixedMapId = 'welcome' | 'research' | 'validation' | 'todo' | 'claude'

// Also holds a SavedPlan's id when a plan tab is active (see PlanningView's
// `mapId`), so this stays a plain string rather than a closed FixedMapId
// union.
export type GraphMapId = string

// A named, persisted list of existing graph node ids — created via a
// widget's "add to plan" hover action (see graph/resolvePlan.ts for how
// nodeIds gets built: the seed node(s) plus their direct neighbors). Not an
// AI createPlanNode draft (no map/status, doesn't live in notes.json) — it
// only ever *references* real nodes, fetched fresh each time its tab is
// opened, never a frozen copy.
export interface SavedPlan {
  id: string
  label: string
  nodeIds: string[]
  /** Workspace-relative paths written via "Generate Code" while this plan's tab was the active Planning tab. Optional — absent/empty for plans with no AI-generated files yet. See DeletePlanModal's "also delete workspace files" option. */
  generatedFiles?: string[]
  /** Workspace-relative paths this plan was seeded with via Workspace's "Add Plan" asset-filter flow, at creation time. Mutually exclusive with `nodeIds` in practice (a plan is either graph-node-based or asset-based), but both fields always exist on the type since a plan could in principle reference a mix. Superseded at view time by resolveAssetPlanGraph (graph/resolveAssetPlan.ts), which re-lists `assetFolders` fresh and re-scans every path's current content — this field is only the fallback for paths that were hand-picked outside any selected folder. */
  assetPaths?: string[]
  /** Top-level directories that were fully selected (every file under them checked) when this plan was created — see NewWorkspacePlanModal.ViewModel's `dirs`/`dirState`. Re-listed live by resolveAssetPlanGraph on every view/refresh, so files added under one of these folders after plan creation show up as new nodes automatically. Absent for plans seeded entirely from individually hand-picked files. */
  assetFolders?: string[]
  /** Import/require connections detected between `assetPaths` entries at creation time (see NewWorkspacePlanModal.ViewModel's detectEdges) — an initial-paint snapshot only. graphForPlan (PlanningView.ViewModel.tsx) renders this immediately for a flash-free first paint, then resolveAssetPlanGraph replaces it with a live re-scan of current file content. Best-effort: precise for JS/TS relative imports, coarser (basename-matched) for other languages — see graph/importAdapters/detectEdges.ts. */
  assetEdges?: { source: string; target: string }[]
  createdAt: number
  /** Scratch/exploratory flag set by tools/sleipnir-plan.mjs's --temporary — informational only today, nothing reads it back to change behavior. */
  temporary?: boolean
  /** Declared step count from tools/sleipnir-plan.mjs's --total-steps, when the authoring agent knows it up front — lets PlanBuildStatusBar show real N-of-M progress and a definitive completion moment instead of an indeterminate pulse + quiet-period guess. Absent when not declared. */
  expectedSteps?: number
}

export type NodeKind = 'built' | 'proposed'

// Only set on AI-created plan nodes (see tools/sleipnir-backend.mjs#createPlanNode).
// Undefined means "not a plan node" — every existing node (generated, proposed,
// hand-typed note) has no status and must keep rendering exactly as it does today.
export type NodeStatus = 'draft' | 'approved' | 'done'

// The sprint-ticket "stage" any node can be tagged with from the detail card —
// independent of both `kind` and the plan-step `status` above. Persisted per
// node id in an overlay store (backend getNodeStages/setNodeStage), not on the
// node's own record, so it applies to build-generated nodes too. See
// graph/stages.ts for the label + color + stroke each value renders as.
export type NodeStage = 'proposed' | 'todo' | 'in-progress' | 'in-review' | 'blocked' | 'completed'

export interface GraphNode {
  id: string
  label: string
  kind: NodeKind
  map: string
  filePath?: string
  type?: string
  description?: string
  status?: NodeStatus
  /** Groups plan-step nodes under the parent "plan" node that spawned them. */
  planId?: string
  /** Only set on nodes created via the "Add Node" modal's file-scaffolding branch (tools/sleipnir-backend.mjs#scaffoldNodes) — which MVVM/MVC/MVP role this node's file plays. Absent on every other node kind (notes, plan-steps, generated/proposed library nodes). */
  role?: NodeRole
  /** Paired with `role` — which of the app's 4 supported languages this scaffolded node's file is written in (see src/app/DesignSystem/codeEditorLanguages.ts). */
  language?: LanguageId
  /** Which architecture this node's batch was scaffolded under — informational (drives the node-card link editor's candidate filtering), not enforced afterward. */
  architecture?: ArchitectureId
  /** True only on an asset-plan node pulled in by the reference walk (see resolveAssetPlan.ts) rather than explicitly added to the plan — e.g. an atom a card component imports, never hand-picked itself. Absent (not false) on every explicitly-added node. */
  discovered?: boolean
  /** Set only on a plan-step node created via tools/sleipnir-plan.mjs's propose-file (see tools/sleipnir-backend.mjs#proposeFileNode) — a staged new-file proposal that hasn't touched real disk yet. `path` doesn't exist as a real Workspace file until a human reviews it (via the same staged-editor-tab flow generate_code uses) and explicitly saves. Absent on every other node kind. */
  proposedFile?: { path: string; content: string }
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'borrows' | 'plan-step'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Wire shape for the "Add Node" modal's bulk-create flow (see
// tools/sleipnir-backend.mjs#scaffoldNodes) — the renderer pre-renders every
// file's full content (see graph/templates) before this ever reaches the
// backend, which just writes bytes and creates nodes/edges atomically.
export interface ScaffoldEntry {
  label: string
  role: NodeRole
  /** Omitted for the Markdown root node — the "Node" role's `.md` doc has no programming language, so it's never same-language-linked to (or spliced into by) the code role files. See AddNodeModal.ViewModel. */
  language?: LanguageId
  description?: string
  /** Workspace-relative. */
  filePath: string
  content: string
  architecture?: ArchitectureId
}

/** Architecture-implied auto-link between two entries in the same batch — indices into the `entries` array passed to scaffoldNodes, not node ids (which don't exist yet client-side until the backend assigns them). */
export interface ScaffoldLink {
  from: number
  to: number
}

const WELCOME_MAP = { id: 'welcome' as FixedMapId, label: 'Welcome' }

// Labels here are deliberately distinct from same-named screens elsewhere in
// the app (App.tsx's top-level "Research" NAV_ITEMS category is a different
// page than this Planning-internal tagged-notes map; the hidden "Open
// Files" fallback category is a different screen than this Planning map of
// opened-file nodes) — collision was mostly dormant before these became
// commonly-hit quick-jump results (see PlanningView.ViewModel's nodeRows).
const FIXED_GRAPH_MAPS: { id: FixedMapId; label: string }[] = [
  { id: 'research', label: 'Research Notes' },
  { id: 'validation', label: 'Validation' },
  { id: 'todo', label: 'TODO' },
  { id: 'claude', label: 'AI' },
]

// Welcome first (the default landing tab for a fresh Planning session — see
// usePlanningViewModel's initial mapId), then the remaining fixed maps.
export function getGraphMaps(): { id: string; label: string }[] {
  return [WELCOME_MAP, ...FIXED_GRAPH_MAPS]
}
