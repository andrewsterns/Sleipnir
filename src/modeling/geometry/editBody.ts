// What editing a part changes (src/canvas/LAYOUT.md): a picked face, edge or
// point of a body (body.ts) and a move in the scene, turned into a change of
// the sketch or the feature that made it — never an edit of the mesh itself,
// so the sketch stays the source and the part rebuilds from it, Onshape's way.
//
//   end cap, pulled along its normal   → the extrude's depth
//   start cap, pulled along its normal → the sketch moves off its plane, the
//                                        end cap staying where it was
//   side face, pushed                  → its outline segment's two points, in the plane
//   upright edge, moved in the plane   → that point of the outline
//   a corner, a rim, or anything moved  → those corners alone, in any direction:
//   out of the plane                     offsets on the feature (cornerTweaks.ts)
//
// Only the in-plane part of a face's move reaches the outline, and only the
// part along the normal reaches depth. A shape (rectangle, ellipse, polygon)
// becomes the path that draws it the first time a point of it moves — Figma's
// way. extrudeFace is the other thing a face can do: grow new material.
//
// Pure: a doc in, a doc out (the caller resolves planes and commits), or why
// not — a placed sketch is edited in its Sketch document, and revolves and
// sweeps are edited in the right panel for now.

import type { CanvasDoc, CanvasNode, CanvasVectorNode } from '../../document/types'
import { isVectorNode } from '../../document/types'
import { findNode, updateNode } from '../../document/doc'
import { addFeature, objectsOf, updateFeature, type CanvasObject, type CornerTweaks, type ExtrudeFeature, type FaceName, type Feature, type PlaneRef } from '../../document/objects'
import { linkOfLayer } from '../../document/placements'
import { createVectorNode } from '../../document/doc'
import { moveAnchors, refit, toEditablePath } from '../../document/vectorEdit'
import { worldToPlane } from '../../document/placement'
import { faceFrame, nextSketchName, resolvePlanes } from '../scene3d/planeRefs'
import { cornerKey, extrudeShift, profileAnchors, type Cap, type CornerRef } from './cornerTweaks'
import { rotate } from '../../document/placement'
import { PX_PER_METER, type Vec3 } from '../../document/sceneTypes'
import { bodyOf, sceneToLayer, type Body } from './body'

/** What was picked on a part: one of its body's faces, edges or corners, by index. */
export type BodyPick = { kind: 'face'; face: number } | { kind: 'edge'; edge: number } | { kind: 'vertex'; vertex: number }

/** The edit, said in words — or why there isn't one, and the Sketch to open when it belongs there. */
export type BodyEdit = { doc: CanvasDoc; did: string } | { blocked: string; sketch?: string }

// How close (px) a picked point or side must lie to an outline point or segment to be it.
const MATCH_PX = 1.5
const MIN_DEPTH = 0.001

const round = (n: number) => Math.round(n * 10_000) / 10_000

/** The names of the faces a pick touches: its own, an edge's two, a corner's every one. */
function facesOf(body: Body, pick: BodyPick): FaceName[] {
  const indices =
    pick.kind === 'face'
      ? [pick.face]
      : pick.kind === 'edge'
        ? (body.edges[pick.edge]?.faces ?? [])
        : [...new Set((body.vertices[pick.vertex]?.edges ?? []).flatMap((e) => body.edges[e]?.faces ?? []))]
  return indices.map((i) => body.faces[i]?.name).filter((n): n is FaceName => !!n)
}

/** The scene points a pick covers: a face's triangle corners, an edge's line, a corner's spot. */
function pointsOf(body: Body, pick: BodyPick): Vec3[] {
  if (pick.kind === 'vertex') return body.vertices[pick.vertex] ? [body.vertices[pick.vertex].at] : []
  if (pick.kind === 'edge') return body.edges[pick.edge]?.points ?? []
  const out: Vec3[] = []
  for (const t of body.faces[pick.face]?.triangles ?? []) {
    for (let k = 0; k < 3; k += 1) {
      const i = body.mesh.indices[t * 3 + k]
      out.push([body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]])
    }
  }
  return out
}

/**
 * Which corners of the extrude the picked points are — each outline point at
 * each end, wherever moved corners now stand. Null when a point isn't a
 * corner: a side running round a curve, say.
 */
