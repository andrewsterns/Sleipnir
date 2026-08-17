import { useEffect, useMemo, useState } from 'react'
import { getGraphForMap, refreshGraphForMap, partitionArchived } from './graph/combine'
import { resolvePlanGraph } from './graph/resolvePlan'
import { resolveAssetPlanGraph } from './graph/resolveAssetPlan'
import { getGraphMaps, type GraphData, type GraphEdge, type GraphMapId, type GraphNode, type NodeStage, type NodeStatus, type SavedPlan } from './graph/types'
import {
  regenerateGraph,
  getArchivedPaths,
  setArchived,
  getNotes,
  setNodeStatus,
  setNodeBorrows,
  updateNote,
  deleteNote,
  deleteWorkspacePath,
  readWorkspaceFile,
  writeWorkspaceFile,
  addPlanNodes,
  type ArchiveEntry,
} from './api/sleipnirApi'
import { useStages, setStage as setStageStore, refreshStages as refreshStagesStore } from './stagesStore'
import { adapterForLanguage } from './graph/importAdapters'
import { fuzzyScore } from '../utils/fuzzyMatch'
import type { SearchSortId } from '../app/UIKit/Search/iSearch'

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

// Must match the id hand-authored for the Workspace guide node in
// graph/proposed-nodes.ts's `welcome` entry — kept as a literal in both
// places rather than a shared export, since it's a single string used twice.
const WELCOME_EXAMPLE_NODE_ID = 'welcome/guide/workspace'

// Best-effort node creation time (ms epoch) for the search's "Recently
// modified" sort. GraphNode carries no timestamp, but note/plan/scaffold nodes
// embed their creation `Date.now()` in the id (see addNote/createPlanNode/
// scaffoldNodes in tools/sleipnir-backend.mjs — e.g. `note/<map>/<slug>-<ms>`
// or `note/<map>/<slug>-<ms>-<index>`). Build-generated library nodes have no
// creation concept and fall back to 0, sorting to the bottom of a
// recency-descending list. The 13-digit match is unambiguous for any
// millisecond timestamp between 2001 and 2286.
function nodeCreatedAt(node: GraphNode): number {
  const m = /(\d{13})(?:-\d+)?$/.exec(node.id)
  return m ? Number(m[1]) : 0
}

