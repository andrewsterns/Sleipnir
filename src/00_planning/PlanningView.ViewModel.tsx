import { useEffect, useMemo, useState } from 'react'
import { getGraphForMap, refreshGraphForMap, partitionArchived } from './graph/combine'
import { resolvePlanGraph } from './graph/resolvePlan'
import { getGraphMaps, type GraphData, type GraphEdge, type GraphMapId, type GraphNode, type NodeStatus, type SavedPlan } from './graph/types'
import {
  regenerateGraph,
  getArchivedPaths,
  setArchived,
  getNotes,
  addNote,
  setNodeStatus,
  type ArchiveEntry,
} from './api/sleipnirApi'
import { fuzzyScore } from '../utils/fuzzyMatch'

// One node plus which map/library/plan it lives in — the unit global search
// (usePlanningViewModel's nodeRows, see below) operates over, since a node's
// bare id alone doesn't say where to navigate to find it.
export interface PlanningNodeRow {
  node: GraphNode
  mapId: GraphMapId
  mapLabel: string
}

// Cap on how many cross-map fuzzy results to show at once — generous, since
// every map's graph is already an in-memory build-time snapshot (no backend
// round-trip), and this repo's total node count across every
// library/prototype/plan tops out at a few hundred.
const GLOBAL_SEARCH_LIMIT = 100

// Must match the id hand-authored for the WelcomeCard node in
// graph/proposed-nodes.ts's `welcome` entry — kept as a literal in both
// places rather than a shared export, since it's a single string used twice.
const WELCOME_EXAMPLE_NODE_ID = 'src/02_components/01_atoms/WelcomeCard/WelcomeCard.tsx'

