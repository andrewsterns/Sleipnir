// The 2D board is the 3D scene seen by the Front orthographic camera: a scene
// point (X, Y, Z) lands on the board at (X, -Y) × PX_PER_METER, depth dropped.
// A layer's plane is flat, so carrying it there is an affine map — the same
// six numbers document/rotation.ts uses for a 2D rotation, so every ring, handle
// and hit test built on boardMatrixOf follows a plane turned in 3D for free.

import { apply, invert, type Mat, type XY } from './rotation'
import type { CanvasRect } from './types'
import { PX_PER_METER, type Placement3D, type Vec3 } from './sceneTypes'
import { planeToWorld, rotate } from './placement'

/**
 * The map from a layer's plane (board px, 0,0 at its top-left, y down) to the
 * 2D board. A plane turned about Y squashes horizontally, one turned about X
 * squashes vertically, and both together shear it into a rhombus.
 */
export function frontMatrix(placement: Placement3D): Mat {
  const [sx, sy] = placement.scale ?? [1, 1, 1]
  // The plane's own +u (right) and +v (down) axes in the scene, per board px.
  const u = rotate([sx, 0, 0], placement.rotation)
  const v = rotate([0, -sy, 0], placement.rotation)
  return {
    a: u[0],
    b: -u[1],
    c: v[0],
    d: -v[1],
    e: placement.position[0] * PX_PER_METER,
    f: -placement.position[1] * PX_PER_METER,
  }
}

/** A scene point (meters, y up) on the 2D board. */
export function frontPoint([x, y]: Vec3): XY {
  return { x: x * PX_PER_METER, y: -y * PX_PER_METER }
}

/**
 * True when the plane stands edge-on to the front camera (turned 90° about X
 * or Y): it projects to a line, has no inverse, and has to be drawn and picked
 * as one.
 */
export function isEdgeOn(m: Mat): boolean {
  const scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), 1e-9)
  return Math.abs(m.a * m.d - m.b * m.c) < 1e-3 * scale * scale
}

/**
 * Resizing a placed top-level layer, done in its own plane. The pointer's
 * board move is carried onto the plane, `resize` resizes the layer there (at
 * the plane's origin, its own size), and the plane's origin then moves in 3D
 * to wherever the resized box's top-left landed — so dragging a west or north
 * handle of a turned plane moves it along the plane, depth included, not just
 * across the screen. Null when the plane is edge-on: nothing on screen to
 * drag.
 */
export function resizeOnPlane(
  space: Placement3D,
  size: { w: number; h: number },
  delta: XY,
  resize: (start: CanvasRect, local: XY) => CanvasRect,
): { rect: CanvasRect; space: Placement3D } | null {
  const m = frontMatrix(space)
  if (isEdgeOn(m)) return null
  const local = apply(invert({ ...m, e: 0, f: 0 }), delta)
  const r = resize({ x: 0, y: 0, w: size.w, h: size.h }, local)
  const position = planeToWorld(space, r.x, r.y).map((n) => Math.round(n * 10_000) / 10_000) as Vec3
  const at = frontPoint(position)
  // Meters × 100 leaves float dust (1.1 m → 110.00000000000001 px) that would land in the board file.
  const px = (n: number) => Math.round(n * 1000) / 1000
  return { rect: { x: px(at.x), y: px(at.y), w: r.w, h: r.h }, space: { ...space, position } }
}
