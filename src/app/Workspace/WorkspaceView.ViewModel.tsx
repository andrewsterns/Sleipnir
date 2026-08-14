import { useEffect, useState } from 'react'
import { getWorkspaceInfo, openWorkspace, cloneRepo } from '../../00_planning/api/sleipnirApi'
import type { WorkspaceInfo } from '../../00_planning/api/PlatformAPI'

// `onProjectOpened`, when given, fires after a successful chooseFolder() —
// lets App.tsx (the single owner of activeProject/recentProjects, see its
// own onOpenProject/onOpenRecentProject) stay in sync even when the switch
// was triggered from this view's own "Choose/Switch Folder…" button rather
// than the File menu.
export function useWorkspaceViewModel(onProjectOpened?: (info: WorkspaceInfo) => void) {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getWorkspaceInfo()
      .then(setInfo)
      .catch(() => setInfo({ root: null, name: null }))
      .finally(() => setLoading(false))
  }, [])

  const chooseFolder = async () => {
    setError(null)
    const result = await openWorkspace()
    if (!result) return
    if ('error' in result) {
      setError(result.error)
      return
    }
    setInfo(result)
    onProjectOpened?.(result)
  }

  const [cloning, setCloning] = useState(false)
  // Clone a repo, then open it as this project (same repoint path as
  // chooseFolder). The native destination picker happens in the main process;
  // `null` means canceled (or not the Electron shell).
  const cloneAndOpen = async (url: string) => {
    setError(null)
    setCloning(true)
    try {
      const result = await cloneRepo(url.trim())
      if (!result) return
      if ('error' in result) { setError(result.error); return }
      setInfo(result)
      onProjectOpened?.(result)
    } finally {
      setCloning(false)
    }
  }

  return { info, loading, error, chooseFolder, cloneAndOpen, cloning }
}
