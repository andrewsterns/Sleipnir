import { useMemo } from 'react'
import { forceX, forceY } from 'd3-force-3d'
import { buildForceLayout, linkNode, linkId, type SimNode } from '../../00_planning/graph/layout'
import type { GraphData } from '../../00_planning/graph/types'
import type { ArchitectureBucket } from './RefactorPanelViewModel'

// A non-interactive glance at the dependency graph, colored AND clustered by
// which architecture bucket each node would land in — no pan/zoom/drag, just
// a static snapshot rendered once per architecture tab. The dependency
// topology (who imports whom) never changes between architectures — only
// which bucket a node belongs to does — so re-settling per tab isn't
// re-deriving new relationships, it's visualizing the actual thing that
// changes: which files get grouped together into which folder.
const SETTLE_TICKS = 300
const WIDTH = 220
const HEIGHT = 130
const PADDING = 10
const UNBUCKETED_COLOR = '#4a4f58'
const CLUSTER_RADIUS = 80
const CLUSTER_STRENGTH = 0.4

// A handful of loosely-coupled outlier nodes can otherwise stretch the true
// bounding box so far that the real (densely-connected) cluster shrinks to a
// speck in the middle. Framing on the 10th–90th percentile instead keeps the
// cluster legible; outliers just run past the edge and get clipped by the
// SVG viewport (its default overflow is hidden), which reads fine at this
// scale — an outlier or two clipping off is less misleading than the whole
// graph rendering as a dot.
function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx]
}

export interface MiniArchitectureGraphProps {
  data: GraphData
  buckets: ArchitectureBucket[]
  bucketColorForId: (id: string) => string | null
}

export function MiniArchitectureGraph({ data, buckets, bucketColorForId }: MiniArchitectureGraphProps) {
  // Re-settles per architecture (buckets changes identity each tab switch)
  // on purpose — the cluster anchors below are what actually differ between
  // tabs, and letting the simulation re-relax onto them is what makes
  // switching tabs visibly regroup nodes instead of only recoloring them.
  const laidOut = useMemo(() => {
    const bucketIndexById = new Map<string, number>()
    buckets.forEach((bucket, i) => {
      for (const id of bucket.nodeIds) bucketIndexById.set(id, i)
    })
    const anchor = (i: number) => {
      const angle = (i / Math.max(1, buckets.length)) * Math.PI * 2 - Math.PI / 2
      return { x: Math.cos(angle) * CLUSTER_RADIUS, y: Math.sin(angle) * CLUSTER_RADIUS }
    }

    const { simNodes, simLinks, simulation } = buildForceLayout(data)
    // A directly-linked View/ViewModel pair (e.g. a view importing its own
    // hook) would otherwise fight the cluster force at its default strength
    // and blur the separation between buckets — dampened here, for this
    // preview instance only, not in the shared layout GraphCanvas also uses.
    const linkForce = simulation.force('link') as { strength: (v: number) => unknown } | undefined
    linkForce?.strength(0.15)
    simulation
      .force(
        'clusterX',
        forceX<SimNode>((d) => {
          const i = bucketIndexById.get(d.id)
          return i === undefined ? 0 : anchor(i).x
        }).strength((d) => (bucketIndexById.has(d.id) ? CLUSTER_STRENGTH : 0.02)),
      )
      .force(
        'clusterY',
        forceY<SimNode>((d) => {
          const i = bucketIndexById.get(d.id)
          return i === undefined ? 0 : anchor(i).y
        }).strength((d) => (bucketIndexById.has(d.id) ? CLUSTER_STRENGTH : 0.02)),
      )
    for (let i = 0; i < SETTLE_TICKS; i++) simulation.tick()

    const xs = simNodes.map((n) => n.x ?? 0).sort((a, b) => a - b)
    const ys = simNodes.map((n) => n.y ?? 0).sort((a, b) => a - b)
    const minX = percentile(xs, 0.1)
    const maxX = percentile(xs, 0.9)
    const minY = percentile(ys, 0.1)
    const maxY = percentile(ys, 0.9)
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY)

    const project = (x: number, y: number) => ({
      x: PADDING + (x - minX) * scale,
      y: PADDING + (y - minY) * scale,
    })

    return {
      nodes: simNodes.map((n) => ({ id: n.id, ...project(n.x ?? 0, n.y ?? 0) })),
      links: simLinks.map((edge) => {
        const s = linkNode(edge.source, simNodes)
        const t = linkNode(edge.target, simNodes)
        return {
          key: `${linkId(edge.source)}-${linkId(edge.target)}`,
          from: s ? project(s.x ?? 0, s.y ?? 0) : { x: 0, y: 0 },
          to: t ? project(t.x ?? 0, t.y ?? 0) : { x: 0, y: 0 },
        }
      }),
    }
  }, [data, buckets])

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ display: 'block' }}>
      {laidOut.links.map((edge) => (
        <line
          key={edge.key}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="#ffffff"
          strokeWidth={0.5}
          opacity={0.12}
        />
      ))}
      {laidOut.nodes.map((node) => (
        <circle
          key={node.id}
          cx={node.x}
          cy={node.y}
          r={1.6}
          fill={bucketColorForId(node.id) ?? UNBUCKETED_COLOR}
          opacity={bucketColorForId(node.id) ? 0.95 : 0.35}
        />
      ))}
    </svg>
  )
}
