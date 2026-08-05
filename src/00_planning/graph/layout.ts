// Force-layout setup shared by GraphCanvas (interactive, ticked live via RAF)
// and any non-interactive "mini preview" of the same graph (ticked
// synchronously once, then rendered as a static snapshot) — one source of
// truth for how nodes get positioned, so a mini preview's layout genuinely
// matches what the real graph would show.
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d'
import type { Simulation } from 'd3-force-3d'
import type { GraphData, GraphNode } from './types'

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
  source: string | SimNode
  target: string | SimNode
}

export const linkNode = (endpoint: string | SimNode, nodes: SimNode[]): SimNode | undefined =>
  typeof endpoint === 'string' ? nodes.find((n) => n.id === endpoint) : endpoint

export const linkId = (endpoint: string | SimNode): string => (typeof endpoint === 'string' ? endpoint : endpoint.id)

export const nodeRadius = (node: SimNode): number => (node.kind === 'proposed' ? 4 : 6)

export interface ForceLayout {
  simNodes: SimNode[]
  simLinks: SimLink[]
  simulation: Simulation<SimNode>
  neighbors: Map<string, Set<string>>
}

export function buildForceLayout(data: GraphData): ForceLayout {
  const nodes: SimNode[] = data.nodes.map((n: GraphNode, i: number) => {
    const angle = (i / Math.max(1, data.nodes.length)) * Math.PI * 2
    const spread = 40 + Math.sqrt(data.nodes.length) * 20
    return { ...n, x: Math.cos(angle) * spread, y: Math.sin(angle) * spread }
  })
  const idSet = new Set(nodes.map((n) => n.id))
  const filteredEdges = data.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
  const links: SimLink[] = filteredEdges.map((e) => ({ source: e.source, target: e.target }))

  const neighborMap = new Map<string, Set<string>>()
  for (const edge of filteredEdges) {
    if (!neighborMap.has(edge.source)) neighborMap.set(edge.source, new Set())
    if (!neighborMap.has(edge.target)) neighborMap.set(edge.target, new Set())
    neighborMap.get(edge.source)!.add(edge.target)
    neighborMap.get(edge.target)!.add(edge.source)
  }

  const sim: Simulation<SimNode> = forceSimulation(nodes, 2)
    .force('charge', forceManyBody<SimNode>().strength(-360))
    .force('link', forceLink<SimNode, SimLink>(links).id((n) => n.id).distance(140).strength(0.4))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<SimNode>((n) => nodeRadius(n) + 26))
    .stop()

  return { simNodes: nodes, simLinks: links, simulation: sim, neighbors: neighborMap }
}
