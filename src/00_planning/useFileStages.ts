import { useEffect, useMemo, useState } from 'react'
import { getNotes } from './api/sleipnirApi'
import { useStages, setStage, getStage } from './stagesStore'
import { fileStageKey } from './graph/stages'
import type { NodeStage } from './graph/types'

// A workspace-relative filePath → sprint-stage lookup, built from the planning
// data: nodes carry a `filePath`, the stage overlay (shared app-wide via
// stagesStore) is keyed by node id, so joining the two gives "what planning
// stage is the node this file backs at?". Files with no backing node fall
// back to a synthetic `file:<path>` overlay entry instead — see
// fileStageKey above — so status works for every file, plan or no plan. Lets
// any file list (git Source Control, the Workspace/Research file tree) show
// and set a file's planning status the same way the node list does — and,
// since stagesStore is a single shared cache, a status set from Planning's
// node card or from here shows up in every other mounted view immediately.
//
// The filePath→id join re-fetches once per mount, and again whenever
// `reloadToken` changes; the stage values themselves are always live via
// stagesStore. Planning data is optional: a failed fetch (e.g. no project
// open) just yields an empty map, never an error.
export function useFileStages(reloadToken?: unknown) {
  const [nodeIdByPath, setNodeIdByPath] = useState<Map<string, string>>(new Map())
  const stagesById = useStages()

  useEffect(() => {
    let cancelled = false
    getNotes()
      .then((notes) => {
        if (cancelled) return
        const ids = new Map<string, string>()
        for (const n of notes.nodes) {
          if (n.filePath) ids.set(n.filePath, n.id)
        }
        setNodeIdByPath(ids)
      })
      .catch(() => { /* planning data optional — leave the map empty */ })
    return () => { cancelled = true }
  }, [reloadToken])

  const stages = useMemo(() => {
    const next = new Map<string, NodeStage>()
    for (const [path, id] of nodeIdByPath) {
      const stage = stagesById[id]
      if (stage) next.set(path, stage)
    }
    for (const [key, stage] of Object.entries(stagesById)) {
      if (!key.startsWith('file:')) continue
      const path = key.slice('file:'.length)
      if (!next.has(path)) next.set(path, stage)
    }
    return next
  }, [nodeIdByPath, stagesById])

  const setStatus = async (path: string, stage: NodeStage | null) => {
    const id = nodeIdByPath.get(path) ?? fileStageKey(path)
    await setStage(id, stage)
  }

  return { stages, setStatus }
}

// The one automatic transition: code saved into a Proposed (or untagged) file
// moves it to In Progress. In Review and Done are only ever set deliberately,
// so they're never touched here. Resolves the same node-id-or-`file:<path>` key
// as setStatus above, so the change shows in Planning, Canvas and Source Control.
export function shouldPromote(current: NodeStage | undefined): boolean {
  return (current ?? 'proposed') === 'proposed'
}

// Batch form — one getNotes() for the filePath→id join however many paths, so
// the git reconciler (useStatusReconciler) doesn't refetch per file.
// `plannedOnly` skips files no plan node backs (used for untracked git files,
// so a fresh repo doesn't flip every file at once).
export async function promoteFileStages(paths: string[], { plannedOnly = false } = {}) {
  if (paths.length === 0) return
  try {
    const notes = await getNotes().catch(() => null)
    const idByPath = new Map<string, string>()
    for (const n of notes?.nodes ?? []) if (n.filePath) idByPath.set(n.filePath, n.id)
    for (const path of paths) {
      const nodeId = idByPath.get(path)
      if (plannedOnly && !nodeId) continue
      const id = nodeId ?? fileStageKey(path)
      if (shouldPromote(await getStage(id))) await setStage(id, 'in-progress')
    }
  } catch {
    /* status is best-effort — never block saving a file */
  }
}

export function promoteFileStage(path: string) {
  return promoteFileStages([path])
}
