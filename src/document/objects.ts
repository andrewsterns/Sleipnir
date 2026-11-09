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

import { ancestorsOf, findNode, nextId } from './doc'
import { childrenOf, type CanvasDoc, type CanvasNode, type NodeId } from './types'
import { PX_PER_METER, type Placement3D, type RevolveAxis, type SolidSpec } from './sceneTypes'

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
  /** How finely its curves are flattened into polygons — Medium when absent (see SMOOTHNESS). */
  smoothness?: Smoothness
}

/** How many polygons a curved solid is made of: coarse and light, the default, or fine and heavy. */
export type Smoothness = 'low' | 'medium' | 'high'

/**
 * What each smoothness means: how far a curve's flat pieces may stray from it
 * (px — so a big circle gets more pieces than a small one), and how many steps
 * a full revolve takes. Medium is what every solid was built at before.
 */
export const SMOOTHNESS: Record<Smoothness, { tolerance: number; steps: number; label: string }> = {
  low: { tolerance: 2, steps: 16, label: 'Low' },
  medium: { tolerance: 0.25, steps: 48, label: 'Medium' },
  high: { tolerance: 0.04, steps: 128, label: 'High' },
}

/**
 * The flattening tolerance a feature builds its curves at. Below a meter it
 * shrinks with the profile (`size`, its larger side in px), so a small part's
 * curves get as many pieces as a big one's: an 8 cm mug is as round as a 1 m
 * drum, not an octagon. A meter and up, it's the smoothness's own.
 */
export function toleranceOf(feature: Pick<FeatureBase, 'smoothness'> | null | undefined, size?: number): number {
  const base = SMOOTHNESS[feature?.smoothness ?? 'medium'].tolerance
  return size && size > 0 ? base * Math.min(1, Math.max(0.02, size / PX_PER_METER)) : base
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
  /** Corners moved on their own (geometry/cornerTweaks.ts): by "outline point:end", px x right, y down, out of the plane. */
  tweaks?: CornerTweaks
}

export type CornerTweaks = Record<string, [number, number, number]>

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
  /** A placed sketch: the Sketch document (and frame in it) its layers come from (document/placements.ts). Absent: a local sketch, drawn here. */
  link?: SketchLink
}

