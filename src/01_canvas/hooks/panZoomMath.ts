// The camera math, split out from the hook so it can be unit-tested without a
// DOM. Lifted verbatim in behavior from GraphCanvas.tsx's proven
// implementation (its handleWheel / toGraphPoint), generalized off SVG.
//
// Deliberately a COPY, not a shared import: GraphCanvas's pan/zoom is entangled
// with its camera-follow easing, force-simulation reheat, and pointer-capture
// semantics that have clearly been hand-tuned. Refactoring it to serve the
// canvas is how the planning graph gets broken. Converge later, in an isolated
// commit, if the two are still obviously the same code.

export interface Camera {
  x: number
  y: number
  k: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 8

/** Movement (px) before a pointer-down becomes a drag rather than a click. */
export const CLICK_DRAG_THRESHOLD = 4

export function clampScale(k: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k))
}

/** Screen point (relative to the viewport element) → board coordinates. */
export function toBoardPoint(camera: Camera, px: number, py: number): { x: number; y: number } {
  return { x: (px - camera.x) / camera.k, y: (py - camera.y) / camera.k }
}

/** Board coordinates → screen point (relative to the viewport element). */
export function toScreenPoint(camera: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x * camera.k + camera.x, y: y * camera.k + camera.y }
}

/**
 * Zoom anchored on a screen point: the board coordinate under (px, py) stays
 * under (px, py) afterwards. Same derivation GraphCanvas uses.
 */
export function zoomAt(camera: Camera, px: number, py: number, nextScale: number): Camera {
  const k = clampScale(nextScale)
  return {
    k,
    x: px - ((px - camera.x) / camera.k) * k,
    y: py - ((py - camera.y) / camera.k) * k,
  }
}

export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x + dx, y: camera.y + dy }
}

/** The CSS transform for the viewport element. Order matters: translate, then scale. */
export function cameraTransform(camera: Camera): string {
  return `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`
}

/**
 * Fits a board-space bounding box into a viewport of the given size, with
 * padding, never zooming past 1:1 (blowing a small selection up to fill the
 * screen reads as a bug rather than a fit).
 */
export function cameraToFit(
  box: { x: number; y: number; w: number; h: number },
  viewport: { width: number; height: number },
  padding = 64,
): Camera {
  if (box.w <= 0 || box.h <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, k: 1 }
  }
  const k = clampScale(
    Math.min((viewport.width - padding * 2) / box.w, (viewport.height - padding * 2) / box.h, 1),
  )
  return {
    k,
    x: viewport.width / 2 - (box.x + box.w / 2) * k,
    y: viewport.height / 2 - (box.y + box.h / 2) * k,
  }
}
