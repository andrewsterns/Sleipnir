// G / R / S in an environment (src/canvas/LAYOUT.md), Blender's way: press the
// key, move the mouse, X / Y / Z locks to an axis, a typed number sets the
// amount, Enter or a click keeps it, Esc or a right-click puts it back.
//
//   on parts            → the part moves as a whole: its own placement
//                         (document/objects.ts CanvasObject.placement), so its
//                         sketch keeps its plane and a lid can swing on its hinge
//   on other layers     → the layer's plane moves, as the handles move it
//   on points and edges → the outline points they are (geometry/editBody.ts)
//   on faces            → the same rules: pulling a box's top face deepens its
//                         extrude, pushing a side moves that side
//
// A lone face pushes and pulls along its normal until an axis is chosen —
// SketchUp's push/pull, on the same key. E on a lone face grows new material
// out of it instead (editBody.ts extrudeFace), leaving the rest of the part be.
//
// Pure: the 3D view feeds it the pointer and a ScreenView of its camera and
// previews the doc it returns, always worked out from the doc the move began
// on, so nothing accumulates.

import type { CanvasDoc, NodeId } from '../../document/types'
import { findNode, updateNode } from '../../document/doc'
import { objectsOf, partReading, setPartPlacement, type CanvasObject, type FaceName, type ObjectId } from '../../document/objects'
import { eulerOf, placementOf, planeToWorld, rotate, rotateAbout, unrotate } from '../../document/placement'
import type { Placement3D, Vec3 } from '../../document/sceneTypes'
import { bodyOf, outlineOfFace } from '../geometry/body'
import { editBody, extrudeFace, faceIndexOf, type BodyPick } from '../geometry/editBody'
import { elementCenter, type ElementRef, type SelectMode } from './selectionModes'

export type ModalKind = 'grab' | 'rotate' | 'scale' | 'extrude'
export type AxisLock = 'x' | 'y' | 'z' | null

/** The 3D view's camera, as the move needs it: screen px in, scene meters out. */
export interface ScreenView {
  /** The ray under a screen point. */
  ray: (x: number, y: number) => { origin: Vec3; dir: Vec3 }
  /** Where a scene point lands on screen, or null behind the camera. */
  project: (p: Vec3) => { x: number; y: number } | null
  /** Which way the camera looks (unit). */
  forward: Vec3
}

export interface Modal {
  kind: ModalKind
  /** What it turns and scales about: the middle of what's moving. */
  pivot: Vec3
  /** Where the pointer was when it began, screen px. */
  start: { x: number; y: number }
  axis: AxisLock
  /** A lone face's normal: grab pushes and pulls along it until an axis is chosen. */
  normal?: Vec3
  /** The number typed so far, '' for none. */
  typed: string
}

/** A move about the pivot, in scene meters and degrees. */
export type Shift = { kind: 'translate'; by: Vec3 } | { kind: 'rotate'; axis: Vec3; deg: number } | { kind: 'scale'; by: Vec3 }
/** Or new material out of a face, `amount` meters along its normal. */
export type Move = Shift | { kind: 'extrude'; amount: number }

/** What G / R / S acts on. */
export type ModalTarget = { kind: 'parts'; parts: ObjectId[]; layers: NodeId[] } | { kind: 'elements'; elements: ElementRef[] }

const AXES: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
const RAD = Math.PI / 180
// Ctrl while moving: centimeters, 5° and tenths, as Blender snaps.
const SNAP = { grab: 0.01, rotate: 5, scale: 0.1 }
// Scene points closer than this are the same corner (body.ts welds at a tenth of a millimeter).
const SAME_POINT = 1e-5

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const times = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const round = (n: number, step: number) => Math.round(n / step) * step
const tidy = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places || 0

// ── The modal itself ───────────────────────────────────────────────────────

export function startModal(kind: ModalKind, pivot: Vec3, start: { x: number; y: number }, normal?: Vec3): Modal {
  return { kind, pivot, start, axis: null, typed: '', ...(normal ? { normal } : {}) }
}