// A node's containing folder — archiving a node archives its whole
// View/ViewModel/interface "series" as one manifest entry.
export function folderPathForNode(node: GraphNode): string | null {
  if (!node.filePath) return null
  const parts = node.filePath.replace(/^src\//, '').split('/')
  return parts.slice(0, -1).join('/')
}

export function usePlanningViewModel(
  initialMapId: GraphMapId = 'welcome',
  // Set by App.tsx right before switching into Planning (see jumpToClaudeTab)
  // to force the CLAUDE tab open even when PlanningView is already mounted —
  // initialMapId alone only applies on first mount. Consumed once via the
  // paired setter, same pattern as App's pendingLibraryFile/pendingPrototypeId.
  focusMapId?: GraphMapId | null,
  onFocusMapIdConsumed?: () => void,
  // Owned by App.tsx (fetched once, appended to locally on create — same
  // pattern as its `widgets` state), not independently re-fetched here.
  // Never itself registered in getGraphMaps(), so a plan tab's graph has to
  // be resolved specially wherever `data` gets set below, instead of falling
  // through to the normal getGraphForMap(mapId) path.
  plans: SavedPlan[] = [],
) {
  const planFor = (id: GraphMapId) => plans.find((p) => p.id === id)
  const graphForMap = (id: GraphMapId): GraphData => {
    const plan = planFor(id)
    return plan ? resolvePlanGraph(plan.nodeIds) : getGraphForMap(id)
  }
  const [mapId, setMapIdRaw] = useState<GraphMapId>(initialMapId)
  // Only the initial map starts open as a tab — a fresh launch should show
  // just Welcome, not every registered map at once. Closing a tab (see
  // closeMap) only removes it from this list, it never touches the
  // registry/graph, so every other map is still one click away via the left
  // "PLANS" list in PlanningView.tsx.
  const [openMapIds, setOpenMapIds] = useState<GraphMapId[]>(() => [initialMapId])

  // The single entry point for "go to this map" — opens it (if not already)
  // and makes it active. Used by tab clicks, the left PLANS list, and
  // external jumps (focusMapId below). Exposed as `setMapId` too so existing
  // call sites (handleRemoveLibrary, DeleteLibraryModal) that just want to
  // navigate to a known-open map (e.g. 'dsm') don't need to change.
  const openMap = (id: GraphMapId) => {
    setOpenMapIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setMapIdRaw(id)
  }
  const setMapId = openMap

  // Closes a tab without deleting anything — the map stays registered and
  // reappears in the left PLANS list, just no longer pinned to a tab. If the
  // closed tab was active, falls back to a neighboring open tab, or Welcome
  // (always open, never closable-away) if none are left.
  const closeMap = (id: GraphMapId) => {
    setOpenMapIds((prev) => {
      const idx = prev.indexOf(id)
      if (idx === -1) return prev
      const next = prev.filter((m) => m !== id)
      if (mapId !== id) return next
      const fallback = next[idx] ?? next[idx - 1] ?? 'welcome'
      setMapIdRaw(fallback)
      // Guards the all-closed edge case: falling back to Welcome only means
      // something if Welcome is actually in the open list afterward too.
      return next.includes(fallback) ? next : [...next, fallback]
    })
  }

  useEffect(() => {
    if (!focusMapId) return
    openMap(focusMapId)
    onFocusMapIdConsumed?.()
  }, [focusMapId, onFocusMapIdConsumed])
  // The Welcome tab opens with its example node already selected — a new
  // user sees the detail panel (and the "Open in Component Library" link)
  // immediately, instead of an empty panel until they click something.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialMapId === 'welcome' ? WELCOME_EXAMPLE_NODE_ID : null,
  )
  const [data, setData] = useState<GraphData>(() => graphForMap(mapId))
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [notes, setNotes] = useState<GraphNode[]>([])
  const [notesEdges, setNotesEdges] = useState<GraphEdge[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<string[]>([])

  useEffect(() => {
    setData(graphForMap(mapId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId])

  useEffect(() => {
    getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)).catch(() => {})
  }, [])

  const refreshNotes = async () => {
    const { nodes: fresh, edges } = await getNotes()
    setNotes(fresh)
    setNotesEdges(edges)
  }

  useEffect(() => {
    refreshNotes().catch(() => {})
  }, [])

  const { live: liveGenerated } = useMemo(() => partitionArchived(data, archivedEntries), [data, archivedEntries])

  // Notes are plain user-created nodes with no backing file (see
  // sleipnirApi.addNote) — merged in alongside the generated/proposed graph
  // rather than baked into combine.ts, since they're fetched separately and
  // aren't tied to a build-time static import.
  const live = useMemo(() => {
    const notesForMap = notes.filter((n) => n.map === mapId)
    const noteIds = new Set(notesForMap.map((n) => n.id))
    const notesEdgesForMap = notesEdges.filter((e) => noteIds.has(e.source) || noteIds.has(e.target))
    return {
      nodes: [...liveGenerated.nodes, ...notesForMap],
      edges: [...liveGenerated.edges, ...notesEdgesForMap],
    }
  }, [liveGenerated, notes, notesEdges, mapId])

  // Jumping straight to a library right after creating it can't rely on
  // getGraphForMap's static import.meta.glob snapshot (it may not have
  // picked up the brand-new generated/<id>.json yet) — refreshGraphForMap
  // does a plain fetch instead, so it's correct regardless of glob/HMR
  // timing. Normal tab clicks stay on the fast static path (Tabs.Root's
  // onValueChange calls setMapId directly), since existing maps are already
  // present in the glob snapshot.
  const switchToMap = async (id: GraphMapId) => {
    setMapId(id)
    setSelectedId(null)
    const fresh = await refreshGraphForMap(id).catch(() => getGraphForMap(id))
    setData(fresh)
  }

  const refreshAll = async () => {
    // A plan id has no generated/<id>.json on disk for refreshGraphForMap to
    // fetch (it would 404) — its "live" data is always resolved fresh from
    // whatever's currently in every real map, so there's nothing to refetch
    // beyond that resolution itself.
    const plan = planFor(mapId)
    const [fresh] = await Promise.all([
      plan ? Promise.resolve(resolvePlanGraph(plan.nodeIds)) : refreshGraphForMap(mapId),
      getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)),
      refreshNotes(),
    ])
    setData(fresh)
  }

  const createNote = async (label: string, description: string) => {
    const { node } = await addNote(mapId, label, description || undefined)
    await refreshNotes()
    return node.id
  }

  // Only meaningful for plan nodes (created via the AI chat's
  // create_plan_node tool, always start life as 'draft') — moves a node
  // through draft -> approved -> done as the human reviews it.
  const setPlanNodeStatus = async (node: GraphNode, status: NodeStatus) => {
    await setNodeStatus(node.id, status)
    await refreshNotes()
  }

  const archiveNode = async (node: GraphNode) => {
    const folder = folderPathForNode(node)
    if (!folder) return
    await setArchived(folder, true, folder.split('/').pop() ?? folder)
    await regenerateGraph().catch(() => {})
    await refreshAll()
  }

  const restoreEntry = async (entry: ArchiveEntry) => {
    await setArchived(entry.path, false)
    await regenerateGraph().catch(() => {})
    await refreshAll()
  }

  const selectedNode = useMemo(
    () => live.nodes.find((n) => n.id === selectedId) ?? null,
    [live, selectedId],
  )

  const borrowsFrom = useMemo(() => {
    if (!selectedNode) return []
    const targetIds = live.edges.filter((e) => e.source === selectedNode.id).map((e) => e.target)
    return live.nodes.filter((n) => targetIds.includes(n.id))
  }, [live, selectedNode])

  const borrowedBy = useMemo(() => {
    if (!selectedNode) return []
    const sourceIds = live.edges.filter((e) => e.target === selectedNode.id).map((e) => e.source)
    return live.nodes.filter((n) => sourceIds.includes(n.id))
  }, [live, selectedNode])

  const sortedNodes = useMemo(
    () => [...live.nodes].sort((a, b) => a.label.localeCompare(b.label)),
    [live],
  )
  const kindFilteredNodes = useMemo(
    () => (kindFilter.length === 0 ? sortedNodes : sortedNodes.filter((n) => kindFilter.includes(n.kind))),
    [sortedNodes, kindFilter],
  )

  const mapLabelFor = (id: GraphMapId): string =>
    getGraphMaps().find((m) => m.id === id)?.label ?? planFor(id)?.label ?? id

  // Every node across every registered map + Saved Plan, for the NODES
  // search box's global fuzzy quick-jump below — the same "resolve via
  // getGraphForMap/resolvePlanGraph" pattern graphForMap (above) already
  // uses for one map id, just applied across all of them. Cheap: every
  // map's graph is already an in-memory combine.ts build-time snapshot, no
  // async cost. Real maps dedup by node id (first map wins); a Saved Plan's
  // nodes are kept under their own plan-prefixed key so they coexist
  // alongside their source map's copy rather than overwriting it — a node
  // reachable from both its home library and a plan legitimately shows up
  // twice, tagged differently, since both are valid places to jump from.
  const allNodeRows = useMemo(() => {
    const byId = new Map<string, PlanningNodeRow>()
    for (const map of getGraphMaps()) {
      const graph = getGraphForMap(map.id)
      for (const node of graph.nodes) {
        if (!byId.has(node.id)) byId.set(node.id, { node, mapId: map.id, mapLabel: map.label })
      }
    }
    for (const plan of plans) {
      const graph = resolvePlanGraph(plan.nodeIds)
      for (const node of graph.nodes) {
        byId.set(`${plan.id}::${node.id}`, { node, mapId: plan.id, mapLabel: plan.label })
      }
    }
    return [...byId.values()]
  }, [plans])

  const trimmedQuery = query.trim()
  // A non-empty query turns the NODES box into a cross-map quick-jump
  // (ROADMAP.md's Phase 1 follow-up) instead of a per-map visual filter —
  // showing both at once would be confusing, so this replaces rather than
  // supplements the per-map list.
  const isGlobalSearch = trimmedQuery.length > 0
  const globalResults = useMemo(() => {
    if (!isGlobalSearch) return []
    const scoped = kindFilter.length === 0 ? allNodeRows : allNodeRows.filter((r) => kindFilter.includes(r.node.kind))
    return scoped
      .map((row) => ({ row, score: fuzzyScore(trimmedQuery, row.node.label) }))
      .filter((r): r is { row: PlanningNodeRow; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, GLOBAL_SEARCH_LIMIT)
      .map((r) => r.row)
  }, [isGlobalSearch, allNodeRows, kindFilter, trimmedQuery])

  const nodeRows: PlanningNodeRow[] = isGlobalSearch
    ? globalResults
    : kindFilteredNodes.map((node) => ({ node, mapId, mapLabel: mapLabelFor(mapId) }))

  return {
    mapId,
    setMapId,
    openMapIds,
    openMap,
    closeMap,
    switchToMap,
    selectedId,
    setSelectedId,
    live,
    archivedEntries,
    hoveredId,
    setHoveredId,
    refreshAll,
    createNote,
    setPlanNodeStatus,
    archiveNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    nodeRows,
    isGlobalSearch,
  }
}
