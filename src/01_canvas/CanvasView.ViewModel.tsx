// All Canvas state and interaction logic. Imports no view — tools/codemod-lint.mjs
// enforces that a ViewModel never imports its own View.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPlanningWatchAvailable } from '../00_planning/api/iPlanningWatch'
import { usePanZoom } from './hooks/usePanZoom'
import { useMeasuredRects } from './hooks/useMeasuredRects'
import { CLICK_DRAG_THRESHOLD, cameraToFit, type Camera } from './hooks/panZoomMath'
import {
  insertionAt,
  isAutoLayout,
  isLayoutPositioned,
  parentFlowOf,
  resolveDropTarget,
} from './model/layout'
import {
  boardRectOf,
  boundingBoxOf,
  createDoc,
  createFrameNode,
  createTextNode,
  deleteNode,
  dropTargetAt,
  findNode,
  findParent,
  groupNodes,
  hitPath,
  insertNode,
  moveNode,
  nodesInRect,
  pickForScope,
  reparentNode,
  setRect,
  setStyle,
  ungroupNode,
  updateNode,
} from './model/doc'
import {
  alignOffsets,
  distributeOffsets,
  snapRect,
  SNAP_THRESHOLD,
  type AlignMode,
  type DistributeMode,
  type Guide,
} from './model/align'
import {
  addVariant,
  createComponentFromFrame,
  deleteComponent,
  findComponent,
  flattenComponent,
  instancesOf,
  isLosslessDowngrade,
  removeVariant,
  renameVariant,
  resolveVariant,
  setVariantRoot,
  updateComponent,
} from './model/variants'
import { cloneTree } from './model/variants'
import { canRedo, canUndo, commit, initHistory, redo, reset, undo, type History } from './model/undo'
import { deleteDoc, findBoardForFilePath, hashContent, listDocs, loadDoc, saveDoc, serializeDoc } from './model/store'
import {
  createWorkspaceFile,
  deleteWorkspacePath,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../00_planning/api/sleipnirApi'
import { collectImports, emitComponentFile, emitPropsInterface, emitRegionBody, emitSignature } from './emit/react'
import { spliceDeclaration, spliceImports, spliceRegion } from './emit/region'
import { deconflictComponentPath, parentDir, relativeToRoot, resolveComponentPath } from './model/paths'
import { addComponentFolder, buildComponentTree, removeComponentFolder } from './model/componentTree'
import {
  isFrameNode,
  isInstanceNode,
  type CanvasDoc,
  type CanvasDocSummary,
  type CanvasComponent,
  type CanvasNode,
  type CanvasRect,
  type CanvasStyle,
  type CanvasTarget,
  type NodeId,
} from './model/types'

const AUTOSAVE_MS = 400
/** Board-space size of a frame created by a click rather than a drag. */
const DEFAULT_FRAME_SIZE = { w: 240, h: 160 }
const MIN_DRAW_SIZE = 4

export type CanvasTool = 'select' | 'frame' | 'text'

/**
 * Removes `folder` if taking a component's file out of it left it empty.
 *
 * Promotion gives every component its own folder, so without this each removed
 * or relocated component leaves a hollow directory behind — one per discarded
 * experiment, in a tier built for experiments. Checked rather than
 * force-removed: a folder someone put their own files in is theirs.
 *
 * Never throws. An empty folder is cosmetic, and is not worth failing the
 * removal or rename that the human actually asked for.
 */
async function pruneEmptyFolder(folder: string): Promise<void> {
  if (!folder) return
  try {
    const { tree } = await listWorkspaceDir(folder)
    if (tree.length === 0) await deleteWorkspacePath(folder)
  } catch {
    // Listing or removing failed — leave the folder; nothing depends on it.
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
  kind: 'move' | 'draw' | 'marquee' | 'resize'
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

export function useCanvasViewModel(
  activeProjectPath: string | null | undefined,
  opts?: { pendingFocus?: { filePath: string } | null; onFocusConsumed?: () => void },
) {
  const { pendingFocus, onFocusConsumed } = opts ?? {}
  const [docs, setDocs] = useState<CanvasDocSummary[]>([])
  const [history, setHistory] = useState<History | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<NodeId>>(new Set())
  const [tool, setTool] = useState<CanvasTool>('select')
  const [drag, setDrag] = useState<DragState | null>(null)
  /**
   * The camera, mirrored into state purely so the SCREEN-SPACE chrome
   * (selection ring, resize handles, guides, component labels) re-renders with
   * it. usePanZoom still owns the real camera in a ref and writes the transform
   * straight to the DOM; this only ever lags it by an animation frame, since
   * onCameraChange is already rAF-throttled. Before it existed only the zoom
   * level was mirrored, so PANNING left every handle painted at its old screen
   * position until some unrelated state change forced a repaint.
   */
  const [camera, setCameraState] = useState<Camera>({ x: 0, y: 0, k: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /**
   * The container the user has drilled into by double-clicking, for the cases
   * `drillScope` below cannot infer one from the selection.
   */
  const [scopeId, setScopeId] = useState<NodeId | null>(null)
  /** Alignment guides to draw for the current drag. */
  const [guides, setGuides] = useState<Guide[]>([])
  /**
   * What releasing the current drag (or draw) would commit — null when the
   * release would change nothing structural.
   */
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null)
  /** What a click right now would select — drawn as a hover ring. */
  const [hoverId, setHoverId] = useState<NodeId | null>(null)
  /** Held to suspend snapping, the way Figma uses Ctrl. */
  const snapDisabled = useRef(false)

  const doc = history?.present ?? null

  // Hash of the content we last wrote, so our own autosave echoing back through
  // the planning watcher doesn't reload the board out from under the user.
  const lastWrittenHash = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // ── Camera ──
  const panZoom = usePanZoom({
    wheelMode: 'pan-zoom',
    onCameraChange: (c) =>
      setCameraState((prev) => (prev.x === c.x && prev.y === c.y && prev.k === c.k ? prev : c)),
    isBusy: () => dragRef.current !== null,
  })
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  /**
   * Real board rects for the nodes an auto-layout ancestor positions.
   *
   * Empty — and free — on a board with no auto-layout, which is why the exact
   * model math still runs for the freeform case. See hooks/useMeasuredRects.ts
   * and model/layout.ts for why measuring is the only correct answer once a
   * frame lays its children out.
   */
  const measured = useMeasuredRects({
    doc,
    containerRef: panZoom.containerRef,
    getCamera: panZoom.getCamera,
  })

  /**
   * The one geometry accessor: a node's true board rect, measured where the
   * layout owns it and derived from the model everywhere else. Every ring,
   * handle, guide and hit test goes through this, so the outline and the pixels
   * cannot describe different boxes.
   */
  const rectOf = useCallback(
    (id: NodeId): CanvasRect | null => (doc ? boardRectOf(doc, id, measured) : null),
    [doc, measured],
  )

  // ── Board list ──
  const refreshDocs = useCallback(async () => {
    try {
      setDocs(await listDocs())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  /**
   * Flags components whose file vanished while the app wasn't looking.
   *
   * In-app moves relink themselves (see model/relink.ts), but a move or delete
   * done in Explorer, VS Code, or a `git checkout` bypasses all of that. The
   * board would keep pointing at a path that no longer exists and the next push
   * would fail with a bare read error. Marking it detached up front means the
   * inspector can say what happened instead.
   *
   * Read-only: this reports what it found, it does NOT save. A transient read
   * failure (a network drive blinking) must not permanently rewrite the board,
   * and the next real edit persists the state anyway.
   */
  const markVanishedComponents = useCallback(async (loaded: CanvasDoc): Promise<CanvasDoc> => {
    const linked = loaded.components.filter((c) => c.filePath)
    if (linked.length === 0) return loaded

    const missing = new Set<string>()
    await Promise.all(
      linked.map(async (component) => {
        try {
          await readWorkspaceFile(component.filePath!)
        } catch {
          missing.add(component.id)
        }
      }),
    )
    if (missing.size === 0) return loaded

    return {
      ...loaded,
      components: loaded.components.map((c) =>
        missing.has(c.id)
          ? {
              ...c,
              sync: 'detached' as const,
              ejectReason: `${c.filePath} is gone — it was moved or deleted outside Sleipnir.`,
            }
          : c,
      ),
    }
  }, [])

  const openDoc = useCallback(
    async (id: string) => {
      const raw = await loadDoc(id)
      if (!raw) {
        setError(`Could not read board ${id}`)
        return null
      }
      const loaded = await markVanishedComponents(raw)
      lastWrittenHash.current = hashContent(serializeDoc(loaded))
      setHistory(initHistory(loaded))
      setSelectedIds(new Set())
      if (loaded.camera) panZoom.setCamera(loaded.camera)
      return loaded
    },
    [panZoom, markVanishedComponents],
  )

  const createBoard = useCallback(
    async (name: string) => {
      const next = createDoc(name.trim() || 'Untitled')
      lastWrittenHash.current = await saveDoc(next)
      setHistory(initHistory(next))
      setSelectedIds(new Set())
      await refreshDocs()
      return next
    },
    [refreshDocs],
  )

  const removeBoard = useCallback(
    async (id: string) => {
      await deleteDoc(id)
      if (doc?.id === id) setHistory(null)
      await refreshDocs()
    },
    [doc?.id, refreshDocs],
  )

  const renameBoard = useCallback((name: string) => {
    setHistory((h) => (h ? commit(h, { ...h.present, name, updatedAt: Date.now() }) : h))
  }, [])

  // Initial load. Opens the most recently touched board so returning to the tab
  // resumes where you left off rather than showing an empty picker.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await listDocs()
        if (cancelled) return
        setDocs(list)
        if (list.length > 0) await openDoc(list[0].id)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // openDoc is stable enough here; re-running on it would refetch on every camera change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectPath])

  // ── Cross-section focus ("Show in Canvas" from Workspace/Planning) ──
  // pendingFocus names a filePath, not a board — resolved fresh via listDocs()
  // rather than trusting the `docs` state, since this can fire before the
  // initial-load effect above has populated it (both run on mount). Opens the
  // owning board only if it isn't already the current one, then selects and
  // centers the component's instance node. Silently gives up (just consumes
  // the request) if the file no longer backs any component — the menu item
  // that triggered this only appears when a match exists, so a miss here
  // means the board changed underneath the jump, not a bug to surface loudly.
  useEffect(() => {
    if (!pendingFocus) return
    let cancelled = false
    ;(async () => {
      const summaries = await listDocs()
      const targetId = findBoardForFilePath(summaries, pendingFocus.filePath)
      if (cancelled || !targetId) {
        onFocusConsumed?.()
        return
      }
      const targetDoc = doc?.id === targetId ? doc : await openDoc(targetId)
      if (cancelled || !targetDoc) {
        onFocusConsumed?.()
        return
      }
      const component = targetDoc.components.find((c) => c.filePath === pendingFocus.filePath)
      const instance = component ? instancesOf(targetDoc, component.id)[0] : undefined
      if (instance) {
        setSelectedIds(new Set([instance.id]))
        focusNode(instance.id, targetDoc)
      }
      onFocusConsumed?.()
    })()
    return () => {
      cancelled = true
    }
    // doc/openDoc/focusNode intentionally excluded — this should only re-run
    // when a NEW focus request arrives (a fresh object from jumpToCanvasComponent),
    // not on every doc/camera change in between.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus])

  // ── Autosave ──
  const apply = useCallback((next: CanvasDoc, coalesce = false) => {
    setHistory((h) => (h ? commit(h, next, coalesce) : h))
    dirty.current = true
  }, [])

  useEffect(() => {
    if (!doc || !dirty.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const withCamera: CanvasDoc = { ...doc, camera: panZoom.getCamera() }
        lastWrittenHash.current = await saveDoc(withCamera)
        dirty.current = false
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, AUTOSAVE_MS)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [doc, panZoom])

  // ── External change (git pull, hand edit, another window) ──
  useEffect(() => {
    if (!isPlanningWatchAvailable()) return
    return window.planningWatchAPI!.onChanged(async (payload) => {
      // Stage-tag batches never touch a board; ignoring them keeps a planning
      // stage toggle from reloading the canvas mid-edit.
      if (payload?.stagesOnly) return
      if (!doc) {
        await refreshDocs()
        return
      }
      const fresh = await loadDoc(doc.id)
      if (!fresh) return
      const freshHash = hashContent(serializeDoc({ ...fresh, camera: undefined }))
      const ourHash = hashContent(serializeDoc({ ...doc, camera: undefined }))
      // Our own autosave echoing back — nothing to do.
      if (freshHash === ourHash) return
      if (dirty.current) return // local edits in flight win; the next save reconciles
      setHistory(reset(fresh))
      await refreshDocs()
    })
  }, [doc, refreshDocs])

  // ── Selection ──
  const selectOnly = useCallback((id: NodeId | null) => {
    setSelectedIds(id ? new Set([id]) : new Set())
  }, [])

  const toggleSelect = useCallback((id: NodeId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedNodes = useMemo(() => {
    if (!doc) return []
    return [...selectedIds].map((id) => findNode(doc, id)).filter((n): n is CanvasNode => n !== null)
  }, [doc, selectedIds])

  /** The single selected node, or null when the selection is empty or multiple. */
  const singleSelected = selectedNodes.length === 1 ? selectedNodes[0] : null

  // ── Pointer interaction on the board ──

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

  /** What a press (or hover) at this board point resolves to. */
  const pickAt = useCallback(
    (x: number, y: number, deep: boolean): CanvasNode | null => {
      if (!doc) return null
      const path = hitPath(doc, x, y, { measured })
      // Ctrl/Cmd reaches straight through to the deepest node, skipping the
      // drill-down entirely — the standard escape hatch.
      return deep ? (path[path.length - 1] ?? null) : pickForScope(path, drillScope())
    },
    [doc, drillScope, measured],
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

      if (tool === 'frame' || tool === 'text') {
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
      const path = hitPath(doc, board.x, board.y, { measured })
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
    [doc, tool, selectedIds, panZoom, drillScope, measured],
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
    [doc, panZoom],
  )

  /** Double-click drills one level into whatever is under the cursor. */
  const onBoardDoubleClick = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      if (!doc) return
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const path = hitPath(doc, board.x, board.y, { measured })
      if (path.length === 0) return
      const current = pickForScope(path, drillScope())
      const index = path.findIndex((n) => n.id === current?.id)
      const child = path[index + 1]
      if (!child) return
      setScopeId(current!.id)
      setSelectedIds(new Set([child.id]))
    },
    [doc, panZoom, drillScope, measured],
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
      for (const sibling of siblings) {
        if (movingIds.has(sibling.id) || sibling.hidden) continue
        const rect = boardRectOf(doc, sibling.id, measured)
        if (rect) rects.push(rect)
      }
      if (parent) {
        const parentRect = boardRectOf(doc, parent.id, measured)
        if (parentRect) rects.push(parentRect)
      }
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
      for (const id of selectedIds) {
        const node = findNode(doc, id)
        if (node) startRects.set(id, { ...node.rect })
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
        handle,
      })
    },
    [doc, selectedIds, panZoom],
  )

  const onBoardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!doc) return
      const board = panZoom.toBoard(e.clientX, e.clientY)

      // Idle hover: show what a click would take, so nested children stop being
      // a guessing game. Skipped while panning so the pan cursor stands.
      if (!drag) {
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
      setDrag({ ...drag, currentBoard: board, moved })
      if (!moved) return

      if (drag.kind === 'draw') {
        // The parent a release right now would nest into — the same resolution
        // pointerUp commits, so the highlight can never promise the wrong frame.
        const rect = normalizeRect(drag.originBoard, board)
        const target = dropTargetAt(doc, rect.x + 1, rect.y + 1, new Set(), measured)
        setDropIntent(target ? { targetId: target.id, reorder: false } : null)
        return
      }

      if (drag.kind === 'move') {
        const movingIds = new Set(drag.startRects.keys())
        const currentParentId = findParent(doc, [...movingIds][0])?.id ?? null

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
          dx += snap.dx
          dy += snap.dy
          nextGuides = snap.guides
        }
        setGuides(nextGuides)

        const targetId = target?.id ?? ROOT_DROP_TARGET
        setDropIntent(
          targetId === (currentParentId ?? ROOT_DROP_TARGET)
            ? null
            : { targetId, reorder: false },
        )

        let next = doc
        for (const [id, start] of translatable) {
          next = setRect(next, id, { x: start.x + dx, y: start.y + dy })
        }
        // Coalesced so one drag is one undo step, not one per frame.
        if (next !== doc) apply(next, true)
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
          next = setRect(next, id, resizeRect(start, handle, dx, dy))
        }
        if (next !== doc) apply(next, true)
      }
    },
    [drag, doc, tool, panZoom, apply, snapCandidates, pickAt, measured],
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

    if (drag.kind === 'draw') {
      const rect = normalizeRect(drag.originBoard, drag.currentBoard)
      const finalRect =
        rect.w < MIN_DRAW_SIZE || rect.h < MIN_DRAW_SIZE
          ? { x: drag.originBoard.x, y: drag.originBoard.y, ...DEFAULT_FRAME_SIZE }
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

      const node = tool === 'text' ? createTextNode(localRect) : createFrameNode(localRect)
      apply(insertNode(doc, node, parentId))
      setSelectedIds(new Set([node.id]))
      setTool('select')
    }

    if (drag.kind === 'marquee') {
      const rect = normalizeRect(drag.originBoard, drag.currentBoard)
      if (rect.w >= MIN_DRAW_SIZE && rect.h >= MIN_DRAW_SIZE) {
        setSelectedIds(new Set(nodesInRect(doc, rect, measured).map((n) => n.id)))
      }
    }

    setDrag(null)
  }, [drag, doc, tool, apply, dropIntent, measured])

  /** Drops the hover ring when the cursor leaves the board entirely. */
  const onBoardPointerLeave = useCallback(() => {
    setHoverId((prev) => (prev === null ? prev : null))
  }, [])

  // ── Hierarchy & alignment ──

  const groupSelected = useCallback(() => {
    if (!doc || selectedIds.size < 1) return
    const result = groupNodes(doc, [...selectedIds], 'Group', measured)
    if (!result.groupId) return
    apply(result.doc)
    setSelectedIds(new Set([result.groupId]))
  }, [doc, selectedIds, apply, measured])

  const ungroupSelected = useCallback(() => {
    if (!doc || !singleSelected) return
    const result = ungroupNode(doc, singleSelected.id, measured)
    if (result.childIds.length === 0) return
    apply(result.doc)
    setSelectedIds(new Set(result.childIds))
  }, [doc, singleSelected, apply, measured])

  /**
   * Aligns the selection. Offsets are computed in board space then applied as
   * deltas to each node's own (parent-relative) rect, which keeps the operation
   * correct for a selection spread across different parents.
   */
  const alignSelected = useCallback(
    (mode: AlignMode) => {
      if (!doc || selectedIds.size < 2) return
      // Only nodes that can actually be repositioned: under an auto-layout
      // parent the flow decides alignment, so writing x/y here would move the
      // ring and nothing else.
      const ids = [...selectedIds].filter((id) => !isLayoutPositioned(doc, id))
      if (ids.length < 2) return
      const rects = ids.map((id) => boardRectOf(doc, id, measured)).filter((r): r is CanvasRect => r !== null)
      if (rects.length !== ids.length) return
      const offsets = alignOffsets(rects, mode)
      let next = doc
      ids.forEach((id, i) => {
        const node = findNode(next, id)
        if (!node) return
        next = setRect(next, id, { x: node.rect.x + offsets[i].dx, y: node.rect.y + offsets[i].dy })
      })
      apply(next)
    },
    [doc, selectedIds, apply, measured],
  )

  const distributeSelected = useCallback(
    (mode: DistributeMode) => {
      if (!doc || selectedIds.size < 3) return
      const ids = [...selectedIds].filter((id) => !isLayoutPositioned(doc, id))
      if (ids.length < 3) return
      const rects = ids.map((id) => boardRectOf(doc, id, measured)).filter((r): r is CanvasRect => r !== null)
      if (rects.length !== ids.length) return
      const offsets = distributeOffsets(rects, mode)
      let next = doc
      ids.forEach((id, i) => {
        const node = findNode(next, id)
        if (!node) return
        next = setRect(next, id, { x: node.rect.x + offsets[i].dx, y: node.rect.y + offsets[i].dy })
      })
      apply(next)
    },
    [doc, selectedIds, apply, measured],
  )

  /** Duplicates the selection, offset slightly so the copy is visible. */
  const duplicateSelected = useCallback(() => {
    if (!doc || selectedIds.size === 0) return
    let next = doc
    const created: NodeId[] = []
    for (const id of selectedIds) {
      const node = findNode(doc, id)
      if (!node) continue
      const parent = findParent(doc, id)
      const copy = cloneTree({ ...node, rect: { ...node.rect, x: node.rect.x + 16, y: node.rect.y + 16 } })
      next = insertNode(next, copy, parent?.id ?? null)
      created.push(copy.id)
    }
    if (created.length === 0) return
    apply(next)
    setSelectedIds(new Set(created))
  }, [doc, selectedIds, apply])

  /** Moves the selection up to its parent — Escape's "select less" behavior. */
  const selectParent = useCallback(() => {
    if (!doc || !singleSelected) return false
    const parent = findParent(doc, singleSelected.id)
    if (!parent) return false
    setSelectedIds(new Set([parent.id]))
    setScopeId(findParent(doc, parent.id)?.id ?? null)
    return true
  }, [doc, singleSelected])

  // ── Node operations ──
  const deleteSelected = useCallback(() => {
    if (!doc || selectedIds.size === 0) return
    let next = doc
    for (const id of selectedIds) next = deleteNode(next, id)
    apply(next)
    setSelectedIds(new Set())
  }, [doc, selectedIds, apply])

  /** Removes one node by id, regardless of the current selection — for the layers panel's own delete action, which targets whatever was right-clicked. */
  const removeNode = useCallback(
    (id: NodeId) => {
      if (!doc) return
      apply(deleteNode(doc, id))
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [doc, apply],
  )

  /** Removes a component and every instance of it — see model/variants.ts's deleteComponent. */
  const removeComponent = useCallback(
    (componentId: string) => {
      if (!doc) return
      apply(deleteComponent(doc, componentId))
    },
    [doc, apply],
  )

  /**
   * Deletes a component's file from the workspace, and un-promotes the
   * component when doing so costs nothing.
   *
   * Since promotion always writes a file, "a component with no file" is no
   * longer a state the ladder has a rung for — it is what a frame is. So when
   * the component is structurally a frame anyway (one variant, no props, one
   * instance) this dissolves it back into one, which is what deleting its only
   * reason to exist means.
   *
   * Anything richer is kept and marked detached instead. Variants, props and
   * the link between several instances are real work that a frame cannot hold,
   * and this runs behind a single click with no undo once the board autosaves —
   * so the expensive case waits for someone to ask for it explicitly (see
   * flattenComponent).
   *
   * Still deliberately separate from removeComponent: "stop shipping this as
   * code" and "delete this design" remain different intentions, and neither of
   * this function's two outcomes deletes the design.
   */
  const removeComponentFile = useCallback(
    async (componentId: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component?.filePath) return
      await deleteWorkspacePath(component.filePath)
      await pruneEmptyFolder(parentDir(component.filePath))

      if (isLosslessDowngrade(doc, componentId)) {
        apply(flattenComponent(doc, componentId))
        return
      }
      apply(
        updateComponent(doc, componentId, {
          filePath: undefined,
          lastWrittenHash: undefined,
          sync: 'detached',
          ejectReason: 'Its file was deleted. The design is still here — flatten it to a frame, or write it again.',
        }),
      )
    },
    [doc, apply],
  )

  /**
   * Dissolves a component back into a plain frame on request.
   *
   * The explicit half of the rule above: what removeComponentFile does on its
   * own only when nothing would be lost, offered as a decision when something
   * would. Refuses when there isn't exactly one instance, since there would be
   * no single place to dissolve into.
   */
  const flattenComponentToFrame = useCallback(
    (componentId: string) => {
      if (!doc) return
      apply(flattenComponent(doc, componentId))
    },
    [doc, apply],
  )

  /**
   * Retargets where a component's file lives.
   *
   * With no file yet this only records the intent. With a file on disk it is a
   * real move: the content is copied to the new path and the old file deleted,
   * so the region (and any human code around it) travels intact. Always
   * re-contained, so a hand-typed path can never place a file outside the
   * component root.
   */
  const setComponentPath = useCallback(
    async (componentId: string, nextPath: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component) return
      const safePath = resolveComponentPath(component.componentRoot, nextPath)
      if (safePath === component.filePath) return

      if (component.filePath) {
        const { content } = await readWorkspaceFile(component.filePath)
        await createWorkspaceFile(safePath, content)
        await deleteWorkspacePath(component.filePath)
      }
      apply(updateComponent(doc, componentId, { filePath: component.filePath ? safePath : undefined }))
      // A component with no file yet has nowhere to record a path, so the
      // pending target rides on the folder list instead and is picked up by the
      // Create Component modal's default.
      if (!component.filePath) {
        const folder = safePath.split('/').slice(0, -1).join('/')
        const relative = relativeToRoot(component.componentRoot, folder)
        if (relative) apply({ ...doc, componentFolders: addComponentFolder(doc, relative), updatedAt: Date.now() })
      }
    },
    [doc, apply],
  )

  // ── Components directory ──

  const addFolder = useCallback(
    (path: string) => {
      if (!doc) return
      apply({ ...doc, componentFolders: addComponentFolder(doc, path), updatedAt: Date.now() })
    },
    [doc, apply],
  )

  const removeFolder = useCallback(
    (path: string) => {
      if (!doc) return
      apply({ ...doc, componentFolders: removeComponentFolder(doc, path), updatedAt: Date.now() })
    },
    [doc, apply],
  )

  const componentTree = useMemo(
    () => (doc ? buildComponentTree(doc) : { root: { kind: 'folder' as const, path: '', name: '', children: [] }, unplaced: [] }),
    [doc],
  )

  /**
   * What deleting a layer actually means, for the layers panel's context menu:
   * a plain node removal, or — when the node is the LAST instance of a
   * component that has been written to a file — a cascade that should also
   * offer to remove the file (and any plan node scaffolded from it). Other
   * instances of the same component elsewhere on the board mean the file is
   * still in use, so that case is just a node removal too.
   */
  const describeLayerDelete = useCallback(
    (nodeId: NodeId): { kind: 'node' } | { kind: 'component'; componentId: string; filePath?: string } | null => {
      if (!doc) return null
      const node = findNode(doc, nodeId)
      if (!node) return null
      if (isInstanceNode(node) && instancesOf(doc, node.componentId).length <= 1) {
        const component = findComponent(doc, node.componentId)
        return { kind: 'component', componentId: node.componentId, filePath: component?.filePath }
      }
      return { kind: 'node' }
    },
    [doc],
  )

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!doc || selectedIds.size === 0) return
      let next = doc
      // Arrow keys can't nudge a node its parent's flow positions — the write
      // would never reach the screen, so it must not reach the undo stack either.
      for (const id of selectedIds) {
        if (isLayoutPositioned(doc, id)) continue
        next = moveNode(next, id, dx, dy)
      }
      if (next !== doc) apply(next)
    },
    [doc, selectedIds, apply],
  )

  const updateSelectedStyle = useCallback(
    (patch: Partial<CanvasStyle>) => {
      if (!doc) return
      let next = doc
      for (const id of selectedIds) next = setStyle(next, id, patch)
      apply(next)
    },
    [doc, selectedIds, apply],
  )

  const updateSelectedRect = useCallback(
    (patch: Partial<CanvasRect>) => {
      if (!doc) return
      let next = doc
      for (const id of selectedIds) next = setRect(next, id, patch)
      apply(next)
    },
    [doc, selectedIds, apply],
  )

  const updateNodeFields = useCallback(
    (id: NodeId, patch: Partial<CanvasNode>) => {
      if (!doc) return
      apply(updateNode(doc, id, patch))
    },
    [doc, apply],
  )

  const reparent = useCallback(
    (id: NodeId, parentId: NodeId | null, index?: number) => {
      if (!doc) return
      apply(reparentNode(doc, id, parentId, index, measured))
    },
    [doc, apply, measured],
  )

  // ── Components & variants ──

  /**
   * Promotes the selected frame into a main component, replacing it in place
   * with an instance — Figma's "Create component" — AND writes its file.
   *
   * Writing is not a separate approval step. A component's file lands in
   * `.canvas` (see model/paths.ts's DEFAULT_COMPONENT_ROOT), which is a staging
   * tier rather than build input, so there is nothing to protect the project
   * from and nothing to ask about. It becomes real code by being MOVED out of
   * `.canvas` in the Workspace tree, which is where the deliberate decision
   * actually lives now.
   *
   * The path is derived, never asked for, and de-conflicted against the board:
   * promoting two frames both left as "Frame" is routine and must not fail.
   *
   * Same commit-after-write atomicity the old approve flow had: the board is
   * only mutated once the file lands, so a failed write leaves the frame a
   * frame with nothing to undo.
   */
  const promoteSelectedToComponent = useCallback(
    async (options?: { name?: string; target?: CanvasTarget }) => {
      if (!doc || !singleSelected || !isFrameNode(singleSelected)) return null
      const promoted = createComponentFromFrame(doc, singleSelected, options)
      const componentId = promoted.component.id
      const taken = promoted.doc.components.flatMap((c) => (c.filePath ? [c.filePath] : []))

      // Two rounds of de-confliction, because they cover different things. The
      // board knows the paths it owns; the retry covers a file on disk that no
      // board claims (a leftover from a deleted board, or one made by hand).
      // Every rejected path accumulates, or the next derivation would hand back
      // one already refused. Bounded so a pathological directory can't spin.
      const rejected: string[] = []
      let safePath = deconflictComponentPath(promoted.component.componentRoot, promoted.component.name, taken)
      let hash = ''
      for (let attempt = 0; ; attempt += 1) {
        const ctx = {
          filePath: safePath,
          components: promoted.doc.components,
          filePathFor: (id: string) => findComponent(promoted.doc, id)?.filePath,
        }
        const regionBody = emitRegionBody(promoted.component, ctx)
        hash = hashContent(regionBody)
        const file = emitComponentFile(promoted.component, ctx, hash)
        try {
          await createWorkspaceFile(safePath, file.content)
          break
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          if (attempt >= 20 || !/already exists/i.test(message)) throw e
          rejected.push(safePath)
          safePath = deconflictComponentPath(promoted.component.componentRoot, promoted.component.name, [
            ...taken,
            ...rejected,
          ])
        }
      }

      apply(
        updateComponent(promoted.doc, componentId, {
          filePath: safePath,
          sync: 'live',
          lastWrittenHash: hash,
          ejectReason: undefined,
        }),
      )
      setSelectedIds(new Set([promoted.instanceId]))
      return componentId
    },
    [doc, singleSelected, apply],
  )

  /**
   * Promotes `frameId` AND writes its file, as one operation.
   *
   * The promotion is built in memory and only committed once the write lands,
   * so a rejected path (or an existing file) leaves the frame a frame with
   * nothing on the board to undo — the caller shows the reason and stays open.
   * That atomicity is the whole point: "Create component" opens a modal, and
   * until it is approved nothing has happened.
   */
  const promoteAndApproveComponent = useCallback(
    async (frameId: NodeId, input: { name: string; target: CanvasTarget; filePath: string }) => {
      if (!doc) return
      const frame = findNode(doc, frameId)
      if (!frame || !isFrameNode(frame)) return

      const promoted = createComponentFromFrame(doc, frame, { name: input.name, target: input.target })
      const componentId = promoted.component.id
      const safePath = resolveComponentPath(promoted.component.componentRoot, input.filePath)
      const ctx = {
        filePath: safePath,
        components: promoted.doc.components,
        filePathFor: (id: string) => findComponent(promoted.doc, id)?.filePath,
      }

      const regionBody = emitRegionBody(promoted.component, ctx)
      const hash = hashContent(regionBody)
      const file = emitComponentFile(promoted.component, ctx, hash)

      await createWorkspaceFile(safePath, file.content)

      apply(
        updateComponent(promoted.doc, componentId, {
          filePath: safePath,
          sync: 'live',
          lastWrittenHash: hash,
          ejectReason: undefined,
        }),
      )
      setSelectedIds(new Set([promoted.instanceId]))
    },
    [doc, apply],
  )

  const setInstanceVariant = useCallback(
    (instanceId: NodeId, variantId: string) => {
      if (!doc) return
      const instance = findNode(doc, instanceId)
      if (!instance || !isInstanceNode(instance)) return
      const component = findComponent(doc, instance.componentId)
      if (!component) return
      const variant = component.variants.find((v) => v.id === variantId)
      if (!variant) return
      apply(updateNode(doc, instanceId, { variantValues: { ...variant.values } }))
    },
    [doc, apply],
  )

  /** Steps to the next variant — the label's quick preview trigger. */
  const triggerNextVariant = useCallback(
    (instanceId: NodeId) => {
      if (!doc) return
      const instance = findNode(doc, instanceId)
      if (!instance || !isInstanceNode(instance)) return
      const component = findComponent(doc, instance.componentId)
      if (!component || component.variants.length < 2) return
      const current = resolveVariant(component, instance.variantValues)
      const index = component.variants.findIndex((v) => v.id === current.id)
      const next = component.variants[(index + 1) % component.variants.length]
      apply(updateNode(doc, instanceId, { variantValues: { ...next.values } }))
    },
    [doc, apply],
  )

  const addComponentVariant = useCallback(
    (componentId: string, name: string, fromVariantId?: string) => {
      if (!doc) return
      apply(addVariant(doc, componentId, name, fromVariantId))
    },
    [doc, apply],
  )

  const removeComponentVariant = useCallback(
    (componentId: string, variantId: string) => {
      if (!doc) return
      apply(removeVariant(doc, componentId, variantId))
    },
    [doc, apply],
  )

  const renameComponentVariant = useCallback(
    (componentId: string, variantId: string, name: string) => {
      if (!doc) return
      apply(renameVariant(doc, componentId, variantId, name))
    },
    [doc, apply],
  )

  const patchComponent = useCallback(
    (componentId: string, patch: Parameters<typeof updateComponent>[2]) => {
      if (!doc) return
      apply(updateComponent(doc, componentId, patch))
    },
    [doc, apply],
  )

  const replaceVariantRoot = useCallback(
    (componentId: string, variantId: string, root: Parameters<typeof setVariantRoot>[3]) => {
      if (!doc) return
      apply(setVariantRoot(doc, componentId, variantId, root))
    },
    [doc, apply],
  )

  /**
   * Writes a component to disk for the first time.
   *
   * Every path goes through resolveComponentPath, so a write outside the
   * component root is refused rather than corrected. Uses createWorkspaceFile
   * (which throws on an existing path) rather than the upsert, so approving can
   * never silently overwrite a file that is already there.
   */
  const approveComponent = useCallback(
    async (componentId: string, input: { name: string; target: CanvasTarget; filePath: string }) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component) return

      const safePath = resolveComponentPath(component.componentRoot, input.filePath)
      const named: CanvasComponent = { ...component, name: input.name, target: input.target }
      const ctx = {
        filePath: safePath,
        components: doc.components.map((c) => (c.id === componentId ? named : c)),
        filePathFor: (id: string) => findComponent(doc, id)?.filePath,
      }

      // Hash the region body, then emit the file carrying that hash — so the
      // sentinel records exactly what we wrote and the self-echo guard works
      // from the very first write.
      const regionBody = emitRegionBody(named, ctx)
      const hash = hashContent(regionBody)

      if (!component.filePath) {
        // No file yet — a detached component, or one from a board written
        // before promotion started writing its own file.
        await createWorkspaceFile(safePath, emitComponentFile(named, ctx, hash).content)
      } else {
        // A file already exists, so this is a rename and/or a move, not a
        // creation. Emitting a fresh file would throw off createWorkspaceFile
        // AND discard anything a human wrote around the region, so the existing
        // content is carried over and only the canvas-owned spans are updated —
        // the rename reaches the exported symbol and its props interface
        // through spliceDeclaration.
        const { content } = await readWorkspaceFile(component.filePath)
        let next = spliceRegion(content, componentId, hash, regionBody) ?? content
        next = spliceDeclaration(next, emitPropsInterface(named), emitSignature(named))
        next = spliceImports(next, collectImports(named, ctx))

        if (safePath === component.filePath) {
          await writeWorkspaceFile(safePath, next)
        } else {
          // createWorkspaceFile, not the upsert, so a move can never silently
          // overwrite something already sitting at the destination.
          await createWorkspaceFile(safePath, next)
          await deleteWorkspacePath(component.filePath)
          await pruneEmptyFolder(parentDir(component.filePath))
        }
      }

      apply(
        updateComponent(doc, componentId, {
          name: input.name,
          target: input.target,
          filePath: safePath,
          sync: 'live',
          lastWrittenHash: hash,
          ejectReason: undefined,
        }),
      )
    },
    [doc, apply],
  )

  /**
   * Re-syncs an already-approved component's file with its current canvas
   * state — the explicit "push" half of sync (see model/types.ts's
   * ComponentSyncState doc comment: nothing pushes automatically). Splices
   * only the canvas-owned region (emit/region.ts) so anything a human added
   * around it survives untouched.
   *
   * Returns 'pushed', 'unchanged' (nothing to push), or 'detached' (the
   * file's sentinel region is gone — a human removed it, so writing back in
   * would silently clobber whatever replaced it; the caller surfaces this
   * rather than the hook guessing). Deliberately doesn't touch `sync` on the
   * detached path — that state is reserved for a deliberate user action, not
   * an inference from a missing region.
   */
  const pushComponent = useCallback(
    async (componentId: string): Promise<'pushed' | 'unchanged' | 'detached'> => {
      if (!doc) return 'unchanged'
      const component = findComponent(doc, componentId)
      if (!component?.filePath) return 'unchanged'

      const ctx = {
        filePath: component.filePath,
        components: doc.components,
        filePathFor: (id: string) => findComponent(doc, id)?.filePath,
      }
      const regionBody = emitRegionBody(component, ctx)
      const hash = hashContent(regionBody)
      if (hash === component.lastWrittenHash) return 'unchanged'

      const { content } = await readWorkspaceFile(component.filePath)
      const spliced = spliceRegion(content, component.id, hash, regionBody)
      if (spliced === null) return 'detached'

      // The region is not the only canvas-owned span. The props interface, the
      // signature, and the imports all derive from the component too, and all
      // three go stale the moment a prop or an instance reference is added —
      // which, now that the file is written at promote time rather than after
      // the design settles, is the normal case rather than a corner one.
      // Splicing only the region would leave a body using `state` above a
      // signature that still reads `({}: FrameProps)`.
      const withDeclaration = spliceDeclaration(
        spliced,
        emitPropsInterface(component),
        emitSignature(component),
      )
      const next = spliceImports(withDeclaration, collectImports(component, ctx))

      await writeWorkspaceFile(component.filePath, next)
      apply(updateComponent(doc, componentId, { lastWrittenHash: hash }))
      return 'pushed'
    },
    [doc, apply],
  )

  /**
   * Components with a written file whose current canvas state no longer
   * matches what's on disk — drives the dirty indicator in the Inspector and
   * Layers panel, and whether a "Push changes" action is offered at all.
   */
  const dirtyComponentIds = useMemo(() => {
    if (!doc) return new Set<string>()
    const dirty = new Set<string>()
    for (const component of doc.components) {
      if (!component.filePath) continue
      const ctx = {
        filePath: component.filePath,
        components: doc.components,
        filePathFor: (id: string) => findComponent(doc, id)?.filePath,
      }
      const hash = hashContent(emitRegionBody(component, ctx))
      if (hash !== component.lastWrittenHash) dirty.add(component.id)
    }
    return dirty
  }, [doc])

  /** The component behind the current selection, when an instance is selected. */
  const selectedComponent = useMemo(() => {
    if (!doc || !singleSelected || !isInstanceNode(singleSelected)) return null
    return findComponent(doc, singleSelected.componentId)
  }, [doc, singleSelected])

  const selectedVariant = useMemo(() => {
    if (!selectedComponent || !singleSelected || !isInstanceNode(singleSelected)) return null
    return resolveVariant(selectedComponent, singleSelected.variantValues)
  }, [selectedComponent, singleSelected])

  /**
   * Whether the selected component can be dissolved back into a frame.
   *
   * Gated on instance count alone, not on the full lossless test: flattening a
   * component that DOES carry variants or props is exactly the case this
   * button exists for — the automatic downgrade deliberately refuses it, so a
   * human has to be able to say "do it anyway". What it can't do is dissolve
   * something with several instances, since there'd be no single place to
   * dissolve into.
   */
  const canFlattenSelectedComponent = useMemo(() => {
    if (!doc || !selectedComponent) return false
    return instancesOf(doc, selectedComponent.id).length === 1
  }, [doc, selectedComponent])

  // ── History ──
  const doUndo = useCallback(() => {
    setHistory((h) => {
      if (!h) return h
      dirty.current = true
      return undo(h)
    })
  }, [])

  const doRedo = useCallback(() => {
    setHistory((h) => {
      if (!h) return h
      dirty.current = true
      return redo(h)
    })
  }, [])

  // ── Camera helpers ──
  const zoomToFit = useCallback(() => {
    if (!doc || doc.nodes.length === 0) return
    const container = panZoom.containerRef.current
    if (!container) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of doc.nodes) {
      const rect = boardRectOf(doc, node.id, measured)
      if (!rect) continue
      minX = Math.min(minX, rect.x)
      minY = Math.min(minY, rect.y)
      maxX = Math.max(maxX, rect.x + rect.w)
      maxY = Math.max(maxY, rect.y + rect.h)
    }
    if (!Number.isFinite(minX)) return
    panZoom.setCamera(
      cameraToFit(
        { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        { width: container.clientWidth, height: container.clientHeight },
      ),
    )
  }, [doc, panZoom, measured])

  /**
   * Centers/fits the camera on one node — zoomToFit's math scoped to a single
   * rect instead of unioning every node. `forDoc` defaults to the current
   * `doc`, but accepts an explicit one for the cross-section focus effect
   * below, which calls this in the same tick openDoc resolves in — before a
   * re-render would make the new doc visible through the closure.
   */
  const focusNode = useCallback(
    (id: NodeId, forDoc: CanvasDoc | null = doc) => {
      if (!forDoc) return
      const container = panZoom.containerRef.current
      if (!container) return
      const rect = boardRectOf(forDoc, id, forDoc === doc ? measured : undefined)
      if (!rect) return
      panZoom.setCamera(cameraToFit(rect, { width: container.clientWidth, height: container.clientHeight }))
    },
    [doc, panZoom, measured],
  )

  const resetZoom = useCallback(() => {
    const camera: Camera = { ...panZoom.getCamera(), k: 1 }
    panZoom.setCamera(camera)
  }, [panZoom])

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        doRedo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }
      // Escape steps OUT one level before clearing — with deep nesting,
      // "select my parent" is wanted far more often than "select nothing".
      if (e.key === 'Escape') {
        if (!selectParent()) {
          setSelectedIds(new Set())
          setScopeId(null)
        }
        setTool('select')
        return
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelected()
        else groupSelected()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (e.key === 'f' && !mod) setTool('frame')
      if (e.key === 't' && !mod) setTool('text')
      if (e.key === 'v' && !mod) setTool('select')
      if (mod && e.key === '0') {
        e.preventDefault()
        resetZoom()
      }
      if (mod && e.key === '1') {
        e.preventDefault()
        zoomToFit()
      }

      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelected(-step, 0) }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(step, 0) }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelected(0, -step) }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelected(0, step) }
    }
    // Ctrl suspends snapping mid-drag, matching Figma.
    const track = (e: KeyboardEvent) => {
      snapDisabled.current = e.ctrlKey || e.metaKey
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
    }
  }, [
    doUndo,
    doRedo,
    deleteSelected,
    nudgeSelected,
    resetZoom,
    zoomToFit,
    groupSelected,
    ungroupSelected,
    duplicateSelected,
    selectParent,
  ])

  /** The live marquee/draw rect in board space, for the overlay to paint. */
  const previewRect = useMemo(() => {
    if (!drag || (drag.kind !== 'draw' && drag.kind !== 'marquee')) return null
    return normalizeRect(drag.originBoard, drag.currentBoard)
  }, [drag])

  return {
    // data
    docs,
    doc,
    loading,
    error,
    camera,
    zoom: camera.k,
    tool,
    selectedIds,
    selectedNodes,
    singleSelected,
    previewRect,
    dragKind: drag?.kind ?? null,
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
    parentOf: (id: NodeId) => (doc ? findParent(doc, id) : null),
    selectedComponent,
    canFlattenSelectedComponent,
    selectedVariant,
    /** True when the selection is a plain frame, i.e. promotable. */
    canPromote: !!singleSelected && isFrameNode(singleSelected),
    guides,
    /**
     * The one geometry accessor — measured where an auto-layout ancestor owns
     * the position, model-derived everywhere else. The board draws every ring
     * and handle from this, so chrome and pixels can't disagree.
     */
    rectOf,
    /**
     * Frame to highlight as "this will receive the drop". Suppressed for a pure
     * reorder: you are already inside that frame, and the insertion bar is the
     * cue that matters there.
     */
    dropTargetId: dropIntent && !dropIntent.reorder ? dropIntent.targetId : null,
    /** Board-space insertion bar for a drop into an auto-layout frame. */
    dropIndicator: dropIntent?.indicator ?? null,
    /** Which resize handles to offer for the current selection. */
    resizeHandles:
      doc && singleSelected && isLayoutPositioned(doc, singleSelected.id)
        ? FLOW_RESIZE_HANDLES
        : ALL_RESIZE_HANDLES,
    hoverId,
    scopeId,
    /**
     * The flow that decides where the selection sits — 'freeform' when its own
     * rect does. Drives the inspector's greyed-out X/Y and its explanation, so
     * the rule lives in one place instead of being re-derived in the view.
     */
    selectionParentFlow:
      doc && singleSelected ? parentFlowOf(doc, singleSelected.id) : undefined,
    canGroup: selectedIds.size >= 1,
    canUngroup: !!singleSelected && isFrameNode(singleSelected) && singleSelected.children.length > 0,
    canAlign: selectedIds.size >= 2,
    canDistribute: selectedIds.size >= 3,

    // camera
    panZoom,
    zoomToFit,
    focusNode,
    resetZoom,

    // board lifecycle
    refreshDocs,
    openDoc,
    createBoard,
    removeBoard,
    renameBoard,

    // interaction
    setTool,
    selectOnly,
    toggleSelect,
    onBoardPointerDown,
    onBoardPointerMove,
    onBoardPointerUp,
    onBoardPointerLeave,
    onBoardDoubleClick,
    startResize,
    startMoveDrag,

    // hierarchy & alignment
    groupSelected,
    ungroupSelected,
    alignSelected,
    distributeSelected,
    duplicateSelected,
    selectParent,

    // edits
    deleteSelected,
    updateSelectedStyle,
    updateSelectedRect,
    updateNodeFields,
    reparent,
    undo: doUndo,
    redo: doRedo,
    clearError: () => setError(null),
    /** Lets the view surface an outcome the hook deliberately doesn't act on
     *  itself — e.g. a push skipped because the file's region is gone. */
    setError,

    // components & variants
    promoteSelectedToComponent,
    promoteAndApproveComponent,
    setInstanceVariant,
    triggerNextVariant,
    addComponentVariant,
    removeComponentVariant,
    renameComponentVariant,
    patchComponent,
    replaceVariantRoot,
    approveComponent,
    pushComponent,
    removeComponentFile,
    flattenComponentToFrame,
    setComponentPath,
    componentTree,
    addFolder,
    removeFolder,
    dirtyComponentIds,
    removeNode,
    removeComponent,
    describeLayerDelete,
  }
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
export function resizeRect(start: CanvasRect, handle: ResizeHandle, dx: number, dy: number): CanvasRect {
  let { x, y, w, h } = start
  if (handle.includes('w')) {
    const clamped = Math.min(dx, w - 1)
    x += clamped
    w -= clamped
  }
  if (handle.includes('e')) w = Math.max(1, w + dx)
  if (handle.includes('n')) {
    const clamped = Math.min(dy, h - 1)
    y += clamped
    h -= clamped
  }
  if (handle.includes('s')) h = Math.max(1, h + dy)
  return { x, y, w, h }
}
