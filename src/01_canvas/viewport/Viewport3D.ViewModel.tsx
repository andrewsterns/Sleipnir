import { useMemo, useState } from 'react'
import type { CanvasDoc, CanvasNode, CanvasRect, NodeId } from '../model/types'
import { isVectorNode } from '../model/types'
import { isPaintVisible } from '../model/paint'
import { cssColor } from '../model/cssValue'
import { guidePolyline } from '../model/pathGuide'
import { shapeOf } from '../geometry/shape'
import { flatMesh, type Mesh } from '../geometry/mesh'
import { extrude, revolve, sweep, triangleCount } from '../geometry/modifiers'
import { PX_PER_METER, type Placement3D } from '../scene3d/sceneTypes'
import { sceneBounds, type ViewName } from './cameraViews'

export interface Viewport3DProps {
  doc: CanvasDoc
  selectedIds: ReadonlySet<NodeId>
  /** null clears the selection; `additive` toggles the layer in it. */
  onSelect: (id: NodeId | null, additive: boolean) => void
  /** A top-level layer moved, turned or scaled in space by the gizmo. */
  onPlacementChange: (id: NodeId, space: Placement3D) => void
  /**
   * Where a layer really sits on the board (absolute, measured), when an
   * auto-layout parent placed it — the 3D view lays children out the same way
   * the 2D board does. Falls back to each layer's own rect.
   */
  rectOf?: (id: NodeId) => CanvasRect | null
}

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/** Every layer's geometry, found once per layer object — an unchanged layer keeps its mesh. */
const meshCache = new WeakMap<CanvasNode, { pathKey: unknown; w: number; h: number; mesh: Mesh | null }>()

/**
 * A layer's own geometry, in its plane (px, y up): its solid when it has one,
 * else its outline lying flat. A swept profile has none of its own — its tube
 * belongs to the path it follows (see sweepsAlong). Text has none yet.
 */
export function layerMesh(node: CanvasNode, doc: CanvasDoc, size: { w: number; h: number } = node.rect): Mesh | null {
  const solid = node.solid
  const pathKey = solid?.kind === 'sweep' ? findById(doc, solid.pathId) : null
  const cached = meshCache.get(node)
  if (cached && cached.pathKey === pathKey && cached.w === size.w && cached.h === size.h) return cached.mesh
  let mesh: Mesh | null = null
  const sized = size.w === node.rect.w && size.h === node.rect.h ? node : { ...node, rect: { ...node.rect, w: size.w, h: size.h } }
  const shape = shapeOf(sized)
  if (shape) {
    const box = { w: size.w, h: size.h }
    if (solid?.kind === 'extrude') mesh = extrude(shape, box, solid.depth * PX_PER_METER)
    else if (solid?.kind === 'revolve') mesh = revolve(shape, box, solid.axis, solid.angle, solid.steps)
    else if (solid?.kind === 'sweep') mesh = pathKey ? null : flatMesh(shape, box)
    else mesh = flatMesh(shape, box)
  }
  meshCache.set(node, { pathKey, w: size.w, h: size.h, mesh })
  return mesh
}

/** The tube a swept profile makes along `path`, in the path layer's plane (px, y up). */
export function sweptMesh(profile: CanvasNode, path: CanvasNode): Mesh | null {
  const shape = shapeOf(profile)
  if (!shape || !isVectorNode(path)) return null
  const { points, closed } = guidePolyline(path)
  // guidePolyline places the path in its parent's space; the tube lives in the path's own.
  const local = points.map((p) => ({ x: p.x - path.rect.x, y: p.y - path.rect.y }))
  return sweep(shape, { w: profile.rect.w, h: profile.rect.h }, local, closed)
}

