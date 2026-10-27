// All Canvas state and interaction logic. Imports no view — tools/codemod-lint.mjs
// enforces that a ViewModel never imports its own View.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPlanningWatchAvailable } from '../00_planning/api/iPlanningWatch'
import { registerPendingWrite } from '../app/pendingWrites'
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
  boardAngleOf,
  boardMatrixOf,
  boardRectOf,
  boundingBoxOf,
  orientedBoxOf,
  createDoc,
  createFrameNode,
  createTextNode,
  createVectorNode,
  bakeLayout,
  replaceNodeById,
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
import {
  deleteDoc,
  deleteStagedFile,
  findBoardForFilePath,
  findRelocatedComponentFiles,
  hashContent,
  listDocs,
  loadDoc,
  pruneEmptyFolder,
  saveDoc,
  serializeDoc,
  sweepOrphanStagedFiles,
} from './model/store'
import {
  createWorkspaceBinaryFile,
  createWorkspaceFile,
  deleteWorkspacePath,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../00_planning/api/sleipnirApi'
import type { FileTreeNode } from '../00_planning/api/PlatformAPI'
import { collectImports, emitComponentFile, emitPropsInterface, emitRegionBody, emitSignature } from './emit/react'
import { spliceDeclaration, spliceImports, spliceRegion } from './emit/region'
import { pointsBounds } from './model/vector'
import {
  deletePoints,
  insertPoint,
  moveAnchors,
  movePoint,
  nearestSegment,
  pointOnSegment,
  pointType,
  refit,
  removeHandle,
  setPointRadius,
  setPointType,
  toEditablePath,
  toggleSmooth,
  vectorContains,
  type PointPart,
  type PointType,
} from './model/vectorEdit'
import { DEFAULT_COMPONENT_ROOT, deconflictComponentPath, normalizeRelPath, parentDir, relativeToRoot, resolveComponentPath } from './model/paths'
import { relinkRelocated } from './model/relink'
import { diffStagedFiles, isStagedPath, pruneUnreferencedComponents, stagedFilesOf } from './model/stagedFiles'
import { ensureStagingTsconfig } from './model/stagingTsconfig'
import {
  adaptForTarget,
  copyPayload,
  detachedCopy,
  parseClipboard,
  serializeClipboard,
  unionRect,
  type CanvasClipboard,
} from './model/clipboard'
import { useLinkedComponents } from './hooks/useLinkedComponents'
import { fileFromBase64, imageFileFromClipboard, svgSize } from './model/clipboardImage'
import { isOnPath, isPathFlow, moveToPathSlot, pathStartOf, reflowPaths, slideOffset } from './model/pathFlow'
import { keepsProportions } from './model/imageSizing'
import { makePathPattern, pathAndPiece } from './model/pathPattern'
import { angleOf, apply as applyMat, invert, normalizeDegrees, rotateAbout, rotateVector, snapAngle, type OrientedBox } from './model/rotation'
import { addComponentFolder, buildComponentTree, removeComponentFolder } from './model/componentTree'
import {
  isExternalNode,
  isFrameNode,
  isInstanceNode,
  isTextNode,
  isVectorNode,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasDocSummary,
  type CanvasComponent,
  type CanvasNode,
  type CanvasPropValue,
  type CanvasRect,
  type CanvasStyle,
  type CanvasTextStyle,
  type CanvasTarget,
  type NodeId,
  type VectorPoint,
} from './model/types'

const AUTOSAVE_MS = 400
/** Where images imported for image fills land — the staging tier, beside the components using them. */
const CANVAS_ASSETS_DIR = `${DEFAULT_COMPONENT_ROOT}/assets`
const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i
/** Longest side a pasted image lands at — a 4K screenshot at full size would bury the board. */
const MAX_PASTED_IMAGE = 2048

/** An image file's natural size, or a stand-in when the browser can't decode it. */
async function imageFileSize(file: File): Promise<{ w: number; h: number }> {
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
const CAMERA_SAVE_MS = 300

/**
 * Where you were looking is yours, not the project's.
 *
 * Boards are committed (see model/store.ts), and the camera used to ride along
 * in each one — so every save carried a pan or a zoom into git, a diff line in
 * every commit and a merge conflict between any two people who touched the same
 * board. It now lives in this machine's localStorage, per project and board.
 * Best-effort both ways: storage can be unavailable or full, and losing the
 * camera costs nothing but a re-pan.
 */
function cameraKey(projectPath: string | null | undefined, docId: string): string {
  return `sleipnir.canvas.camera:${projectPath ?? ''}:${docId}`
}

function readStoredCamera(key: string): Camera | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const { x, y, k } = parsed as Partial<Camera>
    return typeof x === 'number' && typeof y === 'number' && typeof k === 'number' ? { x, y, k } : null
  } catch {
    return null
  }
}

function storeCamera(key: string, camera: Camera): void {
  try {
    localStorage.setItem(key, JSON.stringify(camera))
  } catch {
    // Unavailable or full — the camera simply isn't remembered.
  }
}
/** Board-space size of a frame created by a click rather than a drag. */
const DEFAULT_FRAME_SIZE = { w: 240, h: 160 }
const MIN_DRAW_SIZE = 4

export type CanvasTool = 'select' | 'frame' | 'text' | 'rectangle' | 'ellipse' | 'polygon' | 'pen'

/** The tools that drag out a vector shape, in the toolbar's shape menu. */
export const SHAPE_TOOLS = ['rectangle', 'ellipse', 'polygon'] as const
export type ShapeTool = (typeof SHAPE_TOOLS)[number]
export const isShapeTool = (tool: CanvasTool): tool is ShapeTool => (SHAPE_TOOLS as readonly string[]).includes(tool)

/**
 * Copies of `ids` placed exactly where they are, each just beneath its
 * original — what Alt-drag leaves behind while the originals move on.
 */
