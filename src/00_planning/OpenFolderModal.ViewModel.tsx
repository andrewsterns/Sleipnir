import { useState } from 'react'
import { installWidget } from './api/sleipnirApi'
import type { WidgetEntry } from './graph/types'

export interface OpenFolderModalProps {
  /** Repo-root-relative path picked via the File menu's native directory dialog (see App.tsx's onOpenFolder). */
  path: string
  onInstalled: (widget: WidgetEntry) => void
  onClose: () => void
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function useOpenFolderViewModel({ path, onInstalled, onClose }: OpenFolderModalProps) {
  const folderName = basename(path)
  const [label, setLabel] = useState(folderName)
  const [tag, setTag] = useState(folderName.slice(0, 3).toUpperCase())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const id = slugify(label)
  const canSubmit = id.length > 0 && tag.trim().length > 0 && !submitting

  // Mirrors the docker/nx catalog entries in widget-catalog.json: a path
  // under src/ browses via the same listDir/writeFile every other Component
  // Library folder uses (rootScope 'src', editable); anything else falls
  // back to the repo-root-scoped, read-only browsing every other
  // outside-src widget (Docker, Nx) already uses.
  const underSrc = path === 'src' || path.startsWith('src/')
  const root = underSrc ? path.replace(/^src\/?/, '') : path
  const rootScope: 'src' | 'repo' = underSrc ? 'src' : 'repo'

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { widget } = await installWidget({
        id,
        kind: 'folder',
        label: label.trim(),
        tag: tag.trim().toUpperCase(),
        icon: 'folder',
        root,
        rootScope,
        previewStrategy: 'none',
        readOnly: rootScope === 'repo',
        extraFiles: [],
      })
      onInstalled(widget)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return { path, label, setLabel, tag, setTag, id, canSubmit, error, submitting, submit, onClose }
}
