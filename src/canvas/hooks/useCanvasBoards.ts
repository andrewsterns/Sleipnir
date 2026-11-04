// A board's life on disk: the board list, opening, creating, renaming and
// deleting boards, the debounced autosave, the camera remembered per machine,
// the staged component files that follow the board, and reloading when the
// board changes outside Sleipnir. The ViewModel owns the board's edit history;
// this hook only reads and replaces it.
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { isPlanningWatchAvailable } from '../../platform/iPlanningWatch'
import { createWorkspaceFile, deleteWorkspacePath, readWorkspaceFile } from '../../platform/sleipnirApi'
import { registerPendingWrite } from '../../app/pendingWrites'
import type { Camera } from './panZoomMath'
import type { PanZoomHandle } from './usePanZoom'
import { createDoc } from '../../document/doc'
import { emitComponentFile, emitRegionBody } from '../emit/react'
import { boardFolderName, normalizeRelPath, parentDir } from '../../document/paths'
import { relinkRelocated } from '../../document/relink'
import { syncPlacements } from '../../document/placement'
import { resolvePlanes } from '../../modeling/scene3d/planeRefs'
import { diffStagedFiles, stagedFilesOf } from '../io/stagedFiles'
import { ensureStagingTsconfig } from '../io/stagingTsconfig'
import { commit, initHistory, reset, type History } from '../../document/undo'
import { findComponent, updateComponent } from '../../document/variants'
import {
  deleteDoc,
  deleteStagedFile,
  findRelocatedComponentFiles,
  hashContent,
  listDocs,
  loadDoc,
  pruneEmptyFolder,
  saveDoc,
  serializeDoc,
  sweepOrphanStagedFiles,
} from '../io/store'
import type { CanvasComponent, CanvasDoc, CanvasDocSummary, NodeId } from '../../document/types'

const AUTOSAVE_MS = 400

const CAMERA_SAVE_MS = 300

/**
 * Where you were looking is yours, not the project's.
 *
 * Boards are committed (see io/store.ts), and the camera used to ride along
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

export interface CanvasBoardsOptions {
  activeProjectPath: string | null | undefined
  /** The open board — the present of the ViewModel's history. */
  doc: CanvasDoc | null
  /** The open board as it is now, for work that finishes after an await. */
  docRef: MutableRefObject<CanvasDoc | null>
  setHistory: Dispatch<SetStateAction<History | null>>
  setSelectedIds: Dispatch<SetStateAction<Set<NodeId>>>
  setError: Dispatch<SetStateAction<string | null>>
  panZoom: PanZoomHandle
  camera: Camera
  onFilesChangedRef: MutableRefObject<(() => void) | undefined>
}