/**
 * A key while moving: the next modal, 'keep' (Enter), 'cancel' (Esc), or null
 * for a key that means nothing here. X / Y / Z lock to an axis (again: free),
 * G / R / S switch what the move does, digits, '.', '-' and Backspace type the amount.
 */
export function modalKey(modal: Modal, key: string): Modal | 'keep' | 'cancel' | null {
  if (key === 'Enter') return 'keep'
  if (key === 'Escape') return 'cancel'
  const k = key.length === 1 ? key.toLowerCase() : key
  if (k === 'x' || k === 'y' || k === 'z') return { ...modal, axis: modal.axis === k ? null : k }
  if (k === 'g' || k === 'r' || k === 's') {
    const kind: ModalKind = k === 'g' ? 'grab' : k === 'r' ? 'rotate' : 'scale'
    return kind === modal.kind ? modal : { ...modal, kind, typed: '' }
  }
  if (/^[0-9]$/.test(k)) return { ...modal, typed: modal.typed + k }
  if (k === '.' && !modal.typed.includes('.')) return { ...modal, typed: modal.typed + '.' }
  if (k === '-') return { ...modal, typed: modal.typed.startsWith('-') ? modal.typed.slice(1) : `-${modal.typed}` }
  if (k === 'Backspace') return { ...modal, typed: modal.typed.slice(0, -1) }
  return null
}

/** The point on a line (`point` + s·`dir`) nearest the ray under a screen point, as s. */
function alongLine(view: ScreenView, at: { x: number; y: number }, point: Vec3, dir: Vec3): number | null {
  const { origin, dir: d } = view.ray(at.x, at.y)
  const w0 = sub(point, origin)
  const a = dot(dir, dir)
  const b = dot(dir, d)
  const c = dot(d, d)
  const denom = a * c - b * b
  // Looking straight down the axis: the pointer can't say how far along it.
  if (Math.abs(denom) < 1e-6 * a * c) return null
  return (b * dot(d, w0) - c * dot(dir, w0)) / denom
}

/** Where the ray under a screen point meets the plane through `point` square to `normal`. */
function onPlane(view: ScreenView, at: { x: number; y: number }, point: Vec3, normal: Vec3): Vec3 | null {
  const { origin, dir } = view.ray(at.x, at.y)
  const facing = dot(dir, normal)
  if (Math.abs(facing) < 1e-9) return null
  return add(origin, times(dir, dot(sub(point, origin), normal) / facing))
}

