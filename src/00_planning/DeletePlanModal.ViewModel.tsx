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

  // The plan record always goes. `everything` also removes the plan's graph
  // nodes (and their edges) and the workspace files it created; the plain path
  // leaves both in place and just drops the plan grouping.
  const remove = async (everything: boolean) => {
    setSubmitting(true)
    try {
      await onDeletePlan(plan.id, everything ? { deleteFiles: true, deleteNodes: true } : {})
    } finally {
      // Runs even if the delete throws, so the modal always closes; onDeleted
      // reloads the graph (see PlanningView) now that the backend has committed.
      onDeleted()
    }
  }

  return { plan, submitting, remove, onClose }
}
