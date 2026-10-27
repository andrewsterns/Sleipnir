// How image layers size — PNGs, JPEGs and SVGs dropped or pasted onto the
// board, which become frames filled with the image (Figma's image node is the
// same thing). Three rules, all pure:
//
//   · an image layer keeps its proportions when resized, by default — Shift
//     frees it (the reverse of every other layer, and Figma's rule for images);
//   · it knows the size of the picture inside it (ImageFill.natural, recorded
//     at import), so the inspector can show a scale % and put it back at 100%;
//   · scaling happens about the layer's center, so a rotated image doesn't
//     drift as it grows.
//
// SVG images need nothing extra to stay crisp: a CSS background or SVG
// <image> renders the vector at whatever size the layer is.

import type { CanvasNode, CanvasRect, ImageFill } from './types'
import { isFrameNode } from './types'

/** The image a layer shows — its topmost visible image fill — or null. */
export function imageFillOf(node: CanvasNode): ImageFill | null {
  const fills = node.style.fills ?? []
  for (let i = fills.length - 1; i >= 0; i -= 1) {
    const fill = fills[i]
    if (fill.type === 'image' && fill.visible !== false && fill.src) return fill
  }
  return null
}

/**
 * True for a layer that IS an image: an empty frame whose visible paint is an
 * image fill (what pasting or importing a picture makes). A frame that merely
 * has an image background behind its own children is a container, not an
 * image, and resizes like one.
 */
export function isImageLayer(node: CanvasNode): boolean {
  if (!isFrameNode(node) || node.children.length > 0) return false
  return imageFillOf(node) !== null
}

/** Whether a resize should keep proportions: always for an image (Shift frees it), only with Shift for anything else. */
export function keepsProportions(node: CanvasNode | null | undefined, shift: boolean): boolean {
  return node && isImageLayer(node) ? !shift : shift
}

/** The layer's size as a percentage of the picture's own, by width; null when the picture's size isn't known. */
export function scalePercent(rect: CanvasRect, natural: { w: number; h: number } | undefined): number | null {
  if (!natural || natural.w <= 0) return null
  return Math.round((rect.w / natural.w) * 1000) / 10
}

/**
 * The rect at `percent` of the picture's size, keeping the layer's center — so
 * a rotated image grows in place. Never below 1px.
 */
export function rectAtScale(rect: CanvasRect, natural: { w: number; h: number }, percent: number): CanvasRect {
  const k = Math.max(0, percent) / 100
  const w = Math.max(1, Math.round(natural.w * k * 100) / 100)
  const h = Math.max(1, Math.round(natural.h * k * 100) / 100)
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
}

/**
 * The rect reshaped to the picture's proportions, keeping its width and center
 * — for an image that was stretched and should look right again.
 */
export function rectAtImageRatio(rect: CanvasRect, natural: { w: number; h: number }): CanvasRect {
  if (natural.w <= 0 || natural.h <= 0) return rect
  const h = Math.max(1, Math.round((rect.w * natural.h) / natural.w * 100) / 100)
  return { ...rect, y: rect.y + (rect.h - h) / 2, h }
}