// A node's containing folder — archiving a node archives its whole
// View/ViewModel/interface "series" as one manifest entry.
export function folderPathForNode(node: GraphNode): string | null {
  if (!node.filePath) return null
  const parts = node.filePath.replace(/^src\//, '').split('/')
  return parts.slice(0, -1).join('/')
}

// A plan is either graph-node-based (nodeIds, resolved against the real
// repo graph) or asset-based (assetPaths, a Workspace file selection with no
// corresponding graph node anywhere — see NewWorkspacePlanModal) — this
// synthesizes plain, informational GraphNodes for the asset side so the rest
// of PlanningView (tab content, global search) doesn't need to know which
// kind of plan it's looking at. The two sources are additive, not exclusive
// — a plan can hold curated graph nodes (nodeIds) AND loose Workspace files
// pulled straight in (assetPaths, e.g. via LeftRailingView's "Add node ▸"
// context-menu action), and both contribute nodes/edges at once. This is the
// fast/frozen first-paint version (assetEdges as detected at creation/last
// add); resolveAssetPlanGraph (graph/resolveAssetPlan.ts) replaces the asset
// half with a live re-scan right after (see the effect below).
function graphForPlan(plan: SavedPlan): GraphData {
  const nodeGraph = resolvePlanGraph(plan.nodeIds)
  if (!plan.assetPaths?.length) return nodeGraph
  const idFor = (path: string) => `workspace-asset/${plan.id}/${path}`
  const assetNodes: GraphNode[] = plan.assetPaths.map((path) => ({
    id: idFor(path),
    label: path.split('/').pop() ?? path,
    kind: 'built',
    map: plan.id,
    filePath: path,
    type: 'workspace-file',
  }))
  const assetEdges: GraphEdge[] = (plan.assetEdges ?? []).map((e) => ({
    source: idFor(e.source),
    target: idFor(e.target),
    kind: 'borrows',
  }))
  return {
    nodes: [...nodeGraph.nodes, ...assetNodes],
    edges: [...nodeGraph.edges, ...assetEdges],
  }
}

export function usePlanningViewModel(
  initialMapId: GraphMapId = 'welcome',
  // Set by App.tsx right before switching into Planning (see jumpToAiTab)
  // to force the AI tab open even when PlanningView is already mounted —
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
  // Propagates a plan whose `nodeIds` this view just mutated (see addLink's
  // cross-plan pull-in) back up to App.tsx's owning `plans` state, so the
  // change is reflected app-wide and survives tab switches — same shape as
  // App's onCodeGenerated → appendPlanGeneratedFiles update.
  onPlanUpdated?: (plan: SavedPlan) => void,
  // When the built-in Welcome guide has been permanently dismissed (see
  // PlanningView's welcome-dismissed flag), it must not auto-open as the
  // initial tab — a "deleted" map reappearing on next launch would defeat the
  // point. Start with no tab open (the create-a-plan empty state) instead.
  welcomeDismissed = false,
) {
  const planFor = (id: GraphMapId) => plans.find((p) => p.id === id)
  const graphForMap = (id: GraphMapId): GraphData => {
    const plan = planFor(id)
    return plan ? graphForPlan(plan) : getGraphForMap(id)
  }
  const [mapId, setMapIdRaw] = useState<GraphMapId>(initialMapId)
  // Only the initial map starts open as a tab — a fresh launch should show
  // just Welcome, not every registered map at once. Closing a tab (see
  // closeMap) only removes it from this list, it never touches the
  // registry/graph, so every other map is still one click away via the left
  // "PLANS" list in PlanningView.tsx.
  const [openMapIds, setOpenMapIds] = useState<GraphMapId[]>(() =>
    welcomeDismissed && initialMapId === 'welcome' ? [] : [initialMapId],
  )

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
  // reappears in the left PLANS list, just no longer pinned to a tab.
  // Welcome closes like any other tab now (it's just the default content
  // shown once nothing else is open, not a tab that refuses to close). If
  // the closed tab was active, falls back to a neighboring open tab, or
  // Welcome's own content area (without re-pinning it as a tab) if none are
  // left.
  const closeMap = (id: GraphMapId) => {
    setOpenMapIds((prev) => {
      const idx = prev.indexOf(id)
      if (idx === -1) return prev
      const next = prev.filter((m) => m !== id)
      if (mapId !== id) return next
      setMapIdRaw(next[idx] ?? next[idx - 1] ?? 'welcome')
      return next
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
    initialMapId === 'welcome' && !welcomeDismissed ? WELCOME_EXAMPLE_NODE_ID : null,
  )
  const [data, setData] = useState<GraphData>(() => graphForMap(mapId))
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [notes, setNotes] = useState<GraphNode[]>([])
  const [notesEdges, setNotesEdges] = useState<GraphEdge[]>([])
  // Per-node sprint stage overlay ({ [nodeId]: stage }) — hydrated onto every
  // node in `live` below, drives the card toggle + graph visuals. Kept apart
  // from the node records so build-generated nodes can be tagged too. Backed
  // by the shared stagesStore (not local state) so a stage set from any other
  // view — Workspace's file tree, Source Control — shows up here live too.
  const stages = useStages()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<string[]>([])
  // Node-list sort, mirroring the Workspace file tree's own sort dropdown so
  // both left-rail searches offer the same control (see SEARCH_SORT_OPTIONS).
  // 'name' is the historical default; 'recent' orders by node createdAt.
  const [sortOrder, setSortOrder] = useState<SearchSortId>('name')

  useEffect(() => {
    setData(graphForMap(mapId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId])

  // A plan's asset half (see graph/resolveAssetPlan.ts) is never resolved
  // from just the assetPaths/assetEdges snapshot on `plan` itself — the
  // effect above renders that snapshot immediately (via graphForPlan) for a
  // flash-free first paint, then this one replaces it with a live re-scan of
  // the plan's current Workspace file content, so an import added or edited
  // (or a file dropped into an assetFolders directory) since the plan was
  // last touched shows up without needing anything resolved ahead of time.
  // Merged back in alongside the plan's own nodeIds graph (resolvePlanGraph
  // is already cheap/fresh, no async needed there) since the two are
  // additive — see graphForPlan's doc comment. Runs on every mapId switch
  // and whenever `plans` itself changes; refreshAll additionally re-triggers
  // this resolve directly since a manual refresh doesn't change mapId.
  useEffect(() => {
    const plan = planFor(mapId)
    if (!plan?.assetPaths?.length && !plan?.assetFolders?.length) return
    let cancelled = false
    resolveAssetPlanGraph(plan)
      .then((liveAsset) => {
        if (cancelled) return
        const nodeGraph = resolvePlanGraph(plan.nodeIds)
        setData({ nodes: [...nodeGraph.nodes, ...liveAsset.nodes], edges: [...nodeGraph.edges, ...liveAsset.edges] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, plans])

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
  //
  // Stage is deliberately NOT merged in here: the graph's force layout is
  // memoized on this `data` object, so folding stage into it would rebuild the
  // whole simulation (resetting node positions) on every tag change. Stage
  // rides alongside as its own `stages` map instead — consumers look a node's
  // stage up by id (see GraphCanvas's `stages` prop, and the card/list below).
  const live = useMemo(() => {
    // A saved-plan tab renders notes two ways: those authored directly into
    // it (map === plan id) PLUS any note the plan explicitly *references* by
    // id — the latter is how a node linked in from another plan (see addLink)
    // becomes part of this one. De-duped against liveGenerated so a node
    // already resolved there (a build-time node the plan's nodeIds point at)
    // isn't added twice.
    const planNodeIds = new Set(planFor(mapId)?.nodeIds ?? [])
    const generatedIds = new Set(liveGenerated.nodes.map((n) => n.id))
    const notesForMap = notes.filter(
      (n) => !generatedIds.has(n.id) && (n.map === mapId || planNodeIds.has(n.id)),
    )
    const noteIds = new Set(notesForMap.map((n) => n.id))
    const notesEdgesForMap = notesEdges.filter((e) => noteIds.has(e.source) || noteIds.has(e.target))
    return {
      nodes: [...liveGenerated.nodes, ...notesForMap],
      edges: [...liveGenerated.edges, ...notesEdgesForMap],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGenerated, notes, notesEdges, mapId, plans])

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
    // A plan id has no generated/<id>.json on disk for refreshGraphForMap to
    // fetch (it would 404 and fall through to an incorrect empty graph) —
    // resolve it the same way graphForMap does instead.
    const plan = planFor(id)
    const fresh = plan ? graphForPlan(plan) : await refreshGraphForMap(id).catch(() => getGraphForMap(id))
    setData(fresh)
  }

  const refreshAll = async () => {
    // A plan id has no generated/<id>.json on disk for refreshGraphForMap to
    // fetch (it would 404) — its "live" data is always resolved fresh from
    // whatever's currently in every real map, so there's nothing to refetch
    // beyond that resolution itself.
    const plan = planFor(mapId)
    const [fresh] = await Promise.all([
      plan ? Promise.resolve(graphForPlan(plan)) : refreshGraphForMap(mapId),
      getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)),
      refreshNotes(),
      refreshStagesStore(),
    ])
    setData(fresh)
    // A manual refresh doesn't change mapId, so the asset-plan live-resolve
    // effect above won't re-fire on its own — trigger it directly here too.
    if (plan?.assetPaths?.length || plan?.assetFolders?.length) {
      resolveAssetPlanGraph(plan)
        .then((liveAsset) => {
          const nodeGraph = resolvePlanGraph(plan.nodeIds)
          setData({ nodes: [...nodeGraph.nodes, ...liveAsset.nodes], edges: [...nodeGraph.edges, ...liveAsset.edges] })
        })
        .catch(() => {})
    }
  }

  // Only meaningful for plan nodes (created via the AI chat's
  // create_plan_node tool, always start life as 'draft') — moves a node
  // through draft -> approved -> done as the human reviews it.
  const setPlanNodeStatus = async (node: GraphNode, status: NodeStatus) => {
    await setNodeStatus(node.id, status)
    await refreshNotes()
  }

  // Tags (or, passing null, clears) a node's sprint stage — the card toggle's
  // action. Delegates to the shared stagesStore, which optimistically updates
  // its cache (recoloring the graph + card, and any other mounted view, e.g.
  // Workspace's file tree, instantly) then writes through, rolling back on
  // failure. Works for any node id, generated ones included (the whole reason
  // stage lives in an overlay, not on the record).
  const setStage = async (node: GraphNode, stage: NodeStage | null) => {
    await setStageStore(node.id, stage).catch(() => {})
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

  // Hard-delete of a notes.json node (note/scaffolded/plan-step) — the
  // permanent counterpart to archiveNode's restorable soft-hide (which only
  // applies to build-generated src nodes). `opts.deleteFile` also removes the
  // real Workspace file a scaffolded node points at (workspace-relative
  // filePath), same node-only-vs-node-plus-file choice DeletePlanModal offers
  // for a plan's generated files; delete the file first so a failed unlink
  // doesn't leave the node already gone from the graph. Clears the selection
  // if the deleted node was the one open in the detail panel.
  const deleteNode = async (node: GraphNode, opts?: { deleteFile?: boolean }) => {
    if (opts?.deleteFile && node.filePath) {
      await deleteWorkspacePath(node.filePath)
    }
    await deleteNote(node.id)
    if (selectedId === node.id) setSelectedId(null)
    await refreshAll()
  }

  // Rename a node's graph label (its notes.json record). Only notes-backed
  // nodes are editable — see updateNote; callers gate this to nodes present in
  // `notes`. Does not touch any backing file the node points at (that's a
  // separate file rename in the Workspace tree).
  const renameNode = async (node: GraphNode, label: string) => {
    await updateNote(node.id, { label })
    await refreshAll()
  }

  const selectedNode = useMemo(
    () => live.nodes.find((n) => n.id === selectedId) ?? null,
    [live, selectedId],
  )

  // Links now span plans (see addLink/addImporter's own comments) — the
  // *edge* touching selectedNode is always fully present in live.edges
  // (selectedNode always belongs to the current map, so notesEdgesForMap's
  // source-or-target check always keeps it), but the *other endpoint* of a
  // cross-plan edge won't be in live.nodes, which is map-scoped. Resolve
  // against the full cross-map `notes` pool too so a linked node from a
  // different plan still renders instead of silently vanishing.
  const linkableNodesById = useMemo(() => {
    const byId = new Map<string, GraphNode>()
    for (const n of live.nodes) byId.set(n.id, n)
    for (const n of notes) byId.set(n.id, n)
    return byId
  }, [live, notes])

  // A node's linked neighbors, split by effective direction — one row per
  // neighbor. Two subtleties the card depends on for its import/export toggle:
  //  1. Notes are authoritative. A user-authored or flipped link lives in
  //     notes.json (see setNodeBorrows); the parsed import graph
  //     (getGraphForMap) is a static build-time snapshot that can't change at
  //     runtime, so right after a flip it still reports the *old* direction.
  //     Whenever notes has something to say about a pair it wins — otherwise a
  //     flipped file row would keep showing the stale parsed direction and
  //     appear not to toggle at all.
  //  2. Deduped by neighbor id. A node that has a (stale) parsed edge one way
  //     and a notes edge the other way must render once, in its true (notes)
  //     direction — never as two contradictory rows.
  const { borrowsFrom, borrowedBy } = useMemo(() => {
    const empty = { borrowsFrom: [] as GraphNode[], borrowedBy: [] as GraphNode[] }
    if (!selectedNode) return empty
    const selId = selectedNode.id
    const dir = new Map<string, 'out' | 'in'>()
    // Parsed/generated edges first — first write wins within this pass, so a
    // pair already claimed here isn't overwritten by a duplicate parsed edge.
    for (const e of live.edges) {
      if (e.source === selId && !dir.has(e.target)) dir.set(e.target, 'out')
      else if (e.target === selId && !dir.has(e.source)) dir.set(e.source, 'in')
    }
    // ...then let notes override unconditionally, so a flip (which writes a
    // notes edge) always wins over whatever the static parsed graph still shows.
    for (const e of notesEdges) {
      if (e.source === selId) dir.set(e.target, 'out')
      else if (e.target === selId) dir.set(e.source, 'in')
    }
    const out: GraphNode[] = []
    const inn: GraphNode[] = []
    for (const [id, d] of dir) {
      const node = linkableNodesById.get(id)
      if (!node) continue
      ;(d === 'out' ? out : inn).push(node)
    }
    return { borrowsFrom: out, borrowedBy: inn }
  }, [live, selectedNode, linkableNodesById, notesEdges])

  // Node-card link editor — the reverse direction of graphLinkExtension's
  // "##token" (which edits the file and lets the graph catch up via
  // WorkspaceView's onImportsChanged/onLinkResolved); this edits the graph
  // and pushes the change into the real file. Both directions share the same
  // ImportAdapter interface (see graph/importAdapters), just called from
  // opposite ends. Only meaningful for a scaffolded selectedNode (a real file
  // to round-trip) — but `target` itself can be *any* note across *any*
  // plan, not just the current one (notes.json isn't map-scoped at all, see
  // setNodeBorrows — a plain, file-less target just means the import splice
  // below is skipped and only the graph edge gets created).
  // A real import statement is only spliced into the file when both ends are
  // the *same* language — there's no valid way to `import`/`use` a Python or
  // Rust file from TypeScript (and vice versa), so a cross-language link is
  // kept as a graph edge only (a conceptual "this depends on that" that can't
  // be expressed as one language's import). Same rule below in
  // removeLink/addImporter/removeImporter.
  const sameLanguage = (a: GraphNode, b: GraphNode) => !!a.language && a.language === b.language

  // Splice a real import only when the source is itself a file whose language
  // matches the target's — otherwise (a plain note, a cross-language pair, a
  // file-less target) the link is a graph edge only, no file touched.
  const canSpliceImport = (source: GraphNode, target: GraphNode) =>
    !!source.filePath && !!source.language && !!target.filePath && sameLanguage(source, target)

  const addLink = async (target: GraphNode) => {
    // Any selected node can link to any target now — the edge itself is just a
    // graph edge (setNodeBorrows works for any source id). Only a same-language
    // file→file pair also gets a real import spliced in (canSpliceImport).
    if (!selectedNode) return
    await setNodeBorrows(selectedNode.id, [...borrowsFrom.map((n) => n.id), target.id])
    if (canSpliceImport(selectedNode, target)) {
      const adapter = adapterForLanguage(selectedNode.language!)
      if (adapter) {
        const { content } = await readWorkspaceFile(selectedNode.filePath!)
        const next = adapter.insertImport(content, selectedNode.filePath!, target.filePath!, target.label, target.role)
        await writeWorkspaceFile(selectedNode.filePath!, next)
      }
    }
    // Linking on a saved-plan tab to a node that lives in a *different* plan
    // (target.map !== this plan) pulls that node into this plan's nodeIds —
    // otherwise resolvePlanGraph/`live` would filter the target (and the new
    // edge) right back out and the link would be invisible here. Skipped for
    // real-map tabs (no plan to add to) and for targets already on this tab.
    const activePlan = planFor(mapId)
    if (activePlan && target.map !== mapId && !(activePlan.nodeIds ?? []).includes(target.id)) {
      const { plan: updated } = await addPlanNodes(activePlan.id, [target.id])
      onPlanUpdated?.(updated)
    }
    await refreshNotes()
  }

  const removeLink = async (target: GraphNode) => {
    if (!selectedNode) return
    await setNodeBorrows(selectedNode.id, borrowsFrom.filter((n) => n.id !== target.id).map((n) => n.id))
    if (canSpliceImport(selectedNode, target)) {
      const adapter = adapterForLanguage(selectedNode.language!)
      if (adapter) {
        const { content } = await readWorkspaceFile(selectedNode.filePath!)
        const next = adapter.removeImport(content, selectedNode.filePath!, target.filePath!)
        await writeWorkspaceFile(selectedNode.filePath!, next)
      }
    }
    await refreshNotes()
  }

  // Mirror of addLink/removeLink for the incoming ("imported by") direction
  // — edits `source`'s own file (the one doing the importing) instead of
  // selectedNode's, since that's whose import statement actually needs to
  // change. `source` can belong to a different plan than selectedNode (same
  // cross-plan linking addLink allows), which is exactly why sourceBorrows
  // reads from `notesEdges` (the raw, unscoped fetch) rather than `live.edges`
  // (current-map-scoped) — source's *other* pre-existing outgoing edges may
  // have nothing to do with the map currently open, and setNodeBorrows is a
  // full replace, so computing this from a partial view would silently drop
  // them. Lets the detail panel's "Linked" list add/remove both directions
  // without forcing the user to go select the other node's own card first.
  const addImporter = async (source: GraphNode) => {
    // 'source imports selectedNode' — always recorded as a graph edge (works on
    // bare ids, so any node/document type can be exported to another). The real
    // import statement is only spliced into source's file for a same-language
    // file pair (canSpliceImport); otherwise it's a pure edge, no file touched.
    if (!selectedNode) return
    const sourceBorrows = notesEdges.filter((e) => e.source === source.id).map((e) => e.target)
    await setNodeBorrows(source.id, [...sourceBorrows, selectedNode.id])
    if (canSpliceImport(source, selectedNode)) {
      const adapter = adapterForLanguage(source.language!)
      if (adapter) {
        const { content } = await readWorkspaceFile(source.filePath!)
        const next = adapter.insertImport(content, source.filePath!, selectedNode.filePath!, selectedNode.label, selectedNode.role)
        await writeWorkspaceFile(source.filePath!, next)
      }
    }
    await refreshNotes()
  }

  const removeImporter = async (source: GraphNode) => {
    if (!selectedNode) return
    const sourceBorrows = notesEdges.filter((e) => e.source === source.id && e.target !== selectedNode.id).map((e) => e.target)
    await setNodeBorrows(source.id, sourceBorrows)
    if (canSpliceImport(source, selectedNode)) {
      const adapter = adapterForLanguage(source.language!)
      if (adapter) {
        const { content } = await readWorkspaceFile(source.filePath!)
        const next = adapter.removeImport(content, source.filePath!, selectedNode.filePath!)
        await writeWorkspaceFile(source.filePath!, next)
      }
    }
    await refreshNotes()
  }

  // Reverse an existing link in one shot: remove it in the current direction
  // and re-add it the other way, but with a *single* refreshNotes at the end.
  // Doing this as separate removeLink+addImporter calls would refresh twice and
  // pass through an edge-less state in between — the graph would see the edge
  // vanish then reappear (a topology change each time) and reheat gravity. A
  // lone same-endpoint update instead lets GraphCanvas keep every node fixed
  // and just redraw the arrow the other way (see its topologyKey). `other` is
  // the node on the far end. The edge itself reverses for any pair of nodes; a
  // real import statement is only rewritten when both ends are same-language
  // files (canSpliceImport), so a note or a cross-language pair simply flips
  // the arrow with no file touched — import/export is never blocked by type.
  const flipLink = async (other: GraphNode, direction: 'out' | 'in') => {
    if (!selectedNode) return
    if (direction === 'out') {
      // selectedNode imports other  ->  other imports selectedNode
      await setNodeBorrows(selectedNode.id, borrowsFrom.filter((n) => n.id !== other.id).map((n) => n.id))
      if (canSpliceImport(selectedNode, other)) {
        const selAdapter = adapterForLanguage(selectedNode.language!)
        if (selAdapter) {
          const { content } = await readWorkspaceFile(selectedNode.filePath!)
          await writeWorkspaceFile(selectedNode.filePath!, selAdapter.removeImport(content, selectedNode.filePath!, other.filePath!))
        }
      }
      const otherBorrows = notesEdges.filter((e) => e.source === other.id).map((e) => e.target)
      await setNodeBorrows(other.id, [...otherBorrows, selectedNode.id])
      if (canSpliceImport(other, selectedNode)) {
        const otherAdapter = adapterForLanguage(other.language!)
        if (otherAdapter) {
          const { content } = await readWorkspaceFile(other.filePath!)
          await writeWorkspaceFile(other.filePath!, otherAdapter.insertImport(content, other.filePath!, selectedNode.filePath!, selectedNode.label, selectedNode.role))
        }
      }
    } else {
      // other imports selectedNode  ->  selectedNode imports other
      const otherBorrows = notesEdges.filter((e) => e.source === other.id && e.target !== selectedNode.id).map((e) => e.target)
      await setNodeBorrows(other.id, otherBorrows)
      if (canSpliceImport(other, selectedNode)) {
        const otherAdapter = adapterForLanguage(other.language!)
        if (otherAdapter) {
          const { content } = await readWorkspaceFile(other.filePath!)
          await writeWorkspaceFile(other.filePath!, otherAdapter.removeImport(content, other.filePath!, selectedNode.filePath!))
        }
      }
      await setNodeBorrows(selectedNode.id, [...borrowsFrom.map((n) => n.id), other.id])
      if (canSpliceImport(selectedNode, other)) {
        const selAdapter = adapterForLanguage(selectedNode.language!)
        if (selAdapter) {
          const { content } = await readWorkspaceFile(selectedNode.filePath!)
          await writeWorkspaceFile(selectedNode.filePath!, selAdapter.insertImport(content, selectedNode.filePath!, other.filePath!, other.label, other.role))
        }
      }
    }
    await refreshNotes()
  }

  const sortedNodes = useMemo(
    () =>
      [...live.nodes].sort((a, b) =>
        sortOrder === 'name' ? a.label.localeCompare(b.label) : nodeCreatedAt(b) - nodeCreatedAt(a),
      ),
    [live, sortOrder],
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
      const graph = graphForPlan(plan)
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
    // Per-node sprint stage overlay ({ [nodeId]: stage }) — read by the graph
    // (GraphCanvas's `stages` prop), the detail card's STATUS toggle, and the
    // sidebar list's stage dot. Set via setStage below.
    stages,
    // Every note/scaffolded node across *every* plan, unscoped by mapId —
    // the link search menu's candidate pool needs this (see PlanningView's
    // LinkAddDropdown usage), since `live.nodes` only ever holds the
    // currently active map's own nodes.
    notes,
    archivedEntries,
    hoveredId,
    setHoveredId,
    refreshAll,
    setPlanNodeStatus,
    setStage,
    archiveNode,
    deleteNode,
    renameNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    addLink,
    removeLink,
    addImporter,
    removeImporter,
    flipLink,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    sortOrder,
    setSortOrder,
    nodeRows,
    isGlobalSearch,
    mapLabelFor,
  }
}