/** What the move is with the pointer here: the typed amount if there is one, else the pointer's travel. */
export function moveOf(modal: Modal, pointer: { x: number; y: number }, view: ScreenView, snap = false): Move {
  const lock = modal.axis ? AXES[modal.axis] : null
  const typed = Number.parseFloat(modal.typed)
  const hasTyped = Number.isFinite(typed)
  if (modal.kind === 'extrude') {
    if (hasTyped) return { kind: 'extrude', amount: typed }
    const s0 = modal.normal ? alongLine(view, modal.start, modal.pivot, modal.normal) : null
    const s1 = modal.normal ? alongLine(view, pointer, modal.pivot, modal.normal) : null
    const amount = s0 === null || s1 === null ? 0 : s1 - s0
    return { kind: 'extrude', amount: snap ? round(amount, SNAP.grab) : amount }
  }
  // The view's own axis, toward the viewer: turning about it looks counterclockwise on screen.
  const toViewer = view.forward.map((v) => (v ? -v : 0)) as Vec3

  if (modal.kind === 'grab') {
    const dir = lock ?? modal.normal ?? null
    if (hasTyped) return { kind: 'translate', by: times(dir ?? AXES.x, typed) }
    if (dir) {
      const s0 = alongLine(view, modal.start, modal.pivot, dir)
      const s1 = alongLine(view, pointer, modal.pivot, dir)
      const s = s0 === null || s1 === null ? 0 : snap ? round(s1 - s0, SNAP.grab) : s1 - s0
      return { kind: 'translate', by: times(dir, s) }
    }
    const p0 = onPlane(view, modal.start, modal.pivot, view.forward)
    const p1 = onPlane(view, pointer, modal.pivot, view.forward)
    const by = p0 && p1 ? sub(p1, p0) : ([0, 0, 0] as Vec3)
    return { kind: 'translate', by: snap ? (by.map((v) => round(v, SNAP.grab)) as Vec3) : by }
  }

  const center = view.project(modal.pivot) ?? modal.start
  if (modal.kind === 'rotate') {
    const axis = lock ?? toViewer
    if (hasTyped) return { kind: 'rotate', axis, deg: typed }
    // Screen y runs down: flip it so counterclockwise is positive.
    const a0 = Math.atan2(-(modal.start.y - center.y), modal.start.x - center.x)
    const a1 = Math.atan2(-(pointer.y - center.y), pointer.x - center.x)
    let deg = ((((a1 - a0) / RAD + 540) % 360) - 180)
    // An axis pointing away from the viewer turns the other way round on screen.
    if (lock && dot(lock, toViewer) < 0) deg = -deg
    return { kind: 'rotate', axis, deg: snap ? round(deg, SNAP.rotate) : deg }
  }

  const from = Math.hypot(modal.start.x - center.x, modal.start.y - center.y)
  let f = hasTyped ? typed : Math.hypot(pointer.x - center.x, pointer.y - center.y) / Math.max(from, 1)
  if (snap && !hasTyped) f = round(f, SNAP.scale)
  const by: Vec3 = lock ? [lock[0] ? f : 1, lock[1] ? f : 1, lock[2] ? f : 1] : [f, f, f]
  return { kind: 'scale', by }
}

/** The move in words, for the 3D view to show while it happens. */
export function describeMove(modal: Modal, move: Move): string {
  const typed = modal.typed ? ` (typed ${modal.typed})` : ''
  if (move.kind === 'extrude') return `Extrude ${tidy(move.amount, 3)} m${typed}`
  const along = modal.axis ? ` along ${modal.axis.toUpperCase()}` : modal.normal && move.kind === 'translate' ? ' along the face' : ''
  if (move.kind === 'translate') {
    const dir = modal.axis ? AXES[modal.axis] : modal.normal
    if (dir) return `Move${along} ${tidy(dot(move.by, dir), 3)} m${typed}`
    return `Move ${move.by.map((v) => tidy(v, 3)).join(', ')} m${typed}`
  }
  if (move.kind === 'rotate') return `Rotate ${tidy(move.deg, 1)}° about ${modal.axis ? modal.axis.toUpperCase() : 'the view'}${typed}`
  const f = modal.axis ? move.by[{ x: 0, y: 1, z: 2 }[modal.axis]] : move.by[0]
  return `Scale ${tidy(f, 3)}×${along}${typed}`
}

// ── Moves applied ──────────────────────────────────────────────────────────

/** A scene point after the move. */
export function movePoint(move: Shift, pivot: Vec3, p: Vec3): Vec3 {
  if (move.kind === 'translate') return add(p, move.by)
  if (move.kind === 'rotate') return add(pivot, rotateAbout(sub(p, pivot), move.axis, move.deg))
  const d = sub(p, pivot)
  return add(pivot, [d[0] * move.by[0], d[1] * move.by[1], d[2] * move.by[2]])
}

/**
 * A placement (a part's, or a layer's plane) after the move about `pivot`.
 * A turned part stretches along its own axes, so scaling never shears it.
 */