function cornersOf(feature: ExtrudeFeature, profile: CanvasNode, local: { x: number; y: number; out: number }[]): CornerRef[] | null {
  const anchors = profileAnchors(profile)
  const depth = feature.depth * PX_PER_METER
  const shift = extrudeShift(feature, depth)
  const found = new Map<string, CornerRef>()
  for (const p of local) {
    let best: CornerRef | null = null
    let bestDist = Infinity
    anchors.forEach((a, anchor) => {
      for (const cap of ['start', 'end'] as Cap[]) {
        const [tx, ty, tz] = feature.tweaks?.[cornerKey({ anchor, cap })] ?? [0, 0, 0]
        const d = Math.hypot(a.x + tx - p.x, a.y + ty - p.y, (cap === 'end' ? depth : 0) + shift + tz - p.out)
        if (d < bestDist) [best, bestDist] = [{ anchor, cap }, d]
      }
    })
    if (!best || bestDist > MATCH_PX) return null
    found.set(cornerKey(best), best)
  }
  return [...found.values()]
}

/** Moves a profile's outline points by an in-plane offset, keeping everything else where it was on its plane. */
function moveOutline(doc: CanvasDoc, profile: CanvasVectorNode, indices: number[], dx: number, dy: number): CanvasDoc {
  const path = toEditablePath(profile)
  const moved = refit(moveAnchors(path, indices, path.points ?? [], dx, dy))
  const shift = { x: moved.rect.x - profile.rect.x, y: moved.rect.y - profile.rect.y }
  const top = doc.nodes.find((n) => n.id === profile.id)
  if (!top) return updateNode(doc, profile.id, moved)
  // A sketch on a plane is placed by its spot there, not its rect: the spot follows the refit.
  if (top.sketch && top.sketch.plane.kind !== 'custom') {
    const at = top.sketch.at ?? { u: 0, v: 0 }
    return updateNode(doc, profile.id, { ...moved, sketch: { ...top.sketch, at: { u: round(at.u + shift.x), v: round(at.v + shift.y) } } })
  }
  if (top.space) {
    const [sx, sy] = top.space.scale ?? [1, 1, 1]
    const [ox, oy, oz] = rotate([(shift.x / PX_PER_METER) * sx, (-shift.y / PX_PER_METER) * sy, 0], top.space.rotation)
    const [px, py, pz] = top.space.position
    return updateNode(doc, profile.id, { ...moved, space: { ...top.space, position: [round(px + ox), round(py + oy), round(pz + oz)] } })
  }
  return updateNode(doc, profile.id, moved)
}

/** A start cap pulled out: the sketch slides along its plane's normal by `meters`, and the extrude shortens to keep its end. */
function moveStartCap(doc: CanvasDoc, feature: ExtrudeFeature, profile: CanvasNode, meters: number): BodyEdit {
  const top = doc.nodes.find((n) => n.id === profile.id)
  const plane = top?.sketch?.plane
  if (!top || !plane || (plane.kind !== 'default' && plane.kind !== 'offset')) {
    return { blocked: 'This face moves with its sketch — pull the other end, or move the sketch' }
  }
  const next: PlaneRef = plane.kind === 'offset' ? { ...plane, distance: round(plane.distance + meters) } : { kind: 'offset', from: plane, distance: round(meters) }
  const depth = Math.max(MIN_DEPTH, round(feature.depth - meters))
  const moved = updateNode(doc, top.id, { sketch: { ...top.sketch!, plane: next } })
  return { doc: updateFeature(moved, feature.id, { depth }), did: `${feature.name} starts ${round(meters)} m further out` }
}

/**
 * Editing a part by a picked face, edge or corner, moved by \`delta\` (scene
 * meters): the change to its sketch or feature, or why it can't be made here.
 */
