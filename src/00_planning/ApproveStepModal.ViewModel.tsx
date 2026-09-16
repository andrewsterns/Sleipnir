import { useEffect, useMemo, useState } from 'react'
import {
  appendPlanGeneratedFiles,
  createWorkspaceFile,
  readWorkspaceFile,
  setNodeStatus,
  updatePlannedFilePath,
  writeWorkspaceFile,
} from './api/sleipnirApi'
import { setStage } from './stagesStore'
import { fileStageKey } from './graph/stages'
import { adapterForLanguage } from './graph/importAdapters'
import { renderStepFiles } from './graph/scaffoldPlan'
import { getWorkspaceScan, invalidateWorkspaceListing, invalidateWorkspacePaths } from './graph/workspaceScanCache'
import type { GraphEdge, GraphNode } from './graph/types'

export interface ApproveStepModalProps {
  step: GraphNode
  /** Every planned-file node of the step's plan. */
  plannedNodes: GraphNode[]
  edges: GraphEdge[]
  /** The saved plan whose tab this is — its generatedFiles records what gets written. */
  planId?: string
  onClose: () => void
  /** After the files are written and the step is approved. */
  onApproved: (writtenPaths: string[]) => void
}

// Why a path can't be written, or null. Mirrors the backend's rules for
// planned files so problems show inline before anything is attempted.
function pathProblem(path: string, existing: Set<string>, duplicate: boolean): string | null {
  if (!path) return 'A path is required'
  if (path === '.planning' || path.startsWith('.planning/')) return "Planned files can't go in .planning/"
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) return 'Use a path inside the project'
  if (existing.has(path)) return 'A file already exists here'
  if (duplicate) return 'Two files share this path'
  return null
}

// The one place a plan step's planned files become real files. Only ever run
// from the modal's explicit confirm — the CLIs and the in-app chat can declare
// files but never reach this.
export function useApproveStepViewModel({ step, plannedNodes, edges, planId, onApproved }: ApproveStepModalProps) {
  const stepFiles = useMemo(() => plannedNodes.filter((n) => n.stepId === step.id), [plannedNodes, step.id])
  const [paths, setPaths] = useState<Record<string, string>>(() =>
    Object.fromEntries(stepFiles.map((f) => [f.id, f.filePath ?? ''])),
  )
  const [contentEdits, setContentEdits] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getWorkspaceScan()
      .then((scan) => setExisting(new Set(scan.files)))
      .catch(() => {})
  }, [])

  const draft = useMemo(
    () =>
      renderStepFiles({
        stepId: step.id,
        plannedNodes,
        edges,
        pathFor: (n) => (n.stepId === step.id ? (paths[n.id] ?? n.filePath ?? '').trim() : n.filePath ?? ''),
        existingPaths: existing,
      }),
    [step.id, plannedNodes, edges, paths, existing],
  )

  const files = draft.files.map((f) => {
    const duplicate = draft.files.filter((g) => g.path === f.path).length > 1
    return {
      ...f,
      rawPath: paths[f.nodeId] ?? f.path,
      content: contentEdits[f.nodeId] ?? f.content,
      contentEdited: f.nodeId in contentEdits,
      problem: pathProblem(f.path, existing, duplicate),
    }
  })
  const canSubmit = files.length > 0 && files.every((f) => !f.problem) && !submitting

  const setPath = (nodeId: string, value: string) => setPaths((prev) => ({ ...prev, [nodeId]: value }))
  const setContent = (nodeId: string, value: string) => setContentEdits((prev) => ({ ...prev, [nodeId]: value }))
  const resetContent = (nodeId: string) =>
    setContentEdits((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const written: string[] = []
    const updated: string[] = []
    try {
      // 1. Paths edited in the modal move their placeholders first (new ids).
      const idFor = new Map<string, string>()
      for (const f of files) {
        const node = stepFiles.find((n) => n.id === f.nodeId)
        if (node && f.path !== node.filePath) {
          const { node: moved } = await updatePlannedFilePath(node.id, f.path)
          idFor.set(node.id, moved.id)
        }
      }
      // 2. Create each file — create-only, so nothing is ever overwritten.
      for (const f of files) {
        await createWorkspaceFile(f.path, f.content)
        written.push(f.path)
      }
      // 3. Existing files built by earlier steps gain their imports of these.
      for (const u of draft.importUpdates) {
        const adapter = u.language ? adapterForLanguage(u.language) : null
        if (!adapter) continue
        const { content } = await readWorkspaceFile(u.path)
        const next = adapter.insertImport(content, u.path, u.importPath, u.label, u.role)
        if (next !== content) {
          await writeWorkspaceFile(u.path, next)
          updated.push(u.path)
        }
      }
      // 4. Approved, and everything it produced is now In Progress.
      await setNodeStatus(step.id, 'approved')
      await setStage(step.id, 'in-progress')
      for (const f of files) {
        await setStage(idFor.get(f.nodeId) ?? f.nodeId, 'in-progress')
        await setStage(fileStageKey(f.path), 'in-progress')
      }
      if (planId) await appendPlanGeneratedFiles(planId, written).catch(() => {})
      onApproved(written)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(written.length ? `${message} — already created: ${written.join(', ')}` : message)
    } finally {
      invalidateWorkspacePaths([...written, ...updated])
      invalidateWorkspaceListing()
      setSubmitting(false)
    }
  }

  return {
    step,
    files,
    edits: step.editsPaths ?? [],
    importUpdates: draft.importUpdates,
    expandedId,
    setExpandedId,
    setPath,
    setContent,
    resetContent,
    canSubmit,
    submitting,
    error,
    submit,
  }
}
