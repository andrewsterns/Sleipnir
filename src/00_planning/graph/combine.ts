import dsmGenerated from './generated/dsm.json'
import prototypesGenerated from './generated/prototypes.json'
import researchGenerated from './generated/research.json'
import validationGenerated from './generated/validation.json'
import { PROPOSED } from './proposed-nodes'
import type { GraphData, GraphMapId, GraphNode } from './types'
import { isArchived, type ArchiveEntry } from '../api/sleipnirApi'

// `todo` has no source files to scan — its nodes are always hand-authored
// in `proposed-nodes.ts`, so it gets an empty generated graph rather than a
// generated/todo.json produced by tools/generate-graph.mjs.
const GENERATED: Record<GraphMapId, GraphData> = {
  dsm: dsmGenerated as GraphData,
  prototypes: prototypesGenerated as GraphData,
  research: researchGenerated as GraphData,
  validation: validationGenerated as GraphData,
  todo: { nodes: [], edges: [] },
}

function combine(generated: GraphData, map: GraphMapId): GraphData {
  const proposed = PROPOSED[map]
  return {
    nodes: [...generated.nodes, ...proposed.nodes],
    edges: [...generated.edges, ...proposed.edges],
  }
}

export function getGraphForMap(map: GraphMapId): GraphData {
  return combine(GENERATED[map], map)
}

// Dev-only: re-fetch a freshly regenerated graph JSON straight from disk,
// bypassing the static import above (which only reflects what was on disk
// at build time). Used after scaffolding a new component so it shows up
// without a full page reload.
export async function refreshGraphForMap(map: GraphMapId): Promise<GraphData> {
  // `todo` has no generated/todo.json on disk (nothing to re-fetch) — its
  // nodes only ever come from the hand-authored PROPOSED list.
  if (map === 'todo') return getGraphForMap(map)
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
