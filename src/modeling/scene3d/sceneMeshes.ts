// What each layer is in 3D, without three.js: its mesh (the solid its modifier
// makes, or its outline lying flat), the tubes swept along a path, the color
// it is drawn in, and the scene's triangle count — what the 3D viewport draws,
// and what the inspector counts.

import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { isVectorNode } from '../../document/types'
import { isPaintVisible } from '../../document/paint'
import { cssColor } from '../../document/cssValue'
import { DEFAULT_FRAME_FILL } from '../../document/doc'
import { guidePolyline } from '../../document/pathGuide'
import { shapeOf } from '../geometry/shape'
import { flatMesh, type Mesh } from '../geometry/mesh'
import { extrude, revolve, sweep, triangleCount } from '../geometry/modifiers'
import { extrudeShift, tweakMesh } from '../geometry/cornerTweaks'
import { PX_PER_METER } from '../../document/sceneTypes'
import { featureOf, objectsOf, solidOf, toleranceOf } from '../../document/objects'

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
  // Sized as body.ts sizes it (the layer's own rect), so the mesh drawn and the body picked stay one.
  const shape = shapeOf(sized, toleranceOf(feature, Math.max(node.rect.w, node.rect.h)))
  if (shape) {
    const box = { w: size.w, h: size.h }
    if (solid?.kind === 'extrude') {
      // As body.ts builds it: moved corners carried, and pushed back when reversed or both ways.
      const depth = solid.depth * PX_PER_METER
      const extruded = feature?.kind === 'extrude' ? feature : null
      const built = tweakMesh(extrude(shape, box, depth), node, depth, extruded?.tweaks)
      const shift = extruded ? extrudeShift(extruded, depth) : 0
      mesh = shift ? { ...built, positions: built.positions.map((v, i) => (i % 3 === 2 ? v + shift : v)) } : built
    }
    else if (solid?.kind === 'revolve') mesh = revolve(shape, box, solid.axis, solid.angle, solid.steps)
    else if (solid?.kind === 'sweep') mesh = pathKey ? null : flatMesh(shape, box)
    else mesh = flatMesh(shape, box)
  }
  meshCache.set(node, { feature, pathKey, w: size.w, h: size.h, mesh })
  return mesh
}

/** The tube a swept profile makes along `path`, in the path layer's plane (px, y up). */
/** The tolerance a sweep's profile is flattened at — its feature's smoothness at its size, as body.ts builds it. */
export function sweepTolerance(doc: CanvasDoc, profile: CanvasNode): number {
  return toleranceOf(featureOf(doc, profile.id)?.feature, Math.max(profile.rect.w, profile.rect.h))
}

export function sweptMesh(profile: CanvasNode, path: CanvasNode, tolerance?: number): Mesh | null {
  const shape = shapeOf(profile, tolerance)
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
  // A frame's default fill is the app's panel colour — near black in the dark theme. As a solid's material it reads as a hole, so it's clay until a colour is chosen.
  if (solid && fill.color === DEFAULT_FRAME_FILL) return { css: CLAY, opacity: own * layer }
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
        const tube = sweptMesh(profile, n, sweepTolerance(doc, profile))
        if (tube) total += triangleCount(tube)
      }
      if (n.kind === 'frame') visit(n.children)
    }
  }
  visit(doc.nodes)
  return total
}
