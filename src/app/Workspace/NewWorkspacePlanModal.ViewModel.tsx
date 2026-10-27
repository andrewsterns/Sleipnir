import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceDir, readWorkspaceFile, createPlan, addNote } from '../../00_planning/api/sleipnirApi'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import type { NodeStage, SavedPlan } from '../../00_planning/graph/types'
import type { SearchFilterOption } from '../UIKit/Search/iSearch'
import { detectEdgesForPaths } from '../../00_planning/graph/importAdapters/detectEdges'
import { fuzzyScore } from '../../utils/fuzzyMatch'
import { setStage as setStageStore } from '../../00_planning/stagesStore'

export interface NewWorkspacePlanModalProps {
  onClose: () => void
  onCreated: (plan: SavedPlan) => void
  /** Seeds the plan name — e.g. what was typed into the PLANS picker before choosing "New plan". */
  initialLabel?: string
}

// One "ADD NODES" row — resolves to an existing file, an existing folder (no
// stage: a folder isn't one node, same as the tree above has no per-folder
// stage), or a brand-new lightweight note (no backing file). `query` only
// matters while unresolved; picking a candidate (or "Create as new node")
// clears it and sets `resolution`.
export interface AddNodeRow {
  id: string
  query: string
  resolution: { kind: 'file'; path: string } | { kind: 'dir'; path: string } | { kind: 'note'; label: string } | null
  stage?: NodeStage
}

export interface RowSuggestion {
  kind: 'file' | 'dir'
  path: string
  label: string
}

// Common naming-convention suffixes offered in the ASSET TYPE filter group —
// only ever surfaced once at least one file in the open Workspace actually
// matches (see suffixOptions below), so the list reflects this project's real
// conventions instead of always presenting a fixed MVVM-flavored set
// regardless of what's really there.
const SUFFIX_CANDIDATES = ['ViewModel', 'View', 'Controller', 'Model', 'Store', 'Service', 'Hook', 'Test']

function flattenFiles(nodes: FileTreeNode[], into: { path: string; name: string }[] = []) {
  for (const n of nodes) {
    if (n.type === 'file') into.push({ path: n.path, name: n.name })
    else if (n.children) flattenFiles(n.children, into)
  }
  return into
}

function basenameNoExt(name: string): string {
  return name.replace(/\.[^./]+$/, '')
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

// Every dir's full recursive file list, keyed by path — the one source of
// truth for a directory checkbox's tri-state and bulk toggle. Built from the
// raw (unfiltered) tree so a dir's checkbox always spans its whole subtree
// regardless of what the current search/filter happens to be showing; that's
// what makes "select this folder" mean "everything in it, present and
// future" (see matchedFolders) rather than "whatever's visible right now".
function buildDirFileMap(nodes: FileTreeNode[], map: Map<string, string[]> = new Map()): Map<string, string[]> {
  const collect = (node: FileTreeNode): { path: string; name: string }[] => {
    if (node.type === 'file') return [{ path: node.path, name: node.name }]
    const files = (node.children ?? []).flatMap(collect)
    map.set(node.path, files.map((f) => f.path))
    return files
  }
  for (const n of nodes) collect(n)
  return map
}

function collectDirPaths(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'dir') {
      into.push(n.path)
      collectDirPaths(n.children ?? [], into)
    }
  }
  return into
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

