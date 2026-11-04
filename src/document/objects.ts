// Sketches and Objects — the board as a sketch-and-part modeler, in Onshape's
// terms with Figma's tools.
//
// A sketch is a layer: any top-level frame or shape, with everything Figma
// gives it, standing on a plane in 3D. An Object is a part, built by an
// ordered list of features, each consuming a sketch: extrude it, revolve it,
// sweep it along a path, loft between several, and combine the result with
// what the object already is. The sketch stays the source — edit it and the
// features rebuild. Nothing here is geometry; geometry/body.ts evaluates it.
//
// A layer's own `solid` (the board's first 3D model, one solid per layer)
// becomes an Object with one feature when a board is read
// (migrateLayerSolids), so old boards open as they were.

import { nextId } from './doc'
import { childrenOf, type CanvasDoc, type CanvasNode, type NodeId } from './types'
import type { Placement3D, RevolveAxis, SolidSpec } from './sceneTypes'

export type ObjectId = string
export type FeatureId = string

/**
 * How a feature's result meets the object so far: a new body of its own,
 * added to it, cut out of it, or kept only where both are.
 */
export type FeatureOp = 'new' | 'add' | 'subtract' | 'intersect'

interface FeatureBase {
  id: FeatureId
  /** Shown in the feature list: "Extrude 1". */
  name: string
  op: FeatureOp
  hidden?: boolean
}

/**
 * The sketch layer a feature consumes, and which of its closed shapes. With no
 * `regions` the sketch's own outline is the profile (a shape layer drawn as
 * one), which is how a layer's solid has always worked.
 */
interface SketchInput {
  sketchId: NodeId
  regions?: NodeId[]
}

/** Pushed straight out of the sketch's plane by `depth` meters (both ways when symmetric, backwards when reversed). */
export interface ExtrudeFeature extends FeatureBase, SketchInput {
  kind: 'extrude'
  depth: number
  direction?: 'normal' | 'reverse' | 'symmetric'
}

/** Spun about an axis in the sketch's plane (see RevolveAxis). */
export interface RevolveFeature extends FeatureBase, SketchInput {
  kind: 'revolve'
  axis: RevolveAxis
  angle: number
  steps: number
}

/** The profile carried along another layer's path: a pipe, a rail. */
export interface SweepFeature extends FeatureBase, SketchInput {
  kind: 'sweep'
  pathId: NodeId
  samples?: number
}

/** A skin through several sketches' profiles, in order. */
export interface LoftFeature extends FeatureBase {
  kind: 'loft'
  sketchIds: NodeId[]
}

export type Feature = ExtrudeFeature | RevolveFeature | SweepFeature | LoftFeature
export type FeatureKind = Feature['kind']

/** A part: what its features build, in order. */
export interface CanvasObject {
  id: ObjectId
  name: string
  features: Feature[]
  /** Moves the finished part as a whole, after its features (G on an object). Absent: where its sketches put it. */
  placement?: Placement3D
  hidden?: boolean
}

/**
 * Where a sketch stands in 3D. The three default planes (Onshape's Front,
 * Top and Right — Side here, as the 3D view's camera calls it), a plane offset from one (meters along its normal), a face of an
 * object (so the sketch rides along when that face moves), or placed freely —
 * then the layer's own `space` is where, and nothing holds it to a plane.
 * scene3d/planeRefs.ts resolves them.
 */
export type PlaneRef =
  | { kind: 'default'; plane: DefaultPlane }
  | { kind: 'offset'; from: PlaneRef; distance: number }
  | { kind: 'face'; objectId: ObjectId; face: FaceName }
  | { kind: 'custom' }

export type DefaultPlane = 'front' | 'top' | 'side'

/**
 * A layer as a sketch: the plane it stands on, and where on that plane its
 * top-left is (px, the plane's right and down) — so it keeps its spot when
 * the plane moves, and a drag slides it along the plane, never off it.
 */
