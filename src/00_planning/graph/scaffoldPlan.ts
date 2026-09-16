// What approving a plan step writes: each of the step's planned files rendered
// from the project's own templates (graph/templates), with imports spliced in
// the same way the Add Node modal wires a batch (graph/importAdapters) — to
// sibling files in the same step, and to planned files earlier steps already
// wrote to disk. Plus the reverse: existing files (built by earlier steps) that
// are planned to import one of this step's files, and so need that import added.
//
// Pure: file existence comes in as `existingPaths`, and `pathFor` supplies each
// planned file's current (possibly just-edited) path.
import type { LanguageId, NodeRole } from './architectures'
import { adapterForLanguage } from './importAdapters'
import { ROLE_SUFFIX } from './naming'
import { renderTemplate } from './templates'
import type { GraphEdge, GraphNode } from './types'

export interface StepFileDraft {
  /** The planned-file node this renders. */
  nodeId: string
  path: string
  role: NodeRole
  language?: LanguageId
  content: string
}

/** An existing file that should gain an import of `importPath`. */
export interface ImportUpdate {
  path: string
  importPath: string
  label: string
  role?: NodeRole
  language?: LanguageId
}

// "src/cart/cartViewModel.tsx" as a view-model -> "cartViewModel" minus its
// role suffix -> "cartViewModel" -> "cart": the label templates and import
// adapters derive symbol names from (they append the role suffix themselves).
export function featureLabel(path: string, role?: NodeRole): string {
  let name = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
  const suffix = role ? ROLE_SUFFIX[role] : ''
  if (suffix && name.length > suffix.length && name.toLowerCase().endsWith(suffix.toLowerCase())) {
    name = name.slice(0, -suffix.length)
  }
  return name
}

export function renderStepFiles({
  stepId,
  plannedNodes,
  edges,
  pathFor,
  existingPaths,
}: {
  stepId: string
  /** Every planned-file node of the plan (earlier and later steps included). */
  plannedNodes: GraphNode[]
  edges: GraphEdge[]
  pathFor: (node: GraphNode) => string
  existingPaths: Set<string>
}): { files: StepFileDraft[]; importUpdates: ImportUpdate[] } {
  const inStep = plannedNodes.filter((n) => n.stepId === stepId)
  const stepIds = new Set(inStep.map((n) => n.id))
  const byId = new Map(plannedNodes.map((n) => [n.id, n]))
  const borrows = edges.filter((e) => e.kind === 'borrows')

  const files = inStep.map((node): StepFileDraft => {
    const role = node.role ?? 'node'
    const path = pathFor(node)
    let content = node.language ? renderTemplate(node.language, role, featureLabel(path, role)).content : ''
    const adapter = node.language ? adapterForLanguage(node.language) : null
    if (adapter) {
      for (const e of borrows) {
        if (e.source !== node.id) continue
        const target = byId.get(e.target)
        if (!target) continue
        const targetPath = pathFor(target)
        // Only import what will exist: a sibling written now, or a file on disk.
        // A file planned by a later step gets its import when that step lands.
        if (!stepIds.has(target.id) && !existingPaths.has(targetPath)) continue
        content = adapter.insertImport(content, path, targetPath, featureLabel(targetPath, target.role), target.role)
      }
    }
    return { nodeId: node.id, path, role, ...(node.language ? { language: node.language } : {}), content }
  })

  const importUpdates: ImportUpdate[] = []
  for (const e of borrows) {
    if (!stepIds.has(e.target) || stepIds.has(e.source)) continue
    const source = byId.get(e.source)
    const target = byId.get(e.target)
    if (!source || !target) continue
    const sourcePath = pathFor(source)
    if (!existingPaths.has(sourcePath)) continue
    const importPath = pathFor(target)
    importUpdates.push({
      path: sourcePath,
      importPath,
      label: featureLabel(importPath, target.role),
      ...(target.role ? { role: target.role } : {}),
      ...(source.language ? { language: source.language } : {}),
    })
  }

  return { files, importUpdates }
}
