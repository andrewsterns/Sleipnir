// Outlines → solids. A layer's shape (shape.ts) is pushed out of its plane
// (extrude), spun around an axis in it (revolve) or carried along a path
// (sweep). The outline stays the source; these rebuild from it on every edit.
//
// How sketch points become polygons is direct: every anchor is a vertex of the
// profile, curves arrive already split at the flattening tolerance, and each
// modifier multiplies the profile by the segments it adds — two caps and one
// wall quad per edge for an extrusion, `steps` rings for a revolve, one ring
// per path sample for a sweep. triangleCount() is what the inspector shows.
//
// Meshes are in the layer's own plane space, in px, y up, like flatMesh: the
// viewport scales them into meters with the layer's placement.

import { normalizeWinding, signedArea, type Contour, type Point, type Shape } from './shape'
import { triangulate, type Mesh, type MeshFace } from './mesh'
import type { RevolveAxis } from '../../document/sceneTypes'

type V3 = [number, number, number]

// Walls this close to straight share a normal across their corner (a curve
// reads smooth); sharper corners keep their own (a box keeps its edges).
const SMOOTH_COS = Math.cos((30 * Math.PI) / 180)

/** The shape pushed `depth` px out of its plane: a back cap on the plane, a front cap facing the viewer, and walls. */
export function extrude(shape: Shape, box: { w: number; h: number }, depth: number): Mesh {
  const mesh = emptyMesh()
  const { vertices, triangles } = triangulate(shape)
  // Caps: the plane itself (facing back) and its copy `depth` in front.
  for (const [z, nz] of [[depth, 1], [0, -1]] as const) {
    const base = vertexCount(mesh)
    const face = openFace(mesh, { role: z === 0 ? 'start' : 'end' })
    for (const p of vertices) push(mesh, [p.x, -p.y, z], [0, 0, nz], [box.w ? p.x / box.w : 0, box.h ? 1 - p.y / box.h : 0])
    for (let t = 0; t < triangles.length; t += 3) pushFacing(mesh, base + triangles[t], base + triangles[t + 1], base + triangles[t + 2], [0, 0, nz], face)
  }
  // Walls, one strip per contour.
  normalizeWinding(shape).contours.forEach((contour, c) => wall(mesh, contour, depth, c))
  return orientOutward(mesh)
}

function wall(mesh: Mesh, contour: Contour, depth: number, contourIndex: number) {
  const n = contour.length
  const pts = contour.map((p) => [p.x, -p.y] as [number, number])
  // A solid winds clockwise on screen, and still clockwise with y turned up
  // (the picture doesn't change, only the numbers); a hole the other way.
  // Either way the material is on the right of each edge, so its left-hand
  // normal points out.
  const edgeNormal = (i: number): [number, number] => {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % n]
    const len = Math.hypot(bx - ax, by - ay) || 1
    return [-(by - ay) / len, (bx - ax) / len]
  }
  const normals = pts.map((_, i) => edgeNormal(i))
  // The normal at each end of edge i: shared with the neighbouring edge when the corner is gentle.
  const cornerNormal = (edge: number, neighbour: number): [number, number] => {
    const a = normals[edge]
    const b = normals[neighbour]
    if (a[0] * b[0] + a[1] * b[1] < SMOOTH_COS) return a
    const x = a[0] + b[0]
    const y = a[1] + b[1]
    const len = Math.hypot(x, y) || 1
    return [x / len, y / len]
  }
  const perimeter = pts.reduce((sum, p, i) => sum + Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]), 0) || 1
  let along = 0
  for (let i = 0; i < n; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const na = cornerNormal(i, (i - 1 + n) % n)
    const nb = cornerNormal(i, (i + 1) % n)
    const u0 = along / perimeter
    const u1 = (along + len) / perimeter
    along += len
    const base = vertexCount(mesh)
    push(mesh, [a[0], a[1], 0], [na[0], na[1], 0], [u0, 0])
    push(mesh, [b[0], b[1], 0], [nb[0], nb[1], 0], [u1, 0])
    push(mesh, [b[0], b[1], depth], [nb[0], nb[1], 0], [u1, 1])
    push(mesh, [a[0], a[1], depth], [na[0], na[1], 0], [u0, 1])
    const out: V3 = [normals[i][0], normals[i][1], 0]
    const face = openFace(mesh, { role: 'side', contour: contourIndex, segment: i })
    pushFacing(mesh, base, base + 1, base + 2, out, face)
    pushFacing(mesh, base, base + 2, base + 3, out, face)
  }
}

