import { useEffect, useMemo, useState } from 'react'
import { getNotes } from './api/sleipnirApi'
import { useStages, setStage } from './stagesStore'
import type { NodeStage } from './graph/types'

// Synthetic stages.json key for a file with no backing plan node — lets any
// Workspace file carry a status without requiring it to be scaffolded into
// the planning graph first. Never collides with a real node id (those are
// always `note/...`, `plan/...`; see sleipnir-backend.mjs's id generation).
function fileStageKey(path: string) {
  return `file:${path}`
}

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
