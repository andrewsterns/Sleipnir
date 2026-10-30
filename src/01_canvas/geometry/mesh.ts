// Shapes → triangles → meshes. A layer's outline (shape.ts) becomes a flat
// polygon mesh lying in 3D space at its depth, front face toward the viewer —
// the form every 3D step starts from: a 2D layer seen from the front looks
// exactly as it does on the board, and extruding, revolving or modelling it
// only adds to this.
//
// Plain arrays in three.js's layout (y up, z toward the viewer, triangles
// counter-clockwise from the front), so a renderer copies them straight into
// a BufferGeometry and nothing here depends on one.

import earcut from 'earcut'
import { containsPoint, normalizeWinding, signedArea, type Contour, type Point, type Shape } from './shape'

export interface Mesh {
  /** x, y, z per vertex: y up, z toward the viewer. */
  positions: number[]
  /** A unit normal per vertex. */
  normals: number[]
  /** u, v per vertex: 0–1 across the layer's box, v up, so an image fill maps the way it shows on the board. */
  uvs: number[]
  /** Three vertex indices per triangle, counter-clockwise seen from its front. */
  indices: number[]
}

export interface Triangulation {
  vertices: Point[]
  /** Three indices into `vertices` per triangle. */
  triangles: number[]
}

/**
 * The shape as triangles, holes kept open. Each solid is cut with the holes
 * directly inside it; a solid inside a hole (a dot in a ring) is cut on its own.
 */
export function triangulate(shape: Shape): Triangulation {
  const contours = normalizeWinding(shape).contours
  const depthOf = contours.map((c) => contours.filter((o) => o !== c && containsPoint(o, c[0])).length)
  const vertices: Point[] = []
  const triangles: number[] = []

  contours.forEach((solid, si) => {
    if (depthOf[si] % 2 === 1) return
    // Holes one level deeper whose tightest container is this solid.
    const holes = contours.filter((hole, hi) => {
      if (depthOf[hi] !== depthOf[si] + 1 || !containsPoint(solid, hole[0])) return false
      const containers = contours.filter((o, oi) => depthOf[oi] === depthOf[si] && containsPoint(o, hole[0]))
      return containers.reduce((best, o) => (Math.abs(signedArea(o)) < Math.abs(signedArea(best)) ? o : best)) === solid
    })
    const rings: Contour[] = [solid, ...holes]
    const flat: number[] = []
    const holeIndices: number[] = []
    for (const ring of rings) {
      if (ring !== solid) holeIndices.push(flat.length / 2)
      for (const p of ring) flat.push(p.x, p.y)
    }
    const base = vertices.length
    for (const ring of rings) vertices.push(...ring)
    for (const i of earcut(flat, holeIndices.length ? holeIndices : null, 2)) triangles.push(base + i)
  })
  return { vertices, triangles }
}

/**
 * A layer lying flat in 3D: its shape triangulated, y turned up, at depth `z`,
 * facing +z. `box` is the layer's size, for UVs.
 */
export function flatMesh(shape: Shape, box: { w: number; h: number }, { z = 0 }: { z?: number } = {}): Mesh {
  const { vertices, triangles } = triangulate(shape)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (const p of vertices) {
    positions.push(p.x, -p.y, z)
    normals.push(0, 0, 1)
    uvs.push(box.w ? p.x / box.w : 0, box.h ? 1 - p.y / box.h : 0)
  }
  const indices: number[] = []
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]]
    // Counter-clockwise in the y-up plane faces the viewer; flip any that don't.
    const pa = vertices[a]
    const pb = vertices[b]
    const pc = vertices[c]
    const cross = (pb.x - pa.x) * -(pc.y - pa.y) - -(pb.y - pa.y) * (pc.x - pa.x)
    if (cross >= 0) indices.push(a, b, c)
    else indices.push(a, c, b)
  }
  return { positions, normals, uvs, indices }
}

/** Total surface area of a mesh's triangles. */
export function meshArea(mesh: Mesh): number {
  const p = mesh.positions
  let sum = 0
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return sum
}

/** Whether every triangle faces +z (the front) — what a flat layer must satisfy. */
export function facesFront(mesh: Mesh): boolean {
  const p = mesh.positions
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    const z = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])
    if (z < -1e-9) return false
  }
  return true
}
