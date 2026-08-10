import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceDir, readWorkspaceFile, createPlan } from '../../00_planning/api/sleipnirApi'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import type { SavedPlan } from '../../00_planning/graph/types'
import { adapterForPath } from '../../00_planning/graph/importAdapters'

export interface NewWorkspacePlanModalProps {
  onClose: () => void
  onCreated: (plan: SavedPlan) => void
}

// Common naming-convention suffixes offered as quick filter chips — only
// ever shown once at least one file in the open Workspace actually matches
// (see suffixOptions below), so the row reflects this project's real
// conventions instead of always presenting a fixed MVVM-flavored list
// regardless of what's really there.
const SUFFIX_CANDIDATES = ['ViewModel', 'View', 'Controller', 'Model', 'Store', 'Service', 'Hook', 'Test']

function flattenFiles(nodes: FileTreeNode[], into: { path: string; name: string }[] = []) {
  for (const n of nodes) {
    if (n.type === 'file') into.push({ path: n.path, name: n.name })
    else if (n.children) flattenFiles(n.children, into)
  }
  return into
}

function countFiles(node: FileTreeNode): number {
  return node.type === 'file' ? 1 : (node.children ?? []).reduce((sum, c) => sum + countFiles(c), 0)
}

function basenameNoExt(name: string): string {
  return name.replace(/\.[^./]+$/, '')
}

// Best-effort import scan, run once at plan-creation time against just the
// matched files (not the whole Workspace) — this is a renderer-side regex
// scan, not a real per-language module resolver, so treat it as "a helpful
// hint," not a guarantee of completeness or correctness.
//
// Every one of the app's 4 supported languages (TSX, Python, Rust, Go) now
// has a real adapter (see graph/importAdapters) with proper relative-path
// resolution — the same one scaffold-time auto-linking, the "##token"
// editor extension, and the node-card link editor all use, so this stays
// the one place that logic lives instead of a private copy per caller.
// Anything with no adapter (a language this feature doesn't cover, or a
// non-code file like markdown/JSON) falls back to a coarse "does an
// imported name match another matched file's basename" heuristic — no real
// module-path resolution, can both miss real edges and occasionally match
// on a common name.
const GENERIC_IMPORT_RE = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w."/]+))/gm

async function detectEdges(paths: string[]): Promise<{ source: string; target: string }[]> {
  const edges: { source: string; target: string }[] = []
  const seen = new Set<string>()
  const addEdge = (source: string, target: string) => {
    if (target === source) return
    const key = `${source}>${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target })
  }

  const contents = await Promise.all(paths.map((p) => readWorkspaceFile(p).then((r) => r.content).catch(() => '')))

  paths.forEach((fromPath, i) => {
    const content = contents[i]
    if (!content) return
    const adapter = adapterForPath(fromPath)

    if (adapter) {
      for (const spec of adapter.detectImports(content)) {
        const target = adapter.resolveSpecifier(fromPath, spec.raw, paths)
        if (target) addEdge(fromPath, target)
      }
    } else {
      for (const m of content.matchAll(GENERIC_IMPORT_RE)) {
        const raw = m[1] ?? m[2] ?? ''
        const mod = raw.split(/[./]/).filter(Boolean).pop()
        if (!mod) continue
        const target = paths.find((p) => p !== fromPath && basenameNoExt(p.split('/').pop() ?? p) === mod)
        if (target) addEdge(fromPath, target)
      }
    }
  })

  return edges
}

export function useNewWorkspacePlanViewModel({ onClose, onCreated }: NewWorkspacePlanModalProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [activeSuffixes, setActiveSuffixes] = useState<string[]>([])
  const [activeDirs, setActiveDirs] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkspaceDir('')
      .then(({ tree }) => setTree(tree))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const files = useMemo(() => flattenFiles(tree), [tree])
  // Top-level folders only — deep enough to be a useful coarse filter
  // (src/, tests/, docs/, ...) without building a full recursive checkbox
  // tree for an arbitrary project of unknown depth.
  const dirs = useMemo(
    () => tree.filter((n) => n.type === 'dir').map((n) => ({ path: n.path, name: n.name, fileCount: countFiles(n) })),
    [tree],
  )

  const suffixOptions = useMemo(
    () =>
      SUFFIX_CANDIDATES.map((suffix) => ({
        suffix,
        count: files.filter((f) => basenameNoExt(f.name).endsWith(suffix)).length,
      })).filter((o) => o.count > 0),
    [files],
  )

  const toggleSuffix = (suffix: string) =>
    setActiveSuffixes((prev) => (prev.includes(suffix) ? prev.filter((s) => s !== suffix) : [...prev, suffix]))

  const toggleDir = (path: string) =>
    setActiveDirs((prev) => (prev.includes(path) ? prev.filter((d) => d !== path) : [...prev, path]))

  // Both filters narrow the set (AND) when active; either alone, or neither,
  // just applies whichever is active — no filter active at all means every
  // file in the Workspace matches.
  const matchedPaths = useMemo(
    () =>
      files
        .filter((f) => activeSuffixes.length === 0 || activeSuffixes.some((s) => basenameNoExt(f.name).endsWith(s)))
        .filter((f) => activeDirs.length === 0 || activeDirs.some((d) => f.path === d || f.path.startsWith(`${d}/`)))
        .map((f) => f.path),
    [files, activeSuffixes, activeDirs],
  )

  const [detectingEdges, setDetectingEdges] = useState(false)

  const submit = async () => {
    if (!label.trim() || matchedPaths.length === 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      setDetectingEdges(true)
      const assetEdges = await detectEdges(matchedPaths).catch(() => [])
      setDetectingEdges(false)
      const { plan } = await createPlan(label.trim(), [], matchedPaths, assetEdges)
      onCreated(plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
      setDetectingEdges(false)
    }
  }

  return {
    loading,
    label,
    setLabel,
    suffixOptions,
    activeSuffixes,
    toggleSuffix,
    dirs,
    activeDirs,
    toggleDir,
    matchedPaths,
    submitting,
    detectingEdges,
    error,
    submit,
    onClose,
  }
}
