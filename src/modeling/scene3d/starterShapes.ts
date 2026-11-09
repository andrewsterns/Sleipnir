// The toolbox's starter shapes (src/canvas/LAYOUT.md). None is a special kind
// of thing: each is a sketch — one shape layer standing on a plane — and the
// feature that turns it into a solid, so it edits exactly like one built by
// hand. Boxes, cylinders and prisms are outlines on the Top plane extruded up;
// spheres, cones and tori are profiles on the Front plane revolved about a
// vertical axis.

import { createVectorNode } from '../../document/doc'
import type { SolidSpec } from '../../document/sceneTypes'
import { setSolidOf, type PlaneRef } from '../../document/objects'
import type { CanvasDoc, CanvasNode, CanvasVectorNode, NodeId, VectorPoint } from '../../document/types'

import { resolvePlanes } from './planeRefs'
import { sceneBounds } from '../viewport/cameraViews'
import { PX_PER_METER } from '../../document/sceneTypes'

export type StarterShape = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'polygon'

const TOP: PlaneRef = { kind: 'default', plane: 'top' }
const FRONT: PlaneRef = { kind: 'default', plane: 'front' }
// One meter (100 board px) across, the scale everything else in 3D is in.
const SIZE = 100
const ROUND = 48

/** A circle as four bezier anchors, centered at (cx, cy). */
function circlePoints(cx: number, cy: number, r: number): VectorPoint[] {
  const k = 0.5523 * r
  return [
    { x: cx, y: cy - r, in: { x: cx - k, y: cy - r }, out: { x: cx + k, y: cy - r } },
    { x: cx + r, y: cy, in: { x: cx + r, y: cy - k }, out: { x: cx + r, y: cy + k } },
    { x: cx, y: cy + r, in: { x: cx + k, y: cy + r }, out: { x: cx - k, y: cy + r } },
    { x: cx - r, y: cy, in: { x: cx - r, y: cy + k }, out: { x: cx - r, y: cy - k } },
  ]
}

interface Recipe {
  name: string
  plane: PlaneRef
  layer: () => CanvasVectorNode
  solid: SolidSpec
  /** Where the sketch's top-left sits on its plane: centered on the origin unless the solid needs its axis there. */
  at: (w: number, h: number) => { u: number; v: number }
}

const centered = (w: number, h: number) => ({ u: -w / 2, v: -h / 2 })
// On the Front plane, centered across and standing on the ground: its bottom edge on y = 0.
const grounded = (w: number, h: number) => ({ u: -w / 2, v: -h })

const RECIPES: Record<StarterShape, Recipe> = {
  box: { name: 'Box', plane: TOP, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, 'rectangle'), solid: { kind: 'extrude', depth: 1 }, at: centered },
  cylinder: { name: 'Cylinder', plane: TOP, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, 'ellipse'), solid: { kind: 'extrude', depth: 1 }, at: centered },
  polygon: {
    name: 'Polygon',
    plane: TOP,
    layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, 'polygon', { sides: 6 }),
    solid: { kind: 'extrude', depth: 1 },
    at: centered,
  },
  // A circle spun about its own middle: only the half right of the axis is swept.
  sphere: { name: 'Sphere', plane: FRONT, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, 'ellipse'), solid: { kind: 'revolve', axis: 'center', angle: 360, steps: ROUND }, at: grounded },
  cone: { name: 'Cone', plane: FRONT, layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: SIZE }, 'polygon', { sides: 3 }), solid: { kind: 'revolve', axis: 'center', angle: 360, steps: ROUND }, at: grounded },
  // A circle held off the axis, spun about the sketch's left edge — which stands on the origin, so the ring centers there, resting on the ground.
  torus: {
    name: 'Torus',
    plane: FRONT,
    layer: () => createVectorNode({ x: 0, y: 0, w: SIZE, h: 60 }, 'path', { points: circlePoints(70, 30, 30), closed: true, viewBox: { w: SIZE, h: 60 } }),
    solid: { kind: 'revolve', axis: 'left', angle: 360, steps: ROUND },
    at: (_w, h) => ({ u: 0, v: -h }),
  },
}

/** "Box 3": the next free number for that name among the board's top-level layers. */
function nextName(doc: CanvasDoc, base: string): string {
  const used = new Set(doc.nodes.map((n) => n.name))
  let n = 1
  while (used.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

// Room left between a new starter shape and what's already there, in meters.
const GAP = 0.5

/**
 * Adds a starter shape to the board: its sketch layer on its plane, and the
 * Object whose feature makes it solid. The first lands on the origin; each
 * after it stands to the right of everything already in the scene, so none
 * appears buried in another. Returns the new board and the layer's id.
 */
export function addStarterShape(doc: CanvasDoc, kind: StarterShape): { doc: CanvasDoc; id: NodeId } {
  const recipe = RECIPES[kind]
  const base = recipe.layer()
  const name = nextName(doc, recipe.name)
  const at = recipe.at(base.rect.w, base.rect.h)
  // Both planes' u runs along the scene's X, so moving right is moving along u.
  const bounds = sceneBounds(doc)
  const width = (base.rect.w / PX_PER_METER) * (kind === 'torus' ? 2 : 1)
  const shift = bounds ? Math.max(0, bounds.max[0] + GAP + width / 2) * PX_PER_METER : 0
  const layer: CanvasNode = { ...base, name, sketch: { plane: recipe.plane, at: { u: at.u + shift, v: at.v } } }
  const placed = resolvePlanes({ ...doc, nodes: [...doc.nodes, layer] })
  return { doc: setSolidOf(placed, layer.id, recipe.solid, name), id: layer.id }
}
