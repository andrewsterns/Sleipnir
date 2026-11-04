// Planes in space: where a layer sits in 3D, and the conversions between a
// point on its plane (board px, x right, y down) and a point in the scene
// (meters, y up). Plain math, no three.js, so the 2D board can use it too —
// the cross-plane sketch guides project one plane's points onto another with it.

import type { CanvasDoc, CanvasNode, CanvasRect } from './types'
import { PX_PER_METER, type Placement3D, type PlanePreset, type Vec3 } from './sceneTypes'

/**
 * The rotation that stands a sketch on each drafting plane. Front faces the
 * viewer (+Z). Top lies on the ground facing up (+Y), its top edge pointing
 * away (-Z) as a plan view does. Side faces right (+X), its right edge pointing
 * away (-Z), as seen from the right.
 */
export const PLANE_ROTATION: Record<PlanePreset, Vec3> = {
  front: [0, 0, 0],
  top: [-90, 0, 0],
  side: [0, 90, 0],
}

/** Where a layer stands when nothing says otherwise: on the front plane, where the board shows it. */
export function defaultPlacement(rect: Pick<CanvasRect, 'x' | 'y'>): Placement3D {
  return { position: [rect.x / PX_PER_METER, -rect.y / PX_PER_METER, 0], rotation: [0, 0, 0] }
}

/** A top-level layer's placement — its own, or the front-plane default. */
export function placementOf(node: Pick<CanvasNode, 'rect' | 'space'>): Placement3D {
  return node.space ?? defaultPlacement(node.rect)
}

const near = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) < 0.01

/** Which drafting plane a rotation is, or 'custom' for any other angle. */
export function planeOf(rotation: Vec3): PlanePreset | 'custom' {
  for (const [preset, r] of Object.entries(PLANE_ROTATION) as [PlanePreset, Vec3][]) {
    if (r.every((deg, i) => near(deg, rotation[i]))) return preset
  }
  return 'custom'
}

// ── Rotation ───────────────────────────────────────────────────────────────

const RAD = Math.PI / 180

function rotX([x, y, z]: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [x, y * c - z * s, y * s + z * c]
}
function rotY([x, y, z]: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [x * c + z * s, y, -x * s + z * c]
}
function rotZ([x, y, z]: Vec3, deg: number): Vec3 {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return [x * c - y * s, x * s + y * c, z]
}

/** `v` turned by an 'XYZ' Euler rotation — the matrix Rx·Ry·Rz, as three.js builds it. */
export function rotate(v: Vec3, [rx, ry, rz]: Vec3): Vec3 {
  return rotX(rotY(rotZ(v, rz), ry), rx)
}

/** The inverse of rotate(). */
export function unrotate(v: Vec3, [rx, ry, rz]: Vec3): Vec3 {
  return rotZ(rotY(rotX(v, -rx), -ry), -rz)
}

// ── Plane ⇄ space ──────────────────────────────────────────────────────────

/** A point on a layer's plane (board px, y down; `out` px off the plane toward its front) in scene meters. */
export function planeToWorld(placement: Placement3D, u: number, v: number, out = 0): Vec3 {
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1]
  const local: Vec3 = [(u / PX_PER_METER) * sx, (-v / PX_PER_METER) * sy, (out / PX_PER_METER) * sz]
  const [x, y, z] = rotate(local, placement.rotation)
  const [px, py, pz] = placement.position
  return [x + px, y + py, z + pz]
}

/** A scene point on a layer's plane: [u, v] in board px, and how far in front of the plane it is. */
export function worldToPlane(placement: Placement3D, world: Vec3): { u: number; v: number; out: number } {
  const [px, py, pz] = placement.position
  const [x, y, z] = unrotate([world[0] - px, world[1] - py, world[2] - pz], placement.rotation)
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1]
  return { u: (x / (sx || 1)) * PX_PER_METER, v: (-y / (sy || 1)) * PX_PER_METER, out: (z / (sz || 1)) * PX_PER_METER }
}

/** The direction a plane faces (its front), in scene space. */
export function planeNormal(placement: Placement3D): Vec3 {
  return rotate([0, 0, 1], placement.rotation)
}

