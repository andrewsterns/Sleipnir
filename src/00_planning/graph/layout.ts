// Force-layout setup shared by GraphCanvas (interactive, ticked live via RAF)
// and any non-interactive "mini preview" of the same graph (ticked
// synchronously once, then rendered as a static snapshot) — one source of
// truth for how nodes get positioned, so a mini preview's layout genuinely
// matches what the real graph would show.
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d'
import type { Simulation } from 'd3-force-3d'
import type { EdgeKind, GraphData, GraphNode } from './types'

export interface SimNode extends GraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export interface SimLink {
  // forceLink() resolves these from id strings to SimNode references in place
  // once the simulation initializes, so both shapes have to be handled.
  // Sequence links never enter forceLink, so theirs stay id strings.
  source: string | SimNode
  target: string | SimNode
  kind: EdgeKind
}

export const linkNode = (endpoint: string | SimNode, nodes: SimNode[]): SimNode | undefined =>
  typeof endpoint === 'string' ? nodes.find((n) => n.id === endpoint) : endpoint

export const linkId = (endpoint: string | SimNode): string => (typeof endpoint === 'string' ? endpoint : endpoint.id)

export const nodeRadius = (node: SimNode): number => (node.kind === 'proposed' ? 3 : 4)

// How far from its step a newly appearing planned-file placeholder is seeded.
const PLANNED_FILE_SEED_DISTANCE = 60

// How far from its already-placed neighbours any other new node is seeded —
// about half a link's rest length, so it settles outward rather than flying
// in from the rim and shoving the whole graph aside on its way.
const NEIGHBOR_SEED_DISTANCE = 70

export interface ForceLayout {
  /** Every drawable link, sequence links included. */
  simLinks: SimLink[]
  simNodes: SimNode[]
  simulation: Simulation<SimNode>
  neighbors: Map<string, Set<string>>
  /** Nodes that had a carried-over position (see NodePositions). 0 on a first build. */
  carriedCount: number
  /** Nodes that didn't — the ones a rebuild just added. */
  addedCount: number
}

// Position of a node carried over from a previous layout — see GraphCanvas's
// positionsRef. Seeding these back in lets the graph rebuild (on any data
// change) without scattering: nodes that still exist keep exactly where they
// were, so a change that doesn't alter topology (an edge-direction flip, a
// label/status edit) can render with the simulation cooled to a stop instead
// of reheating gravity.
export type NodePositions = Map<string, { x: number; y: number; vx: number; vy: number }>

export function buildForceLayout(data: GraphData, prev?: NodePositions): ForceLayout {
  const nodes: SimNode[] = data.nodes.map((n: GraphNode, i: number) => {
    const seed = prev?.get(n.id)
    if (seed) return { ...n, x: seed.x, y: seed.y, vx: seed.vx, vy: seed.vy }
    const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2
    const spread = 40 + Math.sqrt(data.nodes.length) * 20
    return { ...n, x: Math.cos(angle) * spread, y: Math.sin(angle) * spread }
  })

  // A planned file that just appeared starts beside the step that declared it
  // (golden-angle spread so siblings don't stack), not on the far rim.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  nodes.forEach((n, i) => {
    if (!n.stepId || prev?.has(n.id)) return
    const step = byId.get(n.stepId)
    if (!step) return
    const angle = i * 2.399963
    n.x = (step.x ?? 0) + Math.cos(angle) * PLANNED_FILE_SEED_DISTANCE
    n.y = (step.y ?? 0) + Math.sin(angle) * PLANNED_FILE_SEED_DISTANCE
  })

  const filteredEdges = data.edges.filter((e) => byId.has(e.source) && byId.has(e.target))
  // Sequence links describe work order, not structure — pulling them tight
  // would drag a long plan into a single line across the architecture. They
  // never enter forceLink, so nothing would ever resolve their endpoints to
  // nodes; doing it here once saves the tick loop a lookup per link per frame.
  const links: SimLink[] = filteredEdges.map((e) =>
    e.kind === 'sequence'
      ? { source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind }
      : { source: e.source, target: e.target, kind: e.kind },
  )
  const structuralLinks = links.filter((l) => l.kind !== 'sequence')

  const neighborMap = new Map<string, Set<string>>()
  for (const edge of filteredEdges) {
    if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set())
    if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set())
    neighborMap.get(edge.source)!.add(edge.target)
    neighborMap.get(edge.target)!.add(edge.source)
  }

  // Any other new node, on a rebuild (not a first build), starts beside the
  // neighbours it links to — the "pieces getting built" case: a scaffolded
  // file, an AI-streamed step, a node whose import was just saved. Without
  // this it seeds on the far rim of the circle and drags everything with it.
  const carriedCount = prev ? nodes.filter((n) => prev.has(n.id)).length : 0
  if (carriedCount > 0) {
    const placed = new Set(nodes.filter((n) => prev!.has(n.id) || (n.stepId && byId.has(n.stepId))).map((n) => n.id))
    nodes.forEach((n, i) => {
      if (placed.has(n.id)) return
      const anchors = [...(neighborMap.get(n.id) ?? [])].filter((id) => placed.has(id)).map((id) => byId.get(id)!)
      if (anchors.length === 0) return
      const cx = anchors.reduce((sum, a) => sum + (a.x ?? 0), 0) / anchors.length
      const cy = anchors.reduce((sum, a) => sum + (a.y ?? 0), 0) / anchors.length
      const angle = i * 2.399963
      n.x = cx + Math.cos(angle) * NEIGHBOR_SEED_DISTANCE
      n.y = cy + Math.sin(angle) * NEIGHBOR_SEED_DISTANCE
      n.vx = 0
      n.vy = 0
      // Later new nodes can anchor on this one — a chain of new files lands
      // as a chain, not as a pile on the first one's neighbour.
      placed.add(n.id)
    })
  }

  const sim: Simulation<SimNode> = forceSimulation(nodes, 2)
    .force('charge', forceManyBody<SimNode>().strength(-360))
    .force('link', forceLink<SimNode, SimLink>(structuralLinks).id((n) => n.id).distance(140).strength(0.4))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>((n) => nodeRadius(n) + 26))
    .stop()

  return { simNodes: nodes, simLinks: links, simulation: sim, neighbors: neighborMap, carriedCount, addedCount: nodes.length - carriedCount }
}
