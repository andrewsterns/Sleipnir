// The Canvas's state, wired to the editor's hooks: gestures (hooks/useBoardPointer),
// path editing, layer commands, components, clipboard, 3D tools and shortcuts each
// live in hooks/, with the pure tool and geometry helpers in boardEditing.ts. This
// file owns the shared state and passes it in. Imports no view —
// tools/codemod-lint.mjs enforces that a ViewModel never imports its own View.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePanZoom } from './hooks/usePanZoom'
import { useMeasuredRects } from './hooks/useMeasuredRects'
import { cameraToFit, type Camera } from './hooks/panZoomMath'
import {
  isLayoutPositioned,
  parentFlowOf,
} from '../document/layout'
import {
  boardMatrixOf,
  boardRectOf,
  orientedBoxOf,
  quadOfNode,
  planeRectOf,
  replaceNodeById,
  findNode,
  findParent,
  moveNode,
  reparentNode,
  setRect,
  setStyle,
  updateNode,
} from '../document/doc'
import {
  type Guide,
} from '../document/align'
import {
  findComponent,
  instancesOf,
} from '../document/variants'
import { canRedo, canUndo, commit, redo, undo, type History } from '../document/undo'
import {
  findBoardForFilePath,
  listDocs,
} from './io/store'
import {
  createWorkspaceBinaryFile,
  listWorkspaceDir,
} from '../platform/sleipnirApi'
import type { FileTreeNode } from '../platform/PlatformAPI'
import { boardFolderName, normalizeRelPath } from '../document/paths'
import {
  detachedCopy,
} from './io/clipboard'
import { useCanvasBoards } from './hooks/useCanvasBoards'
import { syncPlacements } from '../document/placement'
import { mergePlaneEdit, planeEditView } from '../modeling/scene3d/planeEdit'
import { planeGuides } from '../modeling/scene3d/sketchPlane'
import { frontMatrix } from '../document/frontView'
import { projectedSolidsOf, type ProjectedSurface } from '../modeling/scene3d/sceneMeshes'
import { pruneObjects } from '../document/objects'
import { resolvePlanes } from '../modeling/scene3d/planeRefs'
import { isRigid, angleOf, apply as applyMat, normalizeDegrees, type OrientedBox } from '../document/rotation'
import { isOnPath, isPathFlow, pathStartOf, reflowPaths } from '../document/pathFlow'
import { addComponentFolder, buildComponentTree, removeComponentFolder } from '../document/componentTree'
import {
  isExternalNode,
  isFrameNode,
  isInstanceNode,
  isTextNode,
  type CanvasDoc,
  type CanvasNode,
  type CanvasPropValue,
  type CanvasRect,
  type CanvasStyle,
  type CanvasTextStyle,
  type NodeId,
} from '../document/types'
import { CANVAS_ASSETS_DIR, IMAGE_FILE_RE, type CanvasTool, drawRect, type DragState, ALL_RESIZE_HANDLES, FLOW_RESIZE_HANDLES, type DropIntent, normalizeRect, editTargetOf } from './boardEditing'
import { useComponentEditing } from './hooks/useComponentEditing'
import { usePathEditing } from './hooks/usePathEditing'
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts'
import { useModelingTools } from './hooks/useModelingTools'
import { useCanvasClipboard } from './hooks/useCanvasClipboard'
import { useLayerCommands } from './hooks/useLayerCommands'
import { useBoardPointer } from './hooks/useBoardPointer'

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
  const [error, setError] = useState<string | null>(null)
  /**
   * The container the user has drilled into by double-clicking, for the cases
   * `drillScope` below cannot infer one from the selection.
   */
  const [scopeId, setScopeId] = useState<NodeId | null>(null)
  // The text layer being typed into on the board (double-click a text layer).
  const [editingTextId, setEditingTextId] = useState<NodeId | null>(null)
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

  /** The board as it really is: what's saved, undone and shown in 3D. */
  const present = history?.present ?? null
  /**
   * A layer placed in 3D being drawn on face on (scene3d/planeEdit.ts). While
   * set, the board — and everything here that reads `doc` — works on a view
   * holding just that layer, flat; apply() merges edits back into `present`.
   */
  const [planeEditId, setPlaneEditId] = useState<NodeId | null>(null)
  const planeEditRef = useRef(planeEditId)
  planeEditRef.current = planeEditId
  const doc = useMemo(() => planeEditView(present, planeEditId), [present, planeEditId])
  // For work that finishes after an await (an image paste, a save flushed on a
  // board switch): it must see the board as it is THEN, not as it was captured.
  const docRef = useRef(doc)
  docRef.current = doc
  const presentRef = useRef(present)
  presentRef.current = present

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
   * and document/layout.ts for why measuring is the only correct answer once a
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
   * (document/rotation.ts). Selection rings and handles are drawn from this, so a
   * rotated node's outline turns with it.
   */
  const orientedOf = useCallback(
    (id: NodeId): OrientedBox | null => (doc ? orientedBoxOf(doc, id, measured) : null),
    [doc, measured],
  )

  /** Solids the 2D board draws as the front camera sees them, per top-level layer (scene3d/sceneMeshes.ts). */
  const projectedSolids = useMemo(() => (doc ? projectedSolidsOf(doc) : new Map<NodeId, ProjectedSurface[]>()), [doc])

  /**
   * Blueprint lines on the open plane from every other placed layer
   * (scene3d/sketchPlane.ts), so a Top or Side sketch lines up with the rest of
   * the scene. The open layer is in the board's view; the others are read from
   * the real board, each in its own plane.
   */
  const planeGuideLines = useMemo(() => {
    if (!present || !doc || !planeEditId) return []
    const inView = (id: NodeId) => !!findNode(doc, id)
    return planeGuides(present, planeEditId, (id) => (inView(id) ? boardRectOf(doc, id, measured) : planeRectOf(present, id)))
  }, [present, doc, planeEditId, measured])

  /** A node's rect in its own plane's space, for the 3D view to lay layers out by (see planeRectOf). */
  const planeRect = useCallback((id: NodeId) => (doc ? planeRectOf(doc, id, measured) : null), [doc, measured])

  /** A node's board corners when a plane turned in 3D squashes or shears it on the board (see quadOfNode). */
  const quadOf = useCallback((id: NodeId) => (doc ? quadOfNode(doc, id, measured) : null), [doc, measured])

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

  // ── Board list, autosave, staged files and outside changes (hooks/useCanvasBoards.ts) ──
  // The real board, never the plane-edit view: this is what gets saved.
  const { docs, loading, dirty, refreshDocs, openDoc, closeBoard, createBoard, removeBoard, renameBoard } = useCanvasBoards({
    activeProjectPath,
    doc: present,
    docRef: presentRef,
    setHistory,
    setSelectedIds,
    setError,
    panZoom,
    camera,
    onFilesChangedRef,
  })

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

  // ── Edits ── every change goes through here; the autosave (useCanvasBoards) writes what it marks dirty.
  const apply = useCallback((next: CanvasDoc, coalesce = false) => {
    // Every change re-flows any along-path frames, so editing the curve or the
    // children moves them in the same undo step (see document/pathFlow.ts).
    const flowed = reflowPaths(next)
    // Plane edit works on a view of the board; merge it back first. Then a placed
    // layer's 2D position and its 3D one follow each other (document/placement.ts).
    setHistory((h) => {
      if (!h) return h
      const edit = planeEditRef.current
      const merged = edit ? mergePlaneEdit(h.present, flowed, edit) : flowed
      // Deleting a sketch takes the features built from it (document/objects.ts).
      // And every sketch held to a plane stands back on it (scene3d/planeRefs.ts).
      return commit(h, resolvePlanes(pruneObjects(syncPlacements(h.present, merged))), coalesce)
    })
    dirty.current = true
  }, [dirty])

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

  const { pen, setPen, penRef, penCursor, finishPen, coalesceGesture, editingVectorId, selectedPoints, setSelectedPoints, setSelectedHandle, insertPreview, editingNode, editingVectorIdRef, selectedPointsRef, exitVectorEdit, enterVectorEdit, startPointDrag, vectorEdit, deleteSelectedPoints, deleteSelectedHandle, pointSelection, setSelectedPointType, setSelectedPointRadius, nudgeSelectedPoints, selectAllPoints, applyDragFrame } = usePathEditing({ apply, doc, drag, measured, panZoom, selectedIds, setDrag, setSelectedIds, setTool, tool })

  // ── 3D: solids, placement, sketch planes ──
  const { setLayerSolid, placeLayer, setLayersHidden, setSketchPlane, enterPlaneEdit, exitPlaneEdit, enterPlaneEditOfSelection, newSketchRef, createSketch, sketchOnFace } = useModelingTools({ apply, coalesceGesture, doc, planeEditId, planeEditRef, present, presentRef, selectedIds, setPlaneEditId, setScopeId, setSelectedIds })

  // ── Pointer interaction on the board ──
  const { onBoardPointerDown, startMoveDrag, onBoardDoubleClick, startResize, startPathSlide, startRotate, onBoardPointerMove, onBoardPointerUp, onBoardPointerLeave } = useBoardPointer({ apply, applyDragFrame, doc, drag, dropIntent, editingNode, editingVectorId, enterPlaneEdit, enterVectorEdit, exitVectorEdit, finishPen, insertPreview, measured, panZoom, pathSlideStart, penCursor, penRef, projectedSolids, scopeId, selectedIds, selectedPoints, setDrag, setDropIntent, setEditingTextId, setGuides, setHoverId, setPen, setScopeId, setSelectedHandle, setSelectedIds, setSelectedPoints, setTool, snapDisabled, tool })

  // ── Hierarchy & alignment ──
  const { groupSelected, canPattern, patternSelected, ungroupSelected, alignSelected, distributeSelected, duplicateSelected, selectParent, deleteSelected, removeNode, removeComponent, removeComponentFile, flattenComponentToFrame, setComponentPath } = useLayerCommands({ apply, doc, measured, selectedIds, selectedNodes, setScopeId, setSelectedIds, singleSelected })

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
  const { linked } = useCanvasClipboard({ apply, deleteSelected, doc, docRef, docs, importImageFile, measured, panZoom, selectedIds, setError, setSelectedIds })

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
  const { promoteFrame, promoteSelectedToComponent, svgCandidate, makeSvgComponent, promoteAndApproveComponent, setInstanceVariant, triggerNextVariant, addComponentVariant, removeComponentVariant, renameComponentVariant, patchComponent, replaceVariantRoot, updateVariantRootStyle, approveComponent, renameComponent, pushComponent, dirtyComponentIds, selectedComponent, selectedVariant, setTextContent, endTextEdit, canFlattenSelectedComponent, unmakeSelectedComponent } = useComponentEditing({ apply, coalesceGesture, doc, editingTextId, measured, selectedNodes, setEditingTextId, setSelectedIds, singleSelected })

  // ── History ──
  const doUndo = useCallback(() => {
    setHistory((h) => {
      if (!h) return h
      dirty.current = true
      return undo(h)
    })
  }, [dirty])

  const doRedo = useCallback(() => {
    setHistory((h) => {
      if (!h) return h
      dirty.current = true
      return redo(h)
    })
  }, [dirty])

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

  // A new sketch has landed: open it face on if the board sees it at a slant or edge-on, then frame it.
  useEffect(() => {
    const id = newSketchRef.current
    const node = id ? present?.nodes.find((n) => n.id === id) : undefined
    if (!id || !node) return
    const faceOn = !node.space || isRigid(frontMatrix(node.space))
    if (!faceOn && planeEditId !== id) {
      enterPlaneEdit(id)
      return
    }
    newSketchRef.current = null
    setSelectedIds(new Set([id]))
    focusNode(id, doc)
  }, [present, doc, planeEditId, enterPlaneEdit, focusNode, newSketchRef])

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

  // ── Linked components (pasted from another board — see io/clipboard.ts) ──

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
  useCanvasShortcuts({ deleteSelected, deleteSelectedHandle, deleteSelectedPoints, doRedo, doUndo, duplicateSelected, editingVectorIdRef, enterPlaneEditOfSelection, exitPlaneEdit, exitVectorEdit, finishPen, groupSelected, insertPreview, nudgeSelected, nudgeSelectedPoints, penCursor, penRef, planeEditRef, resetZoom, selectAllPoints, selectParent, selectedPointsRef, setPen, setScopeId, setSelectedIds, setSelectedPoints, setTool, snapDisabled, ungroupSelected, zoomToFit })

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
    unmakeSelectedComponent,
    editingTextId,
    setTextContent,
    endTextEdit,
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
    quadOf,
    /** The real board — the 3D view and anything that must see every layer read this, not `doc`, while a plane is open. */
    present,
    planeEditId,
    setLayerSolid,
    placeLayer,
    setLayersHidden,
    setSketchPlane,
    createSketch,
    sketchOnFace,
    planeGuideLines,
    enterPlaneEdit,
    exitPlaneEdit,
    planeRect,
    projectedSolids,
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
    renameComponent,
    boardFolder: doc ? boardFolderName(doc.name) : null,
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
