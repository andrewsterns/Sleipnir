// Pure, immutable reducers over a CanvasDoc. No React, no fs, no IO — every
// function here takes a doc and returns a new doc, which is what makes undo
// (model/undo.ts) a plain array of previous docs and makes the whole model
// unit-testable without a renderer (see doc.test.ts).
//
// Nothing in this file mutates its input. Callers rely on that: the undo stack
// holds references to previous docs, so an in-place edit would silently
// rewrite history.

import { angleOf, apply, boundsOf, IDENTITY, invert, multiply, nodeMatrix, orientedFrom, quadOf, type Mat, type OrientedBox } from './rotation'
import {
  CANVAS_SCHEMA_VERSION,
  childrenOf,
  isFrameNode,
  isVectorNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasNode,
  type CanvasRect,
  type CanvasStyle,
  type CanvasTextNode,
  type CanvasVectorNode,
  type VectorShape,
  type NodeId,
} from './types'
import { vectorContains } from './vectorEdit'

// ── Ids ────────────────────────────────────────────────────────────────────

// Same shape as the backend's node ids (slug + timestamp) but generated
// client-side: a canvas doc is written as one whole file, so ids only need to
// be unique within the doc, and a round-trip to the backend just to name a
// rectangle would make dragging feel awful.
let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

// ── Construction ───────────────────────────────────────────────────────────

export function createDoc(name: string): CanvasDoc {
  const now = Date.now()
  return {
    version: CANVAS_SCHEMA_VERSION,
    id: nextId('canvas'),
    name,
    nodes: [],
    components: [],
    createdAt: now,
    updatedAt: now,
  }
}

const DEFAULT_FRAME_STYLE: CanvasStyle = {
  flow: 'freeform',
  fills: [{ color: 'bg-2' }],
  stroke: { color: 'border-1', width: 1 },
  radius: 4,
}

export function createFrameNode(rect: CanvasRect, name = 'Frame'): CanvasFrameNode {
  return {
    id: nextId('frame'),
    name,
    kind: 'frame',
    rect,
    style: { ...DEFAULT_FRAME_STYLE },
    children: [],
  }
}

export function createTextNode(rect: CanvasRect, text = 'Text'): CanvasTextNode {
  return {
    id: nextId('text'),
    name: text.slice(0, 24) || 'Text',
    kind: 'text',
    rect,
    style: {},
    text,
    font: { size: 12, color: 'text-1', align: 'left' },
  }
}

/** Figma's default shape fill — and the pen's default stroke, so a fresh path shows on a dark board too. */
export const DEFAULT_VECTOR_COLOR = '#d9d9d9'

