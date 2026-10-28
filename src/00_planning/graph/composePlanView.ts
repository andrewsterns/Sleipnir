// What a plan tab draws. In 'plan' mode, just the plan. In 'architecture' mode,
// the project's real architecture (scoped — see architectureScope.ts) with the
// plan laid over it, plus the set of node ids that belong to the plan so the
// canvas can highlight them and dim the rest. 'health' is the same
// architecture under the Health lens (healthLens.ts): the code as it is, so
// no steps or placeholders and nothing dimmed — the lens has its own emphasis.
// In the other modes:
//   - steps, and planned files not yet on disk (placeholders)
//   - planned or asset files that DO exist now: merged into their real
//     architecture node, which inherits their links
//   - files a step edits: linked from the step, highlighted in place
import type { GraphData, GraphEdge, GraphNode } from './types'
import { archId, folderId, folderKeyOf, scopeArchitecture, type ScopeOptions } from './architectureScope'
import type { WorkspaceScan } from './workspaceScanCache'

export type PlanViewMode = 'architecture' | 'health' | 'plan'

export interface PlanView {
  data: GraphData
  /** Node ids that belong to the plan. Empty when nothing should be dimmed. */
  overlay: Set<string>
}

export function composePlanView(
  planGraph: GraphData,
  planId: string,
  scan: WorkspaceScan | null,
  mode: PlanViewMode,
  options?: ScopeOptions,
): PlanView {
  if (mode === 'plan' || !scan) return { data: planGraph, overlay: new Set() }

  const fileSet = new Set(scan.files)
  const overlay = new Set<string>()
  // Plan node id -> the real file it now is (resolved to a node id below).
  const existingPath = new Map<string, string>()
  const edits = new Map<string, string[]>()
  const focusPaths = new Set<string>()
  const focusDirs = new Set<string>()

  for (const n of planGraph.nodes) {
    const isFileNode = n.type === 'planned-file' || n.type === 'workspace-file'
    if (isFileNode && n.filePath && fileSet.has(n.filePath)) {
      existingPath.set(n.id, n.filePath)
      focusPaths.add(n.filePath)
      continue
    }
    if (n.type === 'planned-file' && n.filePath) {
      const slash = n.filePath.lastIndexOf('/')
      if (slash > 0) focusDirs.add(n.filePath.slice(0, slash))
    }
    if (n.editsPaths?.length) {
      edits.set(n.id, n.editsPaths)
      for (const p of n.editsPaths) focusPaths.add(p)
    }
    if (!n.discovered) overlay.add(n.id)
  }

  const scoped = scopeArchitecture(scan, { paths: [...focusPaths], dirs: [...focusDirs] }, options)
  const kept = new Set(scoped.files)
  const nodeIdForPath = (p: string) => (kept.has(p) ? archId(p) : folderId(folderKeyOf(p)))

  const remap = new Map<string, string>()
  for (const [planNodeId, p] of existingPath) {
    const target = nodeIdForPath(p)
    remap.set(planNodeId, target)
    const original = planGraph.nodes.find((n) => n.id === planNodeId)
    if (original && !original.discovered) overlay.add(target)
  }

  const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
  const nodes: GraphNode[] = [
    ...scoped.files.map((p) => ({
      id: archId(p),
      label: basename(p),
      kind: 'built' as const,
      map: planId,
      filePath: p,
      type: 'workspace-file',
      discovered: true,
    })),
    ...scoped.folders.map((f) => ({
      id: folderId(f.path),
      label: `${f.path}/ (${f.count})`,
      kind: 'built' as const,
      map: planId,
      type: 'folder',
      discovered: true,
    })),
    ...(mode === 'health' ? [] : planGraph.nodes.filter((n) => !remap.has(n.id))),
  ]
  const ids = new Set(nodes.map((n) => n.id))

  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const push = (source: string, target: string, kind: GraphEdge['kind']) => {
    const key = `${source}>${target}>${kind}`
    if (source === target || seen.has(key) || !ids.has(source) || !ids.has(target)) return
    seen.add(key)
    edges.push({ source, target, kind })
  }
  for (const e of scoped.edges) push(e.source, e.target, 'borrows')
  for (const e of planGraph.edges) push(remap.get(e.source) ?? e.source, remap.get(e.target) ?? e.target, e.kind)
  for (const [stepId, paths] of edits) {
    for (const p of paths) {
      const target = nodeIdForPath(p)
      push(stepId, target, 'plan-step')
      if (ids.has(target)) overlay.add(target)
    }
  }

  return { data: { nodes, edges }, overlay: mode === 'health' ? new Set() : overlay }
}
