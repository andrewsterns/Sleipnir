import { useMemo, useState, useEffect } from 'react'
import type { CanvasDoc, CanvasRect, NodeId } from '../../document/types'
import { sceneTriangles, sweepsAlong } from '../scene3d/sceneMeshes'
import { sceneBounds, type ViewName, DISPLAY_MODES, type DisplayMode } from './cameraViews'

export interface Viewport3DProps {
  doc: CanvasDoc
  selectedIds: ReadonlySet<NodeId>
  /** null clears the selection; `additive` toggles the layer in it. */
  onSelect: (id: NodeId | null, additive: boolean) => void
  /**
   * G / R / S and the handles (modalTransform.ts): each step of a live move
   * previewed as a whole doc worked out from where it began, then kept or put
   * back — one undo step either way. Keeping a move of picked elements hands
   * back the pick as it stands in the edited parts.
   */
  onModal?: { preview: (doc: CanvasDoc) => void; end: (keep: boolean, elements?: import('./selectionModes').ElementRef[]) => void }
  /**
   * Where a layer really sits in its plane (measured), when an auto-layout
   * parent placed it — the 3D view lays children out the same way the 2D
   * board does. In the board's space for the front plane, in the plane's own
   * under a layer placed in 3D (document/doc.ts planeRectOf). Falls back to each
   * layer's own rect.
   */
  rectOf?: (id: NodeId) => CanvasRect | null
  /**
   * Picking a face to sketch on (+ Sketch › On a face): a click on a solid
   * reports its layer and which triangle of that layer's mesh it hit, instead
   * of selecting. Esc or Cancel calls onCancelPick.
   */
  pickingFace?: boolean
  /** Bumped by the toolbox's Extrude with one face picked: starts extruding that face. */
  extrudeSignal?: number
  /** Which handles show on the selection — set from the toolbox; G / R / S work whichever it is. */
  gizmoMode?: GizmoMode
  /** Bumped by the top bar's Fit (and Ctrl+1) to frame the whole scene. */
  fitSignal?: number
  /** How parts are drawn — set in the right panel with nothing selected. Absent: shaded. */
  display?: DisplayMode
  /** Sketch mode: face the open sketch's plane under the board laid over this view (SketchInScene.tsx). */
  sketchView?: import('./cameraViews').SketchView | null
  /** A layer the board draws instead — the open sketch. */
  hideId?: string | null
  /** Object mode picks layers; edit mode (Tab, 1 / 2 / 3) picks the parts' points, edges or faces (selectionModes.ts). */
  selectMode?: import('./selectionModes').SelectMode
  onSelectMode?: (mode: import('./selectionModes').SelectMode) => void
  /** The picked points, edges or faces. */
  elements?: import('./selectionModes').ElementRef[]
  /** A click in edit mode: what it landed on (null: nothing), Shift adding. */
  onPickElement?: (ref: import('./selectionModes').ElementRef | null, additive: boolean) => void
  /** B's box: what it caught, Shift adding. */
  onBoxSelect?: (refs: import('./selectionModes').ElementRef[], additive: boolean) => void
  /** True when the click was on an object's face (and so is used up). */
  onPickFace?: (layerId: NodeId, triangle: number) => boolean
  onCancelPick?: () => void
}

export type GizmoMode = 'translate' | 'rotate' | 'scale'

const DISPLAY_KEY = 'sleipnir.viewport.display'

/** The display mode remembered on this machine — a view setting, like the camera. */
export function readDisplay(): DisplayMode {
  try {
    const stored = localStorage.getItem(DISPLAY_KEY)
    return DISPLAY_MODES.some((m) => m.id === stored) ? (stored as DisplayMode) : 'shaded'
  } catch {
    return 'shaded'
  }
}

export function storeDisplay(next: DisplayMode): void {
  try {
    localStorage.setItem(DISPLAY_KEY, next)
  } catch {
    // Storage unavailable — the mode just isn't remembered.
  }
}

export function useViewport3DViewModel({ doc, selectedIds, gizmoMode = 'translate', fitSignal = 0, display = 'shaded' }: Viewport3DProps) {
  const [view, setView] = useState<ViewName>('perspective')
  const mode = gizmoMode
  // Bumped to re-frame the camera on the scene (FIT, or a view switch).
  const [framing, setFraming] = useState(0)
  const bounds = useMemo(() => sceneBounds(doc), [doc])
  const sweeps = useMemo(() => sweepsAlong(doc), [doc])
  const triangles = useMemo(() => sceneTriangles(doc), [doc])
  const selected = selectedIds

  // The top bar's Fit: one for both views.
  useEffect(() => {
    if (fitSignal) setFraming((f) => f + 1)
  }, [fitSignal])

  const chooseView = (next: ViewName) => {
    setView(next)
    setFraming((f) => f + 1)
  }

  return {
    view,
    chooseView,
    display,
    mode,
    framing,
    fit: () => setFraming((f) => f + 1),
    bounds,
    sweeps,
    triangles,
    selected,
  }
}
