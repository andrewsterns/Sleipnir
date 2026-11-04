// Drawing and editing vector paths on the board: the pen tool and point editing
// (anchors, handles, inserting on a segment). Split out of
// CanvasView.ViewModel.tsx; the view model passes in the board state it shares.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PanZoomHandle } from './usePanZoom'
import {
  boardRectOf,
  createVectorNode,
  replaceNodeById,
  dropTargetAt,
  findNode,
  insertNode,
} from '../../document/doc'
import { pointsBounds } from '../../document/vector'
import {
  deletePoints,
  moveAnchors,
  pointType,
  refit,
  removeHandle,
  setPointRadius,
  setPointType,
  toEditablePath,
  toggleSmooth,
  type PointPart,
  type PointType,
} from '../../document/vectorEdit'
import {
  isVectorNode,
  type CanvasDoc,
  type CanvasRect,
  type NodeId,
  type VectorPoint,
} from '../../document/types'
import { type CanvasTool, type PenDraft, createValueStore, type DragState } from '../boardEditing'

export interface PathEditingDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  doc: CanvasDoc | null
  drag: DragState | null
  measured: ReadonlyMap<string, CanvasRect>
  panZoom: PanZoomHandle
  selectedIds: Set<string>
  setDrag: React.Dispatch<React.SetStateAction<DragState | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setTool: React.Dispatch<React.SetStateAction<CanvasTool>>
  tool: CanvasTool
}

