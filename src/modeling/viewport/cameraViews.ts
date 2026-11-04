// The viewport's cameras: a perspective orbit, and the three drafting views a
// sketch is drawn in — Front, Top, Side — looking straight at their plane with
// no perspective, which is what the 2D board shows for a plane. Pure math, so
// framing is tested without a GPU.

import { planeToWorld, placementOf } from '../../document/placement'
import type { Vec3 } from '../../document/sceneTypes'
import type { CanvasDoc } from '../../document/types'
import { solidOf } from '../../document/objects'

export type ViewName = 'perspective' | 'front' | 'top' | 'side'

export interface Bounds {
  min: Vec3
  max: Vec3
}

export interface CameraSetup {
  position: Vec3
  target: Vec3
  up: Vec3
  /** Orthographic views: pixels per meter that fit the bounds in the viewport. */
  zoom: number
}

/** Every top-level layer's corners in space — what "fit the scene" fits. */
export function sceneBounds(doc: CanvasDoc): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const node of doc.nodes) {
    if (node.hidden) continue
    const placement = placementOf(node)
    const { w, h } = node.rect
    // A solid can stand off its plane; reach as far out as it might.
    const solid = solidOf(doc, node.id)
    const depth = solid?.kind === 'extrude' ? solid.depth * 100 : solid ? Math.max(w, h) : 0
    for (const [u, v, out] of [[0, 0, 0], [w, 0, 0], [0, h, 0], [w, h, 0], [0, 0, depth], [w, h, depth], [0, h, -depth], [w, 0, -depth]]) {
      const p = planeToWorld(placement, u, v, out)
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], p[i])
        max[i] = Math.max(max[i], p[i])
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null
}

const center = (b: Bounds): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

/**
 * Where each view's camera goes to show `bounds` in a viewport of `size` px:
 * perspective from the front-right and above, the drafting views straight down
 * their axis — Front looks along -Z, Top down -Y (with -Z up the screen), Side
 * along -X (seen from the right).
 */
export function cameraFor(view: ViewName, bounds: Bounds | null, size: { w: number; h: number }): CameraSetup {
  const b = bounds ?? { min: [-1, -1, -1], max: [1, 1, 1] }
  const c = center(b)
  const extent: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  const radius = Math.max(0.5, Math.hypot(...extent) / 2)
  // The two extents a drafting view shows across and up its screen.
  const fit = (across: number, up: number) => Math.max(10, Math.min(size.w / Math.max(across, 0.5), size.h / Math.max(up, 0.5)) * 0.8)
  const far = radius * 4 + 10
  switch (view) {
    case 'front':
      return { position: [c[0], c[1], c[2] + far], target: c, up: [0, 1, 0], zoom: fit(extent[0], extent[1]) }
    case 'top':
      return { position: [c[0], c[1] + far, c[2]], target: c, up: [0, 0, -1], zoom: fit(extent[0], extent[2]) }
    case 'side':
      return { position: [c[0] + far, c[1], c[2]], target: c, up: [0, 1, 0], zoom: fit(extent[2], extent[1]) }
    default: {
      const d = radius * 2.6
      return { position: [c[0] + d * 0.7, c[1] + d * 0.5, c[2] + d], target: c, up: [0, 1, 0], zoom: 1 }
    }
  }
}
