import { useState } from 'react'
import { createLibrary, regenerateGraph, type Architecture, type ScaffoldLanguage } from './api/sleipnirApi'
import type { LibraryKind } from './graph/types'

export interface CreateLibraryModalProps {
  onCreated: (libraryId: string) => void
  onClose: () => void
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function useCreateLibraryViewModel({ onCreated, onClose }: CreateLibraryModalProps) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<LibraryKind>('component')
  const [architecture, setArchitecture] = useState<Architecture>('atomic')
  const [language, setLanguage] = useState<ScaffoldLanguage>('typescript')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const id = slugify(label)
  const canSubmit = id.length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { library } = await createLibrary({ id, kind, label: label.trim(), architecture, language })
      await regenerateGraph()
      onCreated(library.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label,
    setLabel,
    kind,
    setKind,
    architecture,
    setArchitecture,
    language,
    setLanguage,
    id,
    canSubmit,
    error,
    submitting,
    submit,
    onClose,
  }
}