export function movePlacement(move: Shift, pivot: Vec3, placement: Placement3D): Placement3D {
  const { position, rotation } = placement
  const scale = placement.scale ?? [1, 1, 1]
  let next: Placement3D
  if (move.kind === 'translate') next = { position: add(position, move.by), rotation, scale }
  else if (move.kind === 'rotate') {
    const turn = (v: Vec3) => rotateAbout(v, move.axis, move.deg)
    const axes = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]).map((e) => turn(rotate(e, rotation)))
    next = { position: add(pivot, turn(sub(position, pivot))), rotation: eulerOf(axes[0], axes[1], axes[2]), scale }
  } else {
    const d = unrotate(sub(position, pivot), rotation)
    next = {
      position: add(pivot, rotate([d[0] * move.by[0], d[1] * move.by[1], d[2] * move.by[2]], rotation)),
      rotation,
      scale: [scale[0] * move.by[0], scale[1] * move.by[1], scale[2] * move.by[2]],
    }
  }
  const out: Placement3D = { position: next.position.map((v) => tidy(v)) as Vec3, rotation: next.rotation.map((v) => tidy(v, 2)) as Vec3 }
  const s = next.scale!.map((v) => tidy(v)) as Vec3
  return s.every((v) => v === 1) ? out : { ...out, scale: s }
}

const isIdentity = (p: Placement3D) => p.position.every((v) => v === 0) && p.rotation.every((v) => v === 0) && (p.scale ?? [1, 1, 1]).every((v) => v === 1)
const UNPLACED: Placement3D = { position: [0, 0, 0], rotation: [0, 0, 0] }

// ── What moves ─────────────────────────────────────────────────────────────

/** What G / R / S would move: the picked elements in edit mode; in object mode the selected parts, and other selected top-level layers. */
export function modalTargetOf(doc: CanvasDoc, selectedIds: ReadonlySet<NodeId>, mode: SelectMode, elements: ElementRef[]): ModalTarget | null {
  if (mode !== 'object') return elements.length ? { kind: 'elements', elements } : null
  const parts = new Set<ObjectId>()
  const layers: NodeId[] = []
  for (const id of selectedIds) {
    const reading = partReading(doc, id)
    if (reading && !reading.object.hidden) parts.add(reading.object.id)
    else if (doc.nodes.some((n) => n.id === id)) layers.push(id)
  }
  return parts.size || layers.length ? { kind: 'parts', parts: [...parts], layers } : null
}

const partsOf = (doc: CanvasDoc, ids: ObjectId[]): CanvasObject[] => objectsOf(doc).filter((o) => ids.includes(o.id))

/** The middle of what moves — the pivot it turns and scales about. */
export function pivotOf(doc: CanvasDoc, target: ModalTarget): Vec3 | null {
  if (target.kind === 'elements') {
    const centers = target.elements.flatMap((ref) => {
      const object = objectsOf(doc).find((o) => o.id === ref.objectId)
      const c = object ? elementCenter(bodyOf(doc, object), ref) : null
      return c ? [c] : []
    })
    if (!centers.length) return null
    return times(centers.reduce((s, c) => add(s, c), [0, 0, 0] as Vec3), 1 / centers.length)
  }
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const reach = (p: Vec3) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i])
      max[i] = Math.max(max[i], p[i])
    }
  }
  for (const object of partsOf(doc, target.parts)) {
    const { positions } = bodyOf(doc, object).mesh
    for (let i = 0; i < positions.length; i += 3) reach([positions[i], positions[i + 1], positions[i + 2]])
  }
  for (const id of target.layers) {
    const node = findNode(doc, id)
    if (!node) continue
    const placement = placementOf(node)
    for (const [u, v] of [[0, 0], [node.rect.w, 0], [0, node.rect.h], [node.rect.w, node.rect.h]]) reach(planeToWorld(placement, u, v))
  }
  return Number.isFinite(min[0]) ? times(add(min, max), 0.5) : null
}

