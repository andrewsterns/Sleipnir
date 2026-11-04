import { useEffect, useState } from 'react'
import { getSkillText, saveSkillText } from '../../platform/sleipnirApi'
import type { SkillInfo, SkillText } from '../graph/types'

export interface SkillCardProps {
  skill: SkillInfo
  onOpenFile?: (path: string) => void
  /** After a save: the skills scan is read again. */
  onSaved: () => void
}

// A skill on its card: what it does, which agents have it, what it costs, and
// its text, editable in place. Saving a person's own skill writes its file;
// saving a built-in writes the project's override, and Sleipnir rewrites every
// agent's command from it.
export function useSkillCardViewModel({ skill, onSaved }: SkillCardProps) {
  const [loaded, setLoaded] = useState<SkillText | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    setError(null)
    setSavedNote(null)
    getSkillText(skill.id)
      .then((text) => {
        if (cancelled) return
        setLoaded(text)
        setDraft(text.text)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [skill.id])

  const dirty = !!loaded && draft !== loaded.text
  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const { file, written } = await saveSkillText(skill.id, draft)
      setLoaded((prev) => (prev ? { ...prev, text: draft, file, overridden: prev.builtin || prev.overridden } : prev))
      setSavedNote(written.length > 1 ? `Saved — ${written.length} agent files rewritten` : `Saved to ${file}`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return {
    loaded,
    draft,
    setDraft: (text: string) => {
      setDraft(text)
      setSavedNote(null)
    },
    dirty,
    save,
    saving,
    error,
    savedNote,
    revert: () => loaded && setDraft(loaded.text),
  }
}