export function editBody(doc: CanvasDoc, objectId: string, pick: BodyPick, delta: Vec3): BodyEdit {
  const object: CanvasObject | undefined = objectsOf(doc).find((o) => o.id === objectId)
  if (!object) return { blocked: 'That part is gone' }
  const body = bodyOf(doc, object)
  const names = facesOf(body, pick)
  if (names.length === 0) return { blocked: 'Nothing to edit there' }
  if (new Set(names.map((n) => `${n.feature}|${n.profile}`)).size > 1) return { blocked: 'That lies where two features meet — pick a face of one of them' }
  const { feature: featureId, profile: profileId } = names[0]
  const feature: Feature | undefined = object.features.find((f) => f.id === featureId)
  const profile = findNode(doc, profileId)
  if (!feature || !profile) return { blocked: 'What built that is gone' }

  const placed = linkOfLayer(doc, profileId)
  if (placed) return { blocked: `Placed from a sketch — edit “${placed.node.name}” there`, sketch: placed.link.doc }
  if (feature.kind === 'revolve') return { blocked: `${feature.name} spins its sketch — edit the sketch, or its angle and axis in the right panel` }
  if (feature.kind === 'sweep') return { blocked: `${feature.name} follows a path — edit the sketch or the path` }
  if (feature.kind === 'loft') return { blocked: 'Lofts aren’t built yet' }

  const toLocal = sceneToLayer(doc, profile)
  const at = pointsOf(body, pick)[0]
  if (!at) return { blocked: 'Nothing to edit there' }
  const from = toLocal(at)
  const to = toLocal([at[0] + delta[0], at[1] + delta[1], at[2] + delta[2]])
  const d = { x: to.x - from.x, y: to.y - from.y, out: (to.out - from.out) / PX_PER_METER }

  // A cap pulled along its normal: depth, or where the sketch stands.
  if (pick.kind === 'face' && names[0].role !== 'side') {
    if (names[0].role === 'end') {
      const sign = feature.direction === 'reverse' ? -1 : feature.direction === 'symmetric' ? 2 : 1
      const depth = Math.max(MIN_DEPTH, round(feature.depth + sign * d.out))
      return { doc: updateFeature(doc, feature.id, { depth }), did: `${feature.name} is ${depth} m deep` }
    }
    if (feature.direction === 'reverse' || feature.direction === 'symmetric') return { blocked: 'Pull the other end to change its depth' }
    return moveStartCap(doc, feature, profile, d.out)
  }

  // Everything else is corners: which ones the pick covers, wherever they now stand.
  const corners = cornersOf(feature, profile, pointsOf(body, pick).map((p) => toLocal(p)))
  if (!corners) return { blocked: 'That side runs round a curve — move the curve’s points in sketch mode' }
  const anchors = [...new Set(corners.map((c) => c.anchor))]
  // Both ends of each outline point, moved within the plane: that's an edit of the sketch itself. A face only ever moves this way.
  const whole = anchors.every((a) => corners.some((c) => c.anchor === a && c.cap === 'start') && corners.some((c) => c.anchor === a && c.cap === 'end'))
  if (isVectorNode(profile) && whole && (pick.kind === 'face' || Math.abs(d.out) < 1e-6)) {
    const next = moveOutline(doc, profile, anchors, d.x, d.y)
    return { doc: next, did: anchors.length === 1 ? `Moved a point of ${profile.name}` : `Moved a side of ${profile.name}` }
  }
  // Anything else moves just those corners, in any direction.
  const tweaks: CornerTweaks = { ...feature.tweaks }
  for (const c of corners) {
    const [x, y, z] = tweaks[cornerKey(c)] ?? [0, 0, 0]
    tweaks[cornerKey(c)] = [round(x + d.x), round(y + d.y), round(z + d.out * PX_PER_METER)]
  }
  return { doc: updateFeature(doc, feature.id, { tweaks }), did: corners.length === 1 ? `Moved a point of ${profile.name}` : `Moved ${corners.length} points of ${profile.name}` }
}