function duplicateInPlace(doc: CanvasDoc, ids: NodeId[]): CanvasDoc {
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
function isVectorArt(frame: CanvasFrameNode): boolean {
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
const DEFAULT_SHAPE_SIZE = { w: 100, h: 100 }
/** Screen pixels within which a pen click lands on the path's first point and closes it. */
const PEN_CLOSE_RADIUS = 8
/** Screen pixels within which a click counts as on a vector's outline, or on a segment of a path being edited. */
const OUTLINE_TOLERANCE_PX = 5

/** `to`, snapped onto the nearest 45° ray from `from` — Shift on the pen. */
function snap45(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
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

function createValueStore<T>(initial: T): ValueStore<T> {
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
 * A staged component file as it would be written fresh from the board — the
 * fallback when a component comes back (redo, undo of a delete) and no copy of
 * its old bytes survives in this session.
 */
function renderStagedFile(doc: CanvasDoc, component: CanvasComponent, filePath: string): string {
  const ctx = {
    filePath,
    components: doc.components,
    filePathFor: (id: string) => findComponent(doc, id)?.filePath,
  }
  return emitComponentFile(component, ctx, hashContent(emitRegionBody(component, ctx))).content
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

export function useCanvasViewModel(
  activeProjectPath: string | null | undefined,
  opts?: {
    pendingFocus?: { filePath: string } | null
    onFocusConsumed?: () => void
    /** Fires after the canvas added or removed workspace files on its own (see syncStagedFiles), so the Workspace tree can refresh. */
    onFilesChanged?: () => void
  },
) {
  const { pendingFocus, onFocusConsumed, onFilesChanged } = opts ?? {}
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged
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
  // For work that finishes after an await (an image paste, a save flushed on a
  // board switch): it must see the board as it is THEN, not as it was captured.
  const docRef = useRef(doc)
  docRef.current = doc

  // Hash of the content we last wrote, so our own autosave echoing back through
  // the planning watcher doesn't reload the board out from under the user.
  const lastWrittenHash = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  /**
   * Writes the open board now if an autosave is still pending. Switching boards
   * replaces `doc`, and the autosave effect's cleanup cancels the timer — so an
   * edit made inside the debounce window before a switch was simply lost.
   */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const current = docRef.current
    if (!current || !dirty.current) return
    try {
      lastWrittenHash.current = await saveDoc({ ...current, camera: undefined })
      dirty.current = false
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // The same loss on the way out: File ▸ Save Project copies the folder and a
  // window close tears this view down, both possibly inside the debounce.
  useEffect(() => registerPendingWrite(flushSave), [flushSave])

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

  /**
   * A node as it really sits on the board — center, size and total rotation
   * (model/rotation.ts). Selection rings and handles are drawn from this, so a
   * rotated node's outline turns with it.
   */
  const orientedOf = useCallback(
    (id: NodeId): OrientedBox | null => (doc ? orientedBoxOf(doc, id, measured) : null),
    [doc, measured],
  )

  /** Where a slide-along-the-path drag began: the gesture it belongs to and the frame's offset then. */
  const pathSlideStart = useRef<{ gesture: { x: number; y: number }; offset: number } | null>(null)

  /**
   * The start of the selected along-path frame's run (or of the frame the
   * selected item sits on) in board space, with the direction it heads — the
   * board draws it as a dot and an arrow.
   */
  const pathHint = useMemo(() => {
    if (!doc || selectedIds.size !== 1) return null
    const node = findNode(doc, [...selectedIds][0])
    const frame = isPathFlow(node) ? node : node ? findParent(doc, node.id) : null
    if (!isPathFlow(frame)) return null
    const start = pathStartOf(frame)
    const m = boardMatrixOf(doc, frame.id, measured)
    if (!start || !m) return null
    const at = applyMat(m, start)
    return { x: at.x, y: at.y, angle: start.angle + angleOf(m) }
  }, [doc, selectedIds, measured])

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
   *
   * Before flagging, it looks for the file elsewhere: every component file
   * carries a sentinel naming its component, so a file MOVED outside Sleipnir
   * can be found by id and relinked (see store.ts's
   * findRelocatedComponentFiles). That positive find IS persisted — openDoc
   * saves `relocated` — because unlike a failed read it is not a guess.
   */
  const markVanishedComponents = useCallback(
    async (loaded: CanvasDoc): Promise<{ doc: CanvasDoc; relocated: Map<string, string> }> => {
      const none = new Map<string, string>()
      const linked = loaded.components.filter((c) => c.filePath)
      if (linked.length === 0) return { doc: loaded, relocated: none }

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
      if (missing.size === 0) return { doc: loaded, relocated: none }

      const relocated = await findRelocatedComponentFiles(missing)
      const relinkedDoc = relinkRelocated(loaded, relocated)
      for (const id of relocated.keys()) missing.delete(id)
      if (missing.size === 0) return { doc: relinkedDoc, relocated }

      return {
        relocated,
        doc: {
          ...relinkedDoc,
          components: relinkedDoc.components.map((c) =>
            missing.has(c.id)
              ? {
                  ...c,
                  sync: 'detached' as const,
                  ejectReason: `${c.filePath} is gone — it was moved or deleted outside Sleipnir.`,
                }
              : c,
          ),
        },
      }
    },
    [],
  )

  const openDoc = useCallback(
    async (id: string) => {
      await flushSave()
      const raw = await loadDoc(id)
      if (!raw) {
        setError(`Could not read board ${id}`)
        return null
      }
      const { doc: loaded, relocated } = await markVanishedComponents(raw)
      if (relocated.size > 0) {
        // Persist only the relink, never the "gone" flags riding along with it.
        try {
          await saveDoc(relinkRelocated(raw, relocated))
        } catch {
          // Unsaved is fine — the relink is re-found on the next open.
        }
      }
      lastWrittenHash.current = hashContent(serializeDoc(loaded))
      setHistory(initHistory(loaded))
      setSelectedIds(new Set())
      // A board saved before the camera moved out still carries one; it is the
      // fallback until this machine has its own.
      const camera = readStoredCamera(cameraKey(activeProjectPath, loaded.id)) ?? loaded.camera
      if (camera) panZoom.setCamera(camera)
      return loaded
    },
    [panZoom, markVanishedComponents, activeProjectPath, flushSave],
  )

  /** Closes the open board without opening another — its last tab was closed. */
  const closeBoard = useCallback(async () => {
    await flushSave()
    setHistory(null)
    setSelectedIds(new Set())
  }, [flushSave])

  const createBoard = useCallback(
    async (name: string) => {
      await flushSave()
      const next = createDoc(name.trim() || 'Untitled')
      lastWrittenHash.current = await saveDoc(next)
      setHistory(initHistory(next))
      setSelectedIds(new Set())
      await refreshDocs()
      return next
    },
    [refreshDocs, flushSave],
  )

  /**
   * Deletes a board and the staged files its components were written to — a
   * board's `.canvas` files exist only on its behalf, so they go with it.
   * Promoted files (moved out into real source) stay: that is project code now.
   */
  const removeBoard = useCallback(
    async (id: string) => {
      const target = doc?.id === id ? doc : await loadDoc(id)
      await deleteDoc(id)
      if (doc?.id === id) setHistory(null)
      if (target) {
        let removed = 0
        for (const [path, component] of stagedFilesOf(target)) {
          if ((await deleteStagedFile(path, component.id)) !== null) removed += 1
        }
        if (removed > 0) onFilesChangedRef.current?.()
      }
      await refreshDocs()
    },
    [doc, refreshDocs],
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
        // Clears staged files stranded by older builds before every board
        // change kept `.canvas` in step. Not awaited: it only ever removes
        // files no board owns, so there is nothing for the open to wait on.
        void sweepOrphanStagedFiles()
          .then((removed) => {
            if (removed.length > 0) onFilesChangedRef.current?.()
          })
          .catch(() => {})
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
    // Every change re-flows any along-path frames, so editing the curve or the
    // children moves them in the same undo step (see model/pathFlow.ts).
    const flowed = reflowPaths(next)
    setHistory((h) => (h ? commit(h, flowed, coalesce) : h))
    dirty.current = true
  }, [])

  useEffect(() => {
    if (!doc || !dirty.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        lastWrittenHash.current = await saveDoc({ ...doc, camera: undefined })
        dirty.current = false
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, AUTOSAVE_MS)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [doc])

  // The camera, remembered locally on its own debounce — so a pan alone is
  // remembered too, which it never was while it could only ride a board save.
  const docId = doc?.id
  useEffect(() => {
    if (!docId) return
    const timer = setTimeout(() => storeCamera(cameraKey(activeProjectPath, docId), camera), CAMERA_SAVE_MS)
    return () => clearTimeout(timer)
  }, [camera, docId, activeProjectPath])

  // ── Staged files follow the board ──
  //
  // The `.canvas` invariant (see model/stagedFiles.ts): a component on the
  // board ⇔ its file in `.canvas`. Enforced here, against every change to the
  // board, rather than inside each operation — so Delete, flatten, undo, redo
  // and a reload from disk all get it, including whichever ones get written
  // next.
  //
  // Serialized through one promise chain: an undo deletes, a redo restores,
  // and mashing the two must land on the final state rather than on whichever
  // file operation happened to finish last. Each run diffs against what the
  // previous run left on disk, never against the previous render.
  const syncedFiles = useRef<{ docId: string; files: Map<string, { id: string }> } | null>(null)
  const syncChain = useRef<Promise<void>>(Promise.resolve())
  /**
   * Bytes of every staged file the sync deleted this session, keyed by path and
   * owner — so undoing a delete restores the file exactly, human edits around
   * the canvas region included, rather than re-rendering it from the board.
   */
  const removedFiles = useRef(new Map<string, string>())
  const stagingTsconfigChecked = useRef(false)
  useEffect(() => {
    stagingTsconfigChecked.current = false
  }, [activeProjectPath])

  // Only a change to the component list can change what files the board
  // claims, so the many doc changes that leave it alone (every frame of a
  // drag) skip the sync entirely.
  const lastSyncedComponents = useRef<{ docId: string; components: CanvasComponent[] } | null>(null)
  useEffect(() => {
    const target = doc
    if (target && lastSyncedComponents.current?.docId === target.id && lastSyncedComponents.current.components === target.components) return
    lastSyncedComponents.current = target ? { docId: target.id, components: target.components } : null
    syncChain.current = syncChain.current.then(async () => {
      if (!target) {
        syncedFiles.current = null
        return
      }
      const next = stagedFilesOf(target)
      const prev = syncedFiles.current
      syncedFiles.current = { docId: target.id, files: next }
      // The first time this project has a staged TS file in view, make sure
      // editors can type-check it (see model/stagingTsconfig.ts). Once per
      // project per session: the check is a read, the write is create-only.
      if (!stagingTsconfigChecked.current && [...next.keys()].some((p) => /\.tsx?$/.test(p))) {
        stagingTsconfigChecked.current = true
        if (await ensureStagingTsconfig()) onFilesChangedRef.current?.()
      }
      // A different board just opened: what it claims is the baseline, not a
      // change. Missing files on open are flagged (markVanishedComponents),
      // never silently re-created — a half-mounted drive looks the same.
      if (!prev || prev.docId !== target.id) return

      const { removed, added } = diffStagedFiles(prev.files, next)
      let changed = false
      for (const { path, componentId } of removed) {
        const content = await deleteStagedFile(path, componentId)
        if (content !== null) {
          removedFiles.current.set(`${componentId}\n${path}`, content)
          changed = true
        }
      }
      for (const { path, component } of added) {
        try {
          await readWorkspaceFile(path)
          continue // already on disk — promotion and moves write before they commit
        } catch {
          // Missing: this component came back without its file.
        }
        const key = `${component.id}\n${path}`
        try {
          await createWorkspaceFile(path, removedFiles.current.get(key) ?? renderStagedFile(target, component, path))
          removedFiles.current.delete(key)
          changed = true
        } catch {
          // Lost a race with a write of the same path — whatever is there wins.
        }
      }
      if (changed) onFilesChangedRef.current?.()
    }).catch(() => {})
  }, [doc])

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
    [doc, measured, apply, penCursor],
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
    [doc, apply],
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
    [doc, editingNode, selectedPoints, panZoom, measured, apply],
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
      const path = hitPath(doc, x, y, { measured, tolerance: OUTLINE_TOLERANCE_PX / panZoom.getCamera().k })
      // Ctrl/Cmd reaches straight through to the deepest node, skipping the
      // drill-down entirely — the standard escape hatch.
      return deep ? (path[path.length - 1] ?? null) : pickForScope(path, drillScope())
    },
    [doc, drillScope, measured, panZoom],
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
      const path = hitPath(doc, board.x, board.y, { measured, tolerance: OUTLINE_TOLERANCE_PX / panZoom.getCamera().k })
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
    [doc, tool, selectedIds, panZoom, drillScope, measured, finishPen, editingNode, apply, insertPreview, penCursor],
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
      // A double-click ends a pen path, left open — its second click already
      // placed the last anchor.
      if (tool === 'pen') {
        finishPen(false)
        return
      }
      // A double-click on a vector edits its points.
      const at = panZoom.toBoard(e.clientX, e.clientY)
      const hits = hitPath(doc, at.x, at.y, { measured, tolerance: OUTLINE_TOLERANCE_PX / panZoom.getCamera().k })
      const deepest = hits[hits.length - 1]
      if (deepest && isVectorNode(deepest)) {
        enterVectorEdit(deepest.id)
        return
      }
      const board = panZoom.toBoard(e.clientX, e.clientY)
      const path = hitPath(doc, board.x, board.y, { measured, tolerance: OUTLINE_TOLERANCE_PX / panZoom.getCamera().k })
      if (path.length === 0) return
      const current = pickForScope(path, drillScope())
      const index = path.findIndex((n) => n.id === current?.id)
      const child = path[index + 1]
      if (!child) return
      setScopeId(current!.id)
      setSelectedIds(new Set([child.id]))
    },
    [doc, panZoom, drillScope, measured, tool, finishPen, enterVectorEdit],
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
      for (const id of selectedIds) {
        // A pattern copy's size is its template's — resizing one resizes all.
        const target = editTargetOf(doc, id)
        const node = findNode(doc, target)
        if (node) startRects.set(target, { ...node.rect })
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
    [doc, selectedIds, panZoom],
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
    [doc, selectedIds, panZoom, measured],
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
        // whole run, as the start marker does (model/pathFlow.ts).
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
          // else is the other way round (model/imageSizing.ts).
          const opts = { proportional: keepsProportions(findNode(doc, id), e.shiftKey), fromCenter: e.altKey && !isLayoutPositioned(doc, id) }
          const own = findNode(doc, id)?.style.rotate ?? 0
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
    [drag, doc, tool, panZoom, apply, applyDragFrame, snapCandidates, pickAt, measured, editingVectorId, insertPreview, penCursor],
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
      setTool('select')
    }

    if (drag.kind === 'marquee') {
      const rect = normalizeRect(drag.originBoard, drag.currentBoard)
      if (rect.w >= MIN_DRAW_SIZE && rect.h >= MIN_DRAW_SIZE) {
        setSelectedIds(new Set(nodesInRect(doc, rect, measured).map((n) => n.id)))
      }
    }

    setDrag(null)
  }, [drag, doc, tool, apply, dropIntent, measured, editingNode, selectedPoints, exitVectorEdit, panZoom])

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

  /** Two siblings, one of which can be a path: what "Pattern along path" can act on. */
  const canPattern = useMemo(() => {
    if (!doc || selectedNodes.length !== 2) return false
    const [a, b] = selectedNodes
    return findParent(doc, a.id)?.id === findParent(doc, b.id)?.id && pathAndPiece(selectedNodes) !== null
  }, [doc, selectedNodes])

  /** Wraps the selected path and piece into a pattern (model/pathPattern.ts's makePathPattern). */
  const patternSelected = useCallback(() => {
    if (!doc || !canPattern) return
    const result = makePathPattern(doc, selectedNodes.map((n) => n.id), measured)
    if (!result.frameId) return
    apply(result.doc)
    setSelectedIds(new Set([result.frameId]))
  }, [doc, canPattern, selectedNodes, measured, apply])

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
  //
  // Both deletes prune whatever components they leave without an instance:
  // deleting a component's last use IS deleting the component, and the staged
  // file sync above then takes its `.canvas` file too — one undo step for both.
  const deleteSelected = useCallback(() => {
    if (!doc || selectedIds.size === 0) return
    let next = doc
    for (const id of selectedIds) next = deletePiece(next, id)
    apply(pruneUnreferencedComponents(next))
    setSelectedIds(new Set())
  }, [doc, selectedIds, apply])

  /** Removes one node by id, regardless of the current selection — for the layers panel's own delete action, which targets whatever was right-clicked. */
  const removeNode = useCallback(
    (id: NodeId) => {
      if (!doc) return
      apply(pruneUnreferencedComponents(deletePiece(doc, id)))
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
   *
   * A STAGED file is the exception to keeping a file-less component: in
   * `.canvas` the file and the component are one thing (model/stagedFiles.ts),
   * so removing the file flattens the component — variants and props included,
   * since the undo step now brings back both the component and its file. The
   * staged-file sync does the actual delete. With several instances there is
   * no single frame to become, so that case is refused rather than detached.
   */
  const removeComponentFile = useCallback(
    async (componentId: string) => {
      if (!doc) return
      const component = findComponent(doc, componentId)
      if (!component?.filePath) return

      if (isStagedPath(component.filePath)) {
        const uses = instancesOf(doc, componentId).length
        if (uses > 1) {
          throw new Error(
            `${component.name} is used ${uses} times on this board — delete the other instances first, so it has one frame to turn back into.`,
          )
        }
        // No instance at all is a component an older build stranded; there is
        // nothing to flatten into, only the definition to drop.
        apply(uses === 1 ? flattenComponent(doc, componentId) : deleteComponent(doc, componentId))
        return
      }

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
    (patch: Partial<CanvasStyle>, gesture?: string) => {
      if (!doc) return
      let next = doc
      for (const id of selectedIds) {
        const node = findNode(next, id)
        if (!node) continue
        let rest = patch
        // A piece on a path is turned by its own pathTurn, on top of the path —
        // typing a rotation sets the turn that shows that rotation.
        if ('rotate' in patch && isOnPath(findParent(next, id), node)) {
          const { rotate, ...others } = patch
          rest = others
          const turn = normalizeDegrees((node.pathTurn ?? 0) + (rotate ?? 0) - (node.style.rotate ?? 0))
          next = updateNode(next, id, { pathTurn: Math.round(turn * 10) / 10 || undefined })
        }
        if (Object.keys(rest).length > 0) next = setStyle(next, editTargetOf(next, id), rest)
      }
      apply(next, coalesceGesture(gesture))
    },
    [doc, selectedIds, apply, coalesceGesture],
  )

  /** Merges into a text node's typography — its size, weight, and color. */
  const updateNodeFont = useCallback(
    (id: NodeId, patch: Partial<CanvasTextStyle>, gesture?: string) => {
      if (!doc) return
      const node = findNode(doc, id)
      if (!node || !isTextNode(node)) return
      apply(updateNode(doc, editTargetOf(doc, id), { font: { ...node.font, ...patch } }), coalesceGesture(gesture && `font:${gesture}`))
    },
    [doc, apply, coalesceGesture],
  )

  // ── Image fills ──

  /** Every image file in the workspace, for the image fill's picker. */
  const listWorkspaceImages = useCallback(async (): Promise<string[]> => {
    const { tree } = await listWorkspaceDir('')
    const out: string[] = []
    const visit = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'dir') visit(node.children ?? [])
        else if (IMAGE_FILE_RE.test(node.name)) out.push(node.path)
      }
    }
    visit(tree)
    return out.sort()
  }, [])

  /**
   * Copies an image from disk into `.canvas/assets/`, beside the components
   * that use it, and resolves its workspace path. A name already taken gets a
   * numeric suffix rather than overwriting what's there.
   */
  const importImageFile = useCallback(async (file: File): Promise<string> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
      reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`))
      reader.readAsDataURL(file)
    })
    const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image.png'
    const dot = clean.lastIndexOf('.')
    const stem = dot > 0 ? clean.slice(0, dot) : clean
    const ext = dot > 0 ? clean.slice(dot) : ''
    for (let n = 1; n <= 50; n += 1) {
      const path = `${CANVAS_ASSETS_DIR}/${n === 1 ? clean : `${stem}-${n}${ext}`}`
      try {
        await createWorkspaceBinaryFile(path, base64)
        onFilesChangedRef.current?.()
        return path
      } catch (e) {
        if (!/already exists/i.test(e instanceof Error ? e.message : String(e))) throw e
      }
    }
    throw new Error(`Too many images named ${clean} in ${CANVAS_ASSETS_DIR}`)
  }, [])

  const imageSources = useMemo(
    () => ({ list: listWorkspaceImages, importFile: importImageFile }),
    [listWorkspaceImages, importImageFile],
  )

  // ── Clipboard ──
  //
  // Copy/cut/paste ride the browser's own clipboard events rather than
  // Ctrl+C/V keydowns, so a canvas payload lands on the system clipboard —
  // pasteable into another board or another window — and an image copied
  // anywhere else (a screenshot, a browser) arrives here as a file. See
  // model/clipboard.ts for how components survive the trip between boards.
  const linked = useLinkedComponents(doc, docs)
  /** Same-board pastes step down-right each time, like Ctrl+D, instead of stacking exactly on top. */
  const pasteCount = useRef(0)

  /** The board area on screen right now, in board space. */
  const viewportBoardRect = useCallback((): CanvasRect | null => {
    const container = panZoom.containerRef.current
    if (!container) return null
    const r = container.getBoundingClientRect()
    const tl = panZoom.toBoard(r.left, r.top)
    const br = panZoom.toBoard(r.right, r.bottom)
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
  }, [panZoom])

  /**
   * Whether the paste about to happen was Ctrl+Shift+V (into the selection)
   * rather than Ctrl+V (onto the board). A ClipboardEvent carries no modifier
   * keys, so the V keydown that triggers it records them — read in the capture
   * phase, before any input can stop it, and consumed by the paste. Tracking
   * Shift up/down instead could stick "on" when an input swallowed the keyup,
   * silently sending every later paste into the selected frame.
   */
  const pasteIntoSelection = useRef(false)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyV' && (e.ctrlKey || e.metaKey)) pasteIntoSelection.current = e.shiftKey
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  /**
   * Where pasted content goes. Ctrl+V: straight onto the board, whatever is
   * selected. Ctrl+Shift+V: into the selection — a selected frame receives it
   * (Figma's rule); a selected leaf — or a selected node that is itself what
   * was copied, which means "paste a copy next to it" — gets it as a sibling.
   * `into` says whether it's going INTO the selected frame, which centers it
   * there rather than keeping its own position.
   */
  const pasteTarget = useCallback(
    (current: CanvasDoc, copiedIds: Set<NodeId>, intoSelection: boolean): { parent: CanvasFrameNode | null; into: boolean } => {
      if (!intoSelection) return { parent: null, into: false }
      const selected = selectedIds.size === 1 ? findNode(current, [...selectedIds][0]) : null
      if (!selected) return { parent: null, into: false }
      if (isFrameNode(selected) && !copiedIds.has(selected.id)) return { parent: selected, into: true }
      return { parent: findParent(current, selected.id), into: false }
    },
    [selectedIds],
  )

  /**
   * Moves nodes whose rects are in BOARD space into place under `parent`,
   * keeping their arrangement: centered in the frame they're pasted into;
   * nudged off the original for a same-board paste that's still on screen;
   * centered on screen otherwise.
   */
  const placeNodes = useCallback(
    <T extends CanvasNode>(current: CanvasDoc, nodes: T[], parent: CanvasFrameNode | null, into: boolean, offset: number): T[] => {
      const box = unionRect(nodes.map((n) => n.rect))
      const parentBox = parent ? boardRectOf(current, parent.id, measured) : null
      let target = { x: box.x + offset, y: box.y + offset }
      const view = viewportBoardRect()
      const onScreen =
        !!view && target.x < view.x + view.w && target.x + box.w > view.x && target.y < view.y + view.h && target.y + box.h > view.y
      if (into && parentBox) {
        target = { x: parentBox.x + (parentBox.w - box.w) / 2, y: parentBox.y + (parentBox.h - box.h) / 2 }
      } else if ((offset === 0 || !onScreen) && view) {
        target = { x: view.x + (view.w - box.w) / 2, y: view.y + (view.h - box.h) / 2 }
      }
      const dx = target.x - box.x - (parentBox?.x ?? 0)
      const dy = target.y - box.y - (parentBox?.y ?? 0)
      return nodes.map((n) => ({ ...n, rect: { ...n.rect, x: Math.round(n.rect.x + dx), y: Math.round(n.rect.y + dy) } }))
    },
    [measured, viewportBoardRect],
  )

  const pasteNodes = useCallback(
    (payload: CanvasClipboard, intoSelection: boolean) => {
      const current = docRef.current
      if (!current) return
      const { nodes, components } = adaptForTarget(current, payload)
      const { parent, into } = pasteTarget(current, new Set(payload.nodes.map((n) => n.id)), intoSelection)
      const sameBoard = payload.sourceDocId === current.id
      if (sameBoard && !into) pasteCount.current += 1
      const placed = placeNodes(current, nodes, parent, into, sameBoard && !into ? 16 * pasteCount.current : 0)
      let next = components.length > 0 ? { ...current, components: [...current.components, ...components] } : current
      for (const node of placed) next = insertNode(next, node, parent?.id ?? null)
      apply(next)
      setSelectedIds(new Set(placed.map((n) => n.id)))
    },
    [apply, pasteTarget, placeNodes],
  )

  /**
   * A pasted image becomes a frame filled with it (Figma's image node is the
   * same thing: a rectangle with an image fill), so it crops when resized. It
   * lands on the board; with Ctrl+Shift+V it goes into a selected frame as a
   * child, and that frame starts clipping, so the image is cut to the frame's
   * shape — that's the point of pasting into one.
   */
  const pasteImage = useCallback(
    async (file: File, intoSelection: boolean) => {
      try {
        const [src, size] = await Promise.all([importImageFile(file), imageFileSize(file)])
        const current = docRef.current
        if (!current) return
        const scale = Math.min(1, MAX_PASTED_IMAGE / Math.max(size.w, size.h))
        const name = file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : 'Image'
        const frame = createFrameNode({ x: 0, y: 0, w: Math.round(size.w * scale), h: Math.round(size.h * scale) }, name)
        frame.style = { ...frame.style, fills: [{ type: 'image', src, scaleMode: 'fill', natural: size }], stroke: undefined, radius: undefined, clip: true }
        const { parent, into } = pasteTarget(current, new Set(), intoSelection)
        const [placed] = placeNodes(current, [frame], parent, into, 0)
        let next = insertNode(current, placed, parent?.id ?? null)
        if (into && parent && !parent.style.clip) next = setStyle(next, parent.id, { clip: true })
        apply(next)
        setSelectedIds(new Set([placed.id]))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [apply, importImageFile, pasteTarget, placeNodes],
  )

  useEffect(() => {
    // Every visited view stays mounted (display:none when not shown), so only
    // the board actually on screen may claim the clipboard.
    const onScreen = () => !!panZoom.containerRef.current?.offsetParent
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const copy = (cut: boolean) => (e: ClipboardEvent) => {
      const current = docRef.current
      if (!onScreen() || typing(e.target) || !current || selectedIds.size === 0 || !e.clipboardData) return
      const payload = copyPayload(current, selectedIds, measured)
      if (!payload) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', serializeClipboard(payload))
      pasteCount.current = 0
      if (cut) deleteSelected()
    }
    const onCopy = copy(false)
    const onCut = copy(true)
    const onPaste = (e: ClipboardEvent) => {
      if (!onScreen() || !docRef.current || !e.clipboardData) return
      const intoSelection = pasteIntoSelection.current
      pasteIntoSelection.current = false
      // An image file goes onto the board even while a text field has focus —
      // a text field can't take one anyway, so "Ctrl+V anywhere" works without
      // first clicking an empty spot of the board. Text (SVG code included)
      // and canvas nodes still paste into a focused field as usual.
      const image = imageFileFromClipboard(e.clipboardData, { markup: !typing(e.target) })
      if (image) {
        e.preventDefault()
        void pasteImage(image, intoSelection)
        return
      }
      if (typing(e.target)) return
      const payload = parseClipboard(e.clipboardData.getData('text/plain'))
      if (payload) {
        e.preventDefault()
        pasteNodes(payload, intoSelection)
        return
      }
      // Nothing the page can see — a file copied in Explorer/Finder usually
      // lands here. Ask the main process to read the clipboard natively.
      const readNative = window.electronAPI?.readClipboardImage
      if (readNative) {
        e.preventDefault()
        void readNative().then((native) => {
          const file = native && fileFromBase64(native.base64, native.name, native.mime)
          if (file) void pasteImage(file, intoSelection)
        })
      }
    }
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [panZoom, selectedIds, measured, deleteSelected, pasteNodes, pasteImage])

  const updateSelectedRect = useCallback(
    (patch: Partial<CanvasRect>, gesture?: string) => {
      if (!doc) return
      let next = doc
      for (const id of selectedIds) next = setRect(next, editTargetOf(next, id), patch)
      apply(next, coalesceGesture(gesture && `rect:${gesture}`))
    },
    [doc, selectedIds, apply, coalesceGesture],
  )

  const updateNodeFields = useCallback(
    (id: NodeId, patch: Partial<CanvasNode>, gesture?: string) => {
      if (!doc) return
      apply(updateNode(doc, editTargetOf(doc, id), patch), coalesceGesture(gesture))
    },
    [doc, apply, coalesceGesture],
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
  /**
   * Promotes `frame` within `base` and writes its file — the shared half of
   * CREATE COMPONENT and MAKE SVG COMPONENT. `base` may already carry an edit
   * the promotion depends on (MAKE SVG COMPONENT groups loose vectors first);
   * the whole thing commits as one undo step once the file lands.
   */
  const promoteFrame = useCallback(
    async (
      base: CanvasDoc,
      frame: CanvasFrameNode,
      options?: { name?: string; target?: CanvasTarget; format?: CanvasComponent['format'] },
    ) => {
      const promoted = createComponentFromFrame(base, frame, options)
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
    [apply],
  )

  const promoteSelectedToComponent = useCallback(
    async (options?: { name?: string; target?: CanvasTarget }) => {
      if (!doc || !singleSelected || !isFrameNode(singleSelected)) return null
      return promoteFrame(doc, singleSelected, options)
    },
    [doc, singleSelected, promoteFrame],
  )

  /**
   * What MAKE SVG COMPONENT would promote, or null when the selection isn't
   * vector art: one or more vectors sharing a parent (grouped first), or a
   * single frame holding nothing but vectors and groups of them.
   */
  const svgCandidate = useMemo((): { kind: 'frame'; id: NodeId } | { kind: 'vectors'; ids: NodeId[] } | null => {
    if (!doc || selectedNodes.length === 0) return null
    if (selectedNodes.length === 1 && isFrameNode(selectedNodes[0])) {
      return isVectorArt(selectedNodes[0]) ? { kind: 'frame', id: selectedNodes[0].id } : null
    }
    if (!selectedNodes.every(isVectorNode)) return null
    const parents = new Set(selectedNodes.map((n) => findParent(doc, n.id)?.id ?? null))
    return parents.size === 1 ? { kind: 'vectors', ids: selectedNodes.map((n) => n.id) } : null
  }, [doc, selectedNodes])

  /**
   * Turns the selected vectors into an SVG component: a component whose file
   * is one <svg> of paths rather than a tree of divs (see emit/svg.ts). Loose
   * vectors are grouped first, so the group's box becomes the svg's canvas.
   * Variants, props and the `.canvas` file lifecycle are a component's like
   * any other.
   */
  const makeSvgComponent = useCallback(async () => {
    if (!doc || !svgCandidate) return null
    let base = doc
    let frame: CanvasNode | null
    let name: string
    if (svgCandidate.kind === 'frame') {
      // An SVG has no layout, so wherever a stack placed a child is where it
      // is drawn: bake the measured positions in before promoting.
      base = bakeLayout(doc, svgCandidate.id, measured)
      frame = findNode(base, svgCandidate.id)
      name = frame?.name ?? 'Icon'
    } else {
      const single = svgCandidate.ids.length === 1 ? findNode(doc, svgCandidate.ids[0]) : null
      name = single?.name ?? 'Icon'
      const grouped = groupNodes(doc, svgCandidate.ids, name, measured)
      if (!grouped.groupId) return null
      base = grouped.doc
      frame = findNode(base, grouped.groupId)
    }
    if (!frame || !isFrameNode(frame)) return null
    return promoteFrame(base, frame, { name, format: 'svg' })
  }, [doc, svgCandidate, measured, promoteFrame])

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
   * Restyles a component's variant root — the main component, which every
   * instance renders. This is how a component's paint changes after
   * promotion: the board has no separate main-component canvas, so the
   * inspector edits it from the selected instance. The file then shows dirty
   * and UPDATE COMPONENT writes the change.
   */
  const updateVariantRootStyle = useCallback(
    (componentId: string, variantId: string, patch: Partial<CanvasStyle>, gesture?: string, nodeId?: NodeId) => {
      if (!doc) return
      const variant = findComponent(doc, componentId)?.variants.find((v) => v.id === variantId)
      if (!variant) return
      // `nodeId` reaches past the root to one node inside the main component —
      // an SVG component's lone vector, whose paint IS the component's look.
      const target = nodeId ?? variant.root.id
      const restyle = (node: CanvasNode): CanvasNode =>
        node.id === target
          ? { ...node, style: { ...node.style, ...patch } }
          : isFrameNode(node)
            ? { ...node, children: node.children.map(restyle) }
            : node
      const root = restyle(variant.root) as CanvasFrameNode
      apply(setVariantRoot(doc, componentId, variantId, root), coalesceGesture(gesture && `variant:${variantId}:${target}:${gesture}`))
    },
    [doc, apply, coalesceGesture],
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
      // signature that still reads `()`.
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
  //
  // Emitting a component's code to hash it is the costliest thing a doc change
  // does, and a drag changes the doc every frame — while leaving every
  // component untouched. So each hash is cached against the component object
  // and the component list it was emitted with (instances name other
  // components), and the set keeps its identity while its contents don't
  // change, so the memoized layer rows reading it don't re-render either.
  const regionHashCache = useRef(new WeakMap<CanvasComponent, { components: CanvasComponent[]; hash: string }>())
  const lastDirty = useRef<Set<string>>(new Set())
  const dirtyComponentIds = useMemo(() => {
    if (!doc) return lastDirty.current
    const dirty = new Set<string>()
    for (const component of doc.components) {
      if (!component.filePath) continue
      let cached = regionHashCache.current.get(component)
      if (!cached || cached.components !== doc.components) {
        const ctx = {
          filePath: component.filePath,
          components: doc.components,
          filePathFor: (id: string) => findComponent(doc, id)?.filePath,
        }
        cached = { components: doc.components, hash: hashContent(emitRegionBody(component, ctx)) }
        regionHashCache.current.set(component, cached)
      }
      if (cached.hash !== component.lastWrittenHash) dirty.add(component.id)
    }
    const prev = lastDirty.current
    if (prev.size === dirty.size && [...dirty].every((id) => prev.has(id))) return prev
    lastDirty.current = dirty
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

  // ── Requests left on the board by an AI (/frame, /component) ──
  //
  // The canvas CLI (tools/agentSkills/vendor/canvas.mjs) writes new frames
  // straight into the board file; the external-change watcher reloads them.
  // What it can't do is run the emitters — those live here — so a frame it
  // wants as a component carries a `request`, and this effect carries it out:
  // promote (writing the code into .components/), then bring it into view.
  const handledRequests = useRef(new Set<NodeId>())
  useEffect(() => {
    if (!doc) return
    const pending = doc.nodes.find((n) => n.request && !handledRequests.current.has(n.id))
    if (!pending?.request) return
    handledRequests.current.add(pending.id)
    const { request } = pending
    const base = updateNode(doc, pending.id, { request: undefined })
    const done = () => {
      if (request.focus) focusNode(pending.id, base)
    }
    const frame = findNode(base, pending.id)
    if (request.component && frame && isFrameNode(frame)) {
      promoteFrame(base, frame, { name: request.component.name, format: request.component.format })
        .then(() => {
          onFilesChangedRef.current?.()
          done()
        })
        .catch((e) => {
          apply(base)
          setError(`Couldn't make “${frame.name}” a component: ${e instanceof Error ? e.message : String(e)}`)
        })
    } else {
      apply(base)
      setSelectedIds(new Set([pending.id]))
      done()
    }
  }, [doc, apply, promoteFrame, focusNode])

  const resetZoom = useCallback(() => {
    const camera: Camera = { ...panZoom.getCamera(), k: 1 }
    panZoom.setCamera(camera)
  }, [panZoom])

  // ── Linked components (pasted from another board — see model/clipboard.ts) ──

  /** The selection, when it is a link to a canvas component, resolved to that component. */
  const selectedLinked = useMemo(() => {
    if (!singleSelected || !isExternalNode(singleSelected)) return null
    return linked.get(normalizeRelPath(singleSelected.filePath)) ?? null
  }, [singleSelected, linked])

  /** Sets one prop (or variant choice) on this use of a linked component — the call site's own value, not the component's default. */
  const setLinkedPropValue = useCallback(
    (id: NodeId, name: string, value: CanvasPropValue | undefined) => {
      if (!doc) return
      const node = findNode(doc, id)
      if (!node || !isExternalNode(node)) return
      const propValues = { ...(node.propValues ?? {}) }
      if (value === undefined) delete propValues[name]
      else propValues[name] = value
      apply(updateNode(doc, id, { propValues: Object.keys(propValues).length > 0 ? propValues : undefined }))
    },
    [doc, apply],
  )

  /** Replaces the selected link with an editable local copy of the component's current tree. */
  const detachSelectedLinked = useCallback(() => {
    if (!doc || !singleSelected || !isExternalNode(singleSelected) || !selectedLinked) return
    const { nodes, components } = detachedCopy(doc, singleSelected, selectedLinked.component, selectedLinked.components)
    let next = components.length > 0 ? { ...doc, components: [...doc.components, ...components] } : doc
    next = replaceNodeById(next, singleSelected.id, nodes[0])
    apply(next)
    setSelectedIds(new Set([nodes[0].id]))
  }, [doc, singleSelected, selectedLinked, apply])

  /** Opens the board that owns a linked component and selects its main component's first use there. */
  const openMainComponent = useCallback(
    async (filePath: string) => {
      const owner = linked.get(normalizeRelPath(filePath))
      if (!owner) return
      const target = owner.ownerDocId === doc?.id ? doc : await openDoc(owner.ownerDocId)
      if (!target) return
      const instance = instancesOf(target, owner.component.id)[0]
      if (instance) {
        setSelectedIds(new Set([instance.id]))
        focusNode(instance.id, target)
      }
    },
    [linked, doc, openDoc, focusNode],
  )

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
        // While editing points, Delete removes the selected anchors, not the path.
        if (editingVectorIdRef.current) {
          if (!deleteSelectedHandle()) deleteSelectedPoints()
          return
        }
        // Backspace while drawing takes back the last anchor placed.
        if (penRef.current) {
          const points = penRef.current.points.slice(0, -1)
          setPen(points.length > 0 ? { points } : null)
          if (points.length === 0) penCursor.set(null)
          return
        }
        deleteSelected()
        return
      }
      if ((e.key === 'Enter' || e.key === 'Escape') && editingVectorIdRef.current) {
        e.preventDefault()
        // Escape first lets go of the selected anchors, then of editing — Figma's two-step.
        if (e.key === 'Escape' && selectedPointsRef.current.size > 0) setSelectedPoints(new Set())
        else exitVectorEdit()
        return
      }
      if (editingVectorIdRef.current) {
        if (mod && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          selectAllPoints()
          return
        }
        const stepPx = e.shiftKey ? 10 : 1
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-stepPx, 0],
          ArrowRight: [stepPx, 0],
          ArrowUp: [0, -stepPx],
          ArrowDown: [0, stepPx],
        }
        if (arrows[e.key]) {
          e.preventDefault()
          nudgeSelectedPoints(...arrows[e.key])
          return
        }
      }
      // Enter or Escape ends a pen path, left open — Figma's keys for it.
      if ((e.key === 'Enter' || e.key === 'Escape') && penRef.current) {
        e.preventDefault()
        finishPen(false)
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
      // Figma's shape and pen keys.
      if (e.key === 'r' && !mod) setTool('rectangle')
      if (e.key === 'o' && !mod) setTool('ellipse')
      if (e.key === 'p' && !mod) setTool('pen')
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
      if (!(e.ctrlKey || e.metaKey)) insertPreview.set(null)
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
    finishPen,
    deleteSelectedPoints,
    deleteSelectedHandle,
    exitVectorEdit,
    selectAllPoints,
    nudgeSelectedPoints,
    penCursor,
    insertPreview,
  ])

  /** The live marquee/draw rect in board space, for the overlay to paint. */
  const previewRect = useMemo(() => {
    if (!drag || (drag.kind !== 'draw' && drag.kind !== 'marquee' && drag.kind !== 'point-marquee')) return null
    return drag.kind === 'draw'
      ? drawRect(drag.originBoard, drag.currentBoard, !!drag.shift, !!drag.alt)
      : normalizeRect(drag.originBoard, drag.currentBoard)
  }, [drag])

  return {
    // data
    docs,
    doc,
    /** Components pasted in from other boards, resolved for live rendering. */
    linked,
    selectedLinked,
    setLinkedPropValue,
    detachSelectedLinked,
    openMainComponent,
    closeBoard,
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
    orientedOf,
    pathHint,
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
    /** Set when the selection is a piece on an along-path frame — the inspector explains what it owns. */
    selectionPathPiece: (() => {
      if (!doc || !singleSelected) return null
      const parent = findParent(doc, singleSelected.id)
      if (!isOnPath(parent, singleSelected)) return null
      const template = singleSelected.repeatOf ? findNode(doc, singleSelected.repeatOf) : null
      const run = parent!.children.filter((c) => c.id === (template?.id ?? singleSelected.id) || c.repeatOf === (template?.id ?? singleSelected.id))
      return { isCopy: !!template, templateName: template?.name ?? singleSelected.name, runLength: run.length }
    })(),
    canGroup: selectedIds.size >= 1,
    canPattern,
    patternSelected,
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
    startRotate,
    startPathSlide,
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
    updateVariantRootStyle,
    pen,
    penCursor,
    insertPreview,
    vectorEdit,
    pointSelection,
    setSelectedPointType,
    setSelectedPointRadius,
    editingVectorId,
    enterVectorEdit,
    exitVectorEdit,
    startPointDrag,
    canMakeSvgComponent: svgCandidate !== null,
    makeSvgComponent,
    updateNodeFont,
    imageSources,
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
 * content belongs to its template (model/pathPattern.ts), so editing any piece
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
