// The planes a sketch stands on (document/objects.ts PlaneRef), worked out into
// where it is in the scene. A sketch on the Top plane is laid on the ground;
// one offset 0.2 m from Front stands 0.2 m out; one on "Extrude 1's end face"
// sits on that face, and rides along when the extrude gets deeper. Its own
// spot on the plane (`sketch.at`) is kept in the plane's terms, so moving the
// plane moves it, and a drag (document/placement.ts syncPlacements) slides it
// along the plane rather than off it.
//
// The resolved placement is written back into the layer's `space`, which is
// what everything that draws it already reads.

import { planeRectOf } from '../../document/doc'
import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { inputsOf, objectsOf, type DefaultPlane, type PlaneRef, type SketchSpec } from '../../document/objects'
import { bodiesOf, type Body } from '../geometry/body'
import { frontPoint } from '../../document/frontView'
import { PLANE_ROTATION, placementOf, planeToWorld, rotate, worldToPlane } from '../../document/placement'
import type { Placement3D, Vec3 } from '../../document/sceneTypes'

/** A plane in the scene: where its origin is, and how it's turned (the plane's right, up and normal). */
export interface PlaneFrame {
  origin: Vec3
  rotation: Vec3
  /** Where a new sketch on it centers: a face's middle; the origin for a plane. */
  center?: Vec3
}

const DEFAULT_ROTATION: Record<DefaultPlane, Vec3> = { front: PLANE_ROTATION.front, top: PLANE_ROTATION.top, side: PLANE_ROTATION.side }

const RAD = Math.PI / 180
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1))

/**
 * The 'XYZ' Euler rotation (degrees, as placements store it) that turns the
 * plane's own right, up and normal onto these three scene directions — the
 * inverse of placement.ts rotate(), read off its matrix the way three.js does.
 */
export function eulerOf(right: Vec3, up: Vec3, normal: Vec3): Vec3 {
  const m13 = Math.max(-1, Math.min(1, normal[0]))
  const y = Math.asin(m13)
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-normal[1], normal[2]) / RAD, y / RAD, Math.atan2(-up[0], right[0]) / RAD]
  return [Math.atan2(up[2], up[1]) / RAD, y / RAD, 0]
}

/** A plane's normal, in the scene. */
const normalOf = (frame: PlaneFrame): Vec3 => rotate([0, 0, 1], frame.rotation)

/**
 * Where a PlaneRef is, or null when it can't be found (the face's object or
 * feature is gone) — the sketch then stays where it last was. `bodies` are
 * built on first need; `self` guards a sketch from standing on a face built
 * from itself.
 */
export function frameOf(doc: CanvasDoc, ref: PlaneRef, bodies: () => Map<string, Body>, self?: NodeId): PlaneFrame | null {
  switch (ref.kind) {
    case 'default':
      return { origin: [0, 0, 0], rotation: DEFAULT_ROTATION[ref.plane] }
    case 'offset': {
      const base = frameOf(doc, ref.from, bodies, self)
      return base ? { origin: add(base.origin, scale(normalOf(base), ref.distance)), rotation: base.rotation } : null
    }
    case 'face': {
      const object = objectsOf(doc).find((o) => o.id === ref.objectId)
      if (!object || (self && object.features.some((f) => inputsOf(f).includes(self)))) return null
      const body = bodies().get(object.id)
      const index = body?.faces.findIndex((f) => f.name.feature === ref.face.feature && f.name.role === ref.face.role && f.name.profile === ref.face.profile && (f.name.segment ?? -1) === (ref.face.segment ?? -1)) ?? -1
      return body && index >= 0 ? faceFrame(doc, body, index) : null
    }
    case 'custom':
      return null
  }
}

/**
 * The plane a body face lies in, set up so a sketch on it is turned like the
 * sketch that made the face: its normal is the face's (area-weighted), its
 * right is the profile plane's right laid onto the face (or its normal, for a
 * side face that right runs straight into), and its origin is where the
 * profile plane's own origin lands on it — which stays put when only the
 * extrude's depth changes.
 */
export function faceFrame(doc: CanvasDoc, body: Body, index: number): PlaneFrame {
  const face = body.faces[index]
  const p = body.mesh.positions
  let normal: Vec3 = [0, 0, 0]
  let centroid: Vec3 = [0, 0, 0]
  let area = 0
  for (const t of face.triangles) {
    const [a, b, c] = [0, 1, 2].map((k) => body.mesh.indices[t * 3 + k] * 3).map((i): Vec3 => [p[i], p[i + 1], p[i + 2]])
    const n = cross(sub(b, a), sub(c, a))
    const twice = Math.hypot(...n)
    normal = add(normal, n)
    centroid = add(centroid, scale(add(add(a, b), c), twice / 3))
    area += twice
  }
  normal = unit(normal)
  centroid = scale(centroid, 1 / (area || 1))
  // The profile's own plane: where its top-left is, and its right and up.
  const profile = face.name.profile
  const top = topOf(doc, profile)
  const placement = top ? placementOf(top) : { position: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 }
  const at = planeRectOf(doc, profile) ?? { x: 0, y: 0 }
  const profileOrigin = planeToWorld(placement, at.x, at.y)
  const origin = sub(profileOrigin, scale(normal, dot(sub(profileOrigin, centroid), normal)))
  const across = (axis: Vec3) => sub(axis, scale(normal, dot(axis, normal)))
  let right = across(rotate([1, 0, 0], placement.rotation))
  if (Math.hypot(...right) < 0.1) right = across(rotate([0, 0, 1], placement.rotation))
  right = unit(right)
  const up = cross(normal, right)
  return { origin, rotation: eulerOf(right, up, normal), center: centroid }
}

