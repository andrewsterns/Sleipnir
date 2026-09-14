// Alignment: snapping while you drag, and align/distribute for a multi-selection.
//
// Pure geometry over board-space rects — no React, no doc traversal beyond what
// the caller passes in — so all of it is unit-testable without a canvas.
//
// The snapping model is Figma's: while dragging, compare the moving box's six
// interesting lines (left/centerX/right, top/centerY/bottom) against the same
// lines on every candidate rect, and if any pair is within the threshold, nudge
// the box so they coincide exactly and draw a guide through them.

import type { CanvasRect } from './types'

/** Snap distance in BOARD units. Divided by zoom by the caller so it feels
 *  constant on screen rather than growing as you zoom out. */
export const SNAP_THRESHOLD = 6

export type Axis = 'x' | 'y'

export interface Guide {
  axis: Axis
  /** Board coordinate of the guide line. */
  position: number
  /** Extent of the line, so it spans only the boxes it relates. */
  start: number
  end: number
}

export interface SnapResult {
  /** Delta to add to the moving rect so its lines coincide with a candidate's. */
  dx: number
  dy: number
  guides: Guide[]
}

interface Line {
  value: number
  /** Where this line sits on the perpendicular axis, for drawing extent. */
  min: number
  max: number
}

function linesFor(rect: CanvasRect, axis: Axis): Line[] {
  if (axis === 'x') {
    const min = rect.y
    const max = rect.y + rect.h
    return [
      { value: rect.x, min, max },
      { value: rect.x + rect.w / 2, min, max },
      { value: rect.x + rect.w, min, max },
    ]
  }
  const min = rect.x
  const max = rect.x + rect.w
  return [
    { value: rect.y, min, max },
    { value: rect.y + rect.h / 2, min, max },
    { value: rect.y + rect.h, min, max },
  ]
}

function snapAxis(
  moving: CanvasRect,
  candidates: CanvasRect[],
  axis: Axis,
  threshold: number,
): { delta: number; guides: Guide[] } {
  const movingLines = linesFor(moving, axis)
  let best: { delta: number; distance: number } | null = null

  for (const candidate of candidates) {
    for (const target of linesFor(candidate, axis)) {
      for (const line of movingLines) {
        const distance = Math.abs(target.value - line.value)
        if (distance > threshold) continue
        if (!best || distance < best.distance) {
          best = { delta: target.value - line.value, distance }
        }
      }
    }
  }
  if (!best) return { delta: 0, guides: [] }

  // Re-scan at the snapped position to collect EVERY line that now coincides,
  // so aligning to three things at once draws three guides rather than one.
  const snapped: CanvasRect =
    axis === 'x' ? { ...moving, x: moving.x + best.delta } : { ...moving, y: moving.y + best.delta }
  const guides: Guide[] = []
  for (const candidate of candidates) {
    for (const target of linesFor(candidate, axis)) {
      for (const line of linesFor(snapped, axis)) {
        if (Math.abs(target.value - line.value) > 0.01) continue
        guides.push({
          axis,
          position: target.value,
          start: Math.min(target.min, line.min),
          end: Math.max(target.max, line.max),
        })
      }
    }
  }
  return { delta: best.delta, guides }
}

/**
 * Snaps a moving rect against candidates on both axes independently, so a box
 * can snap horizontally to one neighbour and vertically to another.
 */
export function snapRect(
  moving: CanvasRect,
  candidates: CanvasRect[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  if (candidates.length === 0) return { dx: 0, dy: 0, guides: [] }
  const x = snapAxis(moving, candidates, 'x', threshold)
  const y = snapAxis(moving, candidates, 'y', threshold)
  return { dx: x.delta, dy: y.delta, guides: [...x.guides, ...y.guides] }
}

// ── Align / distribute ─────────────────────────────────────────────────────

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical'

/**
 * Offsets that align every rect to the group's bounding box.
 *
 * Returned as deltas keyed by index rather than mutated rects, so the caller can
 * apply them through the doc's own immutable setRect and keep one undo step.
 */
export function alignOffsets(rects: CanvasRect[], mode: AlignMode): { dx: number; dy: number }[] {
  if (rects.length === 0) return []
  const minX = Math.min(...rects.map((r) => r.x))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return rects.map((rect) => {
    switch (mode) {
      case 'left':
        return { dx: minX - rect.x, dy: 0 }
      case 'right':
        return { dx: maxX - (rect.x + rect.w), dy: 0 }
      case 'center-x':
        return { dx: centerX - (rect.x + rect.w / 2), dy: 0 }
      case 'top':
        return { dx: 0, dy: minY - rect.y }
      case 'bottom':
        return { dx: 0, dy: maxY - (rect.y + rect.h) }
      case 'center-y':
        return { dx: 0, dy: centerY - (rect.y + rect.h / 2) }
    }
  })
}

/**
 * Offsets that spread rects so the GAPS between them are equal, keeping the
 * outermost two fixed. Figma's "distribute spacing" — equalizing gaps rather
 * than centers, which is what actually looks right when sizes differ.
 *
 * Fewer than three rects has no interior to distribute, so it is a no-op.
 */
export function distributeOffsets(
  rects: CanvasRect[],
  mode: DistributeMode,
): { dx: number; dy: number }[] {
  const zero = rects.map(() => ({ dx: 0, dy: 0 }))
  if (rects.length < 3) return zero

  const axis = mode === 'horizontal' ? 'x' : 'y'
  const size = mode === 'horizontal' ? 'w' : 'h'

  const order = rects.map((rect, index) => ({ rect, index })).sort((a, b) => a.rect[axis] - b.rect[axis])
  const first = order[0].rect
  const last = order[order.length - 1].rect
  const span = last[axis] + last[size] - first[axis]
  const totalSize = order.reduce((sum, o) => sum + o.rect[size], 0)
  const gap = (span - totalSize) / (order.length - 1)

  const offsets = [...zero]
  let cursor = first[axis]
  for (const { rect, index } of order) {
    const delta = cursor - rect[axis]
    offsets[index] = mode === 'horizontal' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta }
    cursor += rect[size] + gap
  }
  return offsets
}
