// Board-space rects for the nodes the model cannot place: everything under an
// auto-layout frame, where the browser's own layout decides the position.
//
// ── Why measure at all, and why only these nodes ───────────────────────────
//
// doc.ts's boardRectOf is exact while every ancestor is freeform — a child sits
// at its own rect, offset by its ancestors', with nothing the parent's paint can
// add (toCss uses outline rather than border precisely so that stays true). The
// moment an ancestor gains a flow, that arithmetic describes a box that is not
// on screen: positionCss drops the child's x/y and flex places it instead.
//
// So this hook measures exactly the nodes model/layout.ts's `measuredIds` marks
// and nothing else. A board with no auto-layout anywhere — the common case —
// does no DOM work and keeps pixel-exact model math. That split matters twice
// over: it is faster, and it keeps measurement error (which grows as 1/zoom)
// out of every case where the model already has the right answer.
//
// ── Board space, not screen space ──────────────────────────────────────────
//
// Rects are stored in BOARD coordinates, so they survive panning and zooming
// untouched and only need recomputing when the document or the layout changes.
// Measuring per camera frame would put a full DOM read on the pan path, which is
// the thing usePanZoom exists to avoid.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { measuredIds } from '../model/layout'
import type { CanvasDoc, CanvasRect, NodeId } from '../model/types'
import type { Camera } from './panZoomMath'

/** Shared empty result, so a freeform-only board never produces a new map. */
const EMPTY: ReadonlyMap<NodeId, CanvasRect> = new Map()

/** Sub-board-unit differences are measurement noise, not movement. */
const EPSILON = 0.01

export interface UseMeasuredRectsOptions {
  doc: CanvasDoc | null
  /** The clipping container the camera is expressed against. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Reads the live camera — the ref-held one, never the state mirror. */
  getCamera: () => Camera
}

/**
 * Board-space rects keyed by node id, for layout-positioned nodes only.
 *
 * Callers treat this as an OVERRIDE: `measured.get(id) ?? boardRectOf(doc, id)`.
 * A miss is normal and means the model's answer is the right one.
 */
export function useMeasuredRects({
  doc,
  containerRef,
  getCamera,
}: UseMeasuredRectsOptions): ReadonlyMap<NodeId, CanvasRect> {
  const [rects, setRects] = useState<ReadonlyMap<NodeId, CanvasRect>>(EMPTY)

  // Recomputed only when the tree's shape or its flows change, so an ordinary
  // freeform drag doesn't rebuild the id list on every pointermove.
  const ids = useMemo(() => (doc ? measuredIds(doc) : []), [doc])
  const idsKey = ids.join('|')

  const rectsRef = useRef(rects)
  rectsRef.current = rects

  const getCameraRef = useRef(getCamera)
  getCameraRef.current = getCamera

  // The measuring pass. Runs after every commit that could have moved
  // something — `doc` is in the deps because a child's SIZE changes with no
  // change to the id list at all (editing a text node, setting a gap on its
  // parent) — and is only DOM reads, so it stays cheap on a drag's hot path.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (ids.length === 0 || !container) {
      if (rectsRef.current.size > 0) setRects(EMPTY)
      return
    }

    const measure = () => {
      const next = readRects(container, new Set(ids), getCameraRef.current())
      // Bailing on an unchanged result is what keeps this out of an infinite
      // measure → setState → effect loop.
      if (!sameRects(rectsRef.current, next)) setRects(next)
    }

    measure()
    // A second pass on the next frame catches layout that settles after the
    // commit — web fonts arriving, a 'hug' box sizing to text that only just
    // wrapped.
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, idsKey, containerRef])

  // Re-measure on changes React never announces: text reflow, a font swap, the
  // panel beside the board changing width. Kept in its own effect keyed on the
  // id LIST, so an ordinary drag (which changes `doc` every pointermove) never
  // tears down and rebuilds the observer.
  useEffect(() => {
    const container = containerRef.current
    if (ids.length === 0 || !container) return

    let frame = 0
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = readRects(container, new Set(ids), getCameraRef.current())
        if (!sameRects(rectsRef.current, next)) setRects(next)
      })
    }

    // The transformed viewport stays 0x0 whatever its absolute children do, so
    // the measured elements have to be observed individually.
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null
    if (observer) {
      for (const el of nodeElements(container)) {
        if (ids.includes(el.getAttribute('data-canvas-node') ?? '')) observer.observe(el)
      }
      observer.observe(container)
    }
    window.addEventListener('resize', remeasure)

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', remeasure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, containerRef])

  return rects
}

/** Every mounted node element, in one DOM pass rather than a query per id. */
function nodeElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-canvas-node]')]
}

/**
 * Screen rects → board rects, for the wanted ids only.
 *
 * The camera is `translate(x, y) scale(k)` with origin 0 0 on the viewport, so
 * un-applying it is a subtract-then-divide against the container's own origin.
 * Hidden nodes render nothing and simply do not appear in the result.
 */
function readRects(
  container: HTMLElement,
  wanted: Set<NodeId>,
  camera: Camera,
): ReadonlyMap<NodeId, CanvasRect> {
  const out = new Map<NodeId, CanvasRect>()
  const k = camera.k
  if (!(k > 0)) return out
  const base = container.getBoundingClientRect()

  for (const el of nodeElements(container)) {
    const id = el.getAttribute('data-canvas-node')
    if (!id || !wanted.has(id)) continue
    const box = el.getBoundingClientRect()
    // A rotated node's client rect is the box AROUND its turned shape. The
    // geometry wants the unrotated box (model/rotation.ts), which shares that
    // box's center and has the element's own layout size.
    if ((el as HTMLElement | SVGElement).style.transform) {
      const css = getComputedStyle(el)
      const w = parseFloat(css.width) || box.width / k
      const h = parseFloat(css.height) || box.height / k
      const cx = (box.left + box.width / 2 - base.left - camera.x) / k
      const cy = (box.top + box.height / 2 - base.top - camera.y) / k
      out.set(id, { x: cx - w / 2, y: cy - h / 2, w, h })
      continue
    }
    out.set(id, {
      x: (box.left - base.left - camera.x) / k,
      y: (box.top - base.top - camera.y) / k,
      w: box.width / k,
      h: box.height / k,
    })
  }
  return out
}

function sameRects(a: ReadonlyMap<NodeId, CanvasRect>, b: ReadonlyMap<NodeId, CanvasRect>): boolean {
  if (a.size !== b.size) return false
  for (const [id, rect] of a) {
    const other = b.get(id)
    if (!other) return false
    if (
      Math.abs(rect.x - other.x) > EPSILON ||
      Math.abs(rect.y - other.y) > EPSILON ||
      Math.abs(rect.w - other.w) > EPSILON ||
      Math.abs(rect.h - other.h) > EPSILON
    ) {
      return false
    }
  }
  return true
}
