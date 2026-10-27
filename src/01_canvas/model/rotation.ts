// Rotation geometry — pure 2D math, no document access (doc.ts builds on it).
//
// A node's rotation (CanvasStyle.rotate) turns it clockwise, in degrees, about
// the center of its own rect: CSS's default transform-origin, so the board and
// the emitted code agree without anything extra. Its rect stays the UNROTATED
// box — rotating never rewrites x/y/w/h — and its children live in that
// unrotated box's space, turning with it.
//
// That means a point on the board has to be carried down through every
// ancestor's rotation to land in a node's own space (hit-testing, resizing),
// and a node's corners carried back up to land on the board (selection rings,
// marquee). Both are the same affine maps, built here.

import type { CanvasRect } from './types'

export interface XY {
  x: number
  y: number
}

/**
 * A 2D affine map: (x, y) → (a·x + c·y + e, b·x + d·y + f) — the same six
 * numbers as CSS's matrix().
 */
export interface Mat {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** Degrees as given → normalized to (-180, 180]; 0 stays 0. */
export function normalizeDegrees(deg: number): number {
  let n = deg % 360
  if (n <= -180) n += 360
  if (n > 180) n -= 360
  return Object.is(n, -0) ? 0 : n
}

/** `m` then `n`: the map that applies `m` first. */
export function multiply(n: Mat, m: Mat): Mat {
  return {
    a: n.a * m.a + n.c * m.b,
    b: n.b * m.a + n.d * m.b,
    c: n.a * m.c + n.c * m.d,
    d: n.b * m.c + n.d * m.d,
    e: n.a * m.e + n.c * m.f + n.e,
    f: n.b * m.e + n.d * m.f + n.f,
  }
}

export function apply(m: Mat, p: XY): XY {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
}

export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c || 1
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  }
}

/** Rotates a vector (not a point) by `deg` clockwise — screen y points down. */
export function rotateVector(v: XY, deg: number): XY {
  if (!deg) return v
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos }
}

/** Rotates `p` by `deg` clockwise about `center`. */
export function rotateAbout(p: XY, center: XY, deg: number): XY {
  if (!deg) return p
  const v = rotateVector({ x: p.x - center.x, y: p.y - center.y }, deg)
  return { x: center.x + v.x, y: center.y + v.y }
}

/**
 * The map from a node's own space (0,0 at its unrotated top-left) into its
 * parent's: move to rect.x/y, then turn about the rect's center.
 */
export function nodeMatrix(rect: CanvasRect, deg = 0): Mat {
  if (!deg) return { ...IDENTITY, e: rect.x, f: rect.y }
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  // translate(cx, cy) · rotate · translate(-w/2, -h/2)
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: cx - cos * (rect.w / 2) + sin * (rect.h / 2),
    f: cy - sin * (rect.w / 2) - cos * (rect.h / 2),
  }
}

/** A rect's four corners under `m`, clockwise from the (local) top-left. */
export function quadOf(m: Mat, w: number, h: number): [XY, XY, XY, XY] {
  return [apply(m, { x: 0, y: 0 }), apply(m, { x: w, y: 0 }), apply(m, { x: w, y: h }), apply(m, { x: 0, y: h })]
}

/** The axis-aligned box around some points. */
export function boundsOf(points: XY[]): CanvasRect {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The angle a map turns by, in degrees — a rotation-only map's whole rotation. */
export function angleOf(m: Mat): number {
  return normalizeDegrees((Math.atan2(m.b, m.a) * 180) / Math.PI)
}

/**
 * A node drawn on the board as it really appears: its center, its own
 * (unrotated) size, and the total rotation it shows — its own plus every
 * ancestor's. Selection rings and handles are drawn from exactly this.
 */
export interface OrientedBox {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

export function orientedFrom(m: Mat, w: number, h: number): OrientedBox {
  const c = apply(m, { x: w / 2, y: h / 2 })
  return { cx: c.x, cy: c.y, w, h, angle: angleOf(m) }
}

/** The four corners of an oriented box, clockwise from its own top-left. */
export function orientedCorners(box: OrientedBox): [XY, XY, XY, XY] {
  const half = [
    { x: -box.w / 2, y: -box.h / 2 },
    { x: box.w / 2, y: -box.h / 2 },
    { x: box.w / 2, y: box.h / 2 },
    { x: -box.w / 2, y: box.h / 2 },
  ]
  return half.map((v) => {
    const r = rotateVector(v, box.angle)
    return { x: box.cx + r.x, y: box.cy + r.y }
  }) as [XY, XY, XY, XY]
}

/** Snaps an angle to the nearest `step` degrees (Shift while rotating). */
export function snapAngle(deg: number, step = 15): number {
  return normalizeDegrees(Math.round(deg / step) * step)
}