/** For each path layer, the profiles swept along it — drawn as part of the path. */
export function sweepsAlong(doc: CanvasDoc): Map<NodeId, CanvasNode[]> {
  const out = new Map<NodeId, CanvasNode[]>()
  const visit = (nodes: CanvasNode[]) => {
    for (const n of nodes) {
      if (n.solid?.kind === 'sweep') out.set(n.solid.pathId, [...(out.get(n.solid.pathId) ?? []), n])
      if (n.kind === 'frame') visit(n.children)
    }
  }
  visit(doc.nodes)
  for (const c of doc.components) for (const v of c.variants) visit([v.root])
  return out
}

function findById(doc: CanvasDoc, id: NodeId): CanvasNode | null {
  const visit = (nodes: CanvasNode[]): CanvasNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      const hit = n.kind === 'frame' ? visit(n.children) : null
      if (hit) return hit
    }
    return null
  }
  return visit(doc.nodes)
}

// What a solid with no fill of its own is made of: a neutral clay, so it still reads as a form.
const CLAY = '#b9bcc4'

/**
 * A layer's surface: its topmost visible fill as a CSS color (gradients by
 * their first stop, images as clay until textures arrive), with the fill's and
 * layer's opacity. Null when there's nothing to draw — a frame with no fill is
 * just a container, as in 2D. Solids always have a surface.
 */
export function surfaceOf(node: CanvasNode): { css: string; opacity: number } | null {
  const fill = [...(node.style.fills ?? [])].reverse().find(isPaintVisible)
  const layer = node.style.opacity ?? 1
  if (!fill) return node.solid ? { css: CLAY, opacity: layer } : null
  const own = fill.opacity ?? 1
  if (fill.type === 'image') return { css: CLAY, opacity: own * layer }
  if (fill.type === 'linear' || fill.type === 'radial' || fill.type === 'angular') {
    return fill.stops.length ? { css: cssColor(fill.stops[0].color), opacity: own * layer } : null
  }
  return { css: cssColor(fill.color), opacity: own * layer }
}

/**
 * A CSS color (a theme token's var() included) as the concrete color three.js
 * needs, read back from the page's current theme.
 */
export function resolveCssColor(css: string): string {
  if (typeof document === 'undefined' || /^#[0-9a-f]{3,8}$/i.test(css)) return css
  const probe = document.createElement('span')
  probe.style.color = css
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved || CLAY
}

/** Triangles across the visible scene — the budget the toolbar shows. */
export function sceneTriangles(doc: CanvasDoc): number {
  let total = 0
  const sweeps = sweepsAlong(doc)
  const visit = (nodes: CanvasNode[]) => {
    for (const n of nodes) {
      if (n.hidden) continue
      const mesh = layerMesh(n, doc)
      if (mesh) total += triangleCount(mesh)
      for (const profile of sweeps.get(n.id) ?? []) {
        const tube = sweptMesh(profile, n)
        if (tube) total += triangleCount(tube)
      }
      if (n.kind === 'frame') visit(n.children)
    }
  }
  visit(doc.nodes)
  return total
}

export function useViewport3DViewModel({ doc, selectedIds }: Viewport3DProps) {
  const [view, setView] = useState<ViewName>('perspective')
  const [mode, setMode] = useState<GizmoMode>('translate')
  // Bumped to re-frame the camera on the scene (FIT, or a view switch).
  const [framing, setFraming] = useState(0)
  const bounds = useMemo(() => sceneBounds(doc), [doc])
  const sweeps = useMemo(() => sweepsAlong(doc), [doc])
  const triangles = useMemo(() => sceneTriangles(doc), [doc])
  const selected = selectedIds
  // The gizmo moves a top-level layer's plane; a child is placed by its parent's 2D layout.
  const only = selectedIds.size === 1 ? [...selectedIds][0] : null
  const gizmoTarget = only && doc.nodes.some((n) => n.id === only) ? only : null

  const chooseView = (next: ViewName) => {
    setView(next)
    setFraming((f) => f + 1)
  }

  return {
    view,
    chooseView,
    mode,
    setMode,
    framing,
    fit: () => setFraming((f) => f + 1),
    bounds,
    sweeps,
    triangles,
    selected,
    gizmoTarget,
  }
}
