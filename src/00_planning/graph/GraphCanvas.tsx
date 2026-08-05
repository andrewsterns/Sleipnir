import React, { useEffect, useMemo, useRef } from 'react'
import { forceCenter } from 'd3-force-3d'
import type { GraphData } from './types'
import { buildForceLayout, linkNode, linkId, nodeRadius } from './layout'

const NODE_COLOR = '#8a94a3'

const MIN_SCALE = 0.15
const MAX_SCALE = 4

// Pointer must move more than this (px) before a background pointer-down
// counts as a pan-drag rather than a plain click-to-deselect.
const CLICK_DRAG_THRESHOLD = 4

// Nodes render at a 4-6px radius, too small to click comfortably — pad the
// actual hit target well beyond the visible circle.
const NODE_HIT_PADDING = 12

export interface GraphCanvasProps {
  data: GraphData
  selectedId: string | null
  onSelectNode: (id: string) => void
  /** Double-click a node to jump to its component/prototype source. */
  onActivateNode?: (id: string) => void
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, selectedId, onSelectNode, onActivateNode }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<SVGGElement>(null)
  const nodeGroupRefs = useRef<Map<string, SVGGElement>>(new Map())
  const edgeRefs = useRef<Map<number, SVGLineElement>>(new Map())

  const view = useRef({ x: 0, y: 0, k: 1 })
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const drag = useRef<{ id: string } | null>(null)

  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const { simNodes, simLinks, simulation, neighbors } = useMemo(() => buildForceLayout(data), [data])

  // Center the simulation on the actual pixel size of the container.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      const rect = el.getBoundingClientRect()
      simulation.force('center', forceCenter(rect.width / 2, rect.height / 2))
      simulation.alpha(1).restart()
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [simulation])

  // Tick loop: stop once the layout has cooled, resume on drag/reheat.
  useEffect(() => {
    let raf = 0
    let running = true

    const render = () => {
      for (const node of simNodes) {
        const g = nodeGroupRefs.current.get(node.id)
        if (g) g.setAttribute('transform', `translate(${node.x ?? 0}, ${node.y ?? 0})`)
      }
      simLinks.forEach((edge, i) => {
        const line = edgeRefs.current.get(i)
        if (!line) return
        const s = linkNode(edge.source, simNodes)
        const t = linkNode(edge.target, simNodes)
        if (s && t) {
          line.setAttribute('x1', String(s.x ?? 0))
          line.setAttribute('y1', String(s.y ?? 0))
          line.setAttribute('x2', String(t.x ?? 0))
          line.setAttribute('y2', String(t.y ?? 0))
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
                stroke="#ffffff"
                strokeWidth={isSelectedEdge ? 1.5 : 1}
                opacity={dimmed ? 0.08 : isSelectedEdge ? 0.9 : 0.35}
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
                <circle
                  r={radius}
                  fill={isProposed ? 'none' : color}
                  stroke={color}
                  strokeWidth={isProposed ? 1.5 : 0}
                  strokeDasharray={isProposed ? '3 2' : undefined}
                  opacity={isProposed ? 0.7 : 0.9}
                />
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
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
