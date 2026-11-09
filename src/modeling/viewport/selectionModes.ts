// Blender's select modes in an environment (src/canvas/LAYOUT.md): object mode
// picks whole layers, as always; edit mode (Tab) picks the parts' points (1),
// edges (2) or faces (3) — the bodies' named elements (geometry/body.ts) —
// with Shift adding, A all, Alt+A none and B a box. Pure, so the rules are
// tested without a GPU; the 3D view draws and feeds them.

import { faceAt, partTriangle, type Body } from '../geometry/body'
import { featureOf } from '../../document/objects'
import type { Vec3 } from '../../document/sceneTypes'

export type SelectMode = 'object' | 'vertex' | 'edge' | 'face'
export type ElementKind = Exclude<SelectMode, 'object'>

/** One element of one part's body: a corner, an edge or a face, by index. */
export interface ElementRef {
  objectId: string
  kind: ElementKind
  index: number
}

export const elementKey = (r: ElementRef) => `${r.objectId}:${r.kind}:${r.index}`
export const sameElement = (a: ElementRef | null | undefined, b: ElementRef | null | undefined) => !!a && !!b && elementKey(a) === elementKey(b)

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function distToLine(p: Vec3, line: Vec3[]): number {
  let best = line.length ? dist(p, line[0]) : Infinity
  for (let i = 1; i < line.length; i += 1) {
    const ab = sub(line[i], line[i - 1])
    const len = dot(ab, ab)
    const t = len ? Math.max(0, Math.min(1, dot(sub(p, line[i - 1]), ab) / len)) : 0
    best = Math.min(best, dist(p, [line[i - 1][0] + ab[0] * t, line[i - 1][1] + ab[1] * t, line[i - 1][2] + ab[2] * t]))
  }
  return best
}

/**
 * What a click on a body's triangle means in a select mode: the face it hit,
 * or the nearest of that face's edges or corners to where it landed — so a
 * point or edge is picked by clicking near it on the surface around it.
 */
export function elementAt(body: Body, kind: ElementKind, triangle: number, hit: Vec3): ElementRef | null {
  const face = faceAt(body, triangle)
  if (!face) return null
  if (kind === 'face') return { objectId: body.objectId, kind, index: face.index }
  const edges = body.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.faces.includes(face.index))
  if (kind === 'edge') {
    const near = edges.reduce<{ i: number; d: number } | null>((best, { e, i }) => {
      const d = distToLine(hit, e.points)
      return !best || d < best.d ? { i, d } : best
    }, null)
    return near ? { objectId: body.objectId, kind, index: near.i } : null
  }
  const ids = new Set(edges.map(({ i }) => i))
  const near = body.vertices.reduce<{ i: number; d: number } | null>((best, v, i) => {
    if (!v.edges.some((e) => ids.has(e))) return best
    const d = dist(hit, v.at)
    return !best || d < best.d ? { i, d } : best
  }, null)
  return near ? { objectId: body.objectId, kind, index: near.i } : null
}

/** A click's effect on the selection: Shift toggles it in or out, a plain click picks only it, a click on nothing clears. */
export function clickElement(selection: ElementRef[], ref: ElementRef | null, additive: boolean): ElementRef[] {
  if (!ref) return additive ? selection : []
  if (!additive) return [ref]
  return selection.some((r) => sameElement(r, ref)) ? selection.filter((r) => !sameElement(r, ref)) : [...selection, ref]
}

/** Every element of a kind across these bodies — A. */
export function allElements(bodies: Iterable<Body>, kind: ElementKind): ElementRef[] {
  const out: ElementRef[] = []
  for (const body of bodies) {
    const count = kind === 'face' ? body.faces.length : kind === 'edge' ? body.edges.length : body.vertices.length
    for (let index = 0; index < count; index += 1) out.push({ objectId: body.objectId, kind, index })
  }
  return out
}

/** Where an element is, for a box to catch it: a corner's spot, an edge's middle, a face's centre. */
export function elementCenter(body: Body, ref: ElementRef): Vec3 | null {
  if (ref.kind === 'vertex') return body.vertices[ref.index]?.at ?? null
  const points: Vec3[] =
    ref.kind === 'edge'
      ? (body.edges[ref.index]?.points ?? [])
      : (body.faces[ref.index]?.triangles ?? []).flatMap((t) =>
          [0, 1, 2].map((k): Vec3 => {
            const i = body.mesh.indices[t * 3 + k]
            return [body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]]
          }),
        )
  if (points.length === 0) return null
  const sum = points.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length]
}

/**
 * B: the elements whose centre a screen box holds. \`project\` turns a scene
 * point into screen px (null behind the camera); Shift adds to what's picked.
 */
export function boxSelect(
  bodies: Iterable<Body>,
  kind: ElementKind,
  project: (p: Vec3) => { x: number; y: number } | null,
  box: { x0: number; y0: number; x1: number; y1: number },
): ElementRef[] {
  const [l, r] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)]
  const [t, b] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)]
  // An iterable is read once: hold the bodies.
  const list = [...bodies]
  return allElements(list, kind).filter((ref) => {
    const body = list.find((bd) => bd.objectId === ref.objectId)
    const at = body && elementCenter(body, ref)
    const s = at && project(at)
    return !!s && s.x >= l && s.x <= r && s.y >= t && s.y <= b
  })
}

/** Adds one selection to another without doubles. */
export function mergeElements(a: ElementRef[], b: ElementRef[]): ElementRef[] {
  const seen = new Set(a.map(elementKey))
  return [...a, ...b.filter((r) => !seen.has(elementKey(r)))]
}

/**
 * The edit-mode keys: Tab between object mode and the last edit mode, 1 / 2 /
 * 3 straight into points, edges or faces, A all, Alt+A none. Null for any
 * other key, which the rest of the keymap handles.
 */
export function selectKey(
  key: string,
  alt: boolean,
  mode: SelectMode,
  lastEdit: ElementKind,
): { mode: SelectMode } | { select: 'all' | 'none' } | null {
  if (key === 'Tab') return { mode: mode === 'object' ? lastEdit : 'object' }
  if (key === '1') return { mode: 'vertex' }
  if (key === '2') return { mode: 'edge' }
  if (key === '3') return { mode: 'face' }
  if ((key === 'a' || key === 'A') && mode !== 'object') return { select: alt ? 'none' : 'all' }
  return null
}

/** The mode's name, for the view's bar: "Points", "Edges", "Faces". */
export const MODE_NAMES: Record<ElementKind, string> = { vertex: 'Points', edge: 'Edges', face: 'Faces' }

/**
 * A click on a layer's own mesh in the 3D view, as an element: the layer's
 * triangle is found in the body of the part it builds (geometry/body.ts
 * partTriangle), then read in the mode. Null on a flat layer, or nothing near.
 */
export function elementOfLayerHit(
  doc: import('../../document/types').CanvasDoc,
  bodies: Map<string, Body>,
  layerId: string,
  triangle: number,
  hit: Vec3,
  kind: ElementKind,
): ElementRef | null {
  const found = featureOf(doc, layerId)
  const body = found && bodies.get(found.object.id)
  if (!found || !body) return null
  const t = partTriangle(body, found.feature.id, layerId, triangle)
  return t === null ? null : elementAt(body, kind, t, hit)
}
