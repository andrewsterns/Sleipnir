// What each layer is in 3D, without three.js: its mesh (the solid its modifier
// makes, or its outline lying flat), the tubes swept along a path, the color
// it is drawn in, and the scene's triangle count. Shared by the 3D viewport and
// the 2D board, which draws a solid as the front camera sees it
// (board/ProjectedSolid.tsx) — so neither needs the other's renderer.

import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { isVectorNode } from '../../document/types'
import { isPaintVisible } from '../../document/paint'
import { cssColor } from '../../document/cssValue'
import { guidePolyline } from '../../document/pathGuide'
import { shapeOf } from '../geometry/shape'
import { flatMesh, type Mesh } from '../geometry/mesh'
import { extrude, revolve, sweep, triangleCount } from '../geometry/modifiers'
import { PX_PER_METER } from '../../document/sceneTypes'
import { isRigid, type XY } from '../../document/rotation'
import { placementOf } from '../../document/placement'
import { frontFaces, frontMatrix, type FrontFace } from '../../document/frontView'
import { featureOf, objectsOf, solidOf } from '../../document/objects'

/** Every layer's geometry, found once per layer object — an unchanged layer keeps its mesh. */
const meshCache = new WeakMap<CanvasNode, { feature: unknown; pathKey: unknown; w: number; h: number; mesh: Mesh | null }>()

/**
 * A layer's own geometry, in its plane (px, y up): its solid when it has one,
 * else its outline lying flat. A swept profile has none of its own — its tube
 * belongs to the path it follows (see sweepsAlong). Text has none yet.
 */
export function layerMesh(node: CanvasNode, doc: CanvasDoc, size: { w: number; h: number } = node.rect): Mesh | null {
  // The solid lives in the board's objects (document/objects.ts), so its feature is part of the cache key.
  const feature = featureOf(doc, node.id)?.feature ?? null
  const solid = solidOf(doc, node.id)
  const pathKey = solid?.kind === 'sweep' ? findById(doc, solid.pathId) : null
  const cached = meshCache.get(node)
  if (cached && cached.feature === feature && cached.pathKey === pathKey && cached.w === size.w && cached.h === size.h) return cached.mesh
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
  meshCache.set(node, { feature, pathKey, w: size.w, h: size.h, mesh })
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
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) {
      if (feature.kind !== 'sweep' || feature.hidden) continue
      const profile = findById(doc, feature.sketchId)
      if (profile) out.set(feature.pathId, [...(out.get(feature.pathId) ?? []), profile])
    }
  }
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
 * just a container, as in 2D. A solid (`solid`) always has a surface.
 */
export function surfaceOf(node: CanvasNode, solid = false): { css: string; opacity: number } | null {
  const fill = [...(node.style.fills ?? [])].reverse().find(isPaintVisible)
  const layer = node.style.opacity ?? 1
  if (!fill) return solid ? { css: CLAY, opacity: layer } : null
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

// ── Solids on the 2D board ─────────────────────────────────────────────────

/** One solid surface of a top-level layer as the front camera sees it — the layer's own, or a tube swept along it. */
export interface ProjectedSurface {
  /** The layer a click on it selects: the solid's own layer, or a tube's profile (as in 3D). */
  id: NodeId
  faces: FrontFace[]
  css: string
  opacity: number
}

/**
 * Whether the 2D board draws a top-level layer as its projected solid rather
 * than as its flat 2D self. A revolve never looks like its outline. An extrude
 * does only while its plane faces the front (its front face is the outline),
 * so it switches once the plane turns. A swept profile has no solid of its own
 * — its tube is drawn with the path it follows.
 */
export function drawsAsSolid(node: CanvasNode, doc: CanvasDoc): boolean {
  const solid = solidOf(doc, node.id)
  if (!solid || node.hidden) return false
  if (solid.kind === 'revolve') return true
  if (solid.kind === 'extrude') return !!node.space && !isRigid(frontMatrix(node.space))
  return false
}

const projectedCache = new WeakMap<CanvasNode, { profiles: CanvasNode[] | undefined; features: unknown[]; surfaces: ProjectedSurface[] }>()

/**
 * Every top-level layer's solids, projected onto the 2D board (document/frontView.ts):
 * the layer's own when drawsAsSolid, plus any tubes swept along it. Unchanged
 * layers keep their projection.
 */
export function projectedSolidsOf(doc: CanvasDoc): Map<NodeId, ProjectedSurface[]> {
  const out = new Map<NodeId, ProjectedSurface[]>()
  const sweeps = sweepsAlong(doc)
  for (const node of doc.nodes) {
    if (node.hidden) continue
    const profiles = sweeps.get(node.id)
    const own = drawsAsSolid(node, doc)
    if (!own && !profiles) continue
    // The solids live in the board's objects, so their features are part of the key.
    const features = [node, ...(profiles ?? [])].map((n) => featureOf(doc, n.id)?.feature ?? null)
    const cached = projectedCache.get(node)
    // sweepsAlong builds fresh arrays, so compare the profiles themselves.
    if (cached && sameNodes(cached.profiles, profiles) && cached.features.length === features.length && cached.features.every((f, i) => f === features[i])) {
      out.set(node.id, cached.surfaces)
      continue
    }
    const placement = placementOf(node)
    const surfaces: ProjectedSurface[] = []
    const add = (id: NodeId, mesh: Mesh | null, surface: { css: string; opacity: number } | null) => {
      if (!mesh || !surface) return
      const faces = frontFaces(mesh, placement, node.rect, node.style.rotate ?? 0, true)
      if (faces.length) surfaces.push({ id, faces, ...surface })
    }
    if (own) add(node.id, layerMesh(node, doc), surfaceOf(node, true))
    for (const profile of profiles ?? []) add(profile.id, sweptMesh(profile, node), surfaceOf(profile, true))
    projectedCache.set(node, { profiles, features, surfaces })
    if (surfaces.length) out.set(node.id, surfaces)
  }
  return out
}

const sameNodes = (a: CanvasNode[] | undefined, b: CanvasNode[] | undefined) => a === b || (!!a && !!b && a.length === b.length && a.every((n, i) => n === b[i]))

/** The projected surface under a board point, topmost first — the solid a click there hits. */
export function solidAt(solids: Map<NodeId, ProjectedSurface[]>, order: NodeId[], x: number, y: number): { layer: NodeId; id: NodeId } | null {
  for (let i = order.length - 1; i >= 0; i -= 1) {
    for (const surface of solids.get(order[i]) ?? []) {
      if (surface.faces.some((f) => inTriangle(f.points, x, y))) return { layer: order[i], id: surface.id }
    }
  }
  return null
}

function inTriangle([a, b, c]: [XY, XY, XY], x: number, y: number): boolean {
  const side = (p: XY, q: XY) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)
  const d1 = side(a, b)
  const d2 = side(b, c)
  const d3 = side(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
