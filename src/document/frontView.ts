// The 2D board is the 3D scene seen by the Front orthographic camera: a scene
// point (X, Y, Z) lands on the board at (X, -Y) × PX_PER_METER, depth dropped.
// A layer's plane is flat, so carrying it there is an affine map — the same
// six numbers document/rotation.ts uses for a 2D rotation, so every ring, handle
// and hit test built on boardMatrixOf follows a plane turned in 3D for free.

import { apply, IDENTITY, invert, rotateAbout, type Mat, type XY } from './rotation'
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

/** The CSS transform that draws a layer's plane where the front camera sees it. */
export function frontTransform(m: Mat): string {
  return m === IDENTITY ? 'none' : `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`
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

// ── Solids seen from the front ─────────────────────────────────────────────

/** One triangle of a solid as the front camera sees it: board points, how near it is, and which way it faces. */
export interface FrontFace {
  points: [XY, XY, XY]
  /** Scene Z of its center: larger is nearer the camera, so faces are painted in ascending order. */
  depth: number
  /** Unit normal in the scene. */
  normal: Vec3
}

/**
 * A layer's mesh (geometry/mesh.ts: px on its plane, y up, its top-left at the
 * origin) projected onto the board the way the 3D view's Front camera renders
 * it: through the layer's own 2D rotation (about its center, as the 3D view
 * turns it), then its placement, depth dropped. A solid's faces turned away
 * from the camera are culled, as the 3D view's FrontSide material does; a flat
 * layer is double-sided and keeps them. Sorted far to near, for painting.
 */
export function frontFaces(
  mesh: { positions: number[]; indices: number[] },
  placement: Placement3D,
  size: { w: number; h: number },
  rotateDeg = 0,
  cullBack = true,
): FrontFace[] {
  const center = { x: size.w / 2, y: size.h / 2 }
  const world: Vec3[] = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    // y up on the mesh, y down on the plane; the 2D rotation turns clockwise on the plane.
    const on = rotateAbout({ x: mesh.positions[i], y: -mesh.positions[i + 1] }, center, rotateDeg)
    world.push(planeToWorld(placement, on.x, on.y, mesh.positions[i + 2]))
  }
  const faces: FrontFace[] = []
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [world[mesh.indices[i]], world[mesh.indices[i + 1]], world[mesh.indices[i + 2]]]
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let normal: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    const length = Math.hypot(...normal)
    if (length < 1e-12) continue
    normal = [normal[0] / length, normal[1] / length, normal[2] / length]
    // Counter-clockwise from its front, so a face the camera (looking down -Z) sees has normal z > 0.
    if (normal[2] <= 0) {
      if (cullBack) continue
      normal = [-normal[0], -normal[1], -normal[2]]
    }
    faces.push({ points: [frontPoint(a), frontPoint(b), frontPoint(c)], depth: (a[2] + b[2] + c[2]) / 3, normal })
  }
  return faces.sort((p, q) => p.depth - q.depth)
}

// The 3D view's lights (viewport/Viewport3D.tsx), so a face shades the same in 2D.
const KEY = { dir: unit([5, 10, 7]), intensity: 1.6 }
const FILL = { dir: unit([-6, 4, -5]), intensity: 0.45 }

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
// three.js takes CSS colors as sRGB and lights in linear light, so the ground color is converted too.
const HEMI = { sky: 1, ground: [0x3a, 0x3a, 0x40].map((c) => toLinear(c / 255)) as Vec3, intensity: 0.8 }

/** three.js's ACESFilmicToneMapping (exposure 1) — what react-three-fiber renders the 3D view with. */
function acesFilmic([r, g, b]: Vec3): Vec3 {
  const s = 1 / 0.6
  const i: Vec3 = [
    (0.59719 * r + 0.35458 * g + 0.04823 * b) * s,
    (0.076 * r + 0.90834 * g + 0.01566 * b) * s,
    (0.0284 * r + 0.13383 * g + 0.83777 * b) * s,
  ]
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
  const [x, y, z] = i.map(fit)
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  return [
    clamp(1.60475 * x - 0.53108 * y - 0.07367 * z),
    clamp(-0.10208 * x + 1.10813 * y - 0.00605 * z),
    clamp(-0.00327 * x - 0.07276 * y + 1.07602 * z),
  ]
}

/**
 * The color a face of `base` (sRGB, 0–255) shows under the 3D view's lights:
 * Lambert diffuse from the key and fill lights plus the sky/ground hemisphere,
 * in linear light, tone-mapped and back to sRGB as the 3D renderer does.
 * Specular is left out — at roughness 0.55 it barely moves a flat face.
 */
export function frontShade(base: Vec3, normal: Vec3): Vec3 {
  const sky = 0.5 * normal[1] + 0.5
  const hemi = HEMI.ground.map((g) => (g + (HEMI.sky - g) * sky) * HEMI.intensity)
  const direct = KEY.intensity * Math.max(0, dot(normal, KEY.dir)) + FILL.intensity * Math.max(0, dot(normal, FILL.dir))
  const lit = base.map((c, i) => (toLinear(c / 255) * (direct + hemi[i])) / Math.PI) as Vec3
  return acesFilmic(lit).map((c) => Math.round(toSrgb(c) * 255)) as Vec3
}
