// Pointer interaction on the board: what a click selects at each depth, drawing,
// moving with snapping and drop targets, resizing, rotating, sliding along a
// path, marquee selection and double-click drilling. Split out of
// CanvasView.ViewModel.tsx; the view model owns the state, this owns the gestures.

import { useCallback } from 'react'
import {
  type CanvasTool,
  DEFAULT_FRAME_SIZE,
  DEFAULT_SHAPE_SIZE,
  type DragState,
  type DropIntent,
  MIN_DRAW_SIZE,
  OUTLINE_TOLERANCE_PX,
  PEN_CLOSE_RADIUS,
  type PenDraft,
  ROOT_DROP_TARGET,
  type ResizeHandle,
  type ValueStore,
  changesOrder,
  drawRect,
  duplicateInPlace,
  editTargetOf,
  isShapeTool,
  normalizeRect,
  resizeRect,
  resizeRotatedRect,
  snap45,
} from '../boardEditing'
import type { PanZoomHandle } from './usePanZoom'
import { type Guide, SNAP_THRESHOLD, snapRect } from '../../document/align'
import {
  ancestorsOf,
  boardAngleOf,
  boardMatrixOf,
  boardRectOf,
  boundingBoxOf,
  createFrameNode,
  createTextNode,
  createVectorNode,
  dropTargetAt,
  findNode,
  findParent,
  hitPath,
  insertNode,
  nodesInRect,
  orientedBoxOf,
  pickForScope,
  reparentNode,
  replaceNodeById,
  setRect,
  setStyle,
  updateNode,
} from '../../document/doc'
import { resizeOnPlane } from '../../document/frontView'
import { keepsProportions } from '../../document/imageSizing'
import { insertionAt, isAutoLayout, isLayoutPositioned, resolveDropTarget } from '../../document/layout'
import { isOnPath, isPathFlow, moveToPathSlot, slideOffset } from '../../document/pathFlow'
import { apply as applyMat, invert, normalizeDegrees, rotateAbout, snapAngle } from '../../document/rotation'
import type { Placement3D } from '../../document/sceneTypes'
import {
  type CanvasDoc,
  type CanvasNode,
  type CanvasRect,
  type CanvasVectorNode,
  type NodeId,
  isTextNode,
  isVectorNode,
} from '../../document/types'
import {
  insertPoint,
  moveAnchors,
  movePoint,
  nearestSegment,
  pointOnSegment,
  refit,
  vectorContains,
} from '../../document/vectorEdit'
import { type ProjectedSurface, solidAt } from '../../modeling/scene3d/sceneMeshes'
import { CLICK_DRAG_THRESHOLD } from '../../utils/pointer'

export interface BoardPointerDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  applyDragFrame: (next: CanvasDoc) => void
  doc: CanvasDoc | null
  drag: DragState | null
  dropIntent: DropIntent | null
  editingNode: CanvasVectorNode | null
  editingVectorId: string | null
  enterPlaneEdit: (id: string) => void
  enterVectorEdit: (id: string) => void
  exitVectorEdit: () => void
  finishPen: (closed: boolean) => void
  insertPreview: ValueStore<{ x: number; y: number } | null>
  measured: ReadonlyMap<string, CanvasRect>
  panZoom: PanZoomHandle
  pathSlideStart: React.MutableRefObject<{ gesture: { x: number; y: number }; offset: number } | null>
  penCursor: ValueStore<{ x: number; y: number } | null>
  penRef: React.MutableRefObject<PenDraft | null>
  projectedSolids: Map<string, ProjectedSurface[]>
  scopeId: string | null
  selectedIds: Set<string>
  selectedPoints: ReadonlySet<number>
  setDrag: React.Dispatch<React.SetStateAction<DragState | null>>
  setDropIntent: React.Dispatch<React.SetStateAction<DropIntent | null>>
  setEditingTextId: React.Dispatch<React.SetStateAction<string | null>>
  setGuides: React.Dispatch<React.SetStateAction<Guide[]>>
  setHoverId: React.Dispatch<React.SetStateAction<string | null>>
  setPen: React.Dispatch<React.SetStateAction<PenDraft | null>>
  setScopeId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedHandle: React.Dispatch<React.SetStateAction<{ index: number; part: "in" | "out" } | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setSelectedPoints: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>
  setTool: React.Dispatch<React.SetStateAction<CanvasTool>>
  snapDisabled: React.MutableRefObject<boolean>
  tool: CanvasTool
}