const VECTOR_NAMES: Record<VectorShape, string> = { rectangle: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', path: 'Vector' }

/**
 * A shape or pen path. Shapes start filled, as Figma's do; a pen path starts
 * stroked and unfilled, since an open path has no inside to fill.
 */
export function createVectorNode(
  rect: CanvasRect,
  shape: VectorShape,
  extra: Pick<CanvasVectorNode, 'sides' | 'points' | 'closed' | 'viewBox'> = {},
): CanvasVectorNode {
  const name = shape === 'polygon' && (extra.sides ?? 3) === 3 ? 'Triangle' : VECTOR_NAMES[shape]
  return {
    id: nextId('vector'),
    name,
    kind: 'vector',
    rect,
    style:
      shape === 'path'
        ? { stroke: { color: DEFAULT_VECTOR_COLOR, width: 2 } }
        : { fills: [{ type: 'solid', color: DEFAULT_VECTOR_COLOR }] },
    shape,
    ...(shape === 'polygon' ? { sides: extra.sides ?? 3 } : {}),
    ...(shape === 'path' ? { points: extra.points ?? [], closed: !!extra.closed, viewBox: extra.viewBox ?? { w: rect.w, h: rect.h } } : {}),
  }
}

// ── Traversal ──────────────────────────────────────────────────────────────

/** Depth-first, parents before children. */
export function walk(doc: CanvasDoc, visit: (node: CanvasNode, parent: CanvasFrameNode | null) => void): void {
  const step = (nodes: CanvasNode[], parent: CanvasFrameNode | null) => {
    for (const node of nodes) {
      visit(node, parent)
      if (isFrameNode(node)) step(node.children, node)
    }
  }
  step(doc.nodes, null)
}

// An id → node / parent index per doc, built on first lookup and kept for as
// long as that doc object lives. Lookups used to walk the whole tree every
// call, and a drag makes hundreds per frame (every sibling's board rect for
// snapping, every label's position) — quadratic in the board's size. Docs are
// immutable (see doc.test.ts), so a doc's index can never go stale.
interface DocIndex {
  nodes: Map<NodeId, CanvasNode>
  parents: Map<NodeId, CanvasFrameNode | null>
}

const indexes = new WeakMap<CanvasDoc, DocIndex>()

function indexOf(doc: CanvasDoc): DocIndex {
  let index = indexes.get(doc)
  if (!index) {
    const built: DocIndex = { nodes: new Map(), parents: new Map() }
    walk(doc, (node, parent) => {
      built.nodes.set(node.id, node)
      built.parents.set(node.id, parent)
    })
    index = built
    indexes.set(doc, index)
  }
  return index
}

export function findNode(doc: CanvasDoc, id: NodeId): CanvasNode | null {
  return indexOf(doc).nodes.get(id) ?? null
}

export function findParent(doc: CanvasDoc, id: NodeId): CanvasFrameNode | null {
  return indexOf(doc).parents.get(id) ?? null
}

/** Ancestors outermost-first, excluding the node itself. */
export function ancestorsOf(doc: CanvasDoc, id: NodeId): CanvasFrameNode[] {
  const { parents } = indexOf(doc)
  const path: CanvasFrameNode[] = []
  for (let parent = parents.get(id) ?? null; parent; parent = parents.get(parent.id) ?? null) path.unshift(parent)
  return path
}

export function isDescendant(doc: CanvasDoc, ancestorId: NodeId, nodeId: NodeId): boolean {
  const ancestor = findNode(doc, ancestorId)
  if (!ancestor || !isFrameNode(ancestor)) return false
  let hit = false
  const step = (nodes: CanvasNode[]) => {
    for (const node of nodes) {
      if (node.id === nodeId) hit = true
      step(childrenOf(node))
    }
  }
  step(ancestor.children)
  return hit
}

/**
 * Board-space rects measured from the DOM, keyed by node id.
 *
 * Only ever holds the nodes an auto-layout ancestor positions — the ones no
 * amount of rect arithmetic can place (see model/layout.ts's header). Every
 * geometry function below takes it as an OVERRIDE and falls back to the model
 * when a node is absent, which is the normal case on a freeform board.
 */
export type MeasuredRects = ReadonlyMap<NodeId, CanvasRect>

/**
 * A node's rect in BOARD space, accumulated through its ancestors.
 *
 * Exact while every ancestor is `flow: 'freeform'`: a child sits at its own
 * rect offset by its ancestors', and toCss uses outline rather than border
 * precisely so a parent's paint can never add to that.
 *
 * Under an auto-layout ancestor the arithmetic is meaningless — positionCss
 * drops the child's x/y and the browser places it — so pass `measured` and the
 * DOM's answer wins. Callers that skip it get the old model-only behavior,
 * which is still correct for a freeform board and is what the pure model tests
 * assert.
 */
export function boardRectOf(doc: CanvasDoc, id: NodeId, measured?: MeasuredRects): CanvasRect | null {
  const direct = measured?.get(id)
  if (direct) return direct

  const node = findNode(doc, id)
  if (!node) return null
  let x = node.rect.x
  let y = node.rect.y
  // Innermost first, so the walk can stop at the nearest MEASURED ancestor:
  // below that point the model's offsets are authoritative again (a freeform
  // frame inside a stack still places its own children by their rects).
  const ancestors = ancestorsOf(doc, id)
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i]
    const box = measured?.get(ancestor.id)
    if (box) return { x: x + box.x, y: y + box.y, w: node.rect.w, h: node.rect.h }
    x += ancestor.rect.x
    y += ancestor.rect.y
  }
  return { x, y, w: node.rect.w, h: node.rect.h }
}

/**
 * The map from a node's own space (0,0 at its unrotated top-left) to the
 * board, through every ancestor's offset AND rotation (see model/rotation.ts).
 * A measured node's box is absolute, so it restarts the chain, exactly as in
 * boardRectOf.
 */
