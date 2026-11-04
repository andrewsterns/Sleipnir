// The board editor's tools, gesture state and pure geometry — no React. Split
// out of CanvasView.ViewModel.tsx so the hooks in hooks/ can share them without
// importing the view model.

import {
  deleteNode,
  findNode,
  findParent,
  insertNode,
  setStyle,
} from '../document/doc'
import { cloneTree } from '../document/variants'
import {
  type PointPart,
} from '../document/vectorEdit'
import { DEFAULT_COMPONENT_ROOT } from '../document/paths'
import type { Placement3D } from '../document/sceneTypes'
import { svgSize } from './io/clipboardImage'
import { rotateAbout, rotateVector } from '../document/rotation'
import {
  isFrameNode,
  isVectorNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasNode,
  type CanvasRect,
  type NodeId,
  type VectorPoint,
} from '../document/types'

/** Where images imported for image fills land — the staging tier, beside the components using them. */
export const CANVAS_ASSETS_DIR = `${DEFAULT_COMPONENT_ROOT}/assets`
export const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i
/** Longest side a pasted image lands at — a 4K screenshot at full size would bury the board. */
export const MAX_PASTED_IMAGE = 2048

/** An image file's natural size, or a stand-in when the browser can't decode it. */
export async function imageFileSize(file: File): Promise<{ w: number; h: number }> {
  // createImageBitmap() can't decode an SVG file — read its own width/height/viewBox.
  if (file.type === 'image/svg+xml') return svgSize(await file.text()) ?? { w: 400, h: 300 }
  try {
    const bitmap = await createImageBitmap(file)
    const size = { w: bitmap.width, h: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return { w: 400, h: 300 }
  }
}
/** Board-space size of a frame created by a click rather than a drag. */
export const DEFAULT_FRAME_SIZE = { w: 240, h: 160 }
export const MIN_DRAW_SIZE = 4

export type CanvasTool = 'select' | 'frame' | 'text' | 'rectangle' | 'ellipse' | 'polygon' | 'pen'

/** The tools that drag out a vector shape, in the toolbar's shape menu. */
export const SHAPE_TOOLS = ['rectangle', 'ellipse', 'polygon'] as const
export type ShapeTool = (typeof SHAPE_TOOLS)[number]
export const isShapeTool = (tool: CanvasTool): tool is ShapeTool => (SHAPE_TOOLS as readonly string[]).includes(tool)

/**
 * Copies of `ids` placed exactly where they are, each just beneath its
 * original — what Alt-drag leaves behind while the originals move on.
 */
export function duplicateInPlace(doc: CanvasDoc, ids: NodeId[]): CanvasDoc {
  let next = doc
  for (const id of ids) {
    const node = findNode(next, id)
    if (!node) continue
    const parent = findParent(next, id)
    const siblings = parent ? parent.children : next.nodes
    next = insertNode(next, cloneTree(node), parent?.id ?? null, siblings.indexOf(node))
  }
  return next
}

/** True for a frame holding only vectors, at any depth (groups of vectors included), and at least one. */
export function isVectorArt(frame: CanvasFrameNode): boolean {
  let vectors = 0
  const ok = (node: CanvasNode): boolean => {
    if (isVectorNode(node)) {
      vectors += 1
      return true
    }
    return isFrameNode(node) && node.children.every(ok)
  }
  return frame.children.every(ok) && vectors > 0
}

/** Board-space size of a shape created by a click rather than a drag. */
export const DEFAULT_SHAPE_SIZE = { w: 100, h: 100 }
/** Screen pixels within which a pen click lands on the path's first point and closes it. */
export const PEN_CLOSE_RADIUS = 8
/** Screen pixels within which a click counts as on a vector's outline, or on a segment of a path being edited. */
export const OUTLINE_TOLERANCE_PX = 5

/** `to`, snapped onto the nearest 45° ray from `from` — Shift on the pen. */
export function snap45(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len }
}

/** The rect a draw gesture covers — square when Shift is held, toward wherever the cursor went. */
export function drawRect(
  origin: { x: number; y: number },
  current: { x: number; y: number },
  square = false,
  fromCenter = false,
): CanvasRect {
  let dx = current.x - origin.x
  let dy = current.y - origin.y
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * size
    dy = Math.sign(dy || 1) * size
  }
  // Alt draws outward from the press point, which becomes the center.
  if (fromCenter) return normalizeRect({ x: origin.x - dx, y: origin.y - dy }, { x: origin.x + dx, y: origin.y + dy })
  return normalizeRect(origin, { x: origin.x + dx, y: origin.y + dy })
}

/** A pen path being drawn: its anchors in board space. */
export interface PenDraft {
  points: VectorPoint[]
}

/**
 * A value outside React state, for something that changes on every pointer
 * move but only one small component draws — the pen's rubber band. Setting it
 * re-renders that subscriber (via useSyncExternalStore) and nothing else; as
 * React state it re-rendered the whole Canvas view, panels included, on every
 * mouse move while drawing.
 */