// ── One position for 2D and 3D ─────────────────────────────────────────────

// Board px closer than this are the same spot (meters are stored to 1e-4).
const SAME_PX = 0.01
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * Keeps a placed top-level layer's two positions in step: its plane's origin
 * (`space.position`, meters) and its 2D top-left (`rect.x/y`, px). The 2D board
 * is the front view, so the plane's origin lands at (X, -Y) × PX_PER_METER on
 * it, depth dropped.
 *
 * Whichever side changed since `prev` wins: a 3D move carries the 2D rect with
 * it, and a 2D drag, nudge or align writes X and Y back into the placement,
 * keeping its depth. With no `prev` (a board just read from disk) the
 * placement wins, since it's what the 3D view has been showing. Unplaced
 * layers and children are untouched — they already sit where their rect says.
 * Returns `next` itself when nothing needed moving.
 */
export function syncPlacements(prev: CanvasDoc | null, next: CanvasDoc): CanvasDoc {
  let changed = false
  const nodes = next.nodes.map((node) => {
    const space = node.space
    if (!space) return node
    // Rounded: meters × 100 leaves float dust (1.1 m → 110.00000000000001 px) that would land in the board file.
    const fromSpace = { x: Math.round(space.position[0] * PX_PER_METER * 1000) / 1000, y: Math.round(-space.position[1] * PX_PER_METER * 1000) / 1000 }
    if (Math.abs(fromSpace.x - node.rect.x) < SAME_PX && Math.abs(fromSpace.y - node.rect.y) < SAME_PX) return node
    const before = prev?.nodes.find((n) => n.id === node.id)
    const movedIn2d = !!before?.space && before.space.position.every((m, i) => m === space.position[i]) && (before.rect.x !== node.rect.x || before.rect.y !== node.rect.y)
    changed = true
    // A sketch on a plane slides along it: the drag, carried onto the plane, moves its spot there,
    // and scene3d/planeRefs.ts resolvePlanes then stands it back on the plane.
    const plane = node.sketch?.plane
    if (movedIn2d && plane && plane.kind !== 'custom') {
      const { u, v } = onPlane(before!.space!, node.rect.x - before!.rect.x, node.rect.y - before!.rect.y)
      const at = node.sketch!.at ?? { u: 0, v: 0 }
      return { ...node, sketch: { ...node.sketch!, at: { u: round3(at.u + u), v: round3(at.v + v) } } }
    }
    if (movedIn2d) {
      const position: Vec3 = [round4(node.rect.x / PX_PER_METER), round4(-node.rect.y / PX_PER_METER), space.position[2]]
      return { ...node, space: { ...space, position } }
    }
    return { ...node, rect: { ...node.rect, x: fromSpace.x, y: fromSpace.y } }
  })
  return changed ? { ...next, nodes } : next
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * A move on the 2D board (the front view) carried onto a plane: the move along
 * the plane that shows as it. A plane seen at a slant is undone exactly; one
 * seen edge-on keeps only the part of the move along its line (the least-
 * squares answer), so a sketch on the Top plane slides sideways and ignores
 * up and down.
 */
export function onPlane(placement: Placement3D, dx: number, dy: number): { u: number; v: number } {
  const [sx, sy] = placement.scale ?? [1, 1, 1]
  const right = rotate([sx, 0, 0], placement.rotation)
  const down = rotate([0, -sy, 0], placement.rotation)
  // The plane-to-board map's linear part: x' = a·u + c·v, y' = b·u + d·v.
  const [a, b, c, d] = [right[0], -right[1], down[0], -down[1]]
  const det = a * d - b * c
  const size = a * a + b * b + c * c + d * d
  if (!size) return { u: 0, v: 0 }
  if (Math.abs(det) > 1e-6 * size) return { u: (d * dx - c * dy) / det, v: (a * dy - b * dx) / det }
  // Rank one: the pseudo-inverse is the transpose over the squared norm.
  return { u: (a * dx + b * dy) / size, v: (c * dx + d * dy) / size }
}
