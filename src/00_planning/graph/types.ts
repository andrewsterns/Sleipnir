import librariesData from './libraries.json'
import type { IconName } from '../../app/UIKit/Icon/Icon'

// The 6 fixed, non-library "doc"/meta maps — never registered as libraries,
// always exist, never created/deleted by the user.
export type FixedMapId = 'welcome' | 'research' | 'validation' | 'todo' | 'claude' | 'open'

// A library map id is open-ended (whatever's registered in libraries.json),
// so GraphMapId is no longer a closed literal union — it's validated at
// runtime against the registry + the 4 fixed ids, not at compile time.
export type GraphMapId = string

export type LibraryKind = 'component' | 'prototype'

// Physical folder layouts Refactor can reorganize a component library into.
// Kept here (not just in PlatformAPI.ts) since LibraryEntry needs it and
// types.ts has no dependency on the API layer.
export type Architecture = 'atomic' | 'mvvm' | 'mvc' | 'mvp'
export type ScaffoldLanguage = 'typescript' | 'python' | 'rust' | 'go'

export interface LibraryEntry {
  id: string
  kind: LibraryKind
  label: string
  /** Relative to src/, e.g. '02_components' or '02_components_myLibrary'. */
  root: string
  architecture: Architecture
  language: ScaffoldLanguage
  createdAt: number
}

// Static at build time (mirrors how combine.ts sources generated/*.json) —
// Phase B adds a runtime refresh path (listLibraries()) for "just created a
// library, show it without a full reload," the same way regenerateGraph()
// already works for generated node data.
export const LIBRARIES: LibraryEntry[] = librariesData as LibraryEntry[]

// A named, persisted list of existing graph node ids — created via a
// widget's "add to plan" hover action (see graph/resolvePlan.ts for how
// nodeIds gets built: the seed node(s) plus their direct neighbors). Not a
// LibraryEntry (no folder on disk) and not an AI createPlanNode draft (no
// map/status, doesn't live in notes.json) — it only ever *references* real
// nodes, fetched fresh each time its tab is opened, never a frozen copy.
export interface SavedPlan {
  id: string
  label: string
  nodeIds: string[]
  createdAt: number
}

export type NodeKind = 'built' | 'proposed'

// Only set on AI-created plan nodes (see tools/sleipnir-backend.mjs#createPlanNode).
// Undefined means "not a plan node" — every existing node (generated, proposed,
// hand-typed note) has no status and must keep rendering exactly as it does today.
export type NodeStatus = 'draft' | 'approved' | 'done'

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
  { id: 'claude', label: 'CLAUDE' },
  { id: 'open', label: 'Open Editors' },
]

// Welcome first (the default landing tab for a fresh Planning session — see
// usePlanningViewModel's initial mapId), then every registered library (in
// registry order — dsm/prototypes first since they're seeded first), then
// the remaining fixed maps — matching today's existing tab order for
// everything after Welcome.
export function getGraphMaps(): { id: string; label: string }[] {
  return [WELCOME_MAP, ...LIBRARIES.map((lib) => ({ id: lib.id, label: lib.label })), ...FIXED_GRAPH_MAPS]
}

// NavRail widgets — a level above LibraryEntry: libraries only ever add tabs
// *inside* the Components/Prototypes rail items, these add whole new rail
// items. 'folder' widgets browse a directory — either src/-scoped
// (rootScope 'src', editable) or repo-scoped (rootScope 'repo', read-only —
// e.g. Docker's docker/ folder, browsed via tools/sleipnir-backend.mjs's
// listRepoDir/readRepoFile). 'tool' widgets would talk to an external
// process/tool directly (e.g. running `docker ps`/`nx` commands) instead of
// a filesystem tree — not built yet, toolId is reserved so WidgetEntry
// doesn't need reshaping when they land.
export type WidgetKind = 'folder' | 'tool'

// Deliberately NOT statically imported from widgets.json the way LIBRARIES
// imports libraries.json above — that only reflects a freshly-created entry
// today by accident of Vite dev-mode HMR reloading the page on file change,
// which doesn't happen in a packaged Electron build. Widgets must always be
// fetched at runtime via listWidgets() and held in React state.
export interface WidgetEntry {
  id: string
  kind: WidgetKind
  label: string
  tag: string
  icon: IconName
  createdAt: number
  /** kind === 'folder': path passed to listDir (rootScope 'src') or listRepoDir (rootScope 'repo'). */
  root?: string
  rootScope?: 'src' | 'repo'
  /** kind === 'folder', rootScope 'repo' only: extra repo-relative file paths spliced in as top-level siblings of `root`'s contents — e.g. Docker's root is the `docker/` folder, but docker-compose.yml lives one level up at the repo root. */
  extraFiles?: string[]
  /** kind === 'folder': how (or whether) to render a preview above the code editor — mirrors DesignLibrary's curated/AutoPreview/none tiers. */
  previewStrategy?: 'curated' | 'auto' | 'none'
  /** kind === 'folder': hides create/archive/edit affordances — every repo-scoped widget (e.g. Docker) sets this true today. */
  readOnly?: boolean
  /** kind === 'tool': which built-in adapter renders this widget's content. Not built yet. */
  toolId?: 'docker' | 'nx'
}

// One entry in the Widget Store's browsable catalog. Lives here (not
// PlatformAPI.ts) so it can reference WidgetEntry directly via an inline
// Omit — PlatformAPI.ts's NewWidgetInput is that same Omit, defined
// separately to avoid a types.ts <-> PlatformAPI.ts import cycle (PlatformAPI
// needs WidgetCatalogEntry for getWidgetCatalog's return type).
//
// Fetched from tools/widget-catalog.mjs (backed today by widget-catalog.json
// on disk), not statically imported — the whole point of moving it out of a
// compiled TS array is that growing the catalog to hundreds of entries never
// requires an app rebuild, and swapping the backend reader for a real
// fetch(remoteURL) later is a one-function change, not a re-architecture.
export interface WidgetCatalogEntry {
  id: string
  label: string
  description: string
  /** Free-text grouping shown as filter chips in the store (e.g. "Containers", "Build Tools") — not a closed enum, so new categories need no code change. */
  category: string
  icon: IconName
  entry: Omit<WidgetEntry, 'createdAt'>
}
