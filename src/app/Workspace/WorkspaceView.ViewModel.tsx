import { useEffect, useState } from 'react'
import { getWorkspaceInfo, openWorkspace } from '../../00_planning/api/sleipnirApi'
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

  return { info, loading, error, chooseFolder }
}