/** Where a placed sketch comes from: a Sketch document, and one frame in it or — absent — all of it. */
export interface SketchLink {
  doc: string
  frame?: NodeId
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
  const base = {
    id: keep?.id ?? nextId('feature'),
    name: keep && keep.kind === spec.kind ? keep.name : nextFeatureName(doc, spec.kind),
    op: keep?.op ?? ('new' as const),
    sketchId: layerId,
    // Kept across an edit of its numbers: whether it's on, and how smooth.
    ...(keep?.hidden ? { hidden: true } : {}),
    ...(keep?.smoothness ? { smoothness: keep.smoothness } : {}),
  }
  if (spec.kind === 'extrude') return { ...base, kind: 'extrude', depth: spec.depth, ...(keep?.kind === 'extrude' && keep.direction ? { direction: keep.direction } : {}), ...(keep?.kind === 'extrude' && keep.tweaks ? { tweaks: keep.tweaks } : {}) }
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

/** Every layer id on the board, in components' variants too — what a feature's inputs can still be found among. */
export function aliveLayers(doc: CanvasDoc): Set<NodeId> {
  const alive = new Set<NodeId>()
  const visit = (nodes: CanvasNode[]) => {
    for (const n of nodes) {
      alive.add(n.id)
      visit(childrenOf(n))
    }
  }
  visit(doc.nodes)
  for (const c of doc.components) visit((c.variants ?? []).flatMap((v) => (v?.root ? [v.root] : [])))
  return alive
}

/**
 * Why a feature can't be built — its sketch or path was deleted — or null
 * when it can. A broken feature stays in its part's list, marked, and the
 * part is built without it (Onshape's red feature); deleting what it reads
 * never deletes it. Undo brings the sketch back, and the feature with it.
 */
export function featureProblem(feature: Feature, alive: Set<NodeId>): string | null {
  if (feature.kind === 'loft') return feature.sketchIds.every((id) => alive.has(id)) ? null : 'A sketch it lofts through was deleted'
  if (!alive.has(feature.sketchId) || feature.regions?.some((id) => !alive.has(id))) return 'Its sketch was deleted'
  if (feature.kind === 'sweep' && !alive.has(feature.pathId)) return 'The path it follows was deleted'
  return null
}

/** Every broken feature on the board, by id, with why (see featureProblem). */
export function brokenFeatures(doc: CanvasDoc): Map<FeatureId, string> {
  const out = new Map<FeatureId, string>()
  if (!doc.objects?.length) return out
  const alive = aliveLayers(doc)
  for (const object of doc.objects) {
    for (const feature of object.features) {
      const problem = featureProblem(feature, alive)
      if (problem) out.set(feature.id, problem)
    }
  }
  return out
}

/** Renames a part. */
export function renameObject(doc: CanvasDoc, objectId: ObjectId, name: string): CanvasDoc {
  return { ...doc, objects: objectsOf(doc).map((o) => (o.id === objectId ? { ...o, name } : o)) }
}

/** The part that reads a layer — as a feature's sketch, region or path — and that feature. */
export function partReading(doc: CanvasDoc, layerId: NodeId): { object: CanvasObject; feature: Feature } | null {
  for (const object of objectsOf(doc)) {
    for (const feature of object.features) if (inputsOf(feature).includes(layerId)) return { object, feature }
  }
  return null
}

/** Whether a plane is, through any offsets, a face of this part. */
function onFaceOf(ref: PlaneRef | undefined, objectId: ObjectId): boolean {
  if (!ref) return false
  if (ref.kind === 'face') return ref.objectId === objectId
  return ref.kind === 'offset' ? onFaceOf(ref.from, objectId) : false
}

/**
 * Where a part's own placement carries a layer it builds: the part's
 * placement — or null when it has none, or when the layer's sketch stands on
 * a face of that same part, whose plane has moved with it already.
 */
export function partPlacementFor(doc: CanvasDoc, object: CanvasObject, layerId: NodeId): Placement3D | null {
  if (!object.placement) return null
  const top = ancestorsOf(doc, layerId)[0] ?? findNode(doc, layerId)
  return onFaceOf(top?.sketch?.plane, object.id) ? null : object.placement
}

/** The same, from the layer alone: the placement of the part that reads it. */
export function partPlacementOf(doc: CanvasDoc, layerId: NodeId): Placement3D | null {
  const reading = partReading(doc, layerId)
  return reading ? partPlacementFor(doc, reading.object, layerId) : null
}

/** Moves a part as a whole (G / R / S on a part); undefined puts it back where its sketches stand it. */
export function setPartPlacement(doc: CanvasDoc, objectId: ObjectId, placement: Placement3D | undefined): CanvasDoc {
  return { ...doc, objects: objectsOf(doc).map((o) => (o.id === objectId ? { ...o, placement } : o)) }
}

/** Deletes one feature; a part left with none goes with it. */
export function removeFeature(doc: CanvasDoc, featureId: FeatureId): CanvasDoc {
  if (!objectsOf(doc).some((o) => o.features.some((f) => f.id === featureId))) return doc
  const objects = objectsOf(doc).flatMap((object) => {
    const features = object.features.filter((f) => f.id !== featureId)
    return features.length === object.features.length ? [object] : features.length ? [{ ...object, features }] : []
  })
  return { ...doc, objects }
}

/** A new feature on an existing part, built from `layerId` and added to what's there. */
export function addFeature(doc: CanvasDoc, objectId: ObjectId, layerId: NodeId, spec: SolidSpec): { doc: CanvasDoc; featureId: FeatureId } {
  const feature: Feature = { ...featureFrom(doc, layerId, spec), op: 'add' }
  return { doc: { ...doc, objects: objectsOf(doc).map((o) => (o.id === objectId ? { ...o, features: [...o.features, feature] } : o)) }, featureId: feature.id }
}

/** Moves a feature to `index` in its part's list — the part rebuilds in the new order. */
export function moveFeature(doc: CanvasDoc, featureId: FeatureId, index: number): CanvasDoc {
  const owner = objectsOf(doc).find((o) => o.features.some((f) => f.id === featureId))
  if (!owner) return doc
  const from = owner.features.findIndex((f) => f.id === featureId)
  const to = Math.max(0, Math.min(owner.features.length - 1, index))
  if (from === to) return doc
  const features = [...owner.features]
  const [moved] = features.splice(from, 1)
  features.splice(to, 0, moved)
  // The first feature starts the part: it can only be a new body; what it displaced adds to it.
  const ordered = features.map((f, i) => (i === 0 ? (f.op === 'new' ? f : { ...f, op: 'new' as const }) : f.op === 'new' ? { ...f, op: 'add' as const } : f))
  return { ...doc, objects: objectsOf(doc).map((o) => (o.id === owner.id ? { ...o, features: ordered } : o)) }
}

/** Deletes a part with all its features; the sketches they read stay, flat again. */
export function removeObject(doc: CanvasDoc, objectId: ObjectId): CanvasDoc {
  if (!objectsOf(doc).some((o) => o.id === objectId)) return doc
  return { ...doc, objects: objectsOf(doc).filter((o) => o.id !== objectId) }
}

/**
 * Re-pick: a broken feature reads `layerId` in place of what was deleted —
 * its sketch (as a whole outline again), or a sweep's path.
 */
export function repickFeatureInput(doc: CanvasDoc, featureId: FeatureId, input: 'sketch' | 'path', layerId: NodeId): CanvasDoc {
  const alive = aliveLayers(doc)
  return {
    ...doc,
    objects: objectsOf(doc).map((object) => ({
      ...object,
      features: object.features.map((f): Feature => {
        if (f.id !== featureId) return f
        if (f.kind === 'loft') return { ...f, sketchIds: f.sketchIds.map((id) => (alive.has(id) ? id : layerId)) }
        if (input === 'path') return f.kind === 'sweep' ? { ...f, pathId: layerId } : f
        const { regions: _regions, ...rest } = f
        return { ...rest, sketchId: layerId }
      }),
    })),
  }
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

/**
 * Changes one feature wherever it is — hiding it (Onshape's suppress: the
 * object is built as if it weren't there, and its sketch shows flat), or any
 * other field. Returns `doc` itself when there's no such feature.
 */
export function updateFeature(doc: CanvasDoc, featureId: FeatureId, patch: Partial<Feature>): CanvasDoc {
  let changed = false
  const objects = objectsOf(doc).map((object) => {
    if (!object.features.some((f) => f.id === featureId)) return object
    changed = true
    return { ...object, features: object.features.map((f) => (f.id === featureId ? ({ ...f, ...patch } as Feature) : f)) }
  })
  return changed ? { ...doc, objects } : doc
}

/** Every layer some object's features read — its sketches and their paths. */
export function usedLayers(doc: CanvasDoc): Set<NodeId> {
  return new Set(objectsOf(doc).flatMap((o) => o.features.flatMap(inputsOf)))
}