export function boardMatrixOf(doc: CanvasDoc, id: NodeId, measured?: MeasuredRects): Mat | null {
  const node = findNode(doc, id)
  if (!node) return null
  let m = IDENTITY
  for (const n of [...ancestorsOf(doc, id), node]) {
    const box = measured?.get(n.id)
    m = box ? nodeMatrix(box, n.style.rotate) : multiply(m, nodeMatrix(n.rect, n.style.rotate))
  }
  return m
}

/**
 * Where a node really is on the board — center, unrotated size and total
 * rotation. Equal to boardRectOf's box (as a center) whenever nothing on the
 * way up is rotated; the selection ring and handles are drawn from this.
 */
export function orientedBoxOf(doc: CanvasDoc, id: NodeId, measured?: MeasuredRects): OrientedBox | null {
  const node = findNode(doc, id)
  const m = boardMatrixOf(doc, id, measured)
  if (!node || !m) return null
  const size = measured?.get(id) ?? node.rect
  return orientedFrom(m, size.w, size.h)
}

/** The total rotation a node shows on the board — its own plus every ancestor's. */
export function boardAngleOf(doc: CanvasDoc, id: NodeId, measured?: MeasuredRects): number {
  const m = boardMatrixOf(doc, id, measured)
  return m ? angleOf(m) : 0
}

/** The axis-aligned board box around a node as drawn — rotation included. */
export function boardBoundsOf(doc: CanvasDoc, id: NodeId, measured?: MeasuredRects): CanvasRect | null {
  const node = findNode(doc, id)
  const m = boardMatrixOf(doc, id, measured)
  if (!node || !m) return null
  const size = measured?.get(id) ?? node.rect
  return boundsOf(quadOf(m, size.w, size.h))
}

// ── Structural edits ───────────────────────────────────────────────────────

/** Rebuilds the tree, replacing the node with `id` by `fn`'s result (null deletes). */
/**
 * `nodes` with node `id` replaced by `fn(node)` (or removed, for null), sharing
 * every subtree the edit doesn't touch: only the edited node's ancestors are
 * new objects. That sharing is what lets the memoized node views and layer
 * rows skip everything else — copying every frame on every edit re-rendered
 * the whole board on each frame of a drag.
 */
function rewrite(nodes: CanvasNode[], id: NodeId, fn: (node: CanvasNode) => CanvasNode | null): CanvasNode[] {
  let changed = false
  const out: CanvasNode[] = []
  for (const node of nodes) {
    if (node.id === id) {
      changed = true
      const next = fn(node)
      if (next) out.push(next)
      continue
    }
    if (isFrameNode(node)) {
      const children = rewrite(node.children, id, fn)
      if (children !== node.children) {
        changed = true
        out.push({ ...node, children })
        continue
      }
    }
    out.push(node)
  }
  return changed ? out : nodes
}

function touch(doc: CanvasDoc, nodes: CanvasNode[]): CanvasDoc {
  return { ...doc, nodes, updatedAt: Date.now() }
}

export function insertNode(doc: CanvasDoc, node: CanvasNode, parentId: NodeId | null, index?: number): CanvasDoc {
  if (parentId === null) {
    const nodes = [...doc.nodes]
    nodes.splice(index ?? nodes.length, 0, node)
    return touch(doc, nodes)
  }
  const parent = findNode(doc, parentId)
  // A non-frame can't hold children; silently landing the node at the root
  // would be a confusing no-op, so this is a deliberate rejection.
  if (!parent || !isFrameNode(parent)) return doc
  return touch(
    doc,
    rewrite(doc.nodes, parentId, (p) => {
      const frame = p as CanvasFrameNode
      const children = [...frame.children]
      children.splice(index ?? children.length, 0, node)
      return { ...frame, children }
    }),
  )
}

/**
 * Swaps a node — subtree and all — for another. For whole-node edits a patch
 * can't express: dropping a field (a shape becoming a path loses `sides`), or
 * rebuilding a frame's children (baking a layout into fixed positions).
 */
export function replaceNodeById(doc: CanvasDoc, id: NodeId, next: CanvasNode): CanvasDoc {
  if (!findNode(doc, id)) return doc
  return touch(doc, rewrite(doc.nodes, id, () => next))
}

