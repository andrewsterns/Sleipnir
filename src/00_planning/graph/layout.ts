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

export const nodeRadius = (node: SimNode): number => (node.kind === 'proposed' ? 4 : 6)

// How far from its step a newly appearing planned-file placeholder is seeded.
const PLANNED_FILE_SEED_DISTANCE = 60

export interface ForceLayout {
  /** Every drawable link, sequence links included. */
  simLinks: SimLink[]
  simNodes: SimNode[]
  simulation: Simulation<SimNode>
  neighbors: Map<string, Set<string>>
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

  const idSet = new Set(nodes.map((n) => n.id))
  const filteredEdges = data.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
  const links: SimLink[] = filteredEdges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }))
  // Sequence links describe work order, not structure — pulling them tight
  // would drag a long plan into a single line across the architecture.
  const structuralLinks = links.filter((l) => l.kind !== 'sequence')

  const neighborMap = new Map<string, Set<string>>()
  for (const edge of filteredEdges) {
    if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set())
    if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set())
    neighborMap.get(edge.source)!.add(edge.target)
    neighborMap.get(edge.target)!.add(edge.source)
  }

  const sim: Simulation<SimNode> = forceSimulation(nodes, 2)
    .force('charge', forceManyBody<SimNode>().strength(-360))
    .force('link', forceLink<SimNode, SimLink>(structuralLinks).id((n) => n.id).distance(140).strength(0.4))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>((n) => nodeRadius(n) + 26))
    .stop()

  return { simNodes: nodes, simLinks: links, simulation: sim, neighbors: neighborMap }
}
