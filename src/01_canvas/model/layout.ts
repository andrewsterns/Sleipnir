// Who owns a node's position: its own rect, or an ancestor's auto-layout.
//
// ── The bug this file exists to close ──────────────────────────────────────
//
// toCss's positionCss deliberately DROPS a child's x/y the moment its parent
// gains a flow (see its doc comment, and toCss.test.ts's "drops a child rect
// entirely under an auto-layout parent"). That is the right rule — it is what
// stops free-form authoring from emitting position:absolute soup, and it is
// Figma's rule too.
//
// But every screen-facing consumer — the selection ring, the hover ring, the
// resize handles, hit-testing, snapping, drop targets, the marquee — derived
// geometry from doc.ts's boardRectOf, which accumulates exactly those dropped
// x/y up the ancestor chain. So under an auto-layout parent the model and the
// pixels described two different boxes:
//
//   · the outline was painted at the model rect, not where flex put the child;
//   · a click hit-tested against the model rect, so it landed on the parent
//     (or on nothing) instead of the child under the cursor;
//   · a drag wrote rect.x/y, which the renderer then ignored — the node was
//     un-movable, while still dirtying the doc and burning an undo step.
//
// The fix has two halves, and this file holds the pure half:
//
//   1. For a node with an auto-layout ancestor the model CANNOT derive a board
//      rect — the browser's layout owns it. `needsMeasurement` marks exactly
//      those nodes; hooks/useMeasuredRects.ts measures them from the DOM, and
//      every geometry call takes the resulting map as an override. Nodes whose
//      ancestors are all freeform keep the exact model math, so the common case
//      stays DOM-free and pixel-exact.
//
//   2. Dragging a node the layout positions cannot translate it. Figma REORDERS
//      it in the flow instead, showing an insertion line. `insertionAt` is that
//      math.

import { findParent } from './doc'
import {
  childrenOf,
  isFrameNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasNode,
  type CanvasRect,
  type Flow,
  type NodeId,
} from './types'

/** A node's own flow. Non-frames hold no children, so they never lay anything out. */
export function flowOf(node: CanvasNode | null | undefined): Flow {
  if (!node || !isFrameNode(node)) return 'freeform'
  return node.style.flow ?? 'freeform'
}

/** True when this frame positions its children itself, rather than honoring their rects. */
export function isAutoLayout(node: CanvasNode | null | undefined): boolean {
  return flowOf(node) !== 'freeform'
}

/** The flow that decides where this node sits. Root nodes are always freeform. */
export function parentFlowOf(doc: CanvasDoc, id: NodeId): Flow {
  return flowOf(findParent(doc, id))
}

/**
 * True when the parent's auto-layout owns this node's position, so its rect.x/y
 * never reach the screen — the case where dragging must reorder rather than move,
 * and where a nudge or an X/Y edit would be a silent no-op.
 */
export function isLayoutPositioned(doc: CanvasDoc, id: NodeId): boolean {
  return parentFlowOf(doc, id) !== 'freeform'
}

/**
 * True when the node's own style decides its size, so rect.w/h are not the box
 * that renders.
 *
 * positionCss drops the rect's width or height the moment style.w / style.h is
 * set, and min/max clamp whatever survives — so a 'fill' or 'hug' frame, or one
 * with a minimum width, is exactly as unmeasurable from the model as a child of
 * a stack, even sitting at the board root.
 */
export function hasSizeOverride(node: CanvasNode): boolean {
  const style = node.style
  return (
    style.w !== undefined ||
    style.h !== undefined ||
    style.minW !== undefined ||
    style.maxW !== undefined ||
    style.minH !== undefined ||
    style.maxH !== undefined ||
    style.grow === true
  )
}

/**
 * Every node whose board rect must come from the DOM, parents before children.
 *
 * Two ways in:
 *
 *   · an auto-layout ANCESTOR — a wider net than isLayoutPositioned, because a
 *     freeform frame inside a stack still places its own children by their
 *     rects, against a box only the browser can locate. The whole subtree under
 *     a stack needs measuring, not just its direct children.
 *
 *   · its own sizing style — that one is about the box, not the position, so it
 *     does not spread to descendants: they still sit at their own rects
 *     relative to this node's top-left, which has not moved.
 *
 * Returns [] for a plain freeform board, the overwhelmingly common case, which
 * then costs no measurement at all and keeps the exact model math.
 */
export function measuredIds(doc: CanvasDoc): NodeId[] {
  const out: NodeId[] = []
  const step = (nodes: CanvasNode[], underLayout: boolean) => {
    for (const node of nodes) {
      if (underLayout || hasSizeOverride(node)) out.push(node.id)
      step(childrenOf(node), underLayout || isAutoLayout(node))
    }
  }
  step(doc.nodes, false)
  return out
}

// ── Reordering inside an auto-layout parent ────────────────────────────────

export interface Insertion {
  /**
   * Index in the parent's child list AFTER the dragged nodes are removed —
   * which is exactly what reparentNode's insert step expects, since it detaches
   * before it inserts.
   */
  index: number
  /** Board-space bar to paint between the two children the drop would land between. */
  indicator: CanvasRect
}

/** Thickness of the insertion bar, in board units. Scaled to screen by the caller. */
const INDICATOR_THICKNESS = 2

