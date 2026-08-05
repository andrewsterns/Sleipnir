import { useState } from 'react'
import { setPreviewConfig } from './api/sleipnirApi'
import type { PreviewConfig, PreviewConfigEntry } from './api/sleipnirApi'

export interface PreviewConfigModalProps {
  /** Repo-relative folder path being configured (matches FolderBrowserView's scope:'repo' convention). */
  path: string
  onConfigured: (config: PreviewConfigEntry) => void
  onClose: () => void
}

export function usePreviewConfigViewModel({ path, onConfigured, onClose }: PreviewConfigModalProps) {
  const [commandLine, setCommandLine] = useState('npm run dev')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = commandLine.trim().length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const [command, ...args] = commandLine.trim().split(/\s+/)
      const config: PreviewConfig = { command, args }
      const { config: saved } = await setPreviewConfig(path, config)
      onConfigured(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return { path, commandLine, setCommandLine, canSubmit, error, submitting, submit, onClose }
}
