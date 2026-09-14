import React, { useEffect, useMemo, useRef, useState } from 'react'
import { forceCenter } from 'd3-force-3d'
import type { GraphData, GraphNode, NodeStage } from './types'
import { stageConfig, nodeStageKey } from './stages'
import { buildForceLayout, linkNode, linkId, nodeRadius, type NodePositions } from './layout'
import { Icon, type IconName } from '../../app/UIKit/Icon/Icon'

const MIN_SCALE = 0.15
const MAX_SCALE = 4

// Pointer must move more than this (px) before a background pointer-down
// counts as a pan-drag rather than a plain click-to-deselect.
const CLICK_DRAG_THRESHOLD = 4

// Camera easing for selected-node centering: a very soft lerp with a deadzone
// so tiny node jitter does not shake the viewport. The lerp fraction and the
// per-frame max-step are both scaled per-flight by how far the camera has to
// travel (see followParamsForDistance) — a nearby node gets a slow, visible
// glide; a distant one cruises fast so it doesn't take forever to arrive.
const CAMERA_FOLLOW_DEADZONE = 2.5
const CAMERA_FOLLOW_EPSILON = 0.25

// Screen-space distance (px) below which a flight counts as "near" (slowest,
// most deliberate glide) and above which it counts as "far" (fastest cruise).
// Distances in between interpolate linearly across the NEAR/FAR pairs below.
const CAMERA_FOLLOW_NEAR_DISTANCE = 150
const CAMERA_FOLLOW_FAR_DISTANCE = 1500
const CAMERA_FOLLOW_NEAR_MAX_STEP = 3
const CAMERA_FOLLOW_FAR_MAX_STEP = 70
const CAMERA_FOLLOW_NEAR_LERP = 0.02
const CAMERA_FOLLOW_FAR_LERP = 0.09

function followParamsForDistance(distance: number): { lerp: number; maxStep: number } {
  const span = CAMERA_FOLLOW_FAR_DISTANCE - CAMERA_FOLLOW_NEAR_DISTANCE
  const t = Math.min(1, Math.max(0, (distance - CAMERA_FOLLOW_NEAR_DISTANCE) / span))
  return {
    lerp: CAMERA_FOLLOW_NEAR_LERP + t * (CAMERA_FOLLOW_FAR_LERP - CAMERA_FOLLOW_NEAR_LERP),
    maxStep: CAMERA_FOLLOW_NEAR_MAX_STEP + t * (CAMERA_FOLLOW_FAR_MAX_STEP - CAMERA_FOLLOW_NEAR_MAX_STEP),
  }
}

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

// Which icon represents a node in the NODES list + graph label. A code file
// (.tsx/.rs/.py/…) gets the generic file icon; a markdown note or a file-less
// idea node keeps the planning node glyph — its connection-line variant
// ('plan-node') when it has links, the plain ring ('plan-node-plain') when it
// doesn't. Deliberately no folder icon: a node is never a folder. Exported so
// PlanningView's NODES list and the graph label draw the same mark.
export function nodeIconName(node: Pick<GraphNode, 'filePath'>, linked: boolean): IconName {
  const ext = node.filePath?.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase()
  if (ext && ext !== 'md') return 'file'
  return linked ? 'plan-node' : 'plan-node-plain'
}

// The name shown for a node in the plan (graph label, NODES list, detail card,
// link lists) — always WITHOUT its file extension, since every call site
// appends fileExtLabel's badge right after (see the `${nodeDisplayLabel(node)}
// ${ext}` sites below); returning it here too would double it up on screen
// ("HelveticaNeueLight.ttf" + ".ttf").
//
// A scaffolded node (an architectural role + backing file, created via
// Planning's Add Node) shows its file's base name instead of the stored
// label, so a View, ViewModel, and Interface that share one base label read
// distinctly ("cartView", "cartViewModel", "cartInterface") and match the
// files on disk. `role` is present ONLY on those scaffolded nodes (see
// GraphNode.role) — the stored `label` deliberately stays the base name
// there (the import adapters re-derive each file's symbol from it via
// jsExportName/typeExportName, which append the role suffix themselves), so
// showing `label` directly would drop the role suffix, not double it.
//
// Everything else — notes, plan-steps, generated nodes, and workspace-asset
// nodes pulled in via "Add Assets" (resolveAssetPlan.ts, which sets `label`
// to the file's raw basename, extension included) — falls through to
// `label`, stripped of a trailing extension if it has one.
export function nodeDisplayLabel(node: Pick<GraphNode, 'label' | 'role' | 'filePath'>): string {
  if (node.role && node.filePath) {
    const base = node.filePath.split('/').pop() ?? node.filePath
    return base.replace(/\.[^./]+$/, '')
  }
  return node.filePath ? node.label.replace(/\.[^./]+$/, '') : node.label
}