export function useCanvasBoards({
  activeProjectPath,
  doc,
  docRef,
  setHistory,
  setSelectedIds,
  setError,
  panZoom,
  camera,
  onFilesChangedRef,
}: CanvasBoardsOptions) {
  const [docs, setDocs] = useState<CanvasDocSummary[]>([])
  const [loading, setLoading] = useState(true)

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
  }, [docRef, setError])

  // The same loss on the way out: File ▸ Save Project copies the folder and a
  // window close tears this view down, both possibly inside the debounce.
  useEffect(() => registerPendingWrite(flushSave), [flushSave])

  const refreshDocs = useCallback(async () => {
    try {
      setDocs(await listDocs())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [setError])

  /**
   * Flags components whose file vanished while the app wasn't looking.
   *
   * In-app moves relink themselves (see document/relink.ts), but a move or delete
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
      const { doc: marked, relocated } = await markVanishedComponents(raw)
      // A board saved before 2D and 3D shared one position may disagree; the placement wins.
      const loaded = resolvePlanes(syncPlacements(null, marked))
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
    [panZoom, markVanishedComponents, activeProjectPath, flushSave, setError, setHistory, setSelectedIds],
  )

  /** Closes the open board without opening another — its last tab was closed. */
  const closeBoard = useCallback(async () => {
    await flushSave()
    setHistory(null)
    setSelectedIds(new Set())
  }, [flushSave, setHistory, setSelectedIds])

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
    [refreshDocs, flushSave, setHistory, setSelectedIds],
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
    [doc, refreshDocs, onFilesChangedRef, setHistory],
  )

  const renameBoard = useCallback((name: string) => {
    setHistory((h) => (h ? commit(h, { ...h.present, name, updatedAt: Date.now() }) : h))
    // Through setHistory rather than apply, so the autosave has to be told.
    dirty.current = true
  }, [setHistory])

  /**
   * A board's folder follows its name: once a rename settles, every component
   * file still in the old board folder moves to the new one (content as-is —
   * only the folder changes). Files filed elsewhere by hand stay put. A file
   * whose destination is already taken stays where it is rather than
   * overwrite anything.
   */
  // The folder this board's files are actually in — updated only once a move
  // starts, so an edit landing mid-wait can't make a rename look already done.
  const settledFolderRef = useRef<{ id: string; folder: string } | null>(null)
  useEffect(() => {
    if (!doc) return
    const folder = boardFolderName(doc.name)
    const settled = settledFolderRef.current
    if (!settled || settled.id !== doc.id) {
      settledFolderRef.current = { id: doc.id, folder }
      return
    }
    if (settled.folder === folder) return
    // Wait for the name to settle — typing a new name shouldn't move files per keystroke.
    const timer = setTimeout(async () => {
      const from = settled.folder
      settledFolderRef.current = { id: doc.id, folder }
      const moves: { id: string; from: string; to: string }[] = []
      for (const component of doc.components) {
        if (!component.filePath) continue
        const root = normalizeRelPath(component.componentRoot)
        const oldPrefix = `${root}/${from}/`
        if (!component.filePath.startsWith(oldPrefix)) continue
        moves.push({ id: component.id, from: component.filePath, to: `${root}/${folder}/${component.filePath.slice(oldPrefix.length)}` })
      }
      const moved: typeof moves = []
      for (const move of moves) {
        try {
          const { content } = await readWorkspaceFile(move.from)
          await createWorkspaceFile(move.to, content)
          await deleteWorkspacePath(move.from)
          await pruneEmptyFolder(parentDir(move.from))
          moved.push(move)
        } catch {
          // Destination taken or the file is gone — leave this one where it is.
        }
      }
      if (moved.length === 0) return
      setHistory((h) => {
        if (!h || h.present.id !== doc.id) return h
        let next = h.present
        for (const move of moved) next = updateComponent(next, move.id, { filePath: move.to })
        return commit(h, next, true)
      })
      dirty.current = true
      onFilesChangedRef.current?.()
    }, 600)
    return () => clearTimeout(timer)
  }, [doc, onFilesChangedRef, setHistory])

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
  }, [doc, setError])

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
  // The `.canvas` invariant (see io/stagedFiles.ts): a component on the
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
      // editors can type-check it (see io/stagingTsconfig.ts). Once per
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
  }, [doc, onFilesChangedRef])

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
      const read = await loadDoc(doc.id)
      if (!read) return
      const fresh = resolvePlanes(syncPlacements(null, read))
      const freshHash = hashContent(serializeDoc({ ...fresh, camera: undefined }))
      const ourHash = hashContent(serializeDoc({ ...doc, camera: undefined }))
      // Our own autosave echoing back — nothing to do.
      if (freshHash === ourHash) return
      if (dirty.current) return // local edits in flight win; the next save reconciles
      setHistory(reset(fresh))
      await refreshDocs()
    })
  }, [doc, refreshDocs, setHistory])

  return {
    docs,
    loading,
    /** Hash of the content last written, so an autosave echoing back isn't taken for an outside change. */
    lastWrittenHash,
    /** Set by every edit; the autosave clears it once the board is written. */
    dirty,
    refreshDocs,
    openDoc,
    closeBoard,
    createBoard,
    removeBoard,
    renameBoard,
  }
}
