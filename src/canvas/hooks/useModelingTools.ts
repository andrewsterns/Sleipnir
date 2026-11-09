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
import { unlinkSketch } from '../../document/placements'
import { planeEditTarget } from '../../modeling/scene3d/planeEdit'
import type { Placement3D, SolidSpec } from '../../document/sceneTypes'
import { featureOf, moveFeature, removeFeature, removeObject, renameObject, repickFeatureInput, setPartPlacement, setSolidOf, updateFeature, type FaceName, type Feature, type FeatureId, type PlaneRef } from '../../document/objects'
import { addSketch, attachSketch, nextSketchName } from '../../modeling/scene3d/planeRefs'
import { bodyOf, faceAt, partTriangle } from '../../modeling/geometry/body'
import {
  type CanvasDoc,
  type CanvasNode,
  type NodeId,
} from '../../document/types'
import { editTargetOf } from '../boardEditing'
import { sweepPair, type SolidTool } from '../board/toolbox'
import { addStarterShape, type StarterShape } from '../../modeling/scene3d/starterShapes'
import { placeSketchIn } from '../../modeling/commands/modelCommands'

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
      const patch: Partial<CanvasNode> = !space ? { space: undefined, sketch: undefined } : held ? { space, sketch: { link: node.sketch?.link, plane: { kind: 'custom' } } } : { space }
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
   * Place: a Sketch document, linked, standing on `plane`. On Front (the
   * default) it stands on the ground to the right of everything already
   * there, as a starter shape does, so it never lands inside a part; on
   * another plane, in the middle of it. Selected rather than opened — its
   * layers are the sketch's, edited there.
   */
  const placeSketch = useCallback(
    (source: CanvasDoc, plane: PlaneRef = { kind: 'default', plane: 'front' }, frame?: NodeId) => {
      const base = presentRef.current
      if (!base) return false
      // One implementation with the agent's `place` command (modeling/commands/modelCommands.ts).
      const placed = placeSketchIn(base, source, plane, frame)
      if (!placed) return false
      planeEditRef.current = null
      setPlaneEditId(null)
      apply(placed.doc)
      setSelectedIds(new Set([placed.id]))
      return true
    },
    [apply, planeEditRef, presentRef, setPlaneEditId, setSelectedIds],
  )

  /** Unlink: a placed sketch becomes a local one, its layers kept as they are. */
  const unlinkPlaced = useCallback(
    (id: NodeId) => {
      const base = presentRef.current
      if (base) apply(unlinkSketch(base, id))
    },
    [apply, presentRef],
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

  /** Re-pick face: a sketch stands on the face a 3D click picked, in place of the one it lost. False off a part's face. */
  const repickFace = useCallback(
    (id: NodeId, layerId: NodeId, triangle: number) => {
      const hit = faceAtLayer(layerId, triangle)
      const base = presentRef.current
      if (!hit || !base) return false
      apply(attachSketch(base, id, { kind: 'face', objectId: hit.objectId, face: hit.face }))
      return true
    },
    [faceAtLayer, presentRef, apply],
  )

  /** Re-pick sketch / path: a broken feature reads another layer in place of the one deleted. */
  const repickFeature = useCallback(
    (featureId: FeatureId, input: 'sketch' | 'path', layerId: NodeId) => {
      const base = presentRef.current
      if (base) apply(repickFeatureInput(base, featureId, input, layerId))
    },
    [presentRef, apply],
  )

  /** Changes a feature's own settings — its smoothness — one undo step per pick. */
  const editFeature = useCallback(
    (featureId: FeatureId, patch: Partial<Feature>) => {
      const base = presentRef.current
      if (base) apply(updateFeature(base, featureId, patch))
    },
    [presentRef, apply],
  )

  /** Renames a part — one undo step however many keys it took. */
  const renamePart = useCallback(
    (objectId: string, name: string) => {
      const base = presentRef.current
      if (base) apply(renameObject(base, objectId, name), coalesceGesture(`part-name:${objectId}`))
    },
    [presentRef, apply, coalesceGesture],
  )

  /** Deletes one feature — and its part, when it was the last. */
  const deleteFeature = useCallback(
    (featureId: FeatureId) => {
      const base = presentRef.current
      if (base) apply(removeFeature(base, featureId))
    },
    [presentRef, apply],
  )

  /** Drags a feature to another place in its part's list; the part rebuilds in that order. */
  const reorderFeature = useCallback(
    (featureId: FeatureId, index: number) => {
      const base = presentRef.current
      if (base) apply(moveFeature(base, featureId, index))
    },
    [presentRef, apply],
  )

  /** Deletes a part from its row's menu: its features go, its sketches stay. */
  const deletePart = useCallback(
    (objectId: string) => {
      const base = presentRef.current
      if (base) apply(removeObject(base, objectId))
    },
    [presentRef, apply],
  )

  /** Puts a part moved as a whole back where its sketches stand it. */
  const resetPartPlacement = useCallback(
    (objectId: string) => {
      const base = presentRef.current
      if (base) apply(setPartPlacement(base, objectId, undefined))
    },
    [presentRef, apply],
  )

  /** Turns one of an object's features off or on — Onshape's suppress. */
  const setFeatureHidden = useCallback(
    (featureId: string, hidden: boolean) => {
      if (!doc) return
      apply(updateFeature(doc, featureId, { hidden }))
    },
    [doc, apply],
  )

  // ── The toolbox's 3D groups (src/canvas/board/toolbox.ts) ──

  /**
   * Extrude, Revolve or Sweep on the selection — as the feature of an Object.
   * An extrude starts as deep as the shape is small across, so a square makes
   * a cube; a revolve spins all the way round about the shape's middle.
   */
  const applySolidTool = useCallback(
    (tool: SolidTool) => {
      if (!doc) return
      if (tool === 'sweep') {
        const pair = sweepPair(doc, selectedIds)
        if (pair) setLayerSolid(pair.profile, { kind: 'sweep', pathId: pair.path })
        return
      }
      const only = selectedIds.size === 1 ? findNode(doc, [...selectedIds][0]) : null
      if (!only) return
      if (tool === 'extrude') setLayerSolid(only.id, { kind: 'extrude', depth: Math.max(0.01, Math.round(Math.min(only.rect.w, only.rect.h)) / 100) })
      if (tool === 'revolve') setLayerSolid(only.id, { kind: 'revolve', axis: 'center', angle: 360, steps: 48 })
    },
    [doc, selectedIds, setLayerSolid],
  )

  /** A starter shape from the toolbox — a sketch and its feature — selected. */
  const addStarter = useCallback(
    (shape: StarterShape) => {
      const base = presentRef.current
      if (!base) return
      // Out of any open plane first, synchronously, as createSketch does.
      planeEditRef.current = null
      setPlaneEditId(null)
      const added = addStarterShape(base, shape)
      apply(added.doc)
      setSelectedIds(new Set([added.id]))
    },
    [apply, planeEditRef, presentRef, setPlaneEditId, setSelectedIds],
  )

  // The edited layer gone (undone, deleted, un-placed) or another board opened: the plane closes.
  useEffect(() => {
    if (planeEditId && !planeEditTarget(present, planeEditId)) setPlaneEditId(null)
  }, [present, planeEditId, setPlaneEditId])
  return { setLayerSolid, placeLayer, setLayersHidden, setSketchPlane, enterPlaneEdit, exitPlaneEdit, enterPlaneEditOfSelection, newSketchRef, createSketch, placeSketch, unlinkPlaced, sketchOnFace, repickFace, repickFeature, deleteFeature, renamePart, editFeature, applySolidTool, addStarter, setFeatureHidden, reorderFeature, deletePart, resetPartPlacement }
}
