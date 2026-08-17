import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceDir, readWorkspaceFile, createPlan } from '../../00_planning/api/sleipnirApi'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import type { SavedPlan } from '../../00_planning/graph/types'
import { detectEdgesForPaths } from '../../00_planning/graph/importAdapters/detectEdges'

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

// Import scan for the plan's initial-paint snapshot (assetEdges) — the live
// graph re-scans this itself on every view thereafter (see
// graph/resolveAssetPlan.ts), so this call only has to be right once, at
// submit time. detectEdgesForPaths (graph/importAdapters/detectEdges.ts) is
// the same shared, multi-language detector that live re-scan uses too — a
// real per-language ImportAdapter where one exists (TSX/Python/Rust/Go, with
// proper relative-path resolution), a coarse basename-match fallback for
// every other extension.
async function detectEdges(paths: string[]): Promise<{ source: string; target: string }[]> {
  return detectEdgesForPaths(paths, (p) => readWorkspaceFile(p).then((r) => r.content))
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
  // touch it. Starts empty — a suffix chip or search query only narrows what's
  // *shown*, so if selection started as "everything" a filtered-out file would
  // stay silently selected and get submitted anyway. Starting empty means
  // "checked" always matches "will be in the plan"; Select-All (which respects
  // the current filter) is one click away for the old "just take everything" case.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkspaceDir('')
      .then(({ tree }) => {
        setTree(tree)
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

  // Top-level folders that are *fully* selected right now (dirState === 'all')
  // — passed to createPlan as assetFolders so the live graph (see
  // graph/resolveAssetPlan.ts) re-lists them on every future view/refresh,
  // picking up files added under them after this plan is created. A folder
  // only 'some'-selected doesn't qualify: there's no way to distinguish
  // "everything under here, present and future" from "just these specific
  // picks" once individual files are excluded, so it's treated as loose picks.
  const matchedFolders = useMemo(
    () => dirs.filter((d) => d.filePaths.length > 0 && d.filePaths.every((p) => selectedPaths.has(p))).map((d) => d.path),
    [dirs, selectedPaths],
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
      const { plan } = await createPlan(label.trim(), [], matchedPaths, assetEdges, matchedFolders)
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
