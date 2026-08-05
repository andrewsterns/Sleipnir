import { useEffect, useState } from 'react'
import { getWorkspaceInfo, openWorkspace } from '../../00_planning/api/sleipnirApi'
import type { WorkspaceInfo } from '../../00_planning/api/PlatformAPI'

export function useWorkspaceViewModel() {
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
  }

  return { info, loading, error, chooseFolder }
}