/** A lone flat face's outward normal — the line push/pull runs along — or undefined for a curved one or anything else. */
export function pushNormalOf(doc: CanvasDoc, target: ModalTarget): Vec3 | undefined {
  if (target.kind !== 'elements' || target.elements.length !== 1 || target.elements[0].kind !== 'face') return undefined
  const ref = target.elements[0]
  const object = objectsOf(doc).find((o) => o.id === ref.objectId)
  if (!object) return undefined
  const body = bodyOf(doc, object)
  let sum: Vec3 = [0, 0, 0]
  let area = 0
  for (const t of body.faces[ref.index]?.triangles ?? []) {
    const [a, b, c] = [0, 1, 2].map((k): Vec3 => {
      const i = body.mesh.indices[t * 3 + k]
      return [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]]
    })
    const n = cross(sub(b, a), sub(c, a))
    sum = add(sum, n)
    area += Math.hypot(...n)
  }
  const len = Math.hypot(...sum)
  // A curve's triangles face many ways: there's no one line to pull along.
  return area > 0 && len / area > 0.99 ? times(sum, 1 / len) : undefined
}

export interface ModalResult {
  doc: CanvasDoc
  /** What it did, in words — or, when nothing could move, why. */
  said: string
  blocked?: boolean
  /** What's picked once it's kept, when that isn't simply what was: an extrude picks its new end. */
  elements?: ElementRef[]
}

/** The move applied to what it acts on, from the doc it began on. */
export function applyMove(doc: CanvasDoc, target: ModalTarget, move: Move, pivot: Vec3): ModalResult {
  if (move.kind === 'extrude') {
    const ref = target.kind === 'elements' && target.elements.length === 1 && target.elements[0].kind === 'face' ? target.elements[0] : null
    if (!ref) return { doc, said: 'Pick one face to extrude', blocked: true }
    const edit = extrudeFace(doc, ref.objectId, ref.index, move.amount)
    if ('blocked' in edit) return { doc, said: edit.blocked, blocked: true }
    const object = objectsOf(edit.doc).find((o) => o.id === ref.objectId)
    const end = object && edit.feature ? bodyOf(edit.doc, object).faces.findIndex((f) => f.name.feature === edit.feature && f.name.role === 'end') : -1
    return { doc: edit.doc, said: edit.did, ...(end >= 0 ? { elements: [{ ...ref, index: end }] } : {}) }
  }
  if (target.kind === 'parts') {
    let next = doc
    for (const object of partsOf(doc, target.parts)) {
      const placement = movePlacement(move, pivot, object.placement ?? UNPLACED)
      next = setPartPlacement(next, object.id, isIdentity(placement) ? undefined : placement)
    }
    for (const id of target.layers) {
      const node = findNode(next, id)
      if (!node) continue
      const space = movePlacement(move, pivot, placementOf(node))
      // As the handles do: a sketch held to a plane lets go of it, and is placed freely.
      const held = !!node.sketch && node.sketch.plane.kind !== 'custom'
      next = updateNode(next, id, held ? { space, sketch: { link: node.sketch?.link, plane: { kind: 'custom' } } } : { space })
    }
    const count = target.parts.length + target.layers.length
    const what = count === 1 ? (partsOf(doc, target.parts)[0]?.name ?? findNode(doc, target.layers[0])?.name ?? 'it') : `${count} things`
    return { doc: next, said: `${move.kind === 'translate' ? 'Moved' : move.kind === 'rotate' ? 'Turned' : 'Scaled'} ${what}` }
  }
  return applyToElements(doc, target.elements, move, pivot)
}

/** One thing to move: a corner where it was, or a cap by its lasting name. */
type Step = { objectId: ObjectId; at: Vec3; face?: FaceName }

/**
 * Picked elements moved through the editing rules, one at a time, each found
 * again in the body the last one left: a cap by its lasting name, a corner
 * by where it was — and one that has moved already (the far end of a side,
 * say, which is the same outline point) is left alone, so nothing moves twice.
 */