/**
 * The shape's outline spun around an axis on its plane, by `angle` degrees in
 * `steps` segments: its vertical center line ('center' — draw a vase whole and
 * the right half is spun), its left edge ('left' — a half profile drawn against
 * the axis) or its bottom edge ('bottom' — lying down, for discs and wheels).
 * Whatever lies across the axis is cut off, so the solid never folds through it.
 */
export function revolve(shape: Shape, box: { w: number; h: number }, axis: RevolveAxis, angle: number, steps: number): Mesh {
  const whole = normalizeWinding(shape).contours.find((c) => signedArea(c) > 0)
  if (!whole) return emptyMesh()
  const axisAt = axis === 'center' ? box.w / 2 : 0
  const outline = axis === 'bottom' ? whole : clipRight(whole, axisAt)
  if (outline.length < 3) return emptyMesh()
  const full = Math.abs(angle) >= 360
  const segments = Math.max(3, Math.round(steps))
  const sweep = (Math.min(Math.abs(angle), 360) * Math.PI) / 180
  const rings = full ? segments : segments + 1
  // Radius from the axis and position along it, for each outline point.
  const upright = axis !== 'bottom'
  const profile = outline.map((p) => (upright ? { r: p.x - axisAt, along: -p.y } : { r: box.h - p.y, along: p.x }))
  const mesh = emptyMesh()
  for (let k = 0; k < rings; k += 1) {
    const theta = (k / segments) * sweep
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    profile.forEach((p, j) => {
      const position: V3 = upright ? [axisAt + p.r * c, p.along, -p.r * s] : [p.along, -box.h + p.r * c, p.r * s]
      push(mesh, position, [0, 0, 0], [k / segments, j / profile.length])
    })
  }
  const m = profile.length
  // Each outline segment sweeps one side, all the way round.
  const sides = profile.map((_, j) => openFace(mesh, { role: 'side', contour: 0, segment: j }))
  for (let k = 0; k < segments; k += 1) {
    const ring = k * m
    const next = ((k + 1) % rings) * m
    for (let j = 0; j < m; j += 1) {
      const j2 = (j + 1) % m
      mesh.indices.push(ring + j, next + j, next + j2, ring + j, next + j2, ring + j2)
      mesh.faceOf!.push(sides[j], sides[j])
    }
  }
  return smoothNormals(orientOutward(mesh))
}

// The part of a ring at or right of x = at (one Sutherland-Hodgman pass).
function clipRight(ring: Contour, at: number): Contour {
  const out: Point[] = []
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const aIn = a.x >= at
    const bIn = b.x >= at
    if (aIn) out.push(a)
    if (aIn !== bIn) out.push({ x: at, y: a.y + ((b.y - a.y) * (at - a.x)) / (b.x - a.x) })
  }
  return out
}

/**
 * The shape's outline, centered, carried along a path given in the path
 * layer's plane (px, y down): a tube, a rail, a ribbon. The profile stands
 * across the path, its own up along the plane's normal; open paths get caps.
 */
export function sweep(shape: Shape, box: { w: number; h: number }, path: Point[], closed: boolean): Mesh {
  const outline = normalizeWinding(shape).contours.find((c) => signedArea(c) > 0)
  if (!outline || path.length < 2) return emptyMesh()
  const profile = outline.map((p) => ({ x: p.x - box.w / 2, y: -(p.y - box.h / 2) }))
  const pts = path.map((p) => ({ x: p.x, y: -p.y }))
  const n = pts.length
  const mesh = emptyMesh()
  // Each path point's frame: across the path in the plane, and out of the plane.
  const frames = pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    return { p, across: [-ty / len, tx / len] as [number, number] }
  })
  const ringAt = ({ p, across }: (typeof frames)[number], profileOf: (q: { x: number; y: number }) => V3 = (q) => [p.x + across[0] * q.x, p.y + across[1] * q.x, q.y]) => profile.map(profileOf)
  frames.forEach((frame, i) => ringAt(frame).forEach((pos, j) => push(mesh, pos, [0, 0, 0], [i / (n - 1 || 1), j / profile.length])))
  const m = profile.length
  const spans = closed ? n : n - 1
  const sides = profile.map((_, j) => openFace(mesh, { role: 'side', contour: 0, segment: j }))
  for (let i = 0; i < spans; i += 1) {
    const a = i * m
    const b = ((i + 1) % n) * m
    const { across } = frames[i]
    for (let j = 0; j < m; j += 1) {
      const j2 = (j + 1) % m
      // Out of the tube: from the path toward this stretch of the profile.
      const q = { x: (profile[j].x + profile[j2].x) / 2, y: (profile[j].y + profile[j2].y) / 2 }
      const out: V3 = [across[0] * q.x, across[1] * q.x, q.y]
      pushFacing(mesh, a + j, b + j, b + j2, out, sides[j])
      pushFacing(mesh, a + j, b + j2, a + j2, out, sides[j])
    }
  }
  smoothNormals(mesh)
  if (!closed) {
    const { vertices, triangles } = triangulate({ contours: [profile.map((q) => ({ x: q.x, y: -q.y }))] })
    for (const [frame, flip] of [[frames[0], true], [frames[n - 1], false]] as const) {
      const base = vertexCount(mesh)
      const cap = openFace(mesh, { role: flip ? 'start' : 'end' })
      const t = frame === frames[0] ? [pts[1].x - pts[0].x, pts[1].y - pts[0].y] : [pts[n - 1].x - pts[n - 2].x, pts[n - 1].y - pts[n - 2].y]
      const len = Math.hypot(t[0], t[1]) || 1
      const normal: V3 = flip ? [-t[0] / len, -t[1] / len, 0] : [t[0] / len, t[1] / len, 0]
      for (const v of vertices) push(mesh, [frame.p.x + frame.across[0] * v.x, frame.p.y + frame.across[1] * v.x, -v.y], normal, [0, 0])
      for (let k = 0; k < triangles.length; k += 3) pushFacing(mesh, base + triangles[k], base + triangles[k + 1], base + triangles[k + 2], normal, cap)
    }
  }
  return orientOutward(mesh)
}

