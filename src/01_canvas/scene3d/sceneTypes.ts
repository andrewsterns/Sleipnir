// The 3D half of the canvas model. A board stays a 2D document — every layer
// is still drawn and edited in its own plane — and these fields say where that
// plane sits in space and whether its outline becomes a solid. Nothing here
// replaces a 2D field: a layer without them is a flat layer on the front plane.
//
// Space is meters, Y up, Z toward the viewer — glTF's convention, and three.js's,
// so export needs no axis or unit guessing. Board pixels map to it at
// PX_PER_METER (one px = one cm), so a 200 px frame is a 2 m panel.

import type { NodeId } from '../model/types'

export type Vec3 = [number, number, number]

/** Board pixels per meter in 3D. */
export const PX_PER_METER = 100

/**
 * Where a layer's plane sits in 3D. Its 2D contents keep their own coordinates
 * on that plane: the layer's top-left corner is at `position`, its x axis runs
 * along the plane's right and its y axis down the plane.
 */
export interface Placement3D {
  /** Meters. */
  position: Vec3
  /**
   * Degrees about X, then Y, then Z (the 'XYZ' Euler order three.js and Blender
   * default to) — readable and hand-editable in the board file.
   */
  rotation: Vec3
  /** Defaults to [1, 1, 1]. */
  scale?: Vec3
}

/** The line in a layer's plane a revolve spins around. */
export type RevolveAxis = 'center' | 'left' | 'bottom'

/** The three orthographic sketch planes, named the way drafting does. */
export type PlanePreset = 'front' | 'top' | 'side'

/**
 * How a layer's outline becomes a solid. The outline stays the source: edit
 * the 2D shape and the solid rebuilds.
 *
 * - extrude — pushed straight out of its plane by `depth` meters.
 * - revolve — spun around an axis in its plane by `angle` degrees in `steps`
 *   segments: its vertical center line (a full silhouette, like a vase drawn
 *   whole — only the half on one side is spun), its left edge (a half profile
 *   drawn against the axis), or its bottom edge (lying down: discs, wheels).
 * - sweep   — the outline carried along another layer's path (a pipe, a rail).
 */
export type SolidSpec =
  | { kind: 'extrude'; depth: number }
  | { kind: 'revolve'; axis: RevolveAxis; angle: number; steps: number }
  | { kind: 'sweep'; pathId: NodeId; samples?: number }
