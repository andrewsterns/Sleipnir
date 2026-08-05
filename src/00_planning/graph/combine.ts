import { PROPOSED } from './proposed-nodes'
import type { GraphData, GraphMapId, GraphNode } from './types'
import { isArchived, type ArchiveEntry } from '../api/sleipnirApi'

// Vite-native glob import, resolved at build time — one JSON per registered
// library (plus research/validation) with zero per-library file edit ever
// needed here again, unlike the old fixed 4-static-import list. `todo` and
// `claude` have no source files to scan at all (`todo`'s nodes are always
// hand-authored in proposed-nodes.ts, `claude`'s are always AI-created plan
// nodes — see tools/sleipnir-backend.mjs#createPlanNode), so they're simply
// absent from this glob and fall through to the empty-graph default below.
const GENERATED_MODULES = import.meta.glob('./generated/*.json', { eager: true }) as Record<
  string,
  { default: GraphData }
>

function loadGenerated(map: GraphMapId): GraphData {
  const mod = GENERATED_MODULES[`./generated/${map}.json`]
  return mod ? mod.default : { nodes: [], edges: [] }
}

function combine(generated: GraphData, map: GraphMapId): GraphData {
  const proposed = PROPOSED[map] ?? { nodes: [], edges: [] }
  return {
    nodes: [...generated.nodes, ...proposed.nodes],
    edges: [...generated.edges, ...proposed.edges],
  }
}

export function getGraphForMap(map: GraphMapId): GraphData {
  return combine(loadGenerated(map), map)
}

// Dev-only: re-fetch a freshly regenerated graph JSON straight from disk,
// bypassing the static import above (which only reflects what was on disk
// at build time). Used after scaffolding a new component so it shows up
// without a full page reload.
export async function refreshGraphForMap(map: GraphMapId): Promise<GraphData> {
  // `todo`/`claude`/`welcome`/`open` have no generated/<map>.json on disk
  // (nothing to re-fetch) — their nodes only ever come from the hand-authored
  // PROPOSED list (`todo`, `welcome`) or runtime notes (`claude`'s plan
  // nodes, `open`'s opened-file nodes — see tools/sleipnir-backend.mjs).
  if (map === 'todo' || map === 'claude' || map === 'welcome' || map === 'open') return getGraphForMap(map)
  const res = await fetch(`/src/00_planning/graph/generated/${map}.json?t=${Date.now()}`)
  if (!res.ok) throw new Error(`Failed to refresh ${map} graph (${res.status})`)
  const generated = (await res.json()) as GraphData
  return combine(generated, map)
}

// A node is archived if its file lives under an archived path (Planning
// archives a component's whole folder, so every file in it — View,
// ViewModel, interface — moves together as one manifest entry).
function nodeArchivePath(node: GraphNode): string {
  const filePath = node.filePath?.replace(/^src\//, '') ?? node.id
  return filePath
}

export function partitionArchived(
  graph: GraphData,
  archivedEntries: ArchiveEntry[],
): { live: GraphData; archived: GraphNode[] } {
  const archived: GraphNode[] = []
  const liveNodes: GraphNode[] = []
  for (const node of graph.nodes) {
    if (isArchived(nodeArchivePath(node), archivedEntries)) archived.push(node)
    else liveNodes.push(node)
  }
  const liveIds = new Set(liveNodes.map((n) => n.id))
  const liveEdges = graph.edges.filter((e) => liveIds.has(e.source) && liveIds.has(e.target))
  return { live: { nodes: liveNodes, edges: liveEdges }, archived }
}
