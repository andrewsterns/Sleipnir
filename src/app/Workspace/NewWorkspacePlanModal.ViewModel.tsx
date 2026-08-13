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
  const [query, setQuery] = useState('')
  const [activeSuffixes, setActiveSuffixes] = useState<string[]>([])
  // The one source of truth for what the plan will contain: an explicit set of
  // file paths. Directory checkboxes, the per-file checkboxes and Select-All
  // all just mutate this set; query/suffix are pure *view* filters that never
  // touch it. Seeded to "everything" once the tree loads (see the effect
  // below) so the old "name it and go — all files match" flow still works with
  // a single click to create.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkspaceDir('')
      .then(({ tree }) => {
        setTree(tree)
        // Default: every file selected (parity with the previous "no filter =
        // all files match" behavior), the user then pares it down.
        setSelectedPaths(new Set(flattenFiles(tree).map((f) => f.path)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const files = useMemo(() => flattenFiles(tree), [tree])
  // Top-level folders only — deep enough to be a useful coarse bulk-select
  // (src/, tests/, docs/, ...) without building a full recursive tree for an
  // arbitrary project of unknown depth. `filePaths` is every file under the
  // folder, so its checkbox can bulk-toggle and derive its tri-state from
  // selectedPaths.
  const dirs = useMemo(
    () =>
      tree
        .filter((n) => n.type === 'dir')
        .map((n) => ({
          path: n.path,
          name: n.name,
          fileCount: countFiles(n),
          filePaths: files.filter((f) => f.path === n.path || f.path.startsWith(`${n.path}/`)).map((f) => f.path),
        })),
    [tree, files],
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

  // View-only narrowing of the file list — text query (matched against the
  // whole relative path, so a folder name typed into search surfaces its
  // files) AND the active suffix chips. Never affects selectedPaths directly;
  // it only decides which rows are shown and what "Select all visible" spans.
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files
      .filter((f) => q === '' || f.path.toLowerCase().includes(q))
      .filter((f) => activeSuffixes.length === 0 || activeSuffixes.some((s) => basenameNoExt(f.name).endsWith(s)))
  }, [files, query, activeSuffixes])

  const isSelected = (path: string) => selectedPaths.has(path)

  const toggleFile = (path: string) =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // Tri-state for a directory row: 'all' of its files selected, 'some', or
  // 'none'. Toggling clears the folder when it's fully selected, otherwise
  // selects every file under it.
  const dirState = (filePaths: string[]): 'all' | 'some' | 'none' => {
    if (filePaths.length === 0) return 'none'
    const selected = filePaths.filter((p) => selectedPaths.has(p)).length
    return selected === 0 ? 'none' : selected === filePaths.length ? 'all' : 'some'
  }
  const toggleDir = (filePaths: string[]) =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      const fullySelected = filePaths.length > 0 && filePaths.every((p) => next.has(p))
      for (const p of filePaths) {
        if (fullySelected) next.delete(p)
        else next.add(p)
      }
      return next
    })

  // Select-all applies to whatever is currently *visible* (post query/suffix
  // filter), so the header checkbox reflects and controls exactly the rows on
  // screen — the actual, interactive replacement for the old bare "SELECT ALL"
  // text button.
  const visiblePaths = useMemo(() => visibleFiles.map((f) => f.path), [visibleFiles])
  const selectedVisibleCount = visiblePaths.filter((p) => selectedPaths.has(p)).length
  const allVisibleSelected = visiblePaths.length > 0 && selectedVisibleCount === visiblePaths.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected
  const toggleAllVisible = () =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) for (const p of visiblePaths) next.delete(p)
      else for (const p of visiblePaths) next.add(p)
      return next
    })

  // The plan's contents = the explicit selection, order-stable by the tree's
  // own file order.
  const matchedPaths = useMemo(
    () => files.map((f) => f.path).filter((p) => selectedPaths.has(p)),
    [files, selectedPaths],
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
    query,
    setQuery,
    suffixOptions,
    activeSuffixes,
    toggleSuffix,
    dirs,
    dirState,
    toggleDir,
    visibleFiles,
    isSelected,
    toggleFile,
    allVisibleSelected,
    someVisibleSelected,
    toggleAllVisible,
    selectedCount: selectedPaths.size,
    totalCount: files.length,
    matchedPaths,
    submitting,
    detectingEdges,
    error,
    submit,
    onClose,
  }
}
