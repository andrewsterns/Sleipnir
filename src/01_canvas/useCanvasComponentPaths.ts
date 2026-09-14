import { useEffect, useState } from 'react'
import { listDocs } from './model/store'

/**
 * Every filePath with a written component, across every board — for "Show
 * in Canvas" existence checks outside Canvas itself (the Workspace tree,
 * Planning's node list). Mirrors usePlanNodeLinks' shape/best-effort
 * conventions, just sourced from listDocs() instead of getNotes().
 */
export function useCanvasComponentPaths(reloadToken?: unknown): Set<string> {
  const [paths, setPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    listDocs()
      .then((docs) => {
        if (cancelled) return
        setPaths(new Set(docs.flatMap((d) => d.componentFilePaths)))
      })
      .catch(() => { /* no project open, or unreadable — just no matches */ })
    return () => { cancelled = true }
  }, [reloadToken])

  return paths
}