export interface GraphCanvasProps {
  data: GraphData
  selectedId: string | null
  onSelectNode: (id: string) => void
  /**
   * Bump (e.g. `s => s + 1`) to explicitly center the camera on `selectedId`
   * right now — e.g. the NODES list's single-click (see PlanningView's
   * selectNodeRow). Selecting a node from *within* the graph itself (a plain
   * single-click, or the pointerdown that starts a drag) never auto-centers —
   * only this signal and a node's own double-click (below) do — so clicking
   * or dragging a node in the graph never fights the camera.
   */
  centerSignal?: number
  /** Per-node sprint stage overlay ({ [nodeId]: stage }) — drives each node's color + stroke (see graph/stages.ts). Passed separately from `data` on purpose: folding it in would rebuild the force layout on every tag change. Omit/empty = every node renders by its `kind` as before. */
  stages?: Record<string, NodeStage>
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, selectedId, onSelectNode, centerSignal, stages }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const viewportRef = useRef<SVGGElement>(null)
  const nodeGroupRefs = useRef<Map<string, SVGGElement>>(new Map())
  const edgeRefs = useRef<Map<number, SVGLineElement>>(new Map())

  const view = useRef({ x: 0, y: 0, k: 1 })
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const drag = useRef<{ id: string } | null>(null)
  const followNodeIdRef = useRef<string | null>(null)
  // Set once per flight (when a new node is selected — see the effect below),
  // not recomputed every frame, so the speed reflects the distance at the
  // moment of selection rather than easing as the camera gets closer.
  const followParamsRef = useRef<{ lerp: number; maxStep: number }>({
    lerp: CAMERA_FOLLOW_NEAR_LERP,
    maxStep: CAMERA_FOLLOW_NEAR_MAX_STEP,
  })

  // Hover only drives the node-label fill (see the item-state ladder below);
  // it's plain React state because enter/leave fire on boundary crossings, not
  // per-frame — positions still stream through refs in the tick loop, so a
  // hover re-render never disturbs the running simulation.
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
        }
      })
    }

    const tick = () => {
      if (!running) return
      simulation.tick()
      render()
      // Smoothly follow the selected node toward viewport center, while still
      // letting force-sim "gravity" animate the graph underneath.
      if (!pan.current && !drag.current && followNodeIdRef.current) {
        const target = simNodes.find((n) => n.id === followNodeIdRef.current)
        const rect = containerRef.current?.getBoundingClientRect()
        if (target && rect) {
          const tx = rect.width / 2 - (target.x ?? 0) * view.current.k
          const ty = rect.height / 2 - (target.y ?? 0) * view.current.k
          const dx = tx - view.current.x
          const dy = ty - view.current.y

          // Close enough — the camera has arrived. One-shot: stop following so
          // the node stays put and the canvas can be panned freely from here,
          // instead of the node springing back to center on every drag.
          if (Math.abs(dx) < CAMERA_FOLLOW_DEADZONE && Math.abs(dy) < CAMERA_FOLLOW_DEADZONE) {
            followNodeIdRef.current = null
            return
          }

          const { lerp, maxStep } = followParamsRef.current
          let stepX = dx * lerp
          let stepY = dy * lerp
          const stepMag = Math.hypot(stepX, stepY)
          if (stepMag > maxStep) {
            const s = maxStep / stepMag
            stepX *= s
            stepY *= s
          }

          view.current = {
            ...view.current,
            x: view.current.x + stepX,
            y: view.current.y + stepY,
          }
          if (Math.abs(dx) < CAMERA_FOLLOW_EPSILON && Math.abs(dy) < CAMERA_FOLLOW_EPSILON) {
            view.current = { ...view.current, x: tx, y: ty }
          }
          applyTransform()
        }
      }
      if (simulation.alpha() > 0.001 || drag.current || pan.current || followNodeIdRef.current) {
        raf = requestAnimationFrame(tick)
      }
    }

    render()
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [simNodes, simLinks, simulation, selectedId])

  const applyTransform = () => {
    const g = viewportRef.current
    if (g) g.setAttribute('transform', `translate(${view.current.x}, ${view.current.y}) scale(${view.current.k})`)
  }

  const wake = () => {
    simulation.alpha(0.3).restart()
  }

  // One-shot center-on-demand: snaps the camera to a node id, never called
  // automatically just because the selection changed (see centerSignal's doc
  // comment). Mirrored into a ref every render (same pattern as
  // selectedIdRef) rather than memoized, so both the centerSignal effect
  // below and a node's own onDoubleClick handler always call the freshest
  // version — closing directly over `simNodes`/`wake` would go stale the
  // moment `data` changes and rebuilds the simulation. The tick loop clears
  // followNodeIdRef the instant the camera arrives, and starting a
  // background pan cancels it too — so after the initial snap you can drag
  // the canvas around freely without the node springing back to the middle.
  const centerOnNodeRef = useRef<(id: string) => void>(() => {})
  centerOnNodeRef.current = (id: string) => {
    followNodeIdRef.current = id
    // Distance from where the camera is right now to the target node — "how
    // far away" it is from the current view, in screen px — sets this
    // flight's speed (see followParamsForDistance): far = fast, near = slow.
    const target = simNodes.find((n) => n.id === id)
    const rect = containerRef.current?.getBoundingClientRect()
    if (target && rect) {
      const tx = rect.width / 2 - (target.x ?? 0) * view.current.k
      const ty = rect.height / 2 - (target.y ?? 0) * view.current.k
      const distance = Math.hypot(tx - view.current.x, ty - view.current.y)
      followParamsRef.current = followParamsForDistance(distance)
    }
    wake()
  }

  // Fires centerOnNodeRef only when centerSignal actually bumps (the NODES
  // list's single-click, see PlanningView's selectNodeRow) — not on every
  // selectedId/data change, which is what makes a plain click in the graph
  // itself select without moving the camera.
  const prevCenterSignalRef = useRef(centerSignal)
  useEffect(() => {
    if (centerSignal === prevCenterSignalRef.current) return
    prevCenterSignalRef.current = centerSignal
    if (selectedIdRef.current) centerOnNodeRef.current(selectedIdRef.current)
  }, [centerSignal])

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
    if (followNodeIdRef.current) wake()
  }

  const handleBackgroundPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== svgRef.current) return
    // Taking manual control of the camera — cancel any in-progress center-on-
    // select so panning the canvas never yanks the selected node back to the
    // middle.
    followNodeIdRef.current = null
    // Deselecting happens on pointer-up (see handlePointerUp), once we know
    // this was a plain click and not the start of a pan-drag — otherwise
    // panning away from a selected node would close its card mid-drag.
    pan.current = { startX: e.clientX, startY: e.clientY, originX: view.current.x, originY: view.current.y, moved: false }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handleNodePointerDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    onSelectNode(id)
    // Note: no wake() here — selecting a node (a plain click) must never
    // reheat the simulation, or every click would jostle the whole layout.
    // Physics only wakes once an actual drag move happens, below.
    drag.current = { id }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      // Reheat only now, on the first confirmed drag movement — so other
      // nodes' collide/charge forces react to the node being dragged, but a
      // click that never moves the pointer leaves the layout untouched.
      wake()
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
      // current selection (and its card) locked in place. A pan never resumes
      // camera-follow (it was cleared on pan start), so the view stays exactly
      // where you dragged it.
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
              <path d="M2,1 L9,5 L2,9" fill="none" style={{ stroke: 'var(--graph-edge, #ffffff)' }} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
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
                // Theme-aware edge ink (--graph-edge: white on tactical dark,
                // near-black on light — see 00_themes/*.css) at half opacity —
                // `opacity` still fades unrelated edges further when a node is
                // selected, and applies to the arrowhead marker too (same element).
                style={{ stroke: 'var(--graph-edge, #ffffff)' }}
                // Thin link lines: the base edge drops from 1px → 0.5px, and a
                // highlighted (selected-node) edge from 1.5px → 1px, so the
                // graph reads as fine hairlines rather than heavy strokes.
                strokeWidth={isSelectedEdge ? 1 : 0.5}
                opacity={dimmed ? 0.08 : 0.5}
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
            const color = isSelected
              ? 'var(--graph-node-selected, #ffffff)'
              : isNeighbor
                ? 'var(--graph-node-neighbor, #9aa4ae)'
                : 'var(--graph-node, #8a94a3)'
            // Node-label chip follows the shared item-state ladder (the same
            // one list rows use, see item-states.css): selected = solid ink
            // fill; hover (the hovered node only) and a selected node's
            // neighbours (connected) = an ink outline with no fill (white on the
            // dark theme, near-black on light); idle = bare. Adjacency outlines
            // are deliberately a *selection* affordance, not a hover one — you
            // click a node to see what it links to, hovering just highlights the
            // one node under the pointer. Text is ground-coloured on the selected
            // fill, full ink on an outline state, 80% ink when idle.
            const isHovered = node.id === hoveredId
            const isOutlined = !isSelected && (isHovered || isNeighbor)
            const labelBg = isSelected ? 'rgb(var(--item-ink, 255,255,255))' : 'transparent'
            const labelStroke = isOutlined ? 'rgb(var(--item-ink, 255,255,255))' : 'none'
            const labelText = isSelected
              ? 'var(--item-ground, #000)'
              : isOutlined
                ? 'rgba(var(--item-ink, 255,255,255), 1)'
                : 'rgba(var(--item-ink, 255,255,255), 0.80)'
            const radius = nodeRadius(node)
            const isProposed = node.kind === 'proposed'
            const ext = fileExtLabel(node.filePath)
            const label = `${nodeDisplayLabel(node)}${ext}`
            const labelY = -(radius + 13)
            const labelHeight = 12
            // Monospace estimate is enough for an unreadability guard here.
            const labelWidth = Math.max(18, label.length * 5.6)
            // Leading type icon in the label: a file icon for code-backed nodes,
            // the node glyph otherwise (matches the NODES list). Content is
            // laid out left-aligned [icon][gap][text] and centred as a whole.
            const labelIconName = nodeIconName(node, (neighbors.get(node.id)?.size ?? 0) > 0)
            const labelIconSize = 10
            const labelIconGap = 3
            const contentWidth = labelIconSize + labelIconGap + labelWidth
            const contentLeft = -(contentWidth / 2)
            // A tagged stage renders as a real circle using its own fill/
            // stroke/dash (graph/stages.ts) — solid for 'completed', an
            // outline (dashed for todo/in-review) otherwise — always at the
            // same r={radius} every other node uses. StatusGlyph (the list-row/
            // card-toggle status icon) draws this exact same stroked/dashed/
            // filled circle at icon scale, so the mark reads identically
            // whether it's a dot on the graph canvas or a glyph in a list row.
            // Untagged nodes (any node kind besides a workspace-file, which
            // now always gets an explicit stage — see PlanningView.ViewModel's
            // default-fill effect) fall back to the same built/proposed look
            // as before.
            const stage = stageConfig(stages?.[nodeStageKey(node)])
            const circleStyle = stage
              ? { fill: stage.fill === 'solid' ? stage.color : 'none', stroke: stage.color }
              : { fill: isProposed ? 'none' : color, stroke: isProposed ? 'var(--text-1)' : color }
            const circleStrokeWidth = stage ? (stage.fill === 'solid' ? 0 : stage.strokeWidth) : isProposed ? 1.5 : 0
            return (
              <g
                key={node.id}
                ref={(el) => {
                  if (el) nodeGroupRefs.current.set(node.id, el)
                  else nodeGroupRefs.current.delete(node.id)
                }}
                onPointerDown={handleNodePointerDown(node.id)}
                // Double-click centers the camera on this node (it's already
                // selected — pointerdown above fired onSelectNode first) —
                // deliberately not "jump to file" anymore, so double-clicking
                // to steady the view for a drag never navigates away.
                onDoubleClick={() => centerOnNodeRef.current(node.id)}
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() => setHoveredId((h) => (h === node.id ? null : h))}
                // A discovered node (pulled in by the reference walk, never
                // explicitly added — see GraphNode.discovered) reads as
                // "context" rather than a first-class member of the plan: a
                // touch dimmer at rest, same full brightness as any other
                // node once it's selected or a selected node's neighbor.
                opacity={dimmed ? 0.25 : node.discovered && !isHighlighted ? 0.6 : 1}
                style={{ cursor: 'pointer' }}
              >
                <circle r={radius + NODE_HIT_PADDING} fill="transparent" pointerEvents="all" />
                {/* Selection ring for stage-tagged nodes only — the untagged
                    ones still signal selection by turning white (see `color`). */}
                {isSelected && stage && (
                  <circle r={radius + 4} fill="none" style={{ stroke: 'var(--graph-ring, #ffffff)' }} strokeWidth={1} opacity={0.9} />
                )}
                <circle
                  r={radius}
                  style={circleStyle}
                  strokeWidth={circleStrokeWidth}
                  strokeDasharray={stage?.dash}
                  opacity={0.9}
                />
                <rect
                  x={contentLeft - 7}
                  y={labelY - labelHeight / 2}
                  width={contentWidth + 14}
                  height={labelHeight}
                  rx={3}
                  style={{ fill: labelBg, stroke: labelStroke }}
                  strokeWidth={1}
                />
                {/* Type icon — inherits labelText via `color` so it flips with
                    the row-state ladder (ground on the selected fill, ink otherwise). */}
                <g transform={`translate(${contentLeft}, ${labelY - labelIconSize / 2})`} style={{ color: labelText, pointerEvents: 'none' }}>
                  <Icon name={labelIconName} size={labelIconSize} />
                </g>
                <text
                  x={contentLeft + labelIconSize + labelIconGap}
                  y={labelY}
                  textAnchor="start"
                  dominantBaseline="middle"
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  letterSpacing="0.05em"
                  style={{ pointerEvents: 'none', fill: labelText }}
                >
                  {label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
