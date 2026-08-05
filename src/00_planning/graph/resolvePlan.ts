import { getGraphForMap } from './combine'
import { getGraphMaps } from './types'
import type { GraphData, GraphNode } from './types'

// Mirrors tools/generate-graph.mjs's toId(): only .ts/.tsx get their
// extension stripped from the node id — other languages keep it. Works
// uniformly on both FolderBrowserView path conventions (scope:'src' paths
// have no `src/` prefix to begin with; scope:'repo' paths under `src/` do)
// since the `src/` strip is a no-op when there's nothing to strip.
export function toGraphNodeId(path: string): string {
  return path.replace(/^src\//, '').replace(/\.(tsx|ts)$/, '')
}

// Unions every real map's nodes/edges into one lookup — "real" meaning
// whatever getGraphMaps() returns (Welcome, every registered library, the
// fixed doc maps). Saved plans are never added to getGraphMaps() (see
// App.tsx's plans state), so this never recurses into a plan's own data.
// Cross-map edges (e.g. a prototype borrowing a component) are only ever
// recorded in the importer's own generated JSON — see combine.ts/
// generate-graph.mjs — so resolving a node's neighbors correctly requires
// scanning every map, not just the one the seed node happens to live in.
function mergedMapGraph(): GraphData {
  const nodesById = new Map<string, GraphNode>()
  const edges: GraphData['edges'] = []
  for (const map of getGraphMaps()) {
    const graph = getGraphForMap(map.id)
    for (const node of graph.nodes) nodesById.set(node.id, node)
    edges.push(...graph.edges)
  }
  return { nodes: [...nodesById.values()], edges }
}

// One hop only — the seed ids plus whatever they directly borrow from or
// are borrowed by (both directions), not those neighbors' own neighbors in
// turn. Matches "add to plan" for a single component pulling in exactly the
// atoms it renders, not that component's whole dependency tree.
export function expandToNeighbors(seedIds: string[]): string[] {
  const { edges } = mergedMapGraph()
  const result = new Set(seedIds)
  for (const id of seedIds) {
    for (const edge of edges) {
      if (edge.source === id) result.add(edge.target)
      if (edge.target === id) result.add(edge.source)
    }
  }
  return [...result]
}

// A saved plan's graph, resolved fresh each time — never a frozen snapshot.
// Node/edge ids that no longer resolve (the underlying file was deleted or
// renamed since the plan was saved) simply drop out.
export function resolvePlanGraph(nodeIds: string[]): GraphData {
  const { nodes, edges } = mergedMapGraph()
  const idSet = new Set(nodeIds)
  return {
    nodes: nodes.filter((n) => idSet.has(n.id)),
    edges: edges.filter((e) => idSet.has(e.source) && idSet.has(e.target)),
  }
}