// ── Mesh bookkeeping ───────────────────────────────────────────────────────

export function emptyMesh(): Mesh {
  return { positions: [], normals: [], uvs: [], indices: [], faces: [], faceOf: [] }
}

/** Starts a face of the solid being built; the triangles pushed for it name it. */
function openFace(mesh: Mesh, face: MeshFace): number {
  mesh.faces!.push(face)
  return mesh.faces!.length - 1
}

function vertexCount(mesh: Mesh): number {
  return mesh.positions.length / 3
}

function push(mesh: Mesh, p: V3, n: V3, uv: [number, number]) {
  mesh.positions.push(p[0], p[1], p[2])
  mesh.normals.push(n[0], n[1], n[2])
  mesh.uvs.push(uv[0], uv[1])
}

// One triangle, wound so its front faces `toward` — counter-clockwise seen from there — on face `face`.
function pushFacing(mesh: Mesh, a: number, b: number, c: number, toward: V3, face: number) {
  const p = mesh.positions
  const [ax, ay, az] = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]]
  const u: V3 = [p[b * 3] - ax, p[b * 3 + 1] - ay, p[b * 3 + 2] - az]
  const v: V3 = [p[c * 3] - ax, p[c * 3 + 1] - ay, p[c * 3 + 2] - az]
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  if (n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0) mesh.indices.push(a, b, c)
  else mesh.indices.push(a, c, b)
  mesh.faceOf!.push(face)
}

/** Triangles in a mesh — the number the inspector's budget shows. */
export function triangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3
}

/** Enclosed volume (px³): positive when the triangles face outward. */
export function signedVolume(mesh: Mesh): number {
  const p = mesh.positions
  let sum = 0
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    sum +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return sum / 6
}

// Turns every triangle around when the solid came out inside-out — the last
// word on winding for a builder that can't tell which way is out locally.
// Normals are left alone: where a builder set them it set them from geometry
// (a cap faces its own way whatever order its corners come in), and where it
// derives them from the winding it does so after this (see revolve).
function orientOutward(mesh: Mesh): Mesh {
  if (signedVolume(mesh) >= 0) return mesh
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const b = mesh.indices[t + 1]
    mesh.indices[t + 1] = mesh.indices[t + 2]
    mesh.indices[t + 2] = b
  }
  return mesh
}

// Vertex normals as the area-weighted average of the faces around each vertex.
function smoothNormals(mesh: Mesh): Mesh {
  const p = mesh.positions
  const acc = new Array<number>(p.length).fill(0)
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const i of [a, b, c]) {
      acc[i] += nx
      acc[i + 1] += ny
      acc[i + 2] += nz
    }
  }
  for (let i = 0; i < acc.length; i += 3) {
    const len = Math.hypot(acc[i], acc[i + 1], acc[i + 2]) || 1
    mesh.normals[i] = acc[i] / len
    mesh.normals[i + 1] = acc[i + 1] / len
    mesh.normals[i + 2] = acc[i + 2] / len
  }
  return mesh
}