/**
 * `frameId`'s subtree with every auto-layout frame turned freeform and each
 * child pinned to where the layout actually drew it (the measured rects), so
 * nothing moves on the board and positions survive into an SVG, which has no
 * layout. A subtree with no auto-layout is returned as it was.
 */
export function bakeLayout(doc: CanvasDoc, frameId: NodeId, measured: MeasuredRects): CanvasDoc {
  const frame = findNode(doc, frameId)
  if (!frame || !isFrameNode(frame)) return doc
  const bake = (node: CanvasFrameNode): CanvasFrameNode => {
    const parentBox = boardRectOf(doc, node.id, measured)
    const children = node.children.map((child) => {
      const box = boardRectOf(doc, child.id, measured)
      const placed =
        box && parentBox && node.style.flow && node.style.flow !== 'freeform'
          ? { ...child, rect: { x: box.x - parentBox.x, y: box.y - parentBox.y, w: box.w, h: box.h } }
          : child
      return isFrameNode(placed) ? bake(placed) : placed
    })
    return { ...node, style: { ...node.style, flow: 'freeform' }, children }
  }
  return replaceNodeById(doc, frameId, bake(frame))
}

export function deleteNode(doc: CanvasDoc, id: NodeId): CanvasDoc {
  if (!findNode(doc, id)) return doc
  return touch(doc, rewrite(doc.nodes, id, () => null))
}

export function updateNode<T extends CanvasNode>(doc: CanvasDoc, id: NodeId, patch: Partial<T>): CanvasDoc {
  if (!findNode(doc, id)) return doc
  // `children` is structural and must only change through insert/delete/
  // reparent — letting a patch replace it would bypass the descendant checks.
  const { children: _ignored, ...safe } = patch as Partial<CanvasFrameNode>
  return touch(doc, rewrite(doc.nodes, id, (node) => ({ ...node, ...safe }) as CanvasNode))
}

export function setRect(doc: CanvasDoc, id: NodeId, rect: Partial<CanvasRect>): CanvasDoc {
  const node = findNode(doc, id)
  if (!node) return doc
  return updateNode(doc, id, { rect: { ...node.rect, ...rect } })
}

export function moveNode(doc: CanvasDoc, id: NodeId, dx: number, dy: number): CanvasDoc {
  const node = findNode(doc, id)
  if (!node) return doc
  return setRect(doc, id, { x: node.rect.x + dx, y: node.rect.y + dy })
}

export function setStyle(doc: CanvasDoc, id: NodeId, patch: Partial<CanvasStyle>): CanvasDoc {
  const node = findNode(doc, id)
  if (!node) return doc
  return updateNode(doc, id, { style: { ...node.style, ...patch } })
}

/**
 * Moves a node under a new parent, converting its rect between the two
 * coordinate spaces so it doesn't visually jump.
 *
 * Refuses to reparent a node into itself or any of its own descendants — that
 * would detach the subtree from the tree entirely and lose it.
 */
export function reparentNode(
  doc: CanvasDoc,
  id: NodeId,
  newParentId: NodeId | null,
  index?: number,
  measured?: MeasuredRects,
): CanvasDoc {
  const node = findNode(doc, id)
  if (!node) return doc
  if (newParentId === id) return doc
  if (newParentId !== null && isDescendant(doc, id, newParentId)) return doc
  if (findParent(doc, id)?.id === (newParentId ?? undefined)) {
    // Same parent — this is a reorder, not a reparent.
    if (index === undefined) return doc
  }
  if (newParentId !== null) {
    const parent = findNode(doc, newParentId)
    if (!parent || !isFrameNode(parent)) return doc
  }

  // Measured rects matter most here: dragging a child OUT of an auto-layout
  // frame has to land it where it was let go, and only the DOM knows where the
  // layout had actually put it.
  const board = boardRectOf(doc, id, measured)
  const detached = touch(doc, rewrite(doc.nodes, id, () => null))
  const parentBoard = newParentId ? boardRectOf(detached, newParentId, measured) : null
  const rect: CanvasRect = board
    ? {
        ...node.rect,
        x: board.x - (parentBoard?.x ?? 0),
        y: board.y - (parentBoard?.y ?? 0),
      }
    : node.rect

  return insertNode(detached, { ...node, rect } as CanvasNode, newParentId, index)
}

