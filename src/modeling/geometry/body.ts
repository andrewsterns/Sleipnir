// An Object (document/objects.ts) evaluated: its features built into one mesh in
// scene space (meters, y up), with every face, edge and vertex named for
// where it came from — the way Onshape keeps "Extrude 1 > end cap" meaning
// the same face across edits. A click on any triangle resolves to its face;
// a face knows its edges and corners; each traces back to the sketch outline
// and the feature that made it, which is what editing them will act on.
//
// Faces follow CAD, not the triangles: the sides swept from a run of smoothly
// joined outline segments are one face (a cylinder has three faces, not 34),
// an edge is wherever two faces meet (a box has twelve, a cylinder two
// circles), and a vertex is where edges end (a box has eight, a cylinder none).

import { nodeMatrix, multiply, apply, invert, IDENTITY, type Mat } from '../../document/rotation'
import { ancestorsOf, findNode } from '../../document/doc'
import { isVectorNode, type CanvasDoc, type CanvasNode, type NodeId } from '../../document/types'
import { partPlacementFor, partPlacementOf, profilesOf, type CanvasObject, type FaceName, type Feature, type ObjectId, toleranceOf } from '../../document/objects'
import { guidePolyline } from '../../document/pathGuide'
import { placeInScene, placeNormal, placementOf, planeToWorld, rotate, unplaceFromScene, worldToPlane } from '../../document/placement'
import { PX_PER_METER, type Placement3D, type Vec3 } from '../../document/sceneTypes'
import { shapeOf } from './shape'
import type { Mesh } from './mesh'
import { extrude, revolve, sweep } from './modifiers'
import { extrudeShift, tweakMesh } from './cornerTweaks'

export interface BodyFace {
  name: FaceName
  /** Indices of its triangles in the body's mesh. */
  triangles: number[]
}

export interface BodyEdge {
  /** The faces it lies between, by index into the body's faces — one for an open sheet's rim. */
  faces: number[]
  /** Its points in order, scene meters; closed when the first and last coincide (a circle). */
  points: Vec3[]
}

export interface BodyVertex {
  at: Vec3
  /** Every edge ending here. */
  edges: number[]
}

export interface Body {
  objectId: ObjectId
  /** Scene meters, y up — ready for the 3D view. */
  mesh: Mesh
  faces: BodyFace[]
  /** The body face each mesh triangle belongs to. */
  faceOfTriangle: number[]
  edges: BodyEdge[]
  vertices: BodyVertex[]
  /** Features built only in part, said rather than guessed: an op this can't do yet, a loft. */
  notes: string[]
  /**
   * Which triangles each feature built from each profile — in the same order
   * the layer's own mesh has them, so a click on the 3D view's per-layer mesh
   * (triangle t) is body triangle first + t (see partTriangle).
   */
  parts: { feature: string; profile: NodeId; first: number; count: number }[]
}

// Two outline segments meeting at less than this turn belong to one face (a curve), as modifiers' normals do.
const SMOOTH_COS = Math.cos((30 * Math.PI) / 180)
// Scene points closer than this are one point (a tenth of a millimeter).
const WELD = 1e-4

/** Every visible object's body. Unchanged objects keep theirs. */
export function bodiesOf(doc: CanvasDoc): Map<ObjectId, Body> {
  const out = new Map<ObjectId, Body>()
  for (const object of doc.objects ?? []) if (!object.hidden) out.set(object.id, bodyOf(doc, object))
  return out
}

const cache = new WeakMap<CanvasObject, { inputs: unknown[]; body: Body }>()

/** One object's body. */
export function bodyOf(doc: CanvasDoc, object: CanvasObject): Body {
  // A body rebuilds when its object or any layer it reads (and their ancestors, which place them) changes.
  const inputs = object.features.flatMap((f) => [...profilesOf(f), ...(f.kind === 'sweep' ? [f.pathId] : [])].flatMap((id) => [findNode(doc, id), ...ancestorsOf(doc, id)]))
  const cached = cache.get(object)
  if (cached && cached.inputs.length === inputs.length && cached.inputs.every((n, i) => n === inputs[i])) return cached.body
  const body = buildBody(doc, object)
  cache.set(object, { inputs, body })
  return body
}

