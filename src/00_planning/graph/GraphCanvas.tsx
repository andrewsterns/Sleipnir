import React, { useEffect, useMemo, useRef } from 'react'
import { forceCenter } from 'd3-force-3d'
import type { GraphData, NodeStage } from './types'
import { stageConfig } from './stages'
import { buildForceLayout, linkNode, linkId, nodeRadius, type NodePositions } from './layout'

const NODE_COLOR = '#8a94a3'

const MIN_SCALE = 0.15
const MAX_SCALE = 4

// Pointer must move more than this (px) before a background pointer-down
// counts as a pan-drag rather than a plain click-to-deselect.
const CLICK_DRAG_THRESHOLD = 4

// Nodes render at a 4-6px radius, too small to click comfortably — pad the
// actual hit target well beyond the visible circle.
const NODE_HIT_PADDING = 12

// How far short of the target node's own edge an arrowhead's tip stops —
// purely cosmetic breathing room so the arrow doesn't visually merge into
// the node's stroke.
const ARROW_GAP = 7

// Matching breathing room on the source end — the line begins this far
// outside the source node's own radius instead of at its center, so it never
// visually touches the node it leaves from.
const SOURCE_GAP = 7

// The file extension a node's path ends in (".tsx", ".rs", …), or "" for a
// note with no backing file — appended to the label (dimmer) so a node reads
// as the actual file it represents at a glance. Exported so PlanningView's
// NODES list appends the exact same suffix, keeping graph + list names in sync.
export function fileExtLabel(filePath?: string): string {
  const m = filePath?.match(/\.([A-Za-z0-9]+)$/)
  return m ? `.${m[1]}` : ''
}

