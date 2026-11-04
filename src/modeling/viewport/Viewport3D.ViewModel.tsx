import { useMemo, useState } from 'react'
import type { CanvasDoc, CanvasRect, NodeId } from '../../document/types'
import type { Placement3D } from '../../document/sceneTypes'
import { sceneTriangles, sweepsAlong } from '../scene3d/sceneMeshes'
import { sceneBounds, type ViewName } from './cameraViews'

export interface Viewport3DProps {
  doc: CanvasDoc
  selectedIds: ReadonlySet<NodeId>
  /** null clears the selection; `additive` toggles the layer in it. */
  onSelect: (id: NodeId | null, additive: boolean) => void
  /** A top-level layer moved, turned or scaled in space by the gizmo. */
  onPlacementChange: (id: NodeId, space: Placement3D) => void
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
  /** True when the click was on an object's face (and so is used up). */
  onPickFace?: (layerId: NodeId, triangle: number) => boolean
  onCancelPick?: () => void
}

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export function useViewport3DViewModel({ doc, selectedIds }: Viewport3DProps) {
  const [view, setView] = useState<ViewName>('perspective')
  const [mode, setMode] = useState<GizmoMode>('translate')
  // Bumped to re-frame the camera on the scene (FIT, or a view switch).
  const [framing, setFraming] = useState(0)
  const bounds = useMemo(() => sceneBounds(doc), [doc])
  const sweeps = useMemo(() => sweepsAlong(doc), [doc])
  const triangles = useMemo(() => sceneTriangles(doc), [doc])
  const selected = selectedIds
  // The gizmo moves a top-level layer's plane; a child is placed by its parent's 2D layout.
  const only = selectedIds.size === 1 ? [...selectedIds][0] : null
  const gizmoTarget = only && doc.nodes.some((n) => n.id === only) ? only : null

  const chooseView = (next: ViewName) => {
    setView(next)
    setFraming((f) => f + 1)
  }

  return {
    view,
    chooseView,
    mode,
    setMode,
    framing,
    fit: () => setFraming((f) => f + 1),
    bounds,
    sweeps,
    triangles,
    selected,
    gizmoTarget,
  }
}