// ── Hit testing ────────────────────────────────────────────────────────────

function rectContains(rect: CanvasRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

export interface HitOptions {
  /**
   * Subtrees that are transparent to the search — neither hit nor occluding.
   *
   * The drag pass passes the moving selection here. Without it the dragged node
   * sits under the cursor for the whole drag and hides every frame you are
   * trying to drop into, which is why dropping into a frame used to work only
   * on the very first pointermove (while the doc still had the node at its
   * original position) and then stop.
   */
  ignore?: Set<NodeId>
  /**
   * How near a vector's outline counts as on it, in board units — callers pass
   * a few screen pixels divided by zoom. Vectors hit by their shape, not their
   * box, so a click in a triangle's empty corner reaches what is behind it.
   */
  tolerance?: number
  /**
   * Real board rects for auto-layout-positioned nodes.
   *
   * Without these the search tests the cursor against a box that isn't on
   * screen, so clicking a child inside a vertical or horizontal stack selected
   * its parent — or nothing — instead of the child under the pointer.
   */
  measured?: MeasuredRects
}

/**
 * The chain of nodes leading to whatever is drawn under a board-space point,
 * OUTERMOST FIRST.
 *
 * Later siblings win over earlier ones at each level, because they paint on top.
 *
 * A child is searched even when the point lies OUTSIDE its parent's box: a
 * freeform child can be dragged past its parent's edge and is still painted
 * there, so gating the descent on the parent's rect would make it permanently
 * unclickable. Only a clipping parent hides what leaves its box — which is
 * exactly what the renderer does (toCss's `overflow: hidden`). A path can
 * therefore pass THROUGH an ancestor the point isn't inside; callers that need
 * containment (dropTargetAt) check it themselves.
 *
 * Locked and hidden nodes are never returned, but a locked node's children are
 * still searched — locking a container shouldn't make its contents unreachable.
 */
export function hitPath(doc: CanvasDoc, x: number, y: number, opts?: HitOptions): CanvasNode[] {
  const ignore = opts?.ignore
  const measured = opts?.measured
  const search = (nodes: CanvasNode[], parent: Mat, trail: CanvasNode[]): CanvasNode[] | null => {
    // Iterate back-to-front so the topmost sibling is found first.
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i]
      if (node.hidden) continue
      if (ignore?.has(node.id)) continue
      // A measured rect is already absolute, so it REPLACES the accumulated
      // transform rather than composing with it — and becomes the origin its
      // own freeform children are then placed from.
      const box = measured?.get(node.id)
      const m = box ? nodeMatrix(box, node.style.rotate) : multiply(parent, nodeMatrix(node.rect, node.style.rotate))
      const size = box ?? node.rect
      // The point in the node's own unrotated space — so a rotated node is hit
      // by its turned shape, not by the upright box it was drawn as.
      const local = apply(invert(m), { x, y })
      const inside =
        rectContains({ x: 0, y: 0, w: size.w, h: size.h }, local.x, local.y) &&
        (!isVectorNode(node) || vectorContains(node, local.x, local.y, opts?.tolerance ?? 3))
      // A pattern piece is one unit: its insides belong to the template.
      if ((inside || !node.style.clip) && !node.repeatOf) {
        const nextTrail = node.locked ? trail : [...trail, node]
        const deeper = search(childrenOf(node), m, nextTrail)
        // Children paint over their parent, so a hit inside one wins outright.
        if (deeper !== null) return deeper
      }
      if (!inside) continue
      // Committed to this branch; siblings beneath it are occluded — including
      // when this node is locked, which yields the trail without it.
      return node.locked ? trail : [...trail, node]
    }
    return null
  }
  return search(doc.nodes, IDENTITY, []) ?? []
}

/** Deepest visible, unlocked node under the point, or null. */
export function hitTest(doc: CanvasDoc, x: number, y: number, opts?: HitOptions): CanvasNode | null {
  const path = hitPath(doc, x, y, opts)
  return path.length > 0 ? path[path.length - 1] : null
}

