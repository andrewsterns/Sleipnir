import { useEffect, useState } from 'react'
import {
  previewRefactor,
  applyRefactor,
  getCurrentArchitecture,
  type Architecture,
  type RefactorPlan,
} from '../../../00_planning/api/sleipnirApi'
import { RefactorPanelProps } from './iRefactorPanel'

export const ARCHITECTURE_OPTIONS: { value: Architecture; label: string }[] = [
  { value: 'atomic', label: 'Atomic' },
  { value: 'mvvm', label: 'MVVM' },
  { value: 'mvc', label: 'MVC' },
  { value: 'mvp', label: 'MVP' },
]

export function useRefactorPanelViewModel({ onApplied }: RefactorPanelProps) {
  const [current, setCurrent] = useState<Architecture>('atomic')
  const [previewTarget, setPreviewTarget] = useState<Architecture | null>(null)
  const [plan, setPlan] = useState<RefactorPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    getCurrentArchitecture().then(({ current }) => setCurrent(current)).catch(() => {})
  }, [])

  // Selecting an architecture from the dropdown never applies it directly —
  // it opens a preview of what WOULD change, requiring an explicit Apply.
  const openPreview = async (target: Architecture) => {
    setError(null)
    setPlan(null)
    setPreviewTarget(target)
    try {
      const p = await previewRefactor(target)
      setPlan(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const cancel = () => {
    setPreviewTarget(null)
    setPlan(null)
    setError(null)
  }

  const confirmApply = async () => {
    if (!previewTarget) return
    setIsApplying(true)
    try {
      await applyRefactor(previewTarget)
      setCurrent(previewTarget)
      cancel()
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsApplying(false)
    }
  }

  return {
    current,
    options: ARCHITECTURE_OPTIONS,
    previewTarget,
    plan,
    error,
    isApplying,
    openPreview,
    cancel,
    confirmApply,
  }
}