function applyToElements(doc: CanvasDoc, elements: ElementRef[], move: Shift, pivot: Vec3): ModalResult {
  const objects = new Map(objectsOf(doc).map((o) => [o.id, o]))
  // A lone element, moved straight: editBody reads it whole, and says best why not.
  if (elements.length === 1 && move.kind === 'translate') {
    const ref = elements[0]
    const pick: BodyPick = ref.kind === 'face' ? { kind: 'face', face: ref.index } : ref.kind === 'edge' ? { kind: 'edge', edge: ref.index } : { kind: 'vertex', vertex: ref.index }
    const edit = editBody(doc, ref.objectId, pick, move.by)
    return 'blocked' in edit ? { doc, said: edit.blocked, blocked: true } : { doc: edit.doc, said: edit.did }
  }
  const steps: Step[] = []
  const seen = new Set<string>()
  const corner = (objectId: ObjectId, at: Vec3) => {
    const key = `${objectId}:${at.map((v) => Math.round(v / SAME_POINT)).join(',')}`
    if (seen.has(key)) return
    seen.add(key)
    steps.push({ objectId, at })
  }
  for (const ref of elements) {
    const object = objects.get(ref.objectId)
    if (!object) continue
    const body = bodyOf(doc, object)
    if (ref.kind === 'vertex' && body.vertices[ref.index]) corner(ref.objectId, body.vertices[ref.index].at)
    if (ref.kind === 'edge') body.vertices.forEach((v) => v.edges.includes(ref.index) && corner(ref.objectId, v.at))
    if (ref.kind === 'face') {
      const face = body.faces[ref.index]
      if (!face) continue
      // A cap moved straight is depth, or where its sketch stands; anything else is its corners.
      if (move.kind === 'translate' && face.name.role !== 'side') steps.push({ objectId: ref.objectId, face: face.name, at: elementCenter(body, ref) ?? pivot })
      else outlineOfFace(body, ref.index).vertices.forEach((v) => corner(ref.objectId, v.at))
    }
  }
  let next = doc
  let moved = 0
  let why: string | null = null
  for (const step of steps) {
    const object = objectsOf(next).find((o) => o.id === step.objectId)
    if (!object) continue
    const body = bodyOf(next, object)
    let pick: BodyPick | null = null
    if (step.face) {
      const index = faceIndexOf(body, step.face)
      pick = index < 0 ? null : { kind: 'face', face: index }
    } else {
      const index = body.vertices.findIndex((v) => Math.hypot(...sub(v.at, step.at)) < SAME_POINT * 10)
      pick = index < 0 ? null : { kind: 'vertex', vertex: index }
    }
    if (!pick) continue
    const delta = sub(movePoint(move, pivot, step.at), step.at)
    const edit = editBody(next, step.objectId, pick, delta)
    if ('blocked' in edit) {
      why ??= edit.blocked
      continue
    }
    next = edit.doc
    moved += 1
  }
  if (!moved) return { doc, said: why ?? 'Nothing there moves that way', blocked: true }
  const verb = move.kind === 'translate' ? 'Moved' : move.kind === 'rotate' ? 'Turned' : 'Scaled'
  return { doc: next, said: `${verb} ${elements.length} ${elements[0].kind === 'vertex' ? 'points' : elements[0].kind === 'edge' ? 'edges' : 'faces'}${why ? ` — some couldn’t: ${why}` : ''}` }
}

/**
 * The pick after an edit: the same indices while the parts' shapes keep their
 * counts of faces, edges and corners (moving points doesn't change them);
 * otherwise faces by their lasting names, and the rest let go.
 */
export function elementsAfter(before: CanvasDoc, after: CanvasDoc, elements: ElementRef[]): ElementRef[] {
  const out: ElementRef[] = []
  for (const ref of elements) {
    const was = objectsOf(before).find((o) => o.id === ref.objectId)
    const now = objectsOf(after).find((o) => o.id === ref.objectId)
    if (!was || !now) continue
    const a = bodyOf(before, was)
    const b = bodyOf(after, now)
    if (a.faces.length === b.faces.length && a.edges.length === b.edges.length && a.vertices.length === b.vertices.length) out.push(ref)
    else if (ref.kind === 'face' && a.faces[ref.index]) {
      const index = faceIndexOf(b, a.faces[ref.index].name)
      if (index >= 0) out.push({ ...ref, index })
    }
  }
  return out
}
