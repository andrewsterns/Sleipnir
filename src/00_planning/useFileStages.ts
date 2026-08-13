import { useEffect, useState } from 'react'
import { getNotes, getNodeStages } from './api/sleipnirApi'
import type { NodeStage } from './graph/types'

// A workspace-relative filePath → sprint-stage lookup, built from the planning
// data: nodes carry a `filePath`, the stage overlay is keyed by node id, so
// joining the two gives "what planning stage is the node this file backs at?".
// Lets any file list (git Source Control, the Workspace/Research file tree)
// show a file's planning status the same way the node list does.
//
// Fetches once per mount, and again whenever `reloadToken` changes. Files that
// back no node — or a node with no stage set — simply aren't in the map, so
// callers get `undefined` and show nothing. Planning data is optional: a failed
// fetch (e.g. no project open) just yields an empty map, never an error.
export function useFileStages(reloadToken?: unknown): Map<string, NodeStage> {
  const [map, setMap] = useState<Map<string, NodeStage>>(new Map())

  useEffect(() => {
    let cancelled = false
    Promise.all([getNotes(), getNodeStages()])
      .then(([notes, { stages }]) => {
        if (cancelled) return
        const next = new Map<string, NodeStage>()
        for (const n of notes.nodes) {
          const stage = n.filePath ? stages[n.id] : undefined
          if (n.filePath && stage) next.set(n.filePath, stage)
        }
        setMap(next)
      })
      .catch(() => { /* planning data optional — leave the map empty */ })
    return () => { cancelled = true }
  }, [reloadToken])

  return map
}
