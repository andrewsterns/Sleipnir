// The 3D viewport's wheel, in the 2D board's terms (hooks/usePanZoom.ts): a
// plain scroll pans the view along the screen — up and down, or sideways with
// Shift or a trackpad — and Ctrl/Cmd+scroll zooms toward the cursor. Drags are
// OrbitControls' own (right orbits, middle or Space+left pans); only the wheel
// is ours, since OrbitControls can only dolly with it. Pure math on plain
// vectors, so it's tested without a GPU.

import type { Vec3 } from '../../document/sceneTypes'

/** The camera as the wheel needs it: where it is, what it orbits, and its screen axes in world space. */
export interface WheelCamera {
  position: Vec3
  target: Vec3
  /** World direction of the screen's +x (right). */
  right: Vec3
  /** World direction of the screen's +y (up). */
  up: Vec3
  /** World units one screen pixel covers at the target. */
  unitsPerPx: number
}

export interface WheelInput {
  deltaX: number
  deltaY: number
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  /** The cursor, in px from the viewport's center (x right, y down). */
  cursor: { x: number; y: number }
}

export type WheelMove =
  | { kind: 'pan'; offset: Vec3 }
  /** Move the camera and target by `offset`, then divide the distance (perspective) or multiply the zoom (orthographic) by `factor`. */
  | { kind: 'zoom'; offset: Vec3; factor: number }

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]

/** The 2D board's zoom rate (usePanZoom's onWheel), so both feel the same. */
const ZOOM_RATE = 0.002

/** World units per screen px at the target: an orthographic camera's 1/zoom, or a perspective camera's frustum height there. */
export function unitsPerPixel(camera: { orthographic: boolean; zoom: number; fov: number; distance: number }, viewportHeight: number): number {
  if (camera.orthographic) return 1 / (camera.zoom || 1)
  return (2 * camera.distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight)
}

/**
 * What one wheel event does. Panning matches the board exactly: scrolling down
 * moves the view down the screen, so the scene moves up it. Zooming keeps the
 * point under the cursor (on the target's depth) where it is.
 */
export function wheelMove(camera: WheelCamera, e: WheelInput): WheelMove {
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.exp(-e.deltaY * ZOOM_RATE)
    // The cursor's point at the target's depth, relative to the target: zooming
    // by `factor` shrinks that offset by 1/factor, so shift by the difference.
    const under = add(scale(camera.right, e.cursor.x * camera.unitsPerPx), scale(camera.up, -e.cursor.y * camera.unitsPerPx))
    return { kind: 'zoom', offset: scale(under, 1 - 1 / factor), factor }
  }
  const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
  const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY
  return { kind: 'pan', offset: add(scale(camera.right, dx * camera.unitsPerPx), scale(camera.up, -dy * camera.unitsPerPx)) }
}

/**
 * The camera after a move: position and target shift together, then a zoom
 * dollies a perspective camera toward the new target. An orthographic camera
 * zooms by `zoom` instead — moving it closer would only risk putting the scene
 * behind it.
 */
export function applyWheelMove(
  camera: Pick<WheelCamera, 'position' | 'target'> & { orthographic: boolean; zoom: number },
  move: WheelMove,
): { position: Vec3; target: Vec3; zoom: number } {
  const target = add(camera.target, move.offset)
  const moved = add(camera.position, move.offset)
  if (move.kind === 'pan') return { position: moved, target, zoom: camera.zoom }
  if (camera.orthographic) return { position: moved, target, zoom: camera.zoom * move.factor }
  const back: Vec3 = [moved[0] - target[0], moved[1] - target[1], moved[2] - target[2]]
  return { position: add(target, scale(back, 1 / move.factor)), target, zoom: camera.zoom }
}