function buildBody(doc: CanvasDoc, object: CanvasObject): Body {
  const mesh: Mesh = { positions: [], normals: [], uvs: [], indices: [] }
  const faces: BodyFace[] = []
  const faceOfTriangle: number[] = []
  const notes: string[] = []
  const parts: Body['parts'] = []
  for (const feature of object.features) {
    if (feature.hidden) continue
    if (feature.kind === 'loft') {
      notes.push(`${feature.name}: lofts aren't built yet`)
      continue
    }
    if (feature.op === 'subtract' || feature.op === 'intersect') notes.push(`${feature.name}: ${feature.op} is shown as an added body until booleans land`)
    for (const profileId of profilesOf(feature)) {
      const profile = findNode(doc, profileId)
      const built = profile ? featureMesh(doc, object, feature, profile) : null
      if (!built) continue
      parts.push({ feature: feature.id, profile: profileId, first: faceOfTriangle.length, count: built.mesh.indices.length / 3 })
      append(mesh, faces, faceOfTriangle, built.mesh, built.toScene, feature, profileId)
    }
  }
  const edges = edgesOf(mesh, faceOfTriangle)
  return { objectId: object.id, mesh, faces, faceOfTriangle, edges, vertices: verticesOf(edges), notes, parts }
}

/** The feature's mesh in its layer's plane (px, y up), and the map from there into the scene. */
function featureMesh(doc: CanvasDoc, object: CanvasObject, feature: Exclude<Feature, { kind: 'loft' }>, profile: CanvasNode): { mesh: Mesh; toScene: PlaneToScene } | null {
  const shape = shapeOf(profile, toleranceOf(feature, Math.max(profile.rect.w, profile.rect.h)))
  if (!shape) return null
  const box = { w: profile.rect.w, h: profile.rect.h }
  if (feature.kind === 'extrude') {
    const depth = feature.depth * PX_PER_METER
    const mesh = tweakMesh(extrude(shape, box, depth), profile, depth, feature.tweaks)
    // Backwards pushes the same solid behind the plane; both ways centers it on the plane.
    const shift = extrudeShift(feature, depth)
    return { mesh, toScene: planeToScene(doc, profile, shift, partPlacementFor(doc, object, profile.id)) }
  }
  if (feature.kind === 'revolve') return { mesh: revolve(shape, box, feature.axis, feature.angle, feature.steps), toScene: planeToScene(doc, profile, 0, partPlacementFor(doc, object, profile.id)) }
  const path = findNode(doc, feature.pathId)
  if (!path || !isVectorNode(path)) return null
  const { points, closed } = guidePolyline(path)
  const local = points.map((p) => ({ x: p.x - path.rect.x, y: p.y - path.rect.y }))
  // A sweep's tube lives in its path's plane.
  return { mesh: sweep(shape, box, local, closed), toScene: planeToScene(doc, path, 0, partPlacementFor(doc, object, path.id)) }
}

interface PlaneToScene {
  point: (x: number, yUp: number, z: number) => Vec3
  normal: (n: Vec3) => Vec3
}

/**
 * From a layer's own space (its mesh: px, y up, top-left at the origin) to the
 * scene: through its own and its ancestors' 2D rotations and offsets within
 * the plane, then the plane's placement — exactly how the 3D view stands it up
 * — and last the part's own placement, when it has moved as a whole.
 */
function planeToScene(doc: CanvasDoc, node: CanvasNode, outShift: number, part: Placement3D | null): PlaneToScene {
  const chain = [...ancestorsOf(doc, node.id), node]
  const top = chain[0]
  const placement: Placement3D = placementOf(top)
  let m: Mat = IDENTITY
  chain.forEach((n, i) => {
    m = multiply(m, nodeMatrix(i === 0 ? { ...n.rect, x: 0, y: 0 } : n.rect, n.style.rotate))
  })
  return {
    point: (x, yUp, z) => {
      const on = apply(m, { x, y: -yUp })
      const w = planeToWorld(placement, on.x, on.y, z + outShift)
      return part ? placeInScene(part, w) : w
    },
    normal: ([nx, ny, nz]) => {
      // Turned like the plane's own axes: in-plane by the 2D rotations (y down), then out into the scene.
      const u = nx * m.a - ny * m.c
      const v = -(nx * m.b - ny * m.d)
      const len = Math.hypot(u, v, nz) || 1
      const n = rotate([u / len, v / len, nz / len], placement.rotation)
      return part ? placeNormal(part, n) : n
    },
  }
}