export function useNewWorkspacePlanViewModel({ onClose, onCreated, initialLabel }: NewWorkspacePlanModalProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState(initialLabel ?? '')
  const [query, setQuery] = useState('')
  // A single flat id list drives the Search filter dropdown's checklist —
  // "asset:<suffix>" and "ext:<extension>" ids, split back out by prefix
  // wherever the two groups need to be evaluated separately (see fileMatches).
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([])
  // Directories the user has manually collapsed — the tree opens fully
  // expanded by default (matching the old flatten-everything list's "you
  // already see all the files" behaviour) and only respects this once a
  // search/filter isn't forcing everything open anyway (see isExpanded).
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  // The one source of truth for what the plan will contain: an explicit set of
  // file paths. Directory checkboxes, the per-file checkboxes and both
  // Select-All controls all just mutate this set; query/filters are pure
  // *view* concerns that never touch it. Starts empty — a filter or search
  // query only narrows what's *shown*, so if selection started as "everything"
  // a filtered-out file would stay silently selected and get submitted
  // anyway. Starting empty means "checked" always matches "will be in the
  // plan"; Select-All (which respects the current filter) is one click away
  // for the old "just take everything" case.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // "ADD NODES" rows — seeded with one empty row so the affordance is visible
  // without an extra click.
  const [addNodeRows, setAddNodeRows] = useState<AddNodeRow[]>([{ id: crypto.randomUUID(), query: '', resolution: null }])

  useEffect(() => {
    listWorkspaceDir('')
      .then(({ tree }) => {
        setTree(tree)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const files = useMemo(() => flattenFiles(tree), [tree])
  const dirFileMap = useMemo(() => buildDirFileMap(tree), [tree])
  const dirPaths = useMemo(() => [...dirFileMap.keys()], [dirFileMap])

  // Fuzzy-ranked files + dirs for an "ADD NODES" row's suggestion panel —
  // same files/dirFileMap the tree above already loaded, no separate fetch.
  const suggestionsFor = (query: string): RowSuggestion[] => {
    const q = query.trim()
    if (!q) return []
    const fileMatches = files
      .map((f) => ({ kind: 'file' as const, path: f.path, label: f.name, score: fuzzyScore(q, f.path) }))
      .filter((r): r is typeof r & { score: number } => r.score !== null)
    const dirMatches = dirPaths
      .map((path) => ({ kind: 'dir' as const, path, label: path.split('/').pop() ?? path, score: fuzzyScore(q, path) }))
      .filter((r): r is typeof r & { score: number } => r.score !== null)
    return [...fileMatches, ...dirMatches]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ kind, path, label }) => ({ kind, path, label }))
  }

  const suffixOptions = useMemo(
    () =>
      SUFFIX_CANDIDATES.map((suffix) => ({
        suffix,
        count: files.filter((f) => basenameNoExt(f.name).endsWith(suffix)).length,
      })).filter((o) => o.count > 0),
    [files],
  )

  // File-type options: every extension actually present in the Workspace,
  // most-common first — there's no backend-provided classification, so this
  // (like suffixOptions) is derived straight from the file list.
  const extOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of files) {
      const ext = extOf(f.name)
      if (!ext) continue
      counts.set(ext, (counts.get(ext) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([ext, count]) => ({ ext, count }))
  }, [files])

  // The Search component's filter dropdown, fed both groups at once — the
  // "wide" dropdown the popup asks for, grouped so ASSET TYPE and FILE TYPE
  // read as two clusters rather than one undifferentiated list.
  const filterOptions: SearchFilterOption[] = useMemo(
    () => [
      ...suffixOptions.map((o) => ({ id: `asset:${o.suffix}`, label: `${o.suffix} (${o.count})`, group: 'ASSET TYPE' })),
      ...extOptions.map((o) => ({ id: `ext:${o.ext}`, label: `${o.ext} (${o.count})`, group: 'FILE TYPE' })),
    ],
    [suffixOptions, extOptions],
  )

  const activeAssetTypes = useMemo(
    () => activeFilterIds.filter((id) => id.startsWith('asset:')).map((id) => id.slice(6)),
    [activeFilterIds],
  )
  const activeExtTypes = useMemo(
    () => activeFilterIds.filter((id) => id.startsWith('ext:')).map((id) => id.slice(4)),
    [activeFilterIds],
  )

  // View-only narrowing — text query (matched against the whole relative
  // path, so a folder name typed into search surfaces its files) AND the
  // active ASSET TYPE chips (OR'd within the group) AND the active FILE TYPE
  // chips (OR'd within the group). Never affects selectedPaths directly.
  const fileMatches = (f: { path: string; name: string }): boolean => {
    const q = query.trim().toLowerCase()
    if (q && !f.path.toLowerCase().includes(q)) return false
    if (activeAssetTypes.length > 0 && !activeAssetTypes.some((s) => basenameNoExt(f.name).endsWith(s))) return false
    if (activeExtTypes.length > 0 && !activeExtTypes.includes(extOf(f.name))) return false
    return true
  }

  const hasActiveFilter = query.trim() !== '' || activeFilterIds.length > 0

  // The tree actually rendered — same recursive-preserve-parent shape as
  // LeftRailingView's filterTreeByQuery/filterTreeByTier: a dir survives only
  // if at least one descendant file matches, so a hit deep in the tree still
  // surfaces its parent folders (searching a folder name works too, since a
  // file's full relative path is what's matched against the query).
  const visibleTree = useMemo(() => {
    if (!hasActiveFilter) return tree
    const walk = (nodes: FileTreeNode[]): FileTreeNode[] => {
      const out: FileTreeNode[] = []
      for (const n of nodes) {
        if (n.type === 'file') {
          if (fileMatches(n)) out.push(n)
        } else {
          const children = walk(n.children ?? [])
          if (children.length > 0) out.push({ ...n, children })
        }
      }
      return out
    }
    return walk(tree)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fileMatches closes over query/activeAssetTypes/activeExtTypes, all listed below
  }, [tree, hasActiveFilter, query, activeAssetTypes, activeExtTypes])

  // A search/filter in effect forces every dir in the (already-pruned)
  // visible tree open, so matches read in place instead of being hidden
  // behind a manually-collapsed ancestor; with nothing active, each dir
  // respects whatever the user last chose.
  const isExpanded = (path: string) => hasActiveFilter || !collapsedDirs.has(path)
  const toggleExpand = (path: string) =>
    setCollapsedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const isSelected = (path: string) => selectedPaths.has(path)

  const toggleFile = (path: string) =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // Tri-state for a directory row (any depth): 'all' of its files selected,
  // 'some', or 'none'. Always spans the dir's *entire* subtree (dirFileMap),
  // not just what's currently visible.
  const dirState = (path: string): 'all' | 'some' | 'none' => {
    const filePaths = dirFileMap.get(path) ?? []
    if (filePaths.length === 0) return 'none'
    const selected = filePaths.filter((p) => selectedPaths.has(p)).length
    return selected === 0 ? 'none' : selected === filePaths.length ? 'all' : 'some'
  }
  const toggleDir = (path: string) => {
    const filePaths = dirFileMap.get(path) ?? []
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      const fullySelected = filePaths.length > 0 && filePaths.every((p) => next.has(p))
      for (const p of filePaths) {
        if (fullySelected) next.delete(p)
        else next.add(p)
      }
      return next
    })
  }

  // "ADD NODES" row lifecycle. A file/dir row's resolution shares the exact
  // same selectedPaths/dirFileMap state the tree above uses — resolving a row
  // just ensures the underlying box is checked (never a raw toggle, so it
  // can't accidentally *un*check something the tree independently selected),
  // and clearing/removing a row only unchecks it if no *other* row still
  // claims that same path (so one row's removal never silently drops a pick
  // another row still depends on). A note row never touches selectedPaths at
  // all — it has no backing file.
  const addRow = () => setAddNodeRows((prev) => [...prev, { id: crypto.randomUUID(), query: '', resolution: null }])

  const setRowQuery = (id: string, query: string) =>
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, query } : r)))

  const resolveRowToFile = (id: string, path: string) => {
    if (!selectedPaths.has(path)) toggleFile(path)
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, query: '', resolution: { kind: 'file', path } } : r)))
  }
  const resolveRowToDir = (id: string, path: string) => {
    if (dirState(path) !== 'all') toggleDir(path)
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, query: '', resolution: { kind: 'dir', path } } : r)))
  }
  const resolveRowToNote = (id: string, label: string) =>
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, query: '', resolution: { kind: 'note', label } } : r)))

  const otherRowClaims = (rows: AddNodeRow[], excludeId: string, kind: 'file' | 'dir', path: string) =>
    rows.some((r) => r.id !== excludeId && r.resolution?.kind === kind && r.resolution.path === path)

  const releaseRowSelection = (row: AddNodeRow | undefined, excludeId: string) => {
    if (!row?.resolution || row.resolution.kind === 'note') return
    if (otherRowClaims(addNodeRows, excludeId, row.resolution.kind, row.resolution.path)) return
    if (row.resolution.kind === 'file') toggleFile(row.resolution.path)
    else toggleDir(row.resolution.path)
  }

  const clearRowResolution = (id: string) => {
    releaseRowSelection(addNodeRows.find((r) => r.id === id), id)
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, resolution: null, stage: undefined } : r)))
  }

  const removeRow = (id: string) => {
    releaseRowSelection(addNodeRows.find((r) => r.id === id), id)
    setAddNodeRows((prev) => prev.filter((r) => r.id !== id))
  }

  const setRowStage = (id: string, stage: NodeStage | undefined) =>
    setAddNodeRows((prev) => prev.map((r) => (r.id === id ? { ...r, stage } : r)))

  // Select-all FILES — every file matching the current search/filter, at any
  // depth. Respects the filter (unlike Select-all dirs below), so it's the
  // direct analog of the old files-section "Select all".
  const visibleFilePaths = useMemo(() => flattenFiles(visibleTree).map((f) => f.path), [visibleTree])
  const selectedVisibleFileCount = visibleFilePaths.filter((p) => selectedPaths.has(p)).length
  const allFilesSelected = visibleFilePaths.length > 0 && selectedVisibleFileCount === visibleFilePaths.length
  const someFilesSelected = selectedVisibleFileCount > 0 && !allFilesSelected
  const toggleAllFiles = () =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (allFilesSelected) for (const p of visibleFilePaths) next.delete(p)
      else for (const p of visibleFilePaths) next.add(p)
      return next
    })

  // Select-all DIRS — bulk-applies the same "whole subtree" toggle every
  // individual dir checkbox does, to every directory that currently has at
  // least one match (any depth). The filter decides *which* dirs qualify;
  // what gets selected within a qualifying dir is still its full subtree, so
  // this stays consistent with what clicking each dir's own checkbox does.
  const visibleDirPaths = useMemo(() => collectDirPaths(visibleTree), [visibleTree])
  const dirStates = visibleDirPaths.map(dirState)
  const allDirsSelected = visibleDirPaths.length > 0 && dirStates.every((s) => s === 'all')
  const someDirsSelected = !allDirsSelected && dirStates.some((s) => s !== 'none')
  const toggleAllDirs = () =>
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      for (const path of visibleDirPaths) {
        const filePaths = dirFileMap.get(path) ?? []
        if (allDirsSelected) for (const p of filePaths) next.delete(p)
        else for (const p of filePaths) next.add(p)
      }
      return next
    })

  // The plan's contents = the explicit selection, order-stable by the tree's
  // own file order.
  const matchedPaths = useMemo(
    () => files.map((f) => f.path).filter((p) => selectedPaths.has(p)),
    [files, selectedPaths],
  )

  // A plan created from note-rows alone (nothing checked in the tree) must
  // still be submittable — the tree's own matchedPaths.length check isn't
  // enough once notes exist as a second source of "there's something here".
  const hasAnythingToAdd = matchedPaths.length > 0 || addNodeRows.some((r) => r.resolution?.kind === 'note')

  // Topmost fully-selected folders — passed to createPlan as assetFolders so
  // the live graph (see graph/resolveAssetPlan.ts) re-lists them on every
  // future view/refresh, picking up files added under them after this plan is
  // created. Walking the raw tree and stopping the descent the moment a dir
  // qualifies keeps this to the outermost anchor per fully-selected branch —
  // no redundant nested entries whose parent already covers them. A dir only
  // 'some'-selected doesn't qualify (and its children are walked instead):
  // there's no way to distinguish "everything under here, present and
  // future" from "just these specific picks" once individual files are
  // excluded, so it's treated as loose picks.
  const matchedFolders = useMemo(() => {
    const out: string[] = []
    const walk = (nodes: FileTreeNode[]) => {
      for (const n of nodes) {
        if (n.type !== 'dir') continue
        const filePaths = dirFileMap.get(n.path) ?? []
        if (filePaths.length > 0 && filePaths.every((p) => selectedPaths.has(p))) {
          out.push(n.path)
        } else {
          walk(n.children ?? [])
        }
      }
    }
    walk(tree)
    return out
  }, [tree, dirFileMap, selectedPaths])

  const [detectingEdges, setDetectingEdges] = useState(false)

  const submit = async () => {
    if (!label.trim() || !hasAnythingToAdd || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      setDetectingEdges(true)
      const assetEdges = await detectEdges(matchedPaths).catch(() => [])
      setDetectingEdges(false)
      const { plan } = await createPlan(label.trim(), [], matchedPaths, assetEdges, matchedFolders)

      // Note rows and stages both land in separate, sequential calls after
      // createPlan resolves — createPlan itself has no way to accept either
      // atomically (tools/sleipnir-backend.mjs's signature is just
      // (label, nodeIds, assetPaths, assetEdges, assetFolders)). Sequential,
      // not Promise.all: both notes.json and the stage overlay do an
      // unsynchronized read-modify-write, so parallel writes here could lose
      // one another's changes.
      const stageTargets: { id: string; stage: NodeStage }[] = []
      for (const row of addNodeRows) {
        if (row.resolution?.kind !== 'note') continue
        const { node } = await addNote(plan.id, row.resolution.label)
        if (row.stage) stageTargets.push({ id: node.id, stage: row.stage })
      }
      for (const row of addNodeRows) {
        // Asset-node ids are deterministic and computable the instant
        // createPlan returns — resolveAssetPlanGraph and PlanningView.
        // ViewModel's graphForPlan both derive a workspace-file node's id
        // with this exact same formula, so this resolves correctly the
        // moment the graph reads it, no waiting on a live re-scan needed.
        if (row.resolution?.kind === 'file' && row.stage) {
          stageTargets.push({ id: `workspace-asset/${plan.id}/${row.resolution.path}`, stage: row.stage })
        }
      }
      for (const { id, stage } of stageTargets) {
        await setStageStore(id, stage).catch(() => {})
      }

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
    filterOptions,
    activeFilterIds,
    setActiveFilterIds,
    tree: visibleTree,
    isExpanded,
    toggleExpand,
    dirState,
    toggleDir,
    isSelected,
    toggleFile,
    allFilesSelected,
    someFilesSelected,
    toggleAllFiles,
    filesSelectableCount: visibleFilePaths.length,
    allDirsSelected,
    someDirsSelected,
    toggleAllDirs,
    dirsSelectableCount: visibleDirPaths.length,
    selectedCount: selectedPaths.size,
    totalCount: files.length,
    matchedPaths,
    hasAnythingToAdd,
    addNodeRows,
    addRow,
    removeRow,
    setRowQuery,
    resolveRowToFile,
    resolveRowToDir,
    resolveRowToNote,
    clearRowResolution,
    setRowStage,
    suggestionsFor,
    submitting,
    detectingEdges,
    error,
    submit,
    onClose,
  }
}
