import { useState } from 'react'
import type { SavedPlan } from './graph/types'

export interface DeletePlanModalProps {
  plan: SavedPlan
  onClose: () => void
  onDeletePlan: (id: string, opts?: { deleteFiles?: boolean }) => void
  onDeleted: () => void
}

export function useDeletePlanViewModel({ plan, onClose, onDeletePlan, onDeleted }: DeletePlanModalProps) {
  const [submitting, setSubmitting] = useState(false)

  const remove = (deleteFiles: boolean) => {
    setSubmitting(true)
    onDeletePlan(plan.id, { deleteFiles })
    onDeleted()
  }

  return { plan, submitting, remove, onClose }
}