/**
 * The other way: a scene point in a layer's own px (x right, y down, from its
 * top-left — where its outline's points live) and how far out of its plane
 * (px). What turns a drag in 3D into an edit of the sketch (editBody.ts).
 */
export function sceneToLayer(doc: CanvasDoc, node: CanvasNode): (world: Vec3) => { x: number; y: number; out: number } {
  return layerFromScene(doc, node, partPlacementOf(doc, node.id))
}

function layerFromScene(doc: CanvasDoc, node: CanvasNode, part: Placement3D | null): (world: Vec3) => { x: number; y: number; out: number } {
  const chain = [...ancestorsOf(doc, node.id), node]
  const placement: Placement3D = placementOf(chain[0])
  let m: Mat = IDENTITY
  chain.forEach((n, i) => {
    m = multiply(m, nodeMatrix(i === 0 ? { ...n.rect, x: 0, y: 0 } : n.rect, n.style.rotate))
  })
  const back = invert(m)
  return (world) => {
    const { u, v, out } = worldToPlane(placement, part ? unplaceFromScene(part, world) : world)
    const p = apply(back, { x: u, y: v })
    return { x: p.x, y: p.y, out }
  }
}

/**
 * What the 3D view sets on a layer's own mesh (px, y up, as it draws it inside
 * its plane) so it stands where its part's placement moved it: the map from
 * the layer's space to the scene, the part's placement, and back — a 4×4,
 * column-major, as three.js reads it. Null when the layer's part hasn't moved.
 */
export function partMeshMatrix(doc: CanvasDoc, node: CanvasNode, part: Placement3D | null): number[] | null {
  if (!part) return null
  const to = planeToScene(doc, node, 0, null)
  const back = layerFromScene(doc, node, null)
  const f = (x: number, y: number, z: number): Vec3 => {
    const q = back(placeInScene(part, to.point(x, y, z)))
    return [q.x, -q.y, q.out]
  }
  const o = f(0, 0, 0)
  const col = (p: Vec3) => [p[0] - o[0], p[1] - o[1], p[2] - o[2], 0]
  return [...col(f(1, 0, 0)), ...col(f(0, 1, 0)), ...col(f(0, 0, 1)), o[0], o[1], o[2], 1]
}

/** Adds a feature's mesh to the body, in the scene, its faces named and grouped the CAD way. */
function append(body: Mesh, faces: BodyFace[], faceOfTriangle: number[], mesh: Mesh, toScene: PlaneToScene, feature: Feature, profile: NodeId) {
  const base = body.positions.length / 3
  for (let i = 0; i < mesh.positions.length; i += 3) {
    body.positions.push(...toScene.point(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]))
    body.normals.push(...toScene.normal([mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]))
  }
  body.uvs.push(...mesh.uvs)
  for (const i of mesh.indices) body.indices.push(base + i)

  // The mesh's own faces, grouped: a run of smoothly joined sides is one face.
  const own = mesh.faces ?? [{ role: 'start' as const }]
  const group = groupSmoothSides(mesh)
  const firstFace = faces.length
  const bodyFaceOf = new Map<number, number>()
  own.forEach((_, i) => {
    const lead = group[i]
    if (bodyFaceOf.has(lead)) {
      bodyFaceOf.set(i, bodyFaceOf.get(lead)!)
      return
    }
    const leadFace = own[lead]
    const name: FaceName = { feature: feature.id, role: leadFace.role, profile, ...(leadFace.role === 'side' ? { segment: leadFace.segment ?? 0 } : {}) }
    faces.push({ name, triangles: [] })
    bodyFaceOf.set(lead, faces.length - 1)
    bodyFaceOf.set(i, faces.length - 1)
  })
  const triangles = mesh.indices.length / 3
  const baseTriangle = faceOfTriangle.length
  for (let t = 0; t < triangles; t += 1) {
    const face = bodyFaceOf.get(mesh.faceOf?.[t] ?? 0) ?? firstFace
    faceOfTriangle.push(face)
    faces[face].triangles.push(baseTriangle + t)
  }
}