/**
 * What a plain click should select, given how deep the user has already drilled.
 *
 * ── Figma's rule, and why the "outermost wins" version was wrong ────────────
 *
 * A top-level frame is an ARTBOARD, and an artboard's contents are directly
 * clickable. That is the whole reason designing inside a frame is possible: if a
 * click always took the outermost node, every element inside a frame would need
 * a double-click first, and every drag would move the frame instead of the thing
 * under the cursor. So with no scope the outermost node IS the scope, and a
 * click lands on its direct child.
 *
 * Deeper nesting still behaves like a container: given Artboard > Card > Label,
 * a click selects Card, and double-clicking (which sets `scopeId`) reaches
 * Label. One level of container per click, exactly as Figma does it.
 *
 * Clicking a frame's own background — nothing deeper under the cursor — still
 * selects the frame, which is how an artboard is grabbed without its label.
 *
 * Passing the deepest node's id as `scopeId` is how ctrl/cmd-click reaches
 * straight through to the leaf.
 */
export function pickForScope(path: CanvasNode[], scopeId: NodeId | null): CanvasNode | null {
  if (path.length === 0) return null
  if (!scopeId) return path[1] ?? path[0]
  const index = path.findIndex((node) => node.id === scopeId)
  // Scope isn't on this path (you clicked outside what you drilled into) —
  // fall back to the default depth, which pops you back out one container.
  if (index === -1) return path[1] ?? path[0]
  return path[index + 1] ?? path[index]
}

/**
 * The frame a dragged node should land in if dropped at this point.
 *
 * The dragged subtrees are made transparent rather than merely skipped — they
 * follow the cursor, so leaving them in the search would occlude the very frame
 * you are aiming at. That also removes the need for a descendant check: nothing
 * inside a dragged node can appear in the path, so dropping a frame into its own
 * child is unreachable by construction.
 *
 * Instances are never offered — they have no children to receive anything.
 * Returns null for the board root.
 */
export function dropTargetAt(
  doc: CanvasDoc,
  x: number,
  y: number,
  draggingIds: Set<NodeId>,
  measured?: MeasuredRects,
): CanvasFrameNode | null {
  const path = hitPath(doc, x, y, { ignore: draggingIds, measured })
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const node = path[i]
    if (!isFrameNode(node)) continue
    // hitPath can pass through an ancestor whose own box the point is outside
    // (a child that was dragged past its parent's edge). Such an ancestor is not
    // under the cursor, so offering it as a drop target would be a lie.
    const m = boardMatrixOf(doc, node.id, measured)
    if (!m) continue
    const local = apply(invert(m), { x, y })
    const size = measured?.get(node.id) ?? node.rect
    if (!rectContains({ x: 0, y: 0, w: size.w, h: size.h }, local.x, local.y)) continue
    return node
  }
  return null
}

/** Board-space bounding box of a set of nodes, or null when none resolve. */
export function boundingBoxOf(
  doc: CanvasDoc,
  ids: Iterable<NodeId>,
  measured?: MeasuredRects,
): CanvasRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of ids) {
    const rect = boardRectOf(doc, id, measured)
    if (!rect) continue
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.w)
    maxY = Math.max(maxY, rect.y + rect.h)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Wraps the given nodes in a new parent frame sized to their bounding box —
 * the fastest way to build hierarchy, and the inverse of ungroup.
 *
 * The group is inserted at the position of the topmost member so nothing
 * that was drawn over a member ends up under it, and lands in that member's parent so grouping never moves the
 * selection somewhere else in the tree. Children are re-based into the group's
 * coordinate space, so nothing visually moves.
 */
