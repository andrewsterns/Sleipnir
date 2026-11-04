import { useState } from 'react'
import type { SavedPlan } from './graph/types'

export interface DeletePlanModalProps {
  plan: SavedPlan
  onClose: () => void
  onDeletePlan: (id: string, opts?: { deleteFiles?: boolean; deleteNodes?: boolean }) => void | Promise<void>
  onDeleted: () => void
}

export function useDeletePlanViewModel({ plan, onClose, onDeletePlan, onDeleted }: DeletePlanModalProps) {
  const [submitting, setSubmitting] = useState(false)

  // The plan record and its graph nodes (and their edges) always go together —
  // a deleted plan never leaves orphan nodes behind. `withFiles` additionally
  // removes the workspace files it created; without it they stay on disk.
  const remove = async (withFiles: boolean) => {
    setSubmitting(true)
    try {
      await onDeletePlan(plan.id, { deleteNodes: true, deleteFiles: withFiles })
    } finally {
      // Runs even if the delete throws, so the modal always closes; onDeleted
      // reloads the graph (see PlanningView) now that the backend has committed.
      onDeleted()
    }
  }

  return { plan, submitting, remove, onClose }
}