/** A flat face's outer boundary in order, scene points — chained from the triangle sides only one of its triangles uses. */
function faceBoundary(body: Body, face: number): Vec3[] | null {
  const point = (i: number): Vec3 => [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]]
  const key = (p: Vec3) => p.map((v) => Math.round(v * 1e5)).join(',')
  const sides = new Map<string, { from: Vec3; to: Vec3; uses: number }>()
  for (const t of body.faces[face].triangles) {
    for (let k = 0; k < 3; k += 1) {
      const from = point(body.mesh.indices[t * 3 + k])
      const to = point(body.mesh.indices[t * 3 + ((k + 1) % 3)])
      if (key(from) === key(to)) continue
      const id = [key(from), key(to)].sort().join('|')
      const seen = sides.get(id)
      if (seen) seen.uses += 1
      else sides.set(id, { from, to, uses: 1 })
    }
  }
  const next = new Map<string, Vec3>()
  for (const s of sides.values()) if (s.uses === 1) next.set(key(s.from), s.to)
  // The longest loop is the outer one; holes are left out.
  let best: Vec3[] = []
  const seen = new Set<string>()
  for (const [startKey, first] of next) {
    if (seen.has(startKey)) continue
    const loop: Vec3[] = []
    let at: Vec3 | undefined = first
    let atKey = startKey
    while (at && !seen.has(atKey)) {
      seen.add(atKey)
      loop.push(at)
      atKey = key(at)
      at = next.get(atKey)
    }
    if (loop.length > best.length) best = loop
  }
  return best.length >= 3 ? best : null
}

/**
 * New material out of one flat face, along its normal by `meters` — Blender's
 * extrude, Onshape's sketch-on-a-face: a sketch of the face's outline stands on
 * it and a feature of the same part extrudes it, so the rest of the part is
 * untouched and it rides along if that face moves. Negative pushes the face in.
 */
export function extrudeFace(doc: CanvasDoc, objectId: string, face: number, meters: number): BodyEdit & { feature?: string } {
  const object = objectsOf(doc).find((o) => o.id === objectId)
  if (!object) return { blocked: 'That part is gone' }
  const body = bodyOf(doc, object)
  const named = body.faces[face]?.name
  if (!named) return { blocked: 'Nothing to extrude there' }
  const frame = faceFrame(doc, body, face)
  const normal = rotate([0, 0, 1], frame.rotation)
  if (meters <= 0) {
    if (meters === 0) return { doc, did: 'Extrude 0 m' }
    return editBody(doc, objectId, { kind: 'face', face }, [normal[0] * meters, normal[1] * meters, normal[2] * meters])
  }
  const loop = faceBoundary(body, face)
  if (!loop) return { blocked: 'That face has no outline to extrude' }
  const placement = { position: frame.origin, rotation: frame.rotation }
  const flat = loop.map((p) => worldToPlane(placement, p))
  // A moved corner bends a face a little; the new material starts from its average plane. Beyond a little, it's not a face to grow from.
  const span = Math.max(Math.max(...flat.map((p) => p.u)) - Math.min(...flat.map((p) => p.u)), Math.max(...flat.map((p) => p.v)) - Math.min(...flat.map((p) => p.v)))
  if (flat.some((p) => Math.abs(p.out) > span * 0.15)) return { blocked: 'That face isn’t flat enough to extrude' }
  const x0 = Math.min(...flat.map((p) => p.u))
  const y0 = Math.min(...flat.map((p) => p.v))
  const points = flat.map((p) => ({ x: round(p.u - x0), y: round(p.v - y0) }))
  const rect = { x: 0, y: 0, w: Math.max(...points.map((p) => p.x)) || 1, h: Math.max(...points.map((p) => p.y)) || 1 }
  const source = findNode(doc, named.profile)
  const sketch: CanvasNode = {
    ...createVectorNode(rect, 'path', { points, closed: true, viewBox: { w: rect.w, h: rect.h } }),
    name: nextSketchName(doc),
    // The same stuff as the face it grows from.
    style: { fills: source?.style.fills ?? [] },
    sketch: { plane: { kind: 'face', objectId, face: named }, at: { u: round(x0), v: round(y0) } },
  }
  const stood = resolvePlanes({ ...doc, nodes: [...doc.nodes, sketch] })
  const depth = Math.max(MIN_DEPTH, round(meters))
  const added = addFeature(stood, objectId, sketch.id, { kind: 'extrude', depth })
  return { doc: resolvePlanes(added.doc), did: `Extruded the face ${depth} m`, feature: added.featureId }
}

/** For callers holding a face, not an index: the body face with this lasting name. */
export function faceIndexOf(body: Body, name: FaceName): number {
  return body.faces.findIndex((f) => f.name.feature === name.feature && f.name.role === name.role && f.name.profile === name.profile && (f.name.segment ?? -1) === (name.segment ?? -1))
}