/**
 * For each of a mesh's faces, the face that leads its group: itself for a
 * cap or a sharp side, the first of a run of sides of one contour whose
 * neighbouring segments meet gently (the whole round of a cylinder).
 */
function groupSmoothSides(mesh: Mesh): number[] {
  const faces = mesh.faces ?? []
  const lead = faces.map((_, i) => i)
  // A face's normal from its first triangle with any area: a revolve's strip at a pole starts
  // with triangles pinched to a point, which have none, and would split the pole off as a face.
  const normal = (face: number): Vec3 | null => {
    const p = mesh.positions
    for (let t = 0; t < (mesh.faceOf?.length ?? 0); t += 1) {
      if (mesh.faceOf![t] !== face) continue
      const [a, b, c] = [mesh.indices[t * 3] * 3, mesh.indices[t * 3 + 1] * 3, mesh.indices[t * 3 + 2] * 3]
      const u: Vec3 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
      const v: Vec3 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
      const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const len = Math.hypot(...n)
      if (len > 1e-12) return [n[0] / len, n[1] / len, n[2] / len]
    }
    return null
  }
  // Sides by contour, in segment order.
  const byContour = new Map<number, number[]>()
  faces.forEach((f, i) => {
    if (f.role === 'side') byContour.set(f.contour ?? 0, [...(byContour.get(f.contour ?? 0) ?? []), i])
  })
  for (const sides of byContour.values()) {
    sides.sort((a, b) => (faces[a].segment ?? 0) - (faces[b].segment ?? 0))
    const normals = sides.map(normal)
    const smooth = (i: number, j: number) => {
      const a = normals[i]
      const b = normals[j]
      return !!a && !!b && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= SMOOTH_COS
    }
    // Start the walk at a sharp corner, so a run that wraps past segment 0 stays one face.
    const n = sides.length
    const start = Math.max(0, [...Array(n).keys()].findIndex((i) => !smooth((i - 1 + n) % n, i)))
    let current = sides[start]
    for (let k = 0; k < n; k += 1) {
      const i = (start + k) % n
      if (k > 0 && !smooth((i - 1 + n) % n, i)) current = sides[i]
      lead[sides[i]] = current
    }
  }
  return lead
}

const keyOf = (p: Vec3) => p.map((c) => Math.round(c / WELD)).join(',')

/** Where faces meet: every triangle side shared by two different faces (or on only one, an open rim), chained into lines. */
function edgesOf(mesh: Mesh, faceOfTriangle: number[]): BodyEdge[] {
  const at = (i: number): Vec3 => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]
  // Each triangle side, welded by position, with the faces on either side of it.
  const sides = new Map<string, { a: Vec3; b: Vec3; faces: Set<number> }>()
  for (let t = 0; t < faceOfTriangle.length; t += 1) {
    const corners = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]].map(at)
    for (let k = 0; k < 3; k += 1) {
      const a = corners[k]
      const b = corners[(k + 1) % 3]
      const [ka, kb] = [keyOf(a), keyOf(b)]
      if (ka === kb) continue
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const side = sides.get(key) ?? { a, b, faces: new Set<number>() }
      side.faces.add(faceOfTriangle[t])
      sides.set(key, side)
    }
  }
  // Inside a face a side has the same face both ways; the edges are the rest, grouped by which faces they part.
  const byPair = new Map<string, { faces: number[]; segments: [Vec3, Vec3][] }>()
  for (const side of sides.values()) {
    const between = [...side.faces].sort((x, y) => x - y)
    const count = countUses(side, mesh, faceOfTriangle)
    if (between.length === 1 && count > 1) continue
    const key = between.join('|')
    const entry = byPair.get(key) ?? { faces: between, segments: [] }
    entry.segments.push([side.a, side.b])
    byPair.set(key, entry)
  }
  return [...byPair.values()].flatMap(({ faces: between, segments }) => chain(segments).map((points) => ({ faces: between, points })))
}

