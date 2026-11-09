import React, { useEffect, useState } from 'react'
import { flushPendingWrites } from '../pendingWrites'

interface DevAPI {
  /** Files in the main process changed since launch; null in a packaged app. */
  dueFiles: () => Promise<string[] | null>
  onDue: (callback: (files: string[]) => void) => () => void
  restart: (session: Record<string, string>) => Promise<void>
}

declare global {
  interface Window {
    devAPI?: DevAPI
  }
}

/** This window's remembered state, to carry across the restart (app/sessionState.ts). */
function sessionToCarry(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith('sleipnir')) out[key] = sessionStorage.getItem(key) ?? ''
    }
  } catch {
    // Storage unavailable: the window just starts fresh.
  }
  return out
}

/**
 * Developing Sleipnir itself: appears when its main process has changed, which
 * hot reload can't apply. One click saves your work, restarts the app, and
 * brings the terminals back with Claude resumed (electron/devRestart.cjs).
 */
export const DevRestartButton: React.FC = () => {
  const [files, setFiles] = useState<string[]>([])
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    const api = window.devAPI
    if (!api) return
    void api.dueFiles().then((due) => setFiles(due ?? []))
    return api.onDue(setFiles)
  }, [])

  if (!files.length) return null
  const restart = async () => {
    setRestarting(true)
    await flushPendingWrites()
    await window.devAPI?.restart(sessionToCarry())
  }
  return (
    <button
      type="button"
      disabled={restarting}
      title={`Sleipnir's main process changed:\n${files.slice(0, 12).join('\n')}${files.length > 12 ? `\n…and ${files.length - 12} more` : ''}\n\nRestarts the app and resumes your terminals.`}
      onClick={() => void restart()}
      style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-1)', background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-control)', padding: '1px 8px', margin: '3px 0 3px 8px', cursor: restarting ? 'default' : 'pointer' }}
    >
      {restarting ? 'Restarting…' : 'Restart to apply'}
    </button>
  )
}
