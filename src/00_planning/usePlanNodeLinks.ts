import { useEffect, useState } from 'react'
import { getNotes } from './api/sleipnirApi'
import type { GraphMapId } from './graph/types'

export interface PlanNodeLink {
  mapId: GraphMapId
  nodeId: string
}

/**
 * filePath -> the plan node that backs it, for "Show in Planning" actions
 * elsewhere in the app (Workspace tree, Canvas layers panel). Same getNotes()
 * source as useFileStages, just keyed for jumping (owning map + node id)
 * rather than for the stage overlay. Best-effort like useFileStages: a
 * failed fetch (no project open) just yields an empty map, never an error.
 */
export function usePlanNodeLinks(reloadToken?: unknown): Map<string, PlanNodeLink> {
  const [links, setLinks] = useState<Map<string, PlanNodeLink>>(new Map())

  useEffect(() => {
    let cancelled = false
    getNotes()
      .then(({ nodes }) => {
        if (cancelled) return
        const next = new Map<string, PlanNodeLink>()
        for (const n of nodes) {
          if (n.filePath) next.set(n.filePath, { mapId: n.map, nodeId: n.id })
        }
        setLinks(next)
      })
      .catch(() => { /* planning data optional — leave the map empty */ })
    return () => { cancelled = true }
  }, [reloadToken])

  return links
}
