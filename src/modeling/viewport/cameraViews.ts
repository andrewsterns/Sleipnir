// The viewport's cameras: a perspective orbit, and the three drafting views a
// sketch is drawn in — Front, Top, Side — looking straight at their plane with
// no perspective, which is what the 2D board shows for a plane. Pure math, so
// framing is tested without a GPU.

import { planeToWorld, placementOf, rotate } from '../../document/placement'
import { PX_PER_METER, type Placement3D, type Vec3 } from '../../document/sceneTypes'
import type { CanvasDoc } from '../../document/types'
import { objectsOf, partPlacementOf, solidOf } from '../../document/objects'
import { bodyOf } from '../geometry/body'

export type ViewName = 'perspective' | 'front' | 'top' | 'side' | 'back' | 'bottom' | 'left'

/** Which drafting plane a view looks at — what its grid lies in. */
export function planeOfView(view: ViewName): 'front' | 'top' | 'side' | null {
  if (view === 'front' || view === 'back') return 'front'
  if (view === 'top' || view === 'bottom') return 'top'
  if (view === 'side' || view === 'left') return 'side'
  return null
}

/** The view looking straight down an axis from its end — the axis gizmo's heads (+Z is Front, +Y Top, +X Side). */
export function viewOfAxis(axis: 'x' | 'y' | 'z', positive: boolean): ViewName {
  if (axis === 'z') return positive ? 'front' : 'back'
  if (axis === 'y') return positive ? 'top' : 'bottom'
  return positive ? 'side' : 'left'
}

/**
 * How the 3D view draws parts — how you look, not what's there: shaded
 * solids; the same with every polygon's outline over them, so smoothness
 * shows; the polygons' lines alone, in each part's colour; or see-through, so
 * what's behind can be seen and picked.
 */
export type DisplayMode = 'shaded' | 'edges' | 'wireframe' | 'xray'

export const DISPLAY_MODES: { id: DisplayMode; label: string; hint: string }[] = [
  { id: 'shaded', label: 'Shaded', hint: 'Solid, lit parts' },
  { id: 'edges', label: 'Edges', hint: 'Shaded, with every polygon’s outline drawn over it' },
  { id: 'wireframe', label: 'Wire', hint: 'Only the polygons’ lines, in each part’s colour' },
  { id: 'xray', label: 'X-ray', hint: 'See-through, to see and pick what’s behind' },
]

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

/**
 * Sketch mode inside an environment: the live 2D board lies over the 3D view,
 * so the camera must see the sketch's plane exactly as the board draws it —
 * face on, no perspective, the board's pan and zoom. `origin` is where the
 * board draws the sketch's top-left (board px), `camera` the board's own
 * (screen = board · k + x, y). Returns the orthographic camera that puts every
 * plane point under the board pixel showing it.
 */
export interface SketchView {
  placement: Placement3D
  origin: { x: number; y: number }
  camera: { x: number; y: number; k: number }
}

/** How far in front of the plane the sketch camera stands — far enough that nothing in the scene is behind it. */
const SKETCH_CAMERA_DISTANCE = 500

export function sketchCameraPose(view: SketchView, size: { w: number; h: number }): CameraSetup {
  const { placement, origin, camera } = view
  // The board point at the middle of the screen, in the sketch's own px.
  const u = (size.w / 2 - camera.x) / camera.k - origin.x
  const v = (size.h / 2 - camera.y) / camera.k - origin.y
  const target = planeToWorld(placement, u, v)
  const up = rotate([0, 1, 0], placement.rotation)
  const facing = rotate([0, 0, 1], placement.rotation)
  const scale = placement.scale?.[0] ?? 1
  return {
    target,
    position: [target[0] + facing[0] * SKETCH_CAMERA_DISTANCE, target[1] + facing[1] * SKETCH_CAMERA_DISTANCE, target[2] + facing[2] * SKETCH_CAMERA_DISTANCE],
    up,
    // One board px is 1/PX_PER_METER m on the plane (times its scale) and k screen px.
    zoom: (camera.k * PX_PER_METER) / scale,
  }
}

/** Every top-level layer's corners in space — what "fit the scene" fits. */
export function sceneBounds(doc: CanvasDoc): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const reach = (p: Vec3) => {
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], p[i])
      max[i] = Math.max(max[i], p[i])
    }
  }
  // A part moved as a whole is where its body is, not where its sketch stands.
  for (const object of objectsOf(doc)) {
    if (!object.placement || object.hidden) continue
    const { positions } = bodyOf(doc, object).mesh
    for (let i = 0; i < positions.length; i += 3) reach([positions[i], positions[i + 1], positions[i + 2]])
  }
  for (const node of doc.nodes) {
    if (node.hidden || partPlacementOf(doc, node.id)) continue
    const placement = placementOf(node)
    const { w, h } = node.rect
    // A solid can stand off its plane; reach as far out as it might.
    const solid = solidOf(doc, node.id)
    const depth = solid?.kind === 'extrude' ? solid.depth * 100 : solid ? Math.max(w, h) : 0
    for (const [u, v, out] of [[0, 0, 0], [w, 0, 0], [0, h, 0], [w, h, 0], [0, 0, depth], [w, h, depth], [0, h, -depth], [w, 0, -depth]]) {
      reach(planeToWorld(placement, u, v, out))
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
    case 'back':
      return { position: [c[0], c[1], c[2] - far], target: c, up: [0, 1, 0], zoom: fit(extent[0], extent[1]) }
    case 'bottom':
      return { position: [c[0], c[1] - far, c[2]], target: c, up: [0, 0, 1], zoom: fit(extent[0], extent[2]) }
    case 'left':
      return { position: [c[0] - far, c[1], c[2]], target: c, up: [0, 1, 0], zoom: fit(extent[2], extent[1]) }
    default: {
      const d = radius * 2.6
      return { position: [c[0] + d * 0.7, c[1] + d * 0.5, c[2] + d], target: c, up: [0, 1, 0], zoom: 1 }
    }
  }
}