export interface ValueStore<T> {
  get: () => T
  set: (value: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Stands in for the board root as a drop target, so "drop onto empty canvas"
 * can be told apart from "hovering nothing droppable".
 *
 * Without this, `dropTargetId === null` meant both, and the un-nest half was
 * simply unreachable: a child dragged out of its parent stayed a child, keeping
 * its parent-relative rect, and (if the parent clipped) vanished.
 */
export const ROOT_DROP_TARGET = '__board_root__'

export interface DragState {
  /**
   * `pen`: dragging out the handles of the anchor just placed.
   * `point`: dragging an anchor or handle of the path being edited.
   * `point-marquee`: box-selecting anchors of the path being edited.
   */
  kind: 'move' | 'draw' | 'marquee' | 'resize' | 'rotate' | 'path-slide' | 'pen' | 'point' | 'point-marquee'
  originBoard: { x: number; y: number }
  currentBoard: { x: number; y: number }
  /** Client-space press point — the drag threshold is measured on screen, so it
   *  feels the same at any zoom. */
  originClient: { x: number; y: number }
  /**
   * False until the pointer has travelled past CLICK_DRAG_THRESHOLD. A `move`
   * drag applies nothing before that, so a click with a shaky hand selects
   * instead of nudging the node (and burning an undo step).
   */
  moved: boolean
  /** Starting rects of the nodes being moved/resized, keyed by node id. */
  startRects: Map<NodeId, CanvasRect>
  /** Resizing: the starting 3D placement of each top-level layer placed in space, which resizes in its own plane. */
  startSpaces?: Map<NodeId, Placement3D>
  handle?: ResizeHandle
  /**
   * What a RELEASE WITHOUT MOVEMENT should select instead of what the press
   * grabbed.
   *
   * Set when the press landed inside something already selected. Figma grabs the
   * current selection when you drag from inside it — that is how a frame is
   * moved from anywhere within it — while a plain click still reaches one level
   * in to the child under the cursor. Deciding on release is what lets one
   * gesture mean both.
   */
  clickSelect?: NodeId
  /** Shift was held at the last pointer event — squares and circles, 45° pen segments. */
  shift?: boolean
  /** Alt was held at the last pointer event — draw from the center. */
  alt?: boolean
  /** `point` drags: which anchor or handle. */
  point?: { index: number; part: PointPart }
  /**
   * `point` anchor drags: every selected anchor moves, from where the path's
   * points and box were when the drag began — the box refits each frame, so
   * the offset is re-based against it rather than accumulated.
   */
  pointStart?: { indices: number[]; points: VectorPoint[]; box: CanvasRect }
  /** `move`: the Alt-drag copies have been made, so they aren't made again. */
  duplicated?: boolean
  /**
   * `rotate`: the board point the selection turns about (its center), the
   * pointer's starting angle around it, and each node's starting rotation.
   */
  rotateStart?: { center: { x: number; y: number }; pointer: number; angles: Map<NodeId, number>; turns: Map<NodeId, number> }
  /** `path-slide`: the along-path frame whose run the start marker is sliding. */
  pathFrameId?: NodeId
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const ALL_RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * The handles a node its parent's flow positions can actually use.
 *
 * A north or west handle resizes by MOVING the origin, and a laid-out node's
 * origin is the layout's to decide — so those handles could only change the
 * size while the box stayed pinned, which reads as the frame growing away from
 * the cursor. Offering the three that anchor on the pinned corner instead is
 * both truthful and predictable.
 *
 * Assumes the default start/start alignment, which is what a stack does unless
 * told otherwise. A parent that justifies to the end anchors the opposite edge;
 * mirroring the handle set for that is a refinement, not a correctness gap.
 */
export const FLOW_RESIZE_HANDLES: ResizeHandle[] = ['e', 'se', 's']

/**
 * What releasing the current drag would commit.
 *
 * Replaces the bare `dropTargetId` this used to carry, which could say "into
 * this frame" but never "at this position in its flow" — so a child of an
 * auto-layout frame had nowhere to be dropped and simply could not be moved.
 */
export interface DropIntent {
  /** Frame to drop into; ROOT_DROP_TARGET means the board itself. */
  targetId: NodeId
  /** Where in an auto-layout parent's child list the drop lands. Absent for freeform. */
  index?: number
  /** Board-space insertion bar to paint between the two children. */
  indicator?: CanvasRect
  /** True when the target is already the node's parent, i.e. a pure reorder. */
  reorder: boolean
}

// ── Pure geometry helpers ──────────────────────────────────────────────────

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): CanvasRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/**
 * Would reinserting `movingIds` at `index` under `parentId` actually change the
 * child order?
 *
 * A flow reorder that drops a node back onto the slot it already occupies must
 * not commit: it would mark the board dirty, trigger a save, and leave an undo
 * step for a gesture that changed nothing.
 */
export function changesOrder(
  doc: CanvasDoc,
  movingIds: NodeId[],
  parentId: NodeId | null,
  index: number | undefined,
): boolean {
  if (index === undefined || movingIds.length !== 1) return true
  const parent = parentId ? findNode(doc, parentId) : null
  if (parentId && (!parent || !isFrameNode(parent))) return true
  const siblings = parent && isFrameNode(parent) ? parent.children : doc.nodes

  const position = siblings.findIndex((n) => n.id === movingIds[0])
  if (position === -1) return true
  // Where the node would land among its surviving siblings if it stayed put —
  // the same coordinate system reparentNode's insert step uses, since it
  // detaches before it inserts.
  const moving = new Set(movingIds)
  const current = siblings.slice(0, position).filter((n) => !moving.has(n.id)).length
  return current !== index
}

/**
 * Applies a resize-handle drag to a rect. Width/height are floored at 1 rather
 * than allowed to go negative, so dragging a handle past the opposite edge
 * stops instead of inverting the box.
 */
/**
 * A rect resized by dragging `handle` by (dx, dy). Shift keeps the start's
 * proportions (Figma's), scaling by whichever axis moved further; Alt resizes
 * about the center, so the opposite side moves too. Never below 1px.
 */
export function resizeRect(
  start: CanvasRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  { proportional = false, fromCenter = false }: { proportional?: boolean; fromCenter?: boolean } = {},
): CanvasRect {
  const k = fromCenter ? 2 : 1
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  let w = start.w
  let h = start.h
  if (handle.includes('e')) w = start.w + dx * k
  if (handle.includes('w')) w = start.w - dx * k
  if (handle.includes('s')) h = start.h + dy * k
  if (handle.includes('n')) h = start.h - dy * k
  w = Math.max(1, w)
  h = Math.max(1, h)
  if (proportional && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h
    if (horizontal && vertical) {
      if (Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)) h = Math.max(1, w / ratio)
      else w = Math.max(1, h * ratio)
    } else if (horizontal) h = Math.max(1, w / ratio)
    else w = Math.max(1, h * ratio)
  }
  // Which edge holds still: the opposite one, the center under Alt, or — for
  // an axis this handle doesn't own but Shift scaled — the middle of it.
  const x = fromCenter || !horizontal
    ? start.x + (start.w - w) / 2
    : handle.includes('w')
      ? start.x + start.w - w
      : start.x
  const y = fromCenter || !vertical
    ? start.y + (start.h - h) / 2
    : handle.includes('n')
      ? start.y + start.h - h
      : start.y
  return { x, y, w, h }
}

/**
 * Where an edit made with `id` selected actually lands: a pattern copy's
 * content belongs to its template (document/pathPattern.ts), so editing any piece
 * edits them all. Everything else edits itself.
 */
export function editTargetOf(doc: CanvasDoc, id: NodeId): NodeId {
  const node = findNode(doc, id)
  return node?.repeatOf && findNode(doc, node.repeatOf) ? node.repeatOf : id
}

/**
 * Deletes a node — and when it's a piece of a pattern, takes one off the run's
 * count too, or the pattern would just grow the piece back.
 */
export function deletePiece(doc: CanvasDoc, id: NodeId): CanvasDoc {
  const node = findNode(doc, id)
  const parent = findParent(doc, id)
  const repeat = parent?.style.alongPath?.repeat
  if (!node?.repeatOf || !parent || repeat === undefined) return deleteNode(doc, id)
  const runLength = parent.children.filter((c) => c.id === node.repeatOf || c.repeatOf === node.repeatOf).length
  const count = typeof repeat === 'number' ? repeat : runLength
  const next = setStyle(doc, parent.id, { alongPath: { ...parent.style.alongPath, repeat: Math.max(1, count - 1) } })
  return deleteNode(next, id)
}

/**
 * resizeRect for a rotated node. The drag is measured in the node's own turned
 * axes (so the handle you grab follows the pointer), and the rect is then
 * shifted so the edge or corner opposite the handle stays exactly where it is
 * on screen — without that, growing a rotated box would also slide it, because
 * it turns about its center and the center moves as it grows.
 *
 * `own` is the node's rotation within its parent; `total` adds every
 * ancestor's (the board→node turn the pointer delta has to undo).
 */
export function resizeRotatedRect(
  start: CanvasRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  own: number,
  total: number,
  opts: { proportional?: boolean; fromCenter?: boolean } = {},
): CanvasRect {
  const local = rotateVector({ x: dx, y: dy }, -total)
  const r = resizeRect(start, handle, local.x, local.y, opts)
  // The point resizeRect holds still, in the parent's unrotated coordinates.
  const horizontal = handle.includes('e') || handle.includes('w')
  const vertical = handle.includes('n') || handle.includes('s')
  const anchor = {
    x: opts.fromCenter || !horizontal ? start.x + start.w / 2 : handle.includes('w') ? start.x + start.w : start.x,
    y: opts.fromCenter || !vertical ? start.y + start.h / 2 : handle.includes('n') ? start.y + start.h : start.y,
  }
  // Where that point is actually drawn, and so where the new center must go.
  const startCenter = { x: start.x + start.w / 2, y: start.y + start.h / 2 }
  const shown = rotateAbout(anchor, startCenter, own)
  const offset = rotateVector({ x: r.x + r.w / 2 - anchor.x, y: r.y + r.h / 2 - anchor.y }, own)
  return { ...r, x: shown.x + offset.x - r.w / 2, y: shown.y + offset.y - r.h / 2 }
}