export function usePathEditing({ apply, doc, drag, measured, panZoom, selectedIds, setDrag, setSelectedIds, setTool, tool }: PathEditingDeps) {
  // ── Pen ──
  //
  // Figma's pen: click to place a sharp anchor, click and drag to pull out
  // symmetric bezier handles, click the first anchor to close the shape, and
  // Enter, Escape, a double-click or another tool to leave it open. The draft
  // lives in board space until it's finished, then becomes a path node sized
  // to its own bounds, so it nests and resizes like anything else.
  const [pen, setPen] = useState<PenDraft | null>(null)
  const penRef = useRef(pen)
  penRef.current = pen
  /** Where the next anchor would go — the rubber band's far end (see ValueStore). */
  const penCursor = useMemo(() => createValueStore<{ x: number; y: number } | null>(null), [])

  const finishPen = useCallback(
    (closed: boolean) => {
      const draft = penRef.current
      setPen(null)
      penCursor.set(null)
      if (!doc || !draft || draft.points.length < 2) return
      const bounds = pointsBounds(draft.points)
      const w = Math.max(bounds.w, 1)
      const h = Math.max(bounds.h, 1)
      const shift = (q: { x: number; y: number }) => ({ x: q.x - bounds.x, y: q.y - bounds.y })
      const points = draft.points.map((p) => ({
        ...shift(p),
        ...(p.in ? { in: shift(p.in) } : {}),
        ...(p.out ? { out: shift(p.out) } : {}),
      }))
      const first = draft.points[0]
      const parentId = dropTargetAt(doc, first.x, first.y, new Set(), measured)?.id ?? null
      const parentBoard = parentId ? boardRectOf(doc, parentId, measured) : null
      const rect: CanvasRect = { x: bounds.x - (parentBoard?.x ?? 0), y: bounds.y - (parentBoard?.y ?? 0), w, h }
      const node = createVectorNode(rect, 'path', { points, closed, viewBox: { w, h } })
      apply(insertNode(doc, node, parentId))
      setSelectedIds(new Set([node.id]))
      setTool('select')
    },
    [penCursor, doc, measured, apply, setSelectedIds, setTool],
  )

  // Leaving the pen for any other tool keeps what was drawn, as an open path.
  useEffect(() => {
    if (tool !== 'pen' && penRef.current) finishPen(false)
  }, [tool, finishPen])

  /**
   * Whether an inspector edit should fold into the previous undo step: the
   * same control (`gesture`), on the same selection, within a second. A color
   * picker reports every pixel of a drag and a number field every keystroke —
   * without this, one deliberate change cost dozens of Ctrl+Z.
   */
  const lastGesture = useRef<{ key: string; at: number } | null>(null)
  const coalesceGesture = useCallback(
    (gesture: string | undefined) => {
      if (!gesture) {
        lastGesture.current = null
        return false
      }
      const key = `${[...selectedIds].sort().join(',')}|${gesture}`
      const now = Date.now()
      const same = lastGesture.current?.key === key && now - lastGesture.current.at < 1000
      lastGesture.current = { key, at: now }
      return same
    },
    [selectedIds],
  )

  // ── Point editing ──
  //
  // Double-clicking a vector edits its points, as in Figma: drag an anchor (its
  // handles come with it) or a handle (its partner mirrors, Alt breaks the
  // pair), click a segment to add an anchor exactly on the curve, Delete to
  // remove the selected one, Enter or Escape to finish. A shape becomes a path
  // the moment it's edited — a triangle being bent is no longer a triangle.
  const [editingVectorId, setEditingVectorId] = useState<NodeId | null>(null)
  /** Selected anchors, by index. Shift-click and box-select add; Delete, arrows and drags act on all of them. */
  const [selectedPoints, setSelectedPoints] = useState<ReadonlySet<number>>(new Set())
  /** A handle clicked on its own — Delete removes it, making that side of its anchor sharp. */
  const [selectedHandle, setSelectedHandle] = useState<{ index: number; part: 'in' | 'out' } | null>(null)
  /**
   * Where Ctrl+click would add an anchor: the point on the outline nearest the
   * cursor, while Ctrl is held. A ValueStore, so the dot tracking the cursor
   * re-renders only itself (see the pen's rubber band).
   */
  const insertPreview = useMemo(() => createValueStore<{ x: number; y: number } | null>(null), [])
  const editingNode = useMemo(() => {
    if (!doc || !editingVectorId) return null
    const node = findNode(doc, editingVectorId)
    return node && isVectorNode(node) ? node : null
  }, [doc, editingVectorId])

  const editingVectorIdRef = useRef(editingVectorId)
  editingVectorIdRef.current = editingVectorId
  const selectedPointsRef = useRef(selectedPoints)
  selectedPointsRef.current = selectedPoints

  const exitVectorEdit = useCallback(() => {
    setEditingVectorId(null)
    setSelectedPoints(new Set())
    setSelectedHandle(null)
    insertPreview.set(null)
  }, [insertPreview])

  // Selecting something else, deleting the path, or undoing it away all end editing.
  useEffect(() => {
    if (editingVectorId && (!editingNode || !selectedIds.has(editingVectorId))) exitVectorEdit()
  }, [editingVectorId, editingNode, selectedIds, exitVectorEdit])

  const enterVectorEdit = useCallback(
    (id: NodeId) => {
      if (!doc) return
      const node = findNode(doc, id)
      if (!node || !isVectorNode(node)) return
      const editable = toEditablePath(node)
      // A path already in its own pixel space needs no change, so entering
      // edit mode on it costs no undo step.
      const unchanged =
        node.shape === 'path' && node.viewBox?.w === node.rect.w && node.viewBox?.h === node.rect.h
      if (!unchanged) apply(replaceNodeById(doc, id, editable))
      setSelectedIds(new Set([id]))
      setTool('select')
      setEditingVectorId(id)
      setSelectedPoints(new Set())
    },
    [doc, apply, setSelectedIds, setTool],
  )

  /**
   * The overlay's press on an anchor or handle.
   *
   * Shift-click adds or removes an anchor from the selection; Ctrl/Cmd-click
   * flips it between sharp and smooth (Figma's bend tool). A plain press on an
   * unselected anchor selects just it; on a selected one it keeps the
   * selection, so the drag carries every selected anchor along.
   */
  const startPointDrag = useCallback(
    (index: number, part: PointPart, e: React.PointerEvent) => {
      if (e.button !== 0 || !doc || !editingNode) return
      e.stopPropagation()
      if (part === 'anchor' && (e.ctrlKey || e.metaKey)) {
        apply(replaceNodeById(doc, editingNode.id, refit(toggleSmooth(editingNode, index))))
        setSelectedPoints(new Set([index]))
        return
      }
      // A handle press selects that handle (Delete then removes it); an anchor
      // press lets go of any selected handle.
      setSelectedHandle(part === 'anchor' ? null : { index, part })
      let selection = selectedPoints
      if (part === 'anchor') {
        if (e.shiftKey) {
          const next = new Set(selectedPoints)
          if (next.has(index)) next.delete(index)
          else next.add(index)
          selection = next
        } else if (!selectedPoints.has(index)) {
          selection = new Set([index])
        }
        setSelectedPoints(selection)
        // Shift-click toggling an anchor OFF has nothing left to drag.
        if (!selection.has(index)) return
      }
      try {
        panZoom.containerRef.current?.setPointerCapture(e.pointerId)
      } catch {
        // Synthetic or already-captured pointer; the drag still works.
      }
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const box = boardRectOf(doc, editingNode.id, measured)
      setDrag({
        kind: 'point',
        originBoard: board,
        currentBoard: board,
        originClient: { x: e.clientX, y: e.clientY },
        moved: false,
        startRects: new Map(),
        point: { index, part },
        ...(part === 'anchor' && box
          ? { pointStart: { indices: [...selection], points: editingNode.points ?? [], box } }
          : {}),
      })
    },
    [doc, editingNode, selectedPoints, panZoom, measured, setDrag, apply],
  )

  /** The edited path in board space, for the overlay to draw its anchors and handles. */
  const vectorEdit = useMemo(() => {
    if (!doc || !editingNode) return null
    const box = boardRectOf(doc, editingNode.id, measured)
    if (!box) return null
    const at = (q: { x: number; y: number }) => ({ x: box.x + q.x, y: box.y + q.y })
    return {
      points: (editingNode.points ?? []).map((p) => ({ ...at(p), ...(p.in ? { in: at(p.in) } : {}), ...(p.out ? { out: at(p.out) } : {}) })),
      closed: !!editingNode.closed,
      selectedPoints: [...selectedPoints],
      selectedHandle,
    }
  }, [doc, editingNode, measured, selectedPoints, selectedHandle])

  const deleteSelectedPoints = useCallback(() => {
    if (!doc || !editingNode || selectedPoints.size === 0) return false
    const next = deletePoints(editingNode, selectedPoints)
    if (next === editingNode) return false
    apply(replaceNodeById(doc, editingNode.id, refit(next)))
    setSelectedPoints(new Set())
    return true
  }, [doc, editingNode, selectedPoints, apply])

  const deleteSelectedHandle = useCallback(() => {
    if (!doc || !editingNode || !selectedHandle) return false
    const next = removeHandle(editingNode, selectedHandle.index, selectedHandle.part)
    setSelectedHandle(null)
    if (next === editingNode) return false
    apply(replaceNodeById(doc, editingNode.id, refit(next)))
    return true
  }, [doc, editingNode, selectedHandle, apply])

  /**
   * The selected anchors as the inspector's Point section shows them: how many,
   * whether they're sharp, smooth or a mix, and their corner radius (null when
   * they differ).
   */
  const pointSelection = useMemo(() => {
    if (!editingNode || selectedPoints.size === 0) return null
    const points = [...selectedPoints].map((i) => editingNode.points?.[i]).filter((pt): pt is VectorPoint => !!pt)
    if (points.length === 0) return null
    const types = new Set(points.map(pointType))
    const radii = new Set(points.map((pt) => pt.radius ?? 0))
    return {
      count: points.length,
      type: (types.size === 1 ? [...types][0] : 'mixed') as PointType | 'mixed',
      radius: radii.size === 1 ? [...radii][0] : null,
    }
  }, [editingNode, selectedPoints])

  const setSelectedPointType = useCallback(
    (type: PointType) => {
      if (!doc || !editingNode || selectedPoints.size === 0) return
      apply(replaceNodeById(doc, editingNode.id, refit(setPointType(editingNode, selectedPoints, type))))
    },
    [doc, editingNode, selectedPoints, apply],
  )

  const setSelectedPointRadius = useCallback(
    (radius: number, gesture?: string) => {
      if (!doc || !editingNode || selectedPoints.size === 0) return
      apply(
        replaceNodeById(doc, editingNode.id, setPointRadius(editingNode, selectedPoints, radius)),
        coalesceGesture(gesture && `points:${editingNode.id}:${gesture}`),
      )
    },
    [doc, editingNode, selectedPoints, apply, coalesceGesture],
  )

  /** Arrow keys while editing: the selected anchors, by a pixel (Shift: ten). */
  const nudgeSelectedPoints = useCallback(
    (dx: number, dy: number) => {
      if (!doc || !editingNode || selectedPoints.size === 0) return
      const points = editingNode.points ?? []
      apply(replaceNodeById(doc, editingNode.id, refit(moveAnchors(editingNode, selectedPoints, points, dx, dy))))
    },
    [doc, editingNode, selectedPoints, apply],
  )

  const selectAllPoints = useCallback(() => {
    if (!editingNode) return
    setSelectedPoints(new Set((editingNode.points ?? []).map((_, i) => i)))
  }, [editingNode])

  /**
   * Whether the gesture in progress has committed its first undo step. A drag
   * commits once and folds every later frame into that step — folding the
   * FIRST frame too merged the drag into whatever was done before it, so
   * undoing a move also undid the edit that preceded it.
   */
  const dragCommitted = useRef(false)
  useEffect(() => {
    if (!drag) dragCommitted.current = false
  }, [drag])
  const applyDragFrame = useCallback(
    (next: CanvasDoc) => {
      apply(next, dragCommitted.current)
      dragCommitted.current = true
    },
    [apply],
  )
  return { pen, setPen, penRef, penCursor, finishPen, coalesceGesture, editingVectorId, selectedPoints, setSelectedPoints, setSelectedHandle, insertPreview, editingNode, editingVectorIdRef, selectedPointsRef, exitVectorEdit, enterVectorEdit, startPointDrag, vectorEdit, deleteSelectedPoints, deleteSelectedHandle, pointSelection, setSelectedPointType, setSelectedPointRadius, nudgeSelectedPoints, selectAllPoints, applyDragFrame }
}
