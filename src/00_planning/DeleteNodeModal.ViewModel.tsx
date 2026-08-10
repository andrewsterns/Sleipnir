import { useState } from 'react'
import type { GraphNode } from './graph/types'

export interface DeleteNodeModalProps {
  node: GraphNode
  onClose: () => void
  /** Permanently deletes the node (see PlanningView.ViewModel's deleteNode). `deleteFile` also removes the scaffolded node's real Workspace file — only offered when the node has one. */
  onDelete: (node: GraphNode, opts?: { deleteFile?: boolean }) => Promise<void> | void
  onDeleted: () => void
}

export function useDeleteNodeViewModel({ node, onClose, onDelete, onDeleted }: DeleteNodeModalProps) {
  const [submitting, setSubmitting] = useState(false)

  const remove = async (deleteFile: boolean) => {
    setSubmitting(true)
    try {
      await onDelete(node, { deleteFile })
      onDeleted()
    } catch {
      // Unlike a plan delete (a synchronous local state update), this awaits a
      // backend unlink/delete that can fail — re-enable the buttons so the
      // modal isn't left frozen mid-delete rather than silently stuck.
      setSubmitting(false)
    }
  }

  return { node, submitting, remove, onClose }
}