export interface SketchSpec {
  plane: PlaneRef
  at?: { u: number; v: number }
}

/**
 * A face's lasting name: the feature that made it, which of its faces, and —
 * for a side — which segment of the sketch outline it was swept from. It
 * survives edits that keep that segment, which is what lets a sketch stay on
 * "the top of Extrude 1" while its depth changes.
 */
export interface FaceName {
  feature: FeatureId
  role: 'start' | 'end' | 'side'
  /** The profile layer the face came from (a sketch's region). */
  profile: NodeId
  /** For a side: the outline segment's index. */
  segment?: number
}

/** Every object on the board. */
export function objectsOf(doc: CanvasDoc): CanvasObject[] {
  return doc.objects ?? []
}

/** Every layer a feature reads its profile from. */
export function profilesOf(feature: Feature): NodeId[] {
  if (feature.kind === 'loft') return feature.sketchIds
  return feature.regions?.length ? feature.regions : [feature.sketchId]
}

/** Every layer a feature depends on: its profiles, and a sweep's path. */
export function inputsOf(feature: Feature): NodeId[] {
  const sketches = feature.kind === 'loft' ? feature.sketchIds : [feature.sketchId, ...(feature.regions ?? [])]
  return feature.kind === 'sweep' ? [...sketches, feature.pathId] : sketches
}

/** The first feature building a solid from this layer's own outline, and its object. */
export function featureOf(doc: CanvasDoc, layerId: NodeId): { object: CanvasObject; feature: Feature } | null {
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) {
      if (feature.kind !== 'loft' && feature.sketchId === layerId && !feature.regions?.length) return { object, feature }
    }
  }
  return null
}

/**
 * A layer's solid in the one-solid-per-layer shape the 3D view and the
 * inspector's Solid section still speak (document/sceneTypes.ts SolidSpec) —
 * read from the feature that builds it. Until bodies (geometry/body.ts) are
 * evaluated per object, this is how those readers find a layer's solid.
 */
export function solidOf(doc: CanvasDoc, layerId: NodeId): SolidSpec | undefined {
  const feature = featureOf(doc, layerId)?.feature
  if (!feature || feature.hidden) return undefined
  if (feature.kind === 'extrude') return { kind: 'extrude', depth: feature.depth }
  if (feature.kind === 'revolve') return { kind: 'revolve', axis: feature.axis, angle: feature.angle, steps: feature.steps }
  if (feature.kind === 'sweep') return { kind: 'sweep', pathId: feature.pathId, ...(feature.samples ? { samples: feature.samples } : {}) }
  return undefined
}

const KIND_NAMES: Record<FeatureKind, string> = { extrude: 'Extrude', revolve: 'Revolve', sweep: 'Sweep', loft: 'Loft' }

/** "Extrude 3": the next free number for that kind across the board, as Onshape counts. */
function nextFeatureName(doc: CanvasDoc, kind: FeatureKind): string {
  const used = new Set(objectsOf(doc).flatMap((o) => o.features.map((f) => f.name)))
  let n = 1
  while (used.has(`${KIND_NAMES[kind]} ${n}`)) n += 1
  return `${KIND_NAMES[kind]} ${n}`
}

function featureFrom(doc: CanvasDoc, layerId: NodeId, spec: SolidSpec, keep?: Feature): Feature {
  const base = { id: keep?.id ?? nextId('feature'), name: keep && keep.kind === spec.kind ? keep.name : nextFeatureName(doc, spec.kind), op: keep?.op ?? ('new' as const), sketchId: layerId }
  if (spec.kind === 'extrude') return { ...base, kind: 'extrude', depth: spec.depth }
  if (spec.kind === 'revolve') return { ...base, kind: 'revolve', axis: spec.axis, angle: spec.angle, steps: spec.steps }
  return { ...base, kind: 'sweep', pathId: spec.pathId, ...(spec.samples ? { samples: spec.samples } : {}) }
}