export interface GraphCanvasProps {
  data: GraphData
  selectedId: string | null
  onSelectNode: (id: string) => void
  /** Double-click a node to jump to its component/prototype source. */
  onActivateNode?: (id: string) => void
  /** Per-node sprint stage overlay ({ [nodeId]: stage }) — drives each node's color + stroke (see graph/stages.ts). Passed separately from `data` on purpose: folding it in would rebuild the force layout on every tag change. Omit/empty = every node renders by its `kind` as before. */
  stages?: Record<string, NodeStage>
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, selectedId, onSelectNode, onActivateNode, stages }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<SVGGElement>(null)
  const nodeGroupRefs = useRef<Map<string, SVGGElement>>(new Map())
  const edgeRefs = useRef<Map<number, SVGLineElement>>(new Map())
  // Each edge strokes with its own gradient (see the <linearGradient> defs
  // below) so the line can fade from a faint tail at the source to a bright
  // head at the target. userSpaceOnUse gradients don't follow their line
  // automatically, so their x1/y1/x2/y2 are pushed here on every tick right
  // alongside the line's own endpoints.
  const gradientRefs = useRef<Map<number, SVGLinearGradientElement>>(new Map())

  const view = useRef({ x: 0, y: 0, k: 1 })
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const drag = useRef<{ id: string } | null>(null)

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  // Live node positions, kept current by the tick loop (see render()). Seeded
  // back into every rebuild so a `data` change carries positions over instead
  // of scattering to a fresh circle — the basis for the no-reheat path below.
  const positionsRef = useRef<NodePositions>(new Map())

  const { simNodes, simLinks, simulation, neighbors } = useMemo(
    () => buildForceLayout(data, positionsRef.current),
    [data],
  )

  // What the force layout actually depends on: the set of nodes and the
  // *undirected* set of edges. A direction flip reverses an edge but leaves
  // this key identical, as does any pure metadata edit (label, status) — the
  // signal for whether a rebuild needs to reheat gravity or can render cooled.
  const topologyKey = useMemo(() => {
    const nodeKey = data.nodes.map((n) => n.id).sort().join(',')
    const edgeKey = data.edges
      .map((e) => (e.source < e.target ? `${e.source}~${e.target}` : `${e.target}~${e.source}`))
      .sort()
      .join(',')
    return `${nodeKey}|${edgeKey}`
  }, [data])
  const prevTopologyRef = useRef<string | null>(null)
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  // Center the simulation on the container, and decide whether this rebuild
  // reheats gravity. Only a real topology change (a node/edge added or removed)
  // or an actual container resize reheats; a same-topology rebuild — an
  // edge-direction flip, a metadata edit — keeps every node's carried-over
  // position and cools the fresh simulation to a stop, so the one-shot render
  // in the tick loop just redraws the changed edge in place.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    simulation.force('center', forceCenter(rect.width / 2, rect.height / 2))
    const sizeChanged = sizeRef.current.w !== rect.width || sizeRef.current.h !== rect.height
    sizeRef.current = { w: rect.width, h: rect.height }

    if (prevTopologyRef.current !== topologyKey) {
      prevTopologyRef.current = topologyKey
      simulation.alpha(1).restart()
    } else if (sizeChanged) {
      simulation.alpha(0.3).restart()
    } else {
      // A freshly built simulation defaults to alpha 1 — cool it so the tick
      // loop renders one frame at the seeded positions and then stops.
      simulation.alpha(0)
    }

    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      // ResizeObserver fires once on observe(); skip that no-op so it can't
      // sneak in a reheat right after a no-reheat rebuild.
      if (r.width === sizeRef.current.w && r.height === sizeRef.current.h) return
      sizeRef.current = { w: r.width, h: r.height }
      simulation.force('center', forceCenter(r.width / 2, r.height / 2))
      simulation.alpha(0.3).restart()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [simulation, topologyKey])

  // Tick loop: stop once the layout has cooled, resume on drag/reheat.
  useEffect(() => {
    let raf = 0
    let running = true

    const render = () => {
      for (const node of simNodes) {
        const g = nodeGroupRefs.current.get(node.id)
        if (g) g.setAttribute('transform', `translate(${node.x ?? 0}, ${node.y ?? 0})`)
        // Snapshot the live position so the next rebuild can seed from it.
        positionsRef.current.set(node.id, { x: node.x ?? 0, y: node.y ?? 0, vx: node.vx ?? 0, vy: node.vy ?? 0 })
      }
      simLinks.forEach((edge, i) => {
        const line = edgeRefs.current.get(i)
        if (!line) return
        const s = linkNode(edge.source, simNodes)
        const t = linkNode(edge.target, simNodes)
        if (s && t) {
          const sx = s.x ?? 0
          const sy = s.y ?? 0
          const tx = t.x ?? 0
          const ty = t.y ?? 0
          // Pull the endpoint back off the target node's own radius so the
          // arrowhead marker (see the <marker> def below) renders just
          // outside the circle instead of vanishing underneath it — nodes
          // paint on top of edges, so a marker placed at the raw center
          // would be fully hidden.
          const dx = tx - sx
          const dy = ty - sy
          const dist = Math.hypot(dx, dy) || 1
          const ux = dx / dist
          const uy = dy / dist
          // Both endpoints sit just outside their node's radius — the tail off
          // the source (SOURCE_GAP) and the head off the target (ARROW_GAP).
          const startPull = nodeRadius(s) + SOURCE_GAP
          const endPull = nodeRadius(t) + ARROW_GAP
          const bx = sx + ux * startPull
          const by = sy + uy * startPull
          const ex = tx - ux * endPull
          const ey = ty - uy * endPull
          line.setAttribute('x1', String(bx))
          line.setAttribute('y1', String(by))
          line.setAttribute('x2', String(ex))
          line.setAttribute('y2', String(ey))
          // Gradient runs source -> arrowhead end, matching the line exactly so
          // the bright stop lands right at the head.
          const grad = gradientRefs.current.get(i)
          if (grad) {
            grad.setAttribute('x1', String(bx))
            grad.setAttribute('y1', String(by))
            grad.setAttribute('x2', String(ex))
            grad.setAttribute('y2', String(ey))
          }
        }
      })
    }

    const tick = () => {
      if (!running) return
      simulation.tick()
      render()
      if (simulation.alpha() > 0.001 || drag.current) {
        raf = requestAnimationFrame(tick)
      }
    }

    render()
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [simNodes, simLinks, simulation])

  const applyTransform = () => {
    const g = viewportRef.current
    if (g) g.setAttribute('transform', `translate(${view.current.x}, ${view.current.y}) scale(${view.current.k})`)
  }

  const wake = () => {
    simulation.alpha(0.3).restart()
  }

  const toGraphPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const { x, y, k } = view.current
    return {
      x: (clientX - rect.left - x) / k,
      y: (clientY - rect.top - y) / k,
    }
  }

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x, y, k } = view.current
    const nextK = Math.min(MAX_SCALE, Math.max(MIN_SCALE, k * (e.deltaY < 0 ? 1.1 : 0.9)))
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    view.current = {
      k: nextK,
      x: px - ((px - x) / k) * nextK,
      y: py - ((py - y) / k) * nextK,
    }
    applyTransform()
  }

  const handleBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== svgRef.current) return
    // Deselecting happens on pointer-up (see handlePointerUp), once we know
    // this was a plain click and not the start of a pan-drag — otherwise
    // panning away from a selected node would close its card mid-drag.
    pan.current = { startX: e.clientX, startY: e.clientY, originX: view.current.x, originY: view.current.y, moved: false }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handleNodePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelectNode(id)
    drag.current = { id }
    wake()
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const node = simNodes.find((n) => n.id === drag.current!.id)
      if (node) {
        const p = toGraphPoint(e.clientX, e.clientY)
        node.fx = p.x
        node.fy = p.y
      }
      return
    }
    if (pan.current) {
      const dx = e.clientX - pan.current.startX
      const dy = e.clientY - pan.current.startY
      if (!pan.current.moved && Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) pan.current.moved = true
      view.current = {
        ...view.current,
        x: pan.current.originX + dx,
        y: pan.current.originY + dy,
      }
      applyTransform()
    }
  }

  const handlePointerUp = () => {
    if (drag.current) {
      const node = simNodes.find((n) => n.id === drag.current!.id)
      if (node) {
        node.fx = null
        node.fy = null
      }
      drag.current = null
    }
    if (pan.current) {
      // Only a real click (no movement) deselects — a pan-drag leaves the
      // current selection (and its card) locked in place.
      if (!pan.current.moved) onSelectNode('')
      pan.current = null
    }
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onWheel={handleWheel}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: 'grab', touchAction: 'none' }}
      >
        <g ref={viewportRef}>
          <defs>
            {/* One shared arrowhead for every edge — orient="auto-start-reverse"
                rotates it to match each line's own direction automatically, so
                it tracks the tick loop's live x1/y1/x2/y2 updates above with no
                extra JS. opacity/color on the referencing <line> itself applies
                to its marker too (per the SVG spec), so highlighted/dimmed
                edges don't need per-marker logic.

                markerUnits="userSpaceOnUse" decouples the head's size from the
                stroke width (default "strokeWidth" would tie a 1px stroke to a
                near-invisible ~3px head, and make selected 1.5px edges' heads
                jump in size) — so it stays a fixed, node-scaled size (~4.5 graph
                units) that scales with zoom via the parent viewport transform.
                An open (stroked, unfilled) chevron rather than a solid triangle,
                so it reads as a lightweight line-arrowhead. */}
            <marker id="graph-edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M2,1 L9,5 L2,9" fill="none" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            {/* One gradient per edge — coords pushed each tick (see render()).
                Faint tail at the source, bright head at the target, so the eye
                is pulled toward the arrowhead. The <line>'s own `opacity`
                multiplies these stops, so the dim/select states below still
                work on top of the fade. */}
            {simLinks.map((_, i) => (
              <linearGradient
                key={i}
                id={`graph-edge-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                ref={(el) => {
                  if (el) gradientRefs.current.set(i, el)
                  else gradientRefs.current.delete(i)
                }}
              >
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.01} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.2} />
              </linearGradient>
            ))}
          </defs>
          {simLinks.map((edge, i) => {
            const sourceId = linkId(edge.source)
            const targetId = linkId(edge.target)
            const hasSelection = selectedId != null && selectedId !== ''
            const isHighlighted = (id: string) =>
              id === selectedId || (neighbors.get(selectedId ?? '')?.has(id) ?? false)
            const isSelectedEdge = hasSelection && isHighlighted(sourceId) && isHighlighted(targetId)
            const dimmed = hasSelection && !isSelectedEdge
            return (
              <line
                key={`${sourceId}-${targetId}-${i}`}
                ref={(el) => {
                  if (el) edgeRefs.current.set(i, el)
                  else edgeRefs.current.delete(i)
                }}
                stroke={`url(#graph-edge-grad-${i})`}
                strokeWidth={isSelectedEdge ? 1.5 : 1}
                opacity={dimmed ? 0.08 : 1}
                markerEnd="url(#graph-edge-arrow)"
              />
            )
          })}
          {simNodes.map((node) => {
            const isSelected = node.id === selectedId
            const isNeighbor = selectedId != null && selectedId !== '' && neighbors.get(selectedId)?.has(node.id)
            const isHighlighted = isSelected || isNeighbor
            const dimmed = selectedId != null && selectedId !== '' && !isHighlighted
            // Selected node is brightest, its neighbors a step dimmer, everything
            // else falls back to the base grey (and fades further via `dimmed`).
            const color = isSelected ? '#ffffff' : isNeighbor ? '#9aa4ae' : NODE_COLOR
            const textColor = isSelected ? '#ffffff' : isNeighbor ? '#9aa4ae' : 'rgba(220,232,240,0.8)'
            const radius = nodeRadius(node)
            const isProposed = node.kind === 'proposed'
            const ext = fileExtLabel(node.filePath)
            // A tagged stage renders as its own status glyph (◌ ○ ◐ ◑ ⊘ ●, the
            // same marker the detail card's STATUS toggle shows, see
            // graph/stages.ts) in the stage's color, keeping that color even
            // while selected — the card that edits it is open exactly then, so
            // selection is shown by the ring below instead of the white swap.
            // Untagged nodes render exactly as before (built = solid grey dot,
            // proposed = dashed grey ring).
            const stage = stageConfig(stages?.[node.id])
            return (
              <g
                key={node.id}
                ref={(el) => {
                  if (el) nodeGroupRefs.current.set(node.id, el)
                  else nodeGroupRefs.current.delete(node.id)
                }}
                onPointerDown={handleNodePointerDown(node.id)}
                onDoubleClick={() => onActivateNode?.(node.id)}
                opacity={dimmed ? 0.25 : 1}
                style={{ cursor: 'pointer' }}
              >
                <circle r={radius + NODE_HIT_PADDING} fill="transparent" pointerEvents="all" />
                {/* Selection ring for stage-tagged nodes only — the untagged
                    ones still signal selection by turning white (see `color`). */}
                {isSelected && stage && (
                  <circle r={radius + 4} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.9} />
                )}
                {stage ? (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={radius * 2.6}
                    fill={stage.color}
                    opacity={0.95}
                    style={{ pointerEvents: 'none' }}
                  >
                    {stage.glyph}
                  </text>
                ) : (
                  <circle
                    r={radius}
                    fill={isProposed ? 'none' : color}
                    stroke={color}
                    strokeWidth={isProposed ? 1.5 : 0}
                    strokeDasharray={isProposed ? '3 2' : undefined}
                    opacity={isProposed ? 0.7 : 0.9}
                  />
                )}
                <text
                  y={-(radius + 6)}
                  textAnchor="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  letterSpacing="0.05em"
                  fill={textColor}
                  opacity={isHighlighted ? 1 : 0.75}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.label}
                  {ext && <tspan fillOpacity={0.5}>{ext}</tspan>}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
