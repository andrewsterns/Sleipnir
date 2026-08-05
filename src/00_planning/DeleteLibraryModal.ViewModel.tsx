import { useState } from 'react'
import { deleteLibrary } from './api/sleipnirApi'
import type { LibraryEntry } from './graph/types'

export interface DeleteLibraryModalProps {
  library: LibraryEntry
  onDeleted: (id: string) => void
  onClose: () => void
}

export function useDeleteLibraryViewModel({ library, onDeleted, onClose }: DeleteLibraryModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = confirmText.trim() === library.label && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await deleteLibrary(library.id)
      onDeleted(library.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return { confirmText, setConfirmText, canSubmit, error, submitting, submit, onClose, library }
}