/**
 * Gives a layer a solid, changes it, or (with `undefined`) takes it away — as
 * the feature that builds it. A layer without one gets an Object of its own,
 * named after it; removing an object's last feature removes the object.
 */
export function setSolidOf(doc: CanvasDoc, layerId: NodeId, spec: SolidSpec | undefined, layerName = 'Object'): CanvasDoc {
  const found = featureOf(doc, layerId)
  const objects = objectsOf(doc)
  if (!found) {
    if (!spec) return doc
    const object: CanvasObject = { id: nextId('object'), name: layerName, features: [featureFrom(doc, layerId, spec)] }
    return { ...doc, objects: [...objects, object] }
  }
  const next = objects.flatMap((object) => {
    if (object !== found.object) return [object]
    const features = spec
      ? object.features.map((f) => (f === found.feature ? featureFrom(doc, layerId, spec, f) : f))
      : object.features.filter((f) => f !== found.feature)
    return features.length ? [{ ...object, features }] : []
  })
  return { ...doc, objects: next }
}

/**
 * Drops features whose sketch (or path) is gone, and objects left with none —
 * deleting a sketch takes what was built from it, as Onshape does when you
 * delete a sketch and its dependents. Returns `doc` itself when nothing went.
 */
export function pruneObjects(doc: CanvasDoc): CanvasDoc {
  if (!doc.objects?.length) return doc
  const alive = new Set<NodeId>()
  const visit = (nodes: CanvasNode[]) => {
    for (const n of nodes) {
      alive.add(n.id)
      visit(childrenOf(n))
    }
  }
  visit(doc.nodes)
  for (const c of doc.components) visit((c.variants ?? []).flatMap((v) => (v?.root ? [v.root] : [])))
  let changed = false
  const objects = doc.objects.flatMap((object) => {
    const features = object.features.filter((f) => inputsOf(f).every((id) => alive.has(id)))
    if (features.length === object.features.length) return [object]
    changed = true
    return features.length ? [{ ...object, features }] : []
  })
  return changed ? { ...doc, objects } : doc
}

/**
 * Moves every layer's own `solid` (from boards saved before Objects) into an
 * Object of its own with one feature, and strips the field. Safe to run on
 * any board, any number of times: one with nothing to move comes back as is.
 */
export function migrateLayerSolids(doc: CanvasDoc): CanvasDoc {
  const found: { id: NodeId; name: string; solid: SolidSpec }[] = []
  const strip = (nodes: CanvasNode[]): CanvasNode[] =>
    nodes.map((node) => {
      const legacy = (node as CanvasNode & { solid?: SolidSpec }).solid
      const children = 'children' in node && Array.isArray(node.children) ? strip(node.children) : null
      if (!legacy && (!children || children.every((c, i) => c === (node as { children: CanvasNode[] }).children[i]))) return node
      const { solid: _solid, ...rest } = node as CanvasNode & { solid?: SolidSpec }
      if (legacy) found.push({ id: node.id, name: node.name, solid: legacy })
      return (children ? { ...rest, children } : rest) as CanvasNode
    })
  const nodes = strip(doc.nodes)
  // Read straight from disk, so a half-written component (no variants, no root) passes through untouched.
  const components = doc.components.map((c) => {
    if (!Array.isArray(c.variants)) return c
    const variants = c.variants.map((v) => {
      if (!v?.root) return v
      const [root] = strip([v.root]) as (typeof v.root)[]
      return root === v.root ? v : { ...v, root }
    })
    return variants.every((v, i) => v === c.variants[i]) ? c : { ...c, variants }
  })
  if (!found.length && components.every((c, i) => c === doc.components[i])) return doc
  let next: CanvasDoc = { ...doc, nodes, components }
  for (const { id, name, solid } of found) next = setSolidOf(next, id, solid, name)
  return next
}
