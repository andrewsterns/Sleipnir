// Corners of an extrude moved on their own, in any direction (G on a point or
// an edge): a sketch can only say where a corner is on its plane, and both
// ends of an extrude share it, so a corner lifted off the plane or a rim
// slanted needs saying separately. Each is an offset on the feature, by outline
// point and end; the sketch stays the source and the part rebuilds from it.
//
// Pure, and used by both meshes — the one drawn (scene3d/sceneMeshes.ts) and the
// body faces are picked from (body.ts) — so what's seen and what's picked agree.

import type { CanvasNode } from '../../document/types'
import { isVectorNode } from '../../document/types'
import { toEditablePath } from '../../document/vectorEdit'
import type { Vec3 } from '../../document/sceneTypes'
import type { CornerTweaks, ExtrudeFeature } from '../../document/objects'
import type { Mesh } from './mesh'

export type Cap = 'start' | 'end'
export interface CornerRef {
  anchor: number
  cap: Cap
}

export const cornerKey = ({ anchor, cap }: CornerRef) => `${anchor}:${cap}`

// How close (px) a mesh vertex must lie to an outline point to be that corner.
const SAME = 0.01

/** A profile's corners on its plane (px, y down, from its top-left): an outline's points, a frame's four corners. */
export function profileAnchors(profile: CanvasNode): { x: number; y: number }[] {
  if (isVectorNode(profile)) return toEditablePath(profile).points ?? []
  const { w, h } = profile.rect
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
}

/** How far a feature's solid is pushed back along its normal, px: reversed behind the plane, or centered on it. */
export function extrudeShift(feature: Pick<ExtrudeFeature, 'depth' | 'direction'>, depthPx: number): number {
  return feature.direction === 'reverse' ? -depthPx : feature.direction === 'symmetric' ? -depthPx / 2 : 0
}

/** An extrude's mesh (z 0 to depth) with its moved corners carried, and its normals remade to suit. Unmoved: the mesh itself. */
export function tweakMesh(mesh: Mesh, profile: CanvasNode, depthPx: number, tweaks: CornerTweaks | undefined): Mesh {
  if (!tweaks || Object.keys(tweaks).length === 0) return mesh
  const anchors = profileAnchors(profile)
  const positions = [...mesh.positions]
  for (let i = 0; i < positions.length; i += 3) {
    const cap: Cap | null = Math.abs(positions[i + 2]) < SAME ? 'start' : Math.abs(positions[i + 2] - depthPx) < SAME ? 'end' : null
    if (!cap) continue
    const anchor = anchors.findIndex((a) => Math.abs(a.x - positions[i]) < SAME && Math.abs(a.y + positions[i + 1]) < SAME)
    const t: Vec3 | undefined = anchor < 0 ? undefined : tweaks[cornerKey({ anchor, cap })]
    if (!t) continue
    // Offsets are x right, y down, out of the plane; the mesh's y is up.
    positions[i] += t[0]
    positions[i + 1] -= t[1]
    positions[i + 2] += t[2]
  }
  // Each face has its own vertices, so averaging over them keeps the edges between faces sharp.
  const normals = new Array<number>(positions.length).fill(0)
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
    const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]]
    const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]]
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    for (const i of [a, b, c]) for (let k = 0; k < 3; k += 1) normals[i + k] += n[k]
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= len
    normals[i + 1] /= len
    normals[i + 2] /= len
  }
  return { ...mesh, positions, normals }
}
