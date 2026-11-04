// The Canvas's keyboard shortcuts (Figma's keys), plus Ctrl tracking for
// snapping. Split out of CanvasView.ViewModel.tsx; every action comes in from
// the view model, so this file only maps keys to them.

import { useEffect } from 'react'
import type { CanvasTool, PenDraft, ValueStore } from '../boardEditing'

export interface CanvasShortcutsDeps {
  deleteSelected: () => void
  deleteSelectedHandle: () => boolean
  deleteSelectedPoints: () => boolean
  doRedo: () => void
  doUndo: () => void
  duplicateSelected: () => void
  editingVectorIdRef: React.MutableRefObject<string | null>
  enterPlaneEditOfSelection: () => boolean
  exitPlaneEdit: () => void
  exitVectorEdit: () => void
  finishPen: (closed: boolean) => void
  groupSelected: () => void
  insertPreview: ValueStore<{ x: number; y: number } | null>
  nudgeSelected: (dx: number, dy: number) => void
  nudgeSelectedPoints: (dx: number, dy: number) => void
  penCursor: ValueStore<{ x: number; y: number } | null>
  penRef: React.MutableRefObject<PenDraft | null>
  planeEditRef: React.MutableRefObject<string | null>
  resetZoom: () => void
  selectAllPoints: () => void
  selectParent: () => boolean
  selectedPointsRef: React.MutableRefObject<ReadonlySet<number>>
  setPen: React.Dispatch<React.SetStateAction<PenDraft | null>>
  setScopeId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setSelectedPoints: React.Dispatch<React.SetStateAction<ReadonlySet<number>>>
  setTool: React.Dispatch<React.SetStateAction<CanvasTool>>
  snapDisabled: React.MutableRefObject<boolean>
  ungroupSelected: () => void
  zoomToFit: () => void
}

export function useCanvasShortcuts({ deleteSelected, deleteSelectedHandle, deleteSelectedPoints, doRedo, doUndo, duplicateSelected, editingVectorIdRef, enterPlaneEditOfSelection, exitPlaneEdit, exitVectorEdit, finishPen, groupSelected, insertPreview, nudgeSelected, nudgeSelectedPoints, penCursor, penRef, planeEditRef, resetZoom, selectAllPoints, selectParent, selectedPointsRef, setPen, setScopeId, setSelectedIds, setSelectedPoints, setTool, snapDisabled, ungroupSelected, zoomToFit }: CanvasShortcutsDeps) {
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
      // Enter opens the selected placed layer's plane, face on.
      if (e.key === 'Enter' && !planeEditRef.current && enterPlaneEditOfSelection()) {
        e.preventDefault()
        return
      }
      // Escape steps OUT one level before clearing — with deep nesting,
      // "select my parent" is wanted far more often than "select nothing".
      // Past the edited plane's own layer, it closes the plane.
      if (e.key === 'Escape') {
        if (!selectParent()) {
          if (planeEditRef.current) exitPlaneEdit()
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
  }, [enterPlaneEditOfSelection, exitPlaneEdit, doUndo, doRedo, deleteSelected, nudgeSelected, resetZoom, zoomToFit, groupSelected, ungroupSelected, duplicateSelected, selectParent, finishPen, deleteSelectedPoints, deleteSelectedHandle, exitVectorEdit, selectAllPoints, nudgeSelectedPoints, penCursor, insertPreview, editingVectorIdRef, penRef, planeEditRef, setTool, setPen, selectedPointsRef, setSelectedPoints, setSelectedIds, setScopeId, snapDisabled])
  return {  }
}