function topOf(doc: CanvasDoc, id: NodeId): CanvasNode | null {
  const own = doc.nodes.find((n) => n.id === id)
  if (own) return own
  const visit = (n: CanvasNode): boolean => n.id === id || ('children' in n && Array.isArray(n.children) && n.children.some(visit))
  return doc.nodes.find(visit) ?? null
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** A sketch's placement on its plane: the plane's turn, its origin moved to the sketch's spot. */
function placeOn(frame: PlaneFrame, at: { u: number; v: number }, scaleOf?: Vec3): Placement3D {
  const position = planeToWorld({ position: frame.origin, rotation: frame.rotation }, at.u, at.v).map((n) => round(n, 4)) as Vec3
  const rotation = frame.rotation.map((n) => round(n, 3)) as Vec3
  return scaleOf ? { position, rotation, scale: scaleOf } : { position, rotation }
}

const samePlacement = (a: Placement3D | undefined, b: Placement3D) =>
  !!a && a.position.every((n, i) => Math.abs(n - b.position[i]) < 1e-6) && a.rotation.every((n, i) => Math.abs(n - b.rotation[i]) < 1e-6)

/**
 * Every sketch moved to where its plane now is — run after each edit and on
 * load. Sketches on faces can stand on bodies built from other sketches, so
 * it settles over a few passes. Returns `doc` itself when nothing moved.
 */
export function resolvePlanes(doc: CanvasDoc): CanvasDoc {
  let current = doc
  for (let pass = 0; pass < 4; pass += 1) {
    let bodies: Map<string, Body> | null = null
    const lazyBodies = () => (bodies ??= bodiesOf(current))
    let changed = false
    const nodes = current.nodes.map((node) => {
      const sketch = node.sketch
      if (!sketch || sketch.plane.kind === 'custom') return node
      const frame = frameOf(current, sketch.plane, lazyBodies, node.id)
      if (!frame) return node
      const placement = placeOn(frame, sketch.at ?? { u: 0, v: 0 }, node.space?.scale)
      const at = frontPoint(placement.position)
      const rect = { ...node.rect, x: round(at.x, 3), y: round(at.y, 3) }
      if (samePlacement(node.space, placement) && rect.x === node.rect.x && rect.y === node.rect.y) return node
      changed = true
      return { ...node, space: placement, rect }
    })
    if (!changed) break
    current = { ...current, nodes }
  }
  return current
}

/**
 * Stands a top-level layer on a plane as a sketch, keeping it as near where it
 * is as the plane allows: its spot on the plane is its current origin seen
 * from the plane. `custom` frees it, keeping its placement.
 */
export function attachSketch(doc: CanvasDoc, id: NodeId, plane: PlaneRef): CanvasDoc {
  const node = doc.nodes.find((n) => n.id === id)
  if (!node) return doc
  if (plane.kind === 'custom') return replaceTop(doc, { ...node, sketch: { plane }, space: placementOf(node) })
  let bodies: Map<string, Body> | null = null
  const frame = frameOf(doc, plane, () => (bodies ??= bodiesOf(doc)), id)
  if (!frame) return doc
  const { u, v } = worldToPlane({ position: frame.origin, rotation: frame.rotation }, placementOf(node).position)
  const sketch: SketchSpec = { plane, at: { u: round(u, 3), v: round(v, 3) } }
  return resolvePlanes(replaceTop(doc, { ...node, sketch }))
}

function replaceTop(doc: CanvasDoc, node: CanvasNode): CanvasDoc {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === node.id ? node : n)) }
}

/**
 * A new sketch on a plane: a frame of `size` named `name`, centered on the
 * plane's middle (a face's center, or a default plane's origin). Null when the
 * plane can't be found.
 */
export function addSketch(doc: CanvasDoc, plane: PlaneRef, node: CanvasNode): CanvasDoc | null {
  let bodies: Map<string, Body> | null = null
  const frame = frameOf(doc, plane, () => (bodies ??= bodiesOf(doc)))
  if (!frame) return null
  const middle = worldToPlane({ position: frame.origin, rotation: frame.rotation }, frame.center ?? frame.origin)
  const sketch: SketchSpec = { plane, at: { u: round(middle.u - node.rect.w / 2, 3), v: round(middle.v - node.rect.h / 2, 3) } }
  return resolvePlanes({ ...doc, nodes: [...doc.nodes, { ...node, sketch }] })
}

/** "Sketch 3": the next free number among the board's top-level names. */
export function nextSketchName(doc: CanvasDoc): string {
  const used = new Set(doc.nodes.map((n) => n.name))
  let n = 1
  while (used.has(`Sketch ${n}`)) n += 1
  return `Sketch ${n}`
}

/** What a sketch stands on, in words for the inspector: "Top plane", "0.2 m off Front", "a face of Box". */
export function describePlane(doc: CanvasDoc, ref: PlaneRef): string {
  switch (ref.kind) {
    case 'default':
      return `${ref.plane[0].toUpperCase()}${ref.plane.slice(1)} plane`
    case 'offset':
      return `${round(ref.distance, 3)} m off ${describePlane(doc, ref.from)}`
    case 'face': {
      const object = objectsOf(doc).find((o) => o.id === ref.objectId)
      const feature = object?.features.find((f) => f.id === ref.face.feature)
      const which = ref.face.role === 'end' ? 'end face' : ref.face.role === 'start' ? 'start face' : 'side face'
      return object ? `${feature?.name ?? object.name}'s ${which}` : 'a face that is gone'
    }
    case 'custom':
      return 'Placed freely'
  }
}