// How many triangles use a side — two inside a closed surface, one on an open rim.
const useCounts = new WeakMap<Mesh, Map<string, number>>()
function countUses(side: { a: Vec3; b: Vec3 }, mesh: Mesh, faceOfTriangle: number[]): number {
  let counts = useCounts.get(mesh)
  if (!counts) {
    counts = new Map()
    for (let t = 0; t < faceOfTriangle.length; t += 1) {
      const corners = [mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]].map((i) => keyOf([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]))
      for (let k = 0; k < 3; k += 1) {
        const [ka, kb] = [corners[k], corners[(k + 1) % 3]]
        if (ka === kb) continue
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    useCounts.set(mesh, counts)
  }
  const [ka, kb] = [keyOf(side.a), keyOf(side.b)]
  return counts.get(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`) ?? 0
}

/** Segments joined end to end into polylines; a loop comes back closed. */
function chain(segments: [Vec3, Vec3][]): Vec3[][] {
  const unused = new Set(segments.map((_, i) => i))
  const byPoint = new Map<string, number[]>()
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) byPoint.set(keyOf(p), [...(byPoint.get(keyOf(p)) ?? []), i])
  })
  const lines: Vec3[][] = []
  // Open lines start at an end (a point only one segment touches), loops anywhere.
  const order = [...unused].sort((i, j) => degree(segments[j], byPoint) - degree(segments[i], byPoint))
  for (const first of order) {
    if (!unused.has(first)) continue
    unused.delete(first)
    let [a, b] = segments[first]
    if ((byPoint.get(keyOf(b))?.length ?? 0) === 1) [a, b] = [b, a]
    const line = [a, b]
    for (;;) {
      const tail = line[line.length - 1]
      const next = (byPoint.get(keyOf(tail)) ?? []).find((i) => unused.has(i))
      if (next === undefined) break
      unused.delete(next)
      const [p, q] = segments[next]
      line.push(keyOf(p) === keyOf(tail) ? q : p)
    }
    lines.push(line)
  }
  return lines
}

// 1 when a segment touches an end of a line, so lines are walked from their ends.
function degree([a, b]: [Vec3, Vec3], byPoint: Map<string, number[]>): number {
  return Math.min(byPoint.get(keyOf(a))?.length ?? 0, byPoint.get(keyOf(b))?.length ?? 0) === 1 ? 1 : 0
}

/** Where edges end: a box's corners. A closed edge (a circle) has none. */
function verticesOf(edges: BodyEdge[]): BodyVertex[] {
  const out = new Map<string, BodyVertex>()
  edges.forEach((edge, i) => {
    const first = edge.points[0]
    const last = edge.points[edge.points.length - 1]
    if (keyOf(first) === keyOf(last)) return
    for (const p of [first, last]) {
      const key = keyOf(p)
      const vertex = out.get(key) ?? { at: p, edges: [] }
      if (!vertex.edges.includes(i)) vertex.edges.push(i)
      out.set(key, vertex)
    }
  })
  return [...out.values()]
}

/** The body triangle that is triangle `t` of the mesh one feature built from one profile. */
export function partTriangle(body: Body, feature: string, profile: NodeId, t: number): number | null {
  const part = body.parts.find((p) => p.feature === feature && p.profile === profile)
  return part && t >= 0 && t < part.count ? part.first + t : null
}

/** The face a triangle of the body belongs to, and its name. */
export function faceAt(body: Body, triangle: number): { index: number; face: BodyFace } | null {
  const index = body.faceOfTriangle[triangle]
  return index === undefined ? null : { index, face: body.faces[index] }
}

/** A face's edges and its corners — what edit mode draws when the face is picked. */
export function outlineOfFace(body: Body, face: number): { edges: BodyEdge[]; vertices: BodyVertex[] } {
  const edges = body.edges.filter((e) => e.faces.includes(face))
  const ids = new Set(edges.map((e) => body.edges.indexOf(e)))
  return { edges, vertices: body.vertices.filter((v) => v.edges.some((e) => ids.has(e))) }
}

/** Two face names mean the same face. */
export function sameFace(a: FaceName, b: FaceName): boolean {
  return a.feature === b.feature && a.role === b.role && a.profile === b.profile && (a.segment ?? -1) === (b.segment ?? -1)
}
