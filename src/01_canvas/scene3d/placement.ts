// Planes in space: where a layer sits in 3D, and the conversions between a
// point on its plane (board px, x right, y down) and a point in the scene
// (meters, y up). Plain math, no three.js, so the 2D board can use it too —
// the cross-plane sketch guides project one plane's points onto another with it.

import type { CanvasNode, CanvasRect } from '../model/types'
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