export function useBoardPointer({ apply, applyDragFrame, doc, drag, dropIntent, editingNode, editingVectorId, enterPlaneEdit, enterVectorEdit, exitVectorEdit, finishPen, insertPreview, measured, panZoom, pathSlideStart, penCursor, penRef, projectedSolids, scopeId, selectedIds, selectedPoints, setDrag, setDropIntent, setEditingTextId, setGuides, setHoverId, setPen, setScopeId, setSelectedHandle, setSelectedIds, setSelectedPoints, setTool, snapDisabled, tool }: BoardPointerDeps) {

  /**
   * How deep a plain click reaches.
   *
   * Figma's rule is that a click selects the outermost node, so a container
   * stays grabbable once it has children, and that you double-click to drill in.
   * The depth you drilled to used to live ONLY in `scopeId`, which made working
   * inside a frame miserable: the moment anything cleared it you were bounced
   * back to the outermost frame and had to re-drill for every child.
   *
   * So the depth is inferred from the selection instead — a single selected node
   * means "I am working among this node's siblings", which is exactly the scope
   * a click should resolve against. `scopeId` remains the fallback for an empty
   * or multiple selection, where there is nothing to infer from.
   */
  const drillScope = useCallback((): NodeId | null => {
    if (!doc) return scopeId
    if (selectedIds.size !== 1) return scopeId
    const [only] = selectedIds
    return findParent(doc, only)?.id ?? null
  }, [doc, selectedIds, scopeId])

  /**
   * The chain of layers under a board point, outermost first (document/doc.ts
   * hitPath) — with the board's projected solids in it: a solid covers more of
   * the board than its sketch does, so a press on any of it is a press on it,
   * unless a layer painted above it was hit.
   */
  const boardPath = useCallback(
    (x: number, y: number): CanvasNode[] => {
      if (!doc) return []
      const path = hitPath(doc, x, y, { measured, tolerance: OUTLINE_TOLERANCE_PX / panZoom.getCamera().k })
      const solid = solidAt(projectedSolids, doc.nodes.map((n) => n.id), x, y)
      if (!solid) return path
      const hitTop = path[0] ? doc.nodes.indexOf(path[0]) : -1
      const node = doc.nodes.findIndex((n) => n.id === solid.layer) >= hitTop ? findNode(doc, solid.id) : null
      return node && !node.locked ? [...ancestorsOf(doc, node.id), node] : path
    },
    [doc, measured, panZoom, projectedSolids],
  )

  /** What a press (or hover) at this board point resolves to. */
  const pickAt = useCallback(
    (x: number, y: number, deep: boolean): CanvasNode | null => {
      const path = boardPath(x, y)
      // Ctrl/Cmd reaches straight through to the deepest node, skipping the
      // drill-down entirely — the standard escape hatch.
      return deep ? (path[path.length - 1] ?? null) : pickForScope(path, drillScope())
    },
    [boardPath, drillScope],
  )

  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!doc) return
      if (e.button !== 0) return
      if (panZoom.isPanning()) return
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const originClient = { x: e.clientX, y: e.clientY }
      // Without capture, a drag that crosses onto the Layers or Properties panel
      // stops receiving pointermove and the node freezes mid-gesture — one of
      // the ways moving a node "stopped working" partway through.
      try {
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        // Synthetic or already-captured pointer; the drag still works, it just
        // ends early if the cursor leaves the board.
      }

      // Editing a path: a press on its outline adds an anchor there (and
      // starts dragging it); anywhere else finishes editing and carries on as
      // an ordinary press. Anchors and handles have their own pointerdown.
      if (editingNode) {
        const box = boardRectOf(doc, editingNode.id, measured)
        const k = panZoom.getCamera().k
        if (box) {
          const local = { x: board.x - box.x, y: board.y - box.y }
          const seg = nearestSegment(editingNode, local.x, local.y)
          // Ctrl/Cmd+click on the outline adds an anchor there, exactly on the
          // curve (a plain click is a box-select, so a stray click on the line
          // never sprouts a point).
          if ((e.ctrlKey || e.metaKey) && seg && seg.dist * k <= OUTLINE_TOLERANCE_PX) {
            insertPreview.set(null)
            const { node: withPoint, at } = insertPoint(editingNode, seg.index, seg.t)
            const fitted = refit(withPoint)
            apply(replaceNodeById(doc, editingNode.id, fitted))
            setSelectedPoints(new Set([at]))
            const fittedBox = { ...box, x: box.x + (fitted.rect.x - editingNode.rect.x), y: box.y + (fitted.rect.y - editingNode.rect.y) }
            setDrag({
              kind: 'point',
              originBoard: board,
              currentBoard: board,
              originClient,
              moved: false,
              startRects: new Map(),
              point: { index: at, part: 'anchor' },
              pointStart: { indices: [at], points: fitted.points ?? [], box: fittedBox },
            })
            return
          }
        }
        // Anywhere else: a box-select of anchors. A click with no drag clears
        // the anchor selection, and outside the path finishes editing.
        setSelectedHandle(null)
        setDrag({ kind: 'point-marquee', originBoard: board, currentBoard: board, originClient, moved: false, startRects: new Map(), shift: e.shiftKey })
        return
      }

      if (tool === 'pen') {
        const draft = penRef.current
        const first = draft?.points[0]
        const k = panZoom.getCamera().k
        if (draft && first && draft.points.length >= 2 && Math.hypot(board.x - first.x, board.y - first.y) * k <= PEN_CLOSE_RADIUS) {
          finishPen(true)
          return
        }
        const prev = draft?.points[draft.points.length - 1]
        const placed = e.shiftKey && prev ? snap45(prev, board) : board
        setPen({ points: [...(draft?.points ?? []), { x: placed.x, y: placed.y }] })
        penCursor.set(placed)
        setDrag({ kind: 'pen', originBoard: placed, currentBoard: placed, originClient, moved: false, startRects: new Map() })
        return
      }

      if (tool === 'frame' || tool === 'text' || isShapeTool(tool)) {
        setDrag({
          kind: 'draw',
          originBoard: board,
          currentBoard: board,
          originClient,
          moved: false,
          startRects: new Map(),
        })
        return
      }

      const deep = e.ctrlKey || e.metaKey
      const path = boardPath(board.x, board.y)
      const picked = deep ? (path[path.length - 1] ?? null) : pickForScope(path, drillScope())

      /**
       * Pressing inside something that is ALREADY selected grabs it, instead of
       * reaching past it to the child under the cursor.
       *
       * This is the half of Figma's model that makes a container movable: with a
       * frame selected, a drag starting anywhere inside it moves the frame,
       * children and all. Without it, "click the child to select the child" —
       * which is the other half — would make a frame with children impossible to
       * drag except from the sliver of background not covered by something.
       *
       * The outermost selected node in the path wins, so a selected frame beats
       * a selected descendant of it. Shift extends a selection and ctrl reaches
       * for a leaf, so neither should be overridden here.
       */
      const grabbed = !e.shiftKey && !deep ? (path.find((n) => selectedIds.has(n.id)) ?? null) : null
      const reachesDeeper = !!grabbed && !!picked && grabbed.id !== picked.id
      const hit = reachesDeeper ? grabbed : picked

      if (!hit) {
        if (!e.shiftKey) setSelectedIds(new Set())
        // Clicking empty space exits whatever container you had drilled into.
        setScopeId(null)
        setDrag({
          kind: 'marquee',
          originBoard: board,
          currentBoard: board,
          originClient,
          moved: false,
          startRects: new Map(),
        })
        return
      }

      const nextSelection = e.shiftKey
        ? new Set(selectedIds).add(hit.id)
        : selectedIds.has(hit.id)
          ? selectedIds
          : new Set([hit.id])
      setSelectedIds(nextSelection)

      const startRects = new Map<NodeId, CanvasRect>()
      for (const id of nextSelection) {
        const node = findNode(doc, id)
        if (node) startRects.set(id, { ...node.rect })
      }
      setDrag({
        kind: 'move',
        originBoard: board,
        currentBoard: board,
        originClient,
        moved: false,
        startRects,
        // Held back until release: if this turns out to be a click rather than a
        // drag, it reaches into the selected container after all.
        clickSelect: reachesDeeper ? picked!.id : undefined,
      })
    },
    [doc, panZoom, editingNode, tool, boardPath, drillScope, selectedIds, setSelectedIds, setDrag, measured, setSelectedHandle, insertPreview, apply, setSelectedPoints, penRef, setPen, penCursor, finishPen, setScopeId],
  )

  /**
   * Selects one node and begins a move drag on it, from a press that did not
   * land on the board surface — the frame label's.
   *
   * Figma moves an artboard by its label, and with a frame's children directly
   * clickable that label is the only place a fully covered frame can be grabbed
   * at all. Capture goes on the board container rather than the label, so the
   * rest of the gesture arrives at the board's own move handler unchanged.
   */
  const startMoveDrag = useCallback(
    (id: NodeId, e: React.PointerEvent) => {
      if (!doc || e.button !== 0) return
      const node = findNode(doc, id)
      if (!node) return
      e.stopPropagation()
      const board = panZoom.toBoard(e.clientX, e.clientY)
      setSelectedIds(new Set([id]))
      setScopeId(findParent(doc, id)?.id ?? null)
      try {
        panZoom.containerRef.current?.setPointerCapture(e.pointerId)
      } catch {
        // Synthetic or already-captured pointer; the drag still works, it just
        // ends early if the cursor leaves the board.
      }
      setDrag({
        kind: 'move',
        originBoard: board,
        currentBoard: board,
        originClient: { x: e.clientX, y: e.clientY },
        moved: false,
        startRects: new Map([[id, { ...node.rect }]]),
      })
    },
    [doc, panZoom, setDrag, setScopeId, setSelectedIds],
  )

  /** Double-click drills one level into whatever is under the cursor. */
  const onBoardDoubleClick = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      if (!doc) return
      // A double-click ends a pen path, left open — its second click already
      // placed the last anchor.
      if (tool === 'pen') {
        finishPen(false)
        return
      }
      // A double-click on a vector edits its points.
      const at = panZoom.toBoard(e.clientX, e.clientY)
      const hits = boardPath(at.x, at.y)
      // A double-click on a layer placed in 3D first opens its plane, face on;
      // everything below then works on it as on any flat layer.
      const placed = hits[0]?.space ? hits[0] : undefined
      if (placed) {
        enterPlaneEdit(placed.id)
        return
      }
      const deepest = hits[hits.length - 1]
      if (deepest && isVectorNode(deepest)) {
        enterVectorEdit(deepest.id)
        return
      }
      // A double-click on text types into it, right there on the board.
      if (deepest && isTextNode(deepest)) {
        setSelectedIds(new Set([deepest.id]))
        setEditingTextId(deepest.id)
        return
      }
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const path = boardPath(board.x, board.y)
      if (path.length === 0) return
      const current = pickForScope(path, drillScope())
      const index = path.findIndex((n) => n.id === current?.id)
      const child = path[index + 1]
      if (!child) return
      setScopeId(current!.id)
      setSelectedIds(new Set([child.id]))
    },
    [doc, tool, panZoom, boardPath, drillScope, setScopeId, setSelectedIds, finishPen, enterPlaneEdit, enterVectorEdit, setEditingTextId],
  )

  /**
   * Board rects of everything a drag could snap against: siblings of the moving
   * nodes plus their parent's own box. Excludes the nodes being moved, so a
   * selection never snaps to itself.
   */
  const snapCandidates = useCallback(
    (movingIds: Set<NodeId>): CanvasRect[] => {
      if (!doc) return []
      const first = [...movingIds][0]
      if (!first) return []
      const parent = findParent(doc, first)
      const siblings = parent ? parent.children : doc.nodes
      const rects: CanvasRect[] = []
      // Siblings share an origin, so it's resolved once; a sibling the layout
      // placed has its own measured rect. Resolving each sibling from scratch
      // made every drag frame quadratic in the number of siblings.
      const parentRect = parent ? boardRectOf(doc, parent.id, measured) : null
      const ox = parentRect?.x ?? 0
      const oy = parentRect?.y ?? 0
      for (const sibling of siblings) {
        if (movingIds.has(sibling.id) || sibling.hidden) continue
        rects.push(measured.get(sibling.id) ?? { ...sibling.rect, x: ox + sibling.rect.x, y: oy + sibling.rect.y })
      }
      if (parentRect) rects.push(parentRect)
      return rects
    },
    [doc, measured],
  )

  const startResize = useCallback(
    (handle: ResizeHandle, e: React.PointerEvent) => {
      if (!doc) return
      e.stopPropagation()
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const startRects = new Map<NodeId, CanvasRect>()
      const startSpaces = new Map<NodeId, Placement3D>()
      for (const id of selectedIds) {
        // A pattern copy's size is its template's — resizing one resizes all.
        const target = editTargetOf(doc, id)
        const node = findNode(doc, target)
        if (node) startRects.set(target, { ...node.rect })
        if (node?.space && doc.nodes.includes(node)) startSpaces.set(target, node.space)
      }
      // A handle press is unambiguously a resize, so it starts already past the
      // click threshold — the first pixel of movement must land.
      setDrag({
        kind: 'resize',
        originBoard: board,
        currentBoard: board,
        originClient: { x: e.clientX, y: e.clientY },
        moved: true,
        startRects,
        startSpaces,
        handle,
      })
    },
    [doc, panZoom, setDrag, selectedIds],
  )

  /** A press on an along-path frame's start marker: sliding it slides the whole run. */
  const startPathSlide = useCallback(
    (e: React.PointerEvent) => {
      if (!doc || selectedIds.size !== 1) return
      const node = findNode(doc, [...selectedIds][0])
      const frame = isPathFlow(node) ? node : node ? findParent(doc, node.id) : null
      if (!isPathFlow(frame)) return
      e.stopPropagation()
      const board = panZoom.toBoard(e.clientX, e.clientY)
      pathSlideStart.current = { gesture: { x: e.clientX, y: e.clientY }, offset: frame.style.alongPath?.offset ?? 0 }
      setDrag({
        kind: 'path-slide',
        originBoard: board,
        currentBoard: board,
        originClient: pathSlideStart.current.gesture,
        moved: true,
        startRects: new Map(),
        pathFrameId: frame.id,
      })
    },
    [doc, selectedIds, panZoom, pathSlideStart, setDrag],
  )

  /** A press on a rotate zone just outside a selected node's corner. */
  const startRotate = useCallback(
    (e: React.PointerEvent) => {
      if (!doc || selectedIds.size === 0) return
      e.stopPropagation()
      const board = panZoom.toBoard(e.clientX, e.clientY)
      // One node turns about its own center; several turn together about the
      // center of the box around them.
      const ids = [...selectedIds].filter((id) => findNode(doc, id))
      const single = ids.length === 1 ? orientedBoxOf(doc, ids[0], measured) : null
      const box = single ? null : boundingBoxOf(doc, ids, measured)
      const center = single ? { x: single.cx, y: single.cy } : box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null
      if (!center) return
      const angles = new Map<NodeId, number>()
      const turns = new Map<NodeId, number>()
      const startRects = new Map<NodeId, CanvasRect>()
      for (const id of ids) {
        const node = findNode(doc, id)!
        angles.set(id, node.style.rotate ?? 0)
        if (isOnPath(findParent(doc, id), node)) turns.set(id, node.pathTurn ?? 0)
        startRects.set(id, { ...node.rect })
      }
      setDrag({
        kind: 'rotate',
        originBoard: board,
        currentBoard: board,
        originClient: { x: e.clientX, y: e.clientY },
        moved: true,
        startRects,
        rotateStart: { center, pointer: Math.atan2(board.y - center.y, board.x - center.x), angles, turns },
      })
    },
    [doc, selectedIds, panZoom, measured, setDrag],
  )

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!doc) return
      const board = panZoom.toBoard(e.clientX, e.clientY)

      // Idle hover: show what a click would take, so nested children stop being
      // a guessing game. Skipped while panning so the pan cursor stands.
      if (!drag) {
        // Editing points with Ctrl held: a dot rides the outline where a click
        // would add an anchor.
        if (editingVectorId) {
          const node = findNode(doc, editingVectorId)
          const box = boardRectOf(doc, editingVectorId, measured)
          if ((e.ctrlKey || e.metaKey) && node && isVectorNode(node) && box) {
            const seg = nearestSegment(node, board.x - box.x, board.y - box.y)
            const onLine = seg && seg.dist * panZoom.getCamera().k <= OUTLINE_TOLERANCE_PX * 2 ? pointOnSegment(node, seg.index, seg.t) : null
            insertPreview.set(onLine ? { x: box.x + onLine.x, y: box.y + onLine.y } : null)
          } else insertPreview.set(null)
        }
        // The pen's rubber band: the segment the next click would add.
        if (tool === 'pen') {
          const prev = penRef.current?.points[penRef.current.points.length - 1]
          if (prev) penCursor.set(e.shiftKey ? snap45(prev, board) : board)
          return
        }
        if (tool !== 'select' || panZoom.isPanning()) {
          setHoverId((prev) => (prev === null ? prev : null))
          return
        }
        const over = pickAt(board.x, board.y, e.ctrlKey || e.metaKey)
        setHoverId((prev) => (prev === (over?.id ?? null) ? prev : (over?.id ?? null)))
        return
      }

      // Below the threshold this is still a click, not a drag — nothing moves.
      const moved =
        drag.moved ||
        Math.hypot(e.clientX - drag.originClient.x, e.clientY - drag.originClient.y) > CLICK_DRAG_THRESHOLD
      setDrag({ ...drag, currentBoard: board, moved, shift: e.shiftKey, alt: e.altKey })
      if (!moved) return

      if (drag.kind === 'point-marquee') return

      // An anchor or handle of the path being edited. The rect refits to the
      // curve every frame, so the selection box follows the shape live; one
      // gesture is one undo step (the first frame commits, the rest fold in).
      if (drag.kind === 'point' && drag.point && editingVectorId) {
        const node = findNode(doc, editingVectorId)
        const box = boardRectOf(doc, editingVectorId, measured)
        if (!node || !isVectorNode(node) || !box) return
        if (drag.point.part === 'anchor' && drag.pointStart) {
          // Every selected anchor, by the pointer's offset since the press —
          // Shift locks it to whichever axis moved further.
          let dx = board.x - drag.originBoard.x
          let dy = board.y - drag.originBoard.y
          if (e.shiftKey) {
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0
            else dx = 0
          }
          // The box has refitted since the press; re-base the start points onto it.
          const rebase = { x: drag.pointStart.box.x - box.x, y: drag.pointStart.box.y - box.y }
          const moved = moveAnchors(node, drag.pointStart.indices, drag.pointStart.points, dx + rebase.x, dy + rebase.y)
          applyDragFrame(replaceNodeById(doc, node.id, refit(moved)))
          return
        }
        const local = { x: board.x - box.x, y: board.y - box.y }
        const anchor = node.points?.[drag.point.index]
        const target = e.shiftKey && anchor ? snap45(anchor, local) : local
        applyDragFrame(replaceNodeById(doc, node.id, refit(movePoint(node, drag.point.index, drag.point.part, target, e.altKey))))
        return
      }

      // Dragging off a fresh pen anchor pulls out its handles: the outgoing one
      // follows the cursor, the incoming one mirrors it, so the curve passes
      // smoothly through the anchor.
      if (drag.kind === 'pen') {
        setPen((draft) => {
          if (!draft || draft.points.length === 0) return draft
          const points = [...draft.points]
          const anchor = points[points.length - 1]
          const handle = e.shiftKey ? snap45(anchor, board) : board
          // Alt freezes the incoming handle where it is, so only the outgoing
          // one follows — a cusp instead of a smooth anchor.
          const incoming = e.altKey ? anchor.in : { x: 2 * anchor.x - handle.x, y: 2 * anchor.y - handle.y }
          points[points.length - 1] = {
            x: anchor.x,
            y: anchor.y,
            out: { x: handle.x, y: handle.y },
            ...(incoming ? { in: incoming } : {}),
          }
          penCursor.set(handle)
          return { points }
        })
        return
      }

      if (drag.kind === 'draw') {
        // The parent a release right now would nest into — the same resolution
        // pointerUp commits, so the highlight can never promise the wrong frame.
        const rect = drawRect(drag.originBoard, board, e.shiftKey, e.altKey)
        const target = dropTargetAt(doc, rect.x + 1, rect.y + 1, new Set(), measured)
        setDropIntent(target ? { targetId: target.id, reorder: false } : null)
        return
      }

      if (drag.kind === 'move') {
        const movingIds = new Set(drag.startRects.keys())
        const currentParentId = findParent(doc, [...movingIds][0])?.id ?? null

        // ── Pieces on an along-path frame move along its curve ──
        //
        // Their position belongs to the path, so a free move would only snap
        // back. Dragging ONE piece reorders it: it takes the slot nearest the
        // pointer's projection onto the guide. Dragging several slides the
        // whole run, as the start marker does (document/pathFlow.ts).
        const pathParent = currentParentId ? findNode(doc, currentParentId) : null
        if (isPathFlow(pathParent) && [...movingIds].every((id) => { const n = findNode(doc, id); return !!n && isOnPath(pathParent, n) })) {
          const frameM = boardMatrixOf(doc, pathParent.id, measured)
          if (frameM && movingIds.size === 1) {
            const reordered = moveToPathSlot(pathParent, [...movingIds][0], applyMat(invert(frameM), board))
            setGuides([])
            setDropIntent(null)
            if (reordered !== pathParent) applyDragFrame(replaceNodeById(doc, pathParent.id, reordered))
            return
          }
          if (frameM) {
            if (pathSlideStart.current?.gesture !== drag.originClient) {
              pathSlideStart.current = { gesture: drag.originClient, offset: pathParent.style.alongPath?.offset ?? 0 }
            }
            const toFrame = invert(frameM)
            const offset = slideOffset(
              pathParent,
              pathSlideStart.current.offset,
              applyMat(toFrame, drag.originBoard),
              applyMat(toFrame, board),
            )
            setGuides([])
            setDropIntent(null)
            const next = setStyle(doc, pathParent.id, { alongPath: { ...pathParent.style.alongPath, offset: offset || undefined } })
            if (next !== doc) applyDragFrame(next)
            return
          }
        }

        // The frame this would drop into, resolved from the pointer rather than
        // the selection box so the target follows the cursor. Empty board means
        // the root — an explicit target, not "nothing", which is what makes
        // dragging a child back OUT of its parent possible at all.
        //
        // resolveDropTarget then applies the three-zone rule near a sibling, so
        // dragging up a stack reorders instead of diving into the first
        // neighbour it crosses.
        const target = resolveDropTarget(
          doc,
          dropTargetAt(doc, board.x, board.y, movingIds, measured),
          board.x,
          board.y,
          (id) => boardRectOf(doc, id, measured),
          movingIds,
        )

        // ── Dropping into a frame that lays its children out ──
        //
        // Position under a flow belongs to the layout, so there is nothing to
        // translate: Figma REORDERS instead, and so do we. Nothing is written to
        // the doc during the gesture — the commit is an index change on release.
        // This is the path that was missing entirely, and the reason a child of a
        // vertical or horizontal frame could not be moved at all.
        if (target && isAutoLayout(target)) {
          const parentRect = boardRectOf(doc, target.id, measured)
          if (parentRect) {
            const insertion = insertionAt(
              target,
              parentRect,
              board.x,
              board.y,
              (id) => boardRectOf(doc, id, measured),
              movingIds,
            )
            setGuides([])
            setDropIntent({
              targetId: target.id,
              index: insertion.index,
              indicator: insertion.indicator,
              reorder: target.id === currentParentId,
            })
            return
          }
        }

        // ── Freeform target (or the board root): a real translation ──
        let dx = board.x - drag.originBoard.x
        let dy = board.y - drag.originBoard.y
        // Shift locks the move to whichever axis it has gone further along.
        const lock = e.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null
        if (lock === 'x') dy = 0
        if (lock === 'y') dx = 0

        // Nodes their parent's layout positions are excluded from the translate:
        // writing x/y they can never render would dirty the doc and burn an undo
        // step for a move nothing shows. They still reparent on release.
        const translatable = [...drag.startRects].filter(([id]) => !isLayoutPositioned(doc, id))

        // Snap the moving box against its siblings and parent. Threshold is
        // divided by zoom so the pull feels the same on screen at any
        // magnification.
        const box = boundingBoxOf(doc, translatable.map(([id]) => id), measured)
        let nextGuides: Guide[] = []
        if (box && !snapDisabled.current) {
          const movedBox: CanvasRect = { ...box, x: box.x + dx, y: box.y + dy }
          const snap = snapRect(movedBox, snapCandidates(movingIds), SNAP_THRESHOLD / panZoom.getCamera().k)
          // A locked axis stays put, snapping or not.
          if (lock !== 'y') dx += snap.dx
          if (lock !== 'x') dy += snap.dy
          nextGuides = snap.guides
        }
        setGuides(nextGuides)

        const targetId = target?.id ?? ROOT_DROP_TARGET
        setDropIntent(
          targetId === (currentParentId ?? ROOT_DROP_TARGET)
            ? null
            : { targetId, reorder: false },
        )

        // Alt-drag duplicates (Figma's): the first frame leaves a copy of the
        // selection where it was, and the originals carry on moving. The copy
        // and the move are one undo step.
        let next = doc
        if (e.altKey && !drag.duplicated) {
          next = duplicateInPlace(doc, [...drag.startRects.keys()])
          setDrag({ ...drag, currentBoard: board, moved, shift: e.shiftKey, alt: e.altKey, duplicated: true })
        }
        for (const [id, start] of translatable) {
          next = setRect(next, id, { x: start.x + dx, y: start.y + dy })
        }
        // One undo step for the whole drag, not one per frame.
        if (next !== doc) applyDragFrame(next)
        return
      }

      if (drag.kind === 'path-slide' && drag.pathFrameId) {
        const frame = findNode(doc, drag.pathFrameId)
        const frameM = isPathFlow(frame) ? boardMatrixOf(doc, frame.id, measured) : null
        if (!isPathFlow(frame) || !frameM || !pathSlideStart.current) return
        const toFrame = invert(frameM)
        const offset = slideOffset(frame, pathSlideStart.current.offset, applyMat(toFrame, drag.originBoard), applyMat(toFrame, board))
        const next = setStyle(doc, frame.id, { alongPath: { ...frame.style.alongPath, offset: offset || undefined } })
        if (next !== doc) applyDragFrame(next)
        return
      }

      if (drag.kind === 'rotate' && drag.rotateStart) {
        const { center, pointer, angles, turns } = drag.rotateStart
        let delta = ((Math.atan2(board.y - center.y, board.x - center.x) - pointer) * 180) / Math.PI
        let next = doc
        const several = angles.size > 1
        for (const [id, startAngle] of angles) {
          // Shift snaps the result to 15° steps — on the node's own angle, so a
          // snapped node reads a round number in the inspector.
          let angle = startAngle + delta
          if (e.shiftKey) {
            angle = snapAngle(angle)
            if (!several) delta = angle - startAngle
          }
          // A piece on a path keeps its place on it: the turn is its own
          // pathTurn, added to whatever heading the path gives it.
          const startTurn = turns.get(id)
          if (startTurn !== undefined) {
            const turn = normalizeDegrees(Math.round((startTurn + angle - startAngle) * 10) / 10)
            next = updateNode(next, id, { pathTurn: turn || undefined })
            continue
          }
          next = setStyle(next, id, { rotate: normalizeDegrees(Math.round(angle * 10) / 10) || undefined })
          // A group turns about its shared center, so each member's center
          // orbits it too (Shift snaps the group by the same step).
          if (several) {
            const start = drag.startRects.get(id)!
            const parent = findParent(doc, id)
            const parentM = parent ? boardMatrixOf(doc, parent.id, measured) : null
            const toParent = parentM ? invert(parentM) : null
            const startM = boardMatrixOf(doc, id, measured)
            if (!startM) continue
            const c = applyMat(startM, { x: start.w / 2, y: start.h / 2 })
            const moved = rotateAbout(c, center, e.shiftKey ? snapAngle(delta) : delta)
            const local = toParent ? applyMat(toParent, moved) : moved
            const localOld = toParent ? applyMat(toParent, c) : c
            next = setRect(next, id, { x: start.x + local.x - localOld.x, y: start.y + local.y - localOld.y })
          }
        }
        if (next !== doc) applyDragFrame(next)
        return
      }

      if (drag.kind === 'resize' && drag.handle) {
        const dx = board.x - drag.originBoard.x
        const dy = board.y - drag.originBoard.y
        let next = doc
        for (const [id, start] of drag.startRects) {
          // A north/west handle resizes by moving the origin, and a laid-out
          // node's origin belongs to its parent's flow — so those components are
          // dropped rather than applied to a coordinate nothing will render.
          // The handle is normally already restricted to e/se/s; this also
          // covers a mixed multi-selection.
          const handle = isLayoutPositioned(doc, id)
            ? (drag.handle.replace(/[nw]/g, '') as ResizeHandle | '')
            : drag.handle
          if (!handle) continue
          // Shift keeps proportions; Alt resizes about the center — except for
          // a laid-out node, whose position its parent's flow owns.
          // An image keeps its proportions unless Shift frees it; everything
          // else is the other way round (document/imageSizing.ts).
          const opts = { proportional: keepsProportions(findNode(doc, id), e.shiftKey), fromCenter: e.altKey && !isLayoutPositioned(doc, id) }
          const own = findNode(doc, id)?.style.rotate ?? 0
          const space = drag.startSpaces?.get(id)
          if (space) {
            // On a plane placed in 3D the resize happens in that plane, and its
            // origin moves in space with the box (document/frontView.ts).
            const placed = resizeOnPlane(space, start, { x: dx, y: dy }, (box, local) =>
              own ? resizeRotatedRect(box, handle, local.x, local.y, own, own, opts) : resizeRect(box, handle, local.x, local.y, opts),
            )
            if (placed) next = updateNode(next, id, placed)
            continue
          }
          const total = boardAngleOf(doc, id, measured)
          next = setRect(
            next,
            id,
            own || total ? resizeRotatedRect(start, handle, dx, dy, own, total, opts) : resizeRect(start, handle, dx, dy, opts),
          )
        }
        if (next !== doc) applyDragFrame(next)
      }
    },
    [doc, panZoom, drag, setDrag, editingVectorId, tool, pickAt, setHoverId, measured, insertPreview, penRef, penCursor, applyDragFrame, setPen, setDropIntent, snapDisabled, setGuides, pathSlideStart, snapCandidates],
  )

  const onBoardPointerUp = useCallback((e?: React.PointerEvent) => {
    setGuides([])
    setDropIntent(null)
    if (e) {
      try {
        ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
      } catch {
        // Capture already gone (pointercancel, or never taken).
      }
    }
    if (!drag || !doc) {
      setDrag(null)
      return
    }

    // The press grabbed the selected container, but the pointer never moved — so
    // this was a click, and a click reaches one level in. Figma's behavior, and
    // what keeps "drag a frame from anywhere inside it" from costing you the
    // ability to select what is inside it.
    if (drag.kind === 'move' && !drag.moved && drag.clickSelect) {
      setSelectedIds(new Set([drag.clickSelect]))
      setDrag(null)
      return
    }

    // Dropping a moved selection somewhere new reparents it, with the coordinate
    // conversion handled by reparentNode so nothing visually jumps. The root
    // sentinel un-nests: dropping a child on empty board takes it out of its
    // parent instead of leaving it a child stranded outside the parent's box.
    // With an index it is a flow reorder instead — the same call, because
    // "which parent" and "where among its children" are one operation.
    if (drag.kind === 'move' && drag.moved && dropIntent) {
      const parentId = dropIntent.targetId === ROOT_DROP_TARGET ? null : dropIntent.targetId
      const movingIds = [...drag.startRects.keys()]

      // A reorder that lands a node back at the index it already occupies is a
      // no-op the user did not ask to undo later, so it must not commit.
      if (dropIntent.reorder && !changesOrder(doc, movingIds, parentId, dropIntent.index)) {
        setDrag(null)
        return
      }

      let next = doc
      let index = dropIntent.index
      for (const id of movingIds) {
        next = reparentNode(next, id, parentId, index, measured)
        // Keep a multi-node drop in the order it was selected rather than
        // stacking every node onto the same slot.
        if (index !== undefined) index += 1
      }
      apply(next)
      setDrag(null)
      return
    }

    // A pen anchor (and any handles) is placed; the path stays open for more.
    if (drag.kind === 'pen') {
      setDrag(null)
      return
    }

    if (drag.kind === 'point') {
      setDrag(null)
      return
    }

    if (drag.kind === 'point-marquee' && editingNode) {
      const box = boardRectOf(doc, editingNode.id, measured)
      if (drag.moved && box) {
        // Anchors inside the box join the selection (Shift adds to it).
        const rect = normalizeRect(drag.originBoard, drag.currentBoard)
        const inside = (editingNode.points ?? []).flatMap((p, i) => {
          const x = box.x + p.x
          const y = box.y + p.y
          return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h ? [i] : []
        })
        setSelectedPoints(new Set([...(drag.shift ? selectedPoints : []), ...inside]))
      } else if (box) {
        // A click: inside the path clears the anchor selection; outside it, editing ends.
        const local = { x: drag.originBoard.x - box.x, y: drag.originBoard.y - box.y }
        const onPath =
          local.x >= 0 && local.y >= 0 && local.x <= box.w && local.y <= box.h &&
          vectorContains(editingNode, local.x, local.y, OUTLINE_TOLERANCE_PX / panZoom.getCamera().k)
        if (onPath) setSelectedPoints(new Set())
        else {
          exitVectorEdit()
          setSelectedIds(new Set())
        }
      }
      setDrag(null)
      return
    }

    if (drag.kind === 'draw') {
      const rect = drawRect(drag.originBoard, drag.currentBoard, !!drag.shift, !!drag.alt)
      const finalRect =
        rect.w < MIN_DRAW_SIZE || rect.h < MIN_DRAW_SIZE
          ? { x: drag.originBoard.x, y: drag.originBoard.y, ...(isShapeTool(tool) ? DEFAULT_SHAPE_SIZE : DEFAULT_FRAME_SIZE) }
          : rect

      // Drawing inside an existing frame nests into it, which is how you build
      // a hierarchy without a separate "add child" action. dropTargetAt (not
      // hitTest) walks OUT to the nearest frame, so drawing over a text label
      // still lands in the frame that holds it rather than at the root.
      const parentId = dropTargetAt(doc, finalRect.x + 1, finalRect.y + 1, new Set(), measured)?.id ?? null
      const parentBoard = parentId ? boardRectOf(doc, parentId, measured) : null
      const localRect: CanvasRect = {
        ...finalRect,
        x: finalRect.x - (parentBoard?.x ?? 0),
        y: finalRect.y - (parentBoard?.y ?? 0),
      }

      const node =
        tool === 'text'
          ? createTextNode(localRect)
          : isShapeTool(tool)
            ? createVectorNode(localRect, tool, tool === 'polygon' ? { sides: 3 } : {})
            : createFrameNode(localRect)
      apply(insertNode(doc, node, parentId))
      setSelectedIds(new Set([node.id]))
      // A new text layer is for typing into — start there, as Figma does.
      if (node.kind === 'text') setEditingTextId(node.id)
      setTool('select')
    }

    if (drag.kind === 'marquee') {
      const rect = normalizeRect(drag.originBoard, drag.currentBoard)
      if (rect.w >= MIN_DRAW_SIZE && rect.h >= MIN_DRAW_SIZE) {
        setSelectedIds(new Set(nodesInRect(doc, rect, measured).map((n) => n.id)))
      }
    }

    setDrag(null)
  }, [setGuides, setDropIntent, drag, doc, dropIntent, editingNode, setDrag, setSelectedIds, apply, measured, setSelectedPoints, selectedPoints, panZoom, exitVectorEdit, tool, setEditingTextId, setTool])

  /** Drops the hover ring when the cursor leaves the board entirely. */
  const onBoardPointerLeave = useCallback(() => {
    setHoverId((prev) => (prev === null ? prev : null))
  }, [setHoverId])
  return { onBoardPointerDown, startMoveDrag, onBoardDoubleClick, startResize, startPathSlide, startRotate, onBoardPointerMove, onBoardPointerUp, onBoardPointerLeave }
}
