// The Canvas's 3D editing: giving layers solids, placing them in space, standing
// sketches on planes and faces, and opening a placed layer's plane face on. The
// geometry itself lives in src/modeling; this hook applies it to the open board.
// Split out of CanvasView.ViewModel.tsx.

import { useCallback, useEffect, useRef } from 'react'
import {
  createFrameNode,
  findNode,
  updateNode,
} from '../../document/doc'
import { planeEditTarget } from '../../modeling/scene3d/planeEdit'
import type { Placement3D, SolidSpec } from '../../document/sceneTypes'
import { featureOf, setSolidOf, type FaceName, type PlaneRef } from '../../document/objects'
import { addSketch, attachSketch, nextSketchName } from '../../modeling/scene3d/planeRefs'
import { bodyOf, faceAt, partTriangle } from '../../modeling/geometry/body'
import {
  type CanvasDoc,
  type CanvasNode,
  type NodeId,
} from '../../document/types'
import { editTargetOf } from '../boardEditing'

export interface ModelingToolsDeps {
  apply: (next: CanvasDoc, coalesce?: boolean) => void
  coalesceGesture: (gesture: string | undefined) => boolean
  doc: CanvasDoc | null
  planeEditId: string | null
  planeEditRef: React.MutableRefObject<string | null>
  present: CanvasDoc | null
  presentRef: React.MutableRefObject<CanvasDoc | null>
  selectedIds: Set<string>
  setPlaneEditId: React.Dispatch<React.SetStateAction<string | null>>
  setScopeId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function useModelingTools({ apply, coalesceGesture, doc, planeEditId, planeEditRef, present, presentRef, selectedIds, setPlaneEditId, setScopeId, setSelectedIds }: ModelingToolsDeps) {
  /** Gives a layer a solid, changes it or takes it away — as the feature of an Object that builds it (document/objects.ts). */
  const setLayerSolid = useCallback(
    (id: NodeId, solid: SolidSpec | undefined, gesture?: string) => {
      if (!doc) return
      const target = editTargetOf(doc, id)
      apply(setSolidOf(doc, target, solid, findNode(doc, target)?.name), coalesceGesture(gesture))
    },
    [doc, apply, coalesceGesture],
  )

  /**
   * Places a top-level layer by hand (the gizmo, the inspector's position and
   * rotation): a sketch held to a plane lets go of it and is placed freely.
   * `undefined` puts it back on the front plane, facing the board.
   */
  const placeLayer = useCallback(
    (id: NodeId, space: Placement3D | undefined, gesture?: string) => {
      if (!doc) return
      const node = findNode(doc, id)
      const held = !!node?.sketch && node.sketch.plane.kind !== 'custom'
      const patch: Partial<CanvasNode> = !space ? { space: undefined, sketch: undefined } : held ? { space, sketch: { plane: { kind: 'custom' } } } : { space }
      apply(updateNode(doc, id, patch), coalesceGesture(gesture))
    },
    [doc, apply, coalesceGesture],
  )

  /** Hides or shows several layers at once — one undo step. */
  const setLayersHidden = useCallback(
    (ids: NodeId[], hidden: boolean) => {
      if (!doc) return
      apply(ids.reduce((next, id) => updateNode(next, id, { hidden }), doc))
    },
    [doc, apply],
  )

  /** Stands a top-level layer on a plane as a sketch (scene3d/planeRefs.ts). */
  const setSketchPlane = useCallback(
    (id: NodeId, plane: PlaneRef, gesture?: string) => {
      if (!doc) return
      apply(attachSketch(doc, id, plane), coalesceGesture(gesture))
    },
    [doc, apply, coalesceGesture],
  )

  // ── Plane edit (scene3d/planeEdit.ts) ──
  const enterPlaneEdit = useCallback((id: NodeId) => {
    if (!planeEditTarget(presentRef.current, id)) return
    setPlaneEditId(id)
    setScopeId(null)
    setSelectedIds(new Set([id]))
  }, [presentRef, setPlaneEditId, setScopeId, setSelectedIds])

  const exitPlaneEdit = useCallback(() => {
    const id = planeEditRef.current
    setPlaneEditId(null)
    setScopeId(null)
    setSelectedIds(id ? new Set([id]) : new Set())
  }, [planeEditRef, setPlaneEditId, setScopeId, setSelectedIds])

  /** Opens the plane of the one selected top-level layer placed in 3D, if that's what's selected. */
  const enterPlaneEditOfSelection = useCallback(() => {
    const only = selectedIds.size === 1 ? [...selectedIds][0] : null
    if (!only || !planeEditTarget(presentRef.current, only)) return false
    enterPlaneEdit(only)
    return true
  }, [selectedIds, presentRef, enterPlaneEdit])

  // ── + Sketch (scene3d/planeRefs.ts addSketch) ──
  /** A sketch just added, waiting for the board to have it: then it opens face on (or, facing the board already, is selected and framed). */
  const newSketchRef = useRef<NodeId | null>(null)

  /** A new sketch frame on a plane — Front, Top, Right, an offset or an object's face. */
  const createSketch = useCallback(
    (plane: PlaneRef) => {
      const base = presentRef.current
      if (!base) return
      const node = createFrameNode({ x: 0, y: 0, w: 240, h: 160 }, nextSketchName(base))
      const next = addSketch(base, plane, node)
      if (!next) return
      // Out of any open plane first, synchronously: apply() would otherwise merge the whole board in as that plane's view.
      planeEditRef.current = null
      setPlaneEditId(null)
      newSketchRef.current = node.id
      apply(next)
    },
    [apply, planeEditRef, presentRef, setPlaneEditId],
  )

  /**
   * The face of an object a click on its layer's 3D mesh landed on (triangle
   * `triangle` of that mesh), by its lasting name — or null on a flat layer.
   */
  const faceAtLayer = useCallback((layerId: NodeId, triangle: number): { objectId: string; face: FaceName } | null => {
    const base = presentRef.current
    const found = base ? featureOf(base, layerId) : null
    if (!base || !found) return null
    const body = bodyOf(base, found.object)
    const at = partTriangle(body, found.feature.id, layerId, triangle)
    const face = at === null ? null : faceAt(body, at)
    return face ? { objectId: found.object.id, face: face.face.name } : null
  }, [presentRef])

  /** + Sketch › On a face: a sketch on the face a 3D click picked. False when the click wasn't on an object's face. */
  const sketchOnFace = useCallback(
    (layerId: NodeId, triangle: number) => {
      const hit = faceAtLayer(layerId, triangle)
      if (!hit) return false
      createSketch({ kind: 'face', objectId: hit.objectId, face: hit.face })
      return true
    },
    [faceAtLayer, createSketch],
  )

  // The edited layer gone (undone, deleted, un-placed) or another board opened: the plane closes.
  useEffect(() => {
    if (planeEditId && !planeEditTarget(present, planeEditId)) setPlaneEditId(null)
  }, [present, planeEditId, setPlaneEditId])
  return { setLayerSolid, placeLayer, setLayersHidden, setSketchPlane, enterPlaneEdit, exitPlaneEdit, enterPlaneEditOfSelection, newSketchRef, createSketch, sketchOnFace }
}
