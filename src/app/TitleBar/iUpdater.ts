import { useCallback, useEffect, useState } from 'react'

export type UpdateState = 'unsupported' | 'idle' | 'checking' | 'upToDate' | 'downloading' | 'ready' | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** The running app's own version (package.json's, baked in at build time). */
  currentVersion: string
  /** The newer version being downloaded / ready to install. */
  version?: string
  /** Download progress, 0–100 — only while `downloading`. */
  percent?: number
  error?: string
}

export interface UpdaterAPI {
  getStatus: () => Promise<UpdateStatus>
  check: () => Promise<UpdateStatus>
  /** Runs every window's save-on-close prompts, then quits and installs. Resolves false if the user cancelled a prompt (or nothing is ready). */
  install: () => Promise<boolean>
  onStatus: (callback: (status: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    updaterAPI?: UpdaterAPI
  }
}

// No web-transport equivalent — see electron/updater.cjs.
export function isUpdaterAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.updaterAPI
}

/**
 * Live update status for the TitleBar. `check` is the manual Help ▸ Check for
 * Updates path — its result is what the title bar briefly reports back
 * ("Up to date" / "Update check failed"); background checks stay silent unless
 * they find something.
 */
export function useAppUpdate() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [manualResult, setManualResult] = useState<UpdateState | null>(null)

  useEffect(() => {
    const api = window.updaterAPI
    if (!api) return
    let alive = true
    api.getStatus().then((s) => alive && setStatus(s))
    const off = api.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    if (!manualResult) return
    const t = setTimeout(() => setManualResult(null), 4000)
    return () => clearTimeout(t)
  }, [manualResult])

  const check = useCallback(async () => {
    const api = window.updaterAPI
    if (!api) return
    const s = await api.check()
    setStatus(s)
    setManualResult(s.state)
  }, [])

  const install = useCallback(() => window.updaterAPI?.install(), [])

  return { status, manualResult, check, install }
}