export function groupNodes(
  doc: CanvasDoc,
  ids: NodeId[],
  name = 'Group',
  measured?: MeasuredRects,
): { doc: CanvasDoc; groupId: NodeId | null } {
  const unique = [...new Set(ids)].filter((id) => findNode(doc, id))
  if (unique.length === 0) return { doc, groupId: null }

  // Only group siblings: mixing parents would mean pulling nodes out of
  // unrelated containers, which is almost never what a drag-select intended.
  const parent = findParent(doc, unique[0])
  const siblings = unique.filter((id) => findParent(doc, id)?.id === parent?.id)
  if (siblings.length === 0) return { doc, groupId: null }

  const box = boundingBoxOf(doc, siblings, measured)
  if (!box) return { doc, groupId: null }

  const parentBoard = parent ? boardRectOf(doc, parent.id, measured) : null
  const group = createFrameNode(
    { x: box.x - (parentBoard?.x ?? 0), y: box.y - (parentBoard?.y ?? 0), w: box.w, h: box.h },
    name,
  )
  // A group is a plain container: no fill or stroke of its own, so wrapping
  // things doesn't change how they look.
  group.style = { flow: 'freeform' }

  const members = siblings
    .map((id) => findNode(doc, id))
    .filter((n): n is CanvasNode => n !== null)
    .map((node) => {
      const board = boardRectOf(doc, node.id, measured)!
      return { ...node, rect: { ...node.rect, x: board.x - box.x, y: board.y - box.y } }
    })

  // The group takes the TOPMOST member's place in the stack (Figma's rule).
  // It used to take the bottom-most one's, which dropped every other member
  // beneath whatever sat between them — a frame or image drawn in between
  // then covered them, and grouping looked like it made shapes disappear.
  // Members keep their own order inside the group.
  const container = parent ? parent.children : doc.nodes
  let top = -1
  container.forEach((n, i) => {
    if (siblings.includes(n.id)) top = i
  })
  // Where that slot is once the members themselves are lifted out.
  const index = top < 0 ? undefined : container.slice(0, top).filter((n) => !siblings.includes(n.id)).length
  const ordered = container.filter((n) => siblings.includes(n.id)).map((n) => members.find((m) => m.id === n.id)!)

  let next = doc
  for (const id of siblings) next = deleteNode(next, id)
  next = insertNode(next, { ...group, children: ordered }, parent?.id ?? null, index)
  return { doc: next, groupId: group.id }
}

/** Dissolves a frame, lifting its children into its parent at its own position. */
export function ungroupNode(
  doc: CanvasDoc,
  id: NodeId,
  measured?: MeasuredRects,
): { doc: CanvasDoc; childIds: NodeId[] } {
  const node = findNode(doc, id)
  if (!node || !isFrameNode(node) || node.children.length === 0) return { doc, childIds: [] }

  const parent = findParent(doc, id)
  const parentBoard = parent ? boardRectOf(doc, parent.id, measured) : null
  const groupBoard = boardRectOf(doc, id, measured)!

  const lifted = node.children.map((child) => ({
    ...child,
    rect: {
      ...child.rect,
      x: groupBoard.x + child.rect.x - (parentBoard?.x ?? 0),
      y: groupBoard.y + child.rect.y - (parentBoard?.y ?? 0),
    },
  }))

  const container = parent ? parent.children : doc.nodes
  const index = container.findIndex((n) => n.id === id)

  let next = deleteNode(doc, id)
  lifted.forEach((child, offset) => {
    next = insertNode(next, child, parent?.id ?? null, index < 0 ? undefined : index + offset)
  })
  return { doc: next, childIds: lifted.map((c) => c.id) }
}

/** Every node whose board rect lies entirely within the marquee. */
export function nodesInRect(
  doc: CanvasDoc,
  marquee: CanvasRect,
  measured?: MeasuredRects,
): CanvasNode[] {
  const out: CanvasNode[] = []
  const step = (nodes: CanvasNode[], parent: Mat) => {
    for (const node of nodes) {
      if (node.hidden || node.locked) continue
      // Same override rule as hitPath: a measured rect is absolute and becomes
      // the origin for this node's own children.
      const box = measured?.get(node.id)
      const m = box ? nodeMatrix(box, node.style.rotate) : multiply(parent, nodeMatrix(node.rect, node.style.rotate))
      const size = box ?? node.rect
      // A rotated node is inside when its turned corners are.
      const { x, y, w, h } = boundsOf(quadOf(m, size.w, size.h))
      const inside =
        x >= marquee.x &&
        y >= marquee.y &&
        x + w <= marquee.x + marquee.w &&
        y + h <= marquee.y + marquee.h
      // A selected frame takes its whole subtree with it, so descendants are
      // never added alongside their own ancestor.
      if (inside) out.push(node)
      else step(childrenOf(node), m)
    }
  }
  step(doc.nodes, IDENTITY)
  return out
}