/**
 * Where a drop at (x, y) lands in an auto-layout parent, and the line to draw
 * for it.
 *
 * Compares the pointer against each surviving child's CENTER along the flow
 * axis, which is the rule that makes the insertion point flip exactly halfway
 * across a neighbour rather than at its edge — the behavior that makes
 * reordering feel predictable in Figma.
 *
 * `grid` is treated as reading order: a child is "before" the pointer if it sits
 * on an earlier row, or on the same row and further left.
 */
export function insertionAt(
  parent: CanvasFrameNode,
  parentRect: CanvasRect,
  x: number,
  y: number,
  rectOf: (id: NodeId) => CanvasRect | null,
  ignore: Set<NodeId> = new Set(),
): Insertion {
  const flow = flowOf(parent)
  const candidates = parent.children
    .filter((child) => !ignore.has(child.id) && !child.hidden)
    .map((child) => ({ id: child.id, rect: rectOf(child.id) }))
    .filter((c): c is { id: NodeId; rect: CanvasRect } => c.rect !== null)

  // Nothing to sit between — the bar spans the parent's box at its start edge.
  if (candidates.length === 0) {
    return { index: 0, indicator: startEdge(parentRect, flow) }
  }

  const horizontal = flow === 'horizontal' || flow === 'grid'
  let index = candidates.length
  for (let i = 0; i < candidates.length; i += 1) {
    if (!isBefore(candidates[i].rect, x, y, flow)) {
      index = i
      break
    }
  }

  // The bar goes on the leading edge of the child we would push down, or on the
  // trailing edge of the last one when the drop is at the end.
  const atEnd = index === candidates.length
  const anchor = candidates[atEnd ? candidates.length - 1 : index].rect
  const position = horizontal
    ? atEnd
      ? anchor.x + anchor.w
      : anchor.x
    : atEnd
      ? anchor.y + anchor.h
      : anchor.y

  const indicator: CanvasRect = horizontal
    ? {
        x: position - INDICATOR_THICKNESS / 2,
        y: Math.min(anchor.y, parentRect.y),
        w: INDICATOR_THICKNESS,
        h: Math.max(anchor.h, parentRect.h),
      }
    : {
        x: Math.min(anchor.x, parentRect.x),
        y: position - INDICATOR_THICKNESS / 2,
        w: Math.max(anchor.w, parentRect.w),
        h: INDICATOR_THICKNESS,
      }

  return { index, indicator }
}

/** Fraction of a sibling's flow-axis size, at each end, that reorders rather than nests. */
const REORDER_BAND = 0.25

/**
 * Is the pointer in a sibling's REORDER band rather than its NEST core?
 *
 * The classic three-zone rule every file tree uses: the leading and trailing
 * quarters of a neighbour mean "insert before / after me", and the middle half
 * means "go inside me". Without it, dragging a card up a column of cards would
 * dive into the first card it crossed, which makes an auto-layout list
 * effectively impossible to reorder — while a rule that never nested would take
 * away nesting altogether. The bands are measured along the flow axis only,
 * because that is the axis the insertion line moves on.
 */
export function inReorderBand(
  rect: CanvasRect,
  x: number,
  y: number,
  flow: Flow,
  fraction = REORDER_BAND,
): boolean {
  const horizontal = flow === 'horizontal' || flow === 'grid'
  const start = horizontal ? rect.x : rect.y
  const size = horizontal ? rect.w : rect.h
  const at = horizontal ? x : y
  return at < start + size * fraction || at > start + size * (1 - fraction)
}

/**
 * The frame a drop should really land in, once "reorder beside this sibling" is
 * told apart from "nest inside it".
 *
 * Only ever redirects when the dragged node already lives in an auto-layout
 * frame and the raw target is one of its own siblings — every other drop
 * resolves exactly as before.
 */
export function resolveDropTarget(
  doc: CanvasDoc,
  target: CanvasFrameNode | null,
  x: number,
  y: number,
  rectOf: (id: NodeId) => CanvasRect | null,
  draggingIds: Set<NodeId>,
): CanvasFrameNode | null {
  if (!target) return null
  const [first] = draggingIds
  if (!first) return target

  const parent = findParent(doc, first)
  if (!parent || !isAutoLayout(parent)) return target
  if (target.id === parent.id) return target
  if (findParent(doc, target.id)?.id !== parent.id) return target

  const rect = rectOf(target.id)
  if (!rect) return target
  return inReorderBand(rect, x, y, flowOf(parent)) ? parent : target
}

/** Does this child sit before the pointer along the parent's flow axis? */
function isBefore(rect: CanvasRect, x: number, y: number, flow: Flow): boolean {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  if (flow === 'horizontal') return cx < x
  if (flow === 'vertical') return cy < y
  // grid — reading order.
  const sameRow = Math.abs(cy - y) <= rect.h / 2
  return sameRow ? cx < x : cy < y
}

/** The bar for an empty auto-layout parent: flush against where the first child would go. */
function startEdge(parentRect: CanvasRect, flow: Flow): CanvasRect {
  return flow === 'horizontal' || flow === 'grid'
    ? { x: parentRect.x, y: parentRect.y, w: INDICATOR_THICKNESS, h: parentRect.h }
    : { x: parentRect.x, y: parentRect.y, w: parentRect.w, h: INDICATOR_THICKNESS }
}
