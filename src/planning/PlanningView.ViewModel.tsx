import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getGraphForMap, refreshGraphForMap, partitionArchived } from './graph/combine'
import { resolvePlanGraph } from './graph/resolvePlan'
import { resolveAssetPlanGraph } from './graph/resolveAssetPlan'
import { composePlanView, type PlanView, type PlanViewMode } from './graph/composePlanView'
import { pinnedViewFor } from './graph/pinnedViews'
import { getWorkspaceScan, invalidateWorkspaceListing, invalidateWorkspaceScan, type WorkspaceScan } from './graph/workspaceScanCache'
import { buildHealthLens, describeNodeHealth, type NodeHealth } from './graph/healthLens'
import { analyzeWorkspace, getSkills, steerStep, type ArchitectureHealth } from '../platform/sleipnirApi'
import { getGraphMaps, type GraphData, type GraphEdge, type GraphMapId, type GraphNode, type NodeStage, type NodeStatus, type SavedPlan, type SkillScan } from './graph/types'
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
  approvePlanNodes,
  setDefaultNodeStages,
  type ArchiveEntry,
} from '../platform/sleipnirApi'
import { useStages, setStage as setStageStore, refreshStages as refreshStagesStore } from './stagesStore'
import { usePlanActivity } from './usePlanActivity'
import { changedPathsByStep, stepActivity } from './activityLog'
import { nodeTone, stepFileSets } from './graph/nodeTone'
import { useAgentTrail } from './useAgentTrail'
import { currentActivity, nodeForPath, trailView } from './graph/agentTrail'
import { buildSkillGraph, skillTones, skillTrailView } from './graph/skillGraph'
import { effortView } from './graph/trailInsights'
import { steeringFlags, stepMarks } from './graph/steering'
import { useGitDirtyPaths } from './gitChangesStore'
import { isPlanningWatchAvailable } from '../platform/iPlanningWatch'
import { nodeStageKey } from './graph/stages'
import { adapterForLanguage } from './graph/importAdapters'
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

// Must match the id hand-authored for the Workspace guide node in
// graph/proposed-nodes.ts's `welcome` entry — kept as a literal in both
// places rather than a shared export, since it's a single string used twice.
const WELCOME_EXAMPLE_NODE_ID = 'welcome/guide/workspace'

// The Health lens re-analyzes on window refocus only once its last result is
// this old, and draws up to this many files before collapsing folders.
const HEALTH_REFRESH_MS = 20_000
/** A plan tab's two looks: the plan alone, or over the project's architecture. */
export type PlanTabMode = 'plan' | 'architecture'
/** What can be laid over the open view (see `overlay` below). */
export type GraphOverlay = 'health'

/** One node's reading under the lens — see metricFor. */
export interface LensMetric {
  /** 0–1, the same strength the graph's heat shows. */
  value: number
  /** A few characters for the row: "in 12", "40%". */
  label: string
  /** The full reading, for the tooltip. */
  title: string
}
/** A pinned view's plan: none — the view is the whole project. */
const NO_PLAN: GraphData = { nodes: [], edges: [] }

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
    // Matches resolveAssetPlanGraph's own live nodes — a plan's asset picks
    // start as `kind: 'proposed'` (ring), same as every other node-creation path.
    kind: 'proposed',
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

// Every asset-plan node (a Workspace file pulled into a plan, explicitly or
// via the reference walk — see resolveAssetPlanGraph) starts life with an
// explicit 'pending' status, unless it's already tagged something else —
// via Workspace, Source Control, or a previous plan. Never overwrites an
// existing tag; setDefaultNodeStages only fills gaps. Keyed by nodeStageKey
// so it lands under the same `file:<path>` entry Workspace/Source Control
// read and write (see graph/stages.ts) — that shared key is what makes a
// status change made anywhere show up everywhere else. Fire-and-forget:
// nodes already render from the resolve result regardless, this just fills
// the stage overlay in a beat later once the write-through + shared-cache
// refresh completes.
// A step still waiting on a human's go-ahead: never approved, and not already
// finished by an agent that went ahead without it.
function awaitsApproval(n: GraphNode, stages: Record<string, NodeStage>) {
  return n.type === 'plan-step' && n.status === 'draft' && stages[n.id] !== 'completed'
}

function defaultProposeAssetStages(nodes: GraphNode[]) {
  const ids = nodes.filter((n) => n.type === 'workspace-file').map((n) => nodeStageKey(n))
  if (ids.length === 0) return
  setDefaultNodeStages(ids, 'pending')
    .then(() => refreshStagesStore())
    .catch(() => {})
}

// `prev` when `next` holds the same content, else `next` — a refetch that
// changed nothing keeps the old object, so memos keyed on it stay put.
// JSON is enough: these are plain data straight off the planning files.
function keepIfSame<T>(prev: T, next: T): T {
  return prev === next || JSON.stringify(prev) === JSON.stringify(next) ? prev : next
}

export function usePlanningViewModel(
  initialMapId: GraphMapId = 'welcome',
  // Set by App.tsx right before switching into Planning (see jumpToAiTab,
  // and cross-section jumps like jumpToPlanningNode) to force a specific
  // map/tab open even when PlanningView is already mounted — initialMapId
  // alone only applies on first mount. Consumed once via the paired setter,
  // same pattern as App's pendingLibraryFile/pendingPrototypeId. `nodeId`,
  // when present, is handled by PlanningView itself (not here) — selecting a
  // node and centering the graph on it needs centerSignal, which lives in
  // the view, not this hook.
  focusTarget?: { mapId: GraphMapId; nodeId?: string } | null,
  onFocusTargetConsumed?: () => void,
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
  // Only the initial map starts open as a tab — except Welcome, which never
  // auto-opens: a fresh window lands on the create-plan start page, and the
  // guide is opened on demand via its "Get Started" button. Closing a tab (see
  // closeMap) only removes it from this list, it never touches the
  // registry/graph, so every other map is still one click away via the left
  // PLANS picker beside the tabs in PlanningView.tsx.
  const [openMapIds, setOpenMapIds] = useState<GraphMapId[]>(() =>
    initialMapId === 'welcome' ? [] : [initialMapId],
  )

  // The single entry point for "go to this map" — opens it (if not already)
  // and makes it active. Used by tab clicks, the PLANS picker, and
  // external jumps (focusTarget below). Exposed as `setMapId` too so existing
  // call sites (handleRemoveLibrary, DeleteLibraryModal) that just want to
  // navigate to a known-open map (e.g. 'dsm') don't need to change.
  const openMap = (id: GraphMapId) => {
    setOpenMapIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setMapIdRaw(id)
    // A just-created plan's note-backed nodes (see NewWorkspacePlanModal's
    // "ADD NODES" rows) only exist in `notes`, which — unlike a plan's
    // asset-path nodes — isn't re-derived live on every read; without this,
    // a plan opened right after creation can show its checkbox/tree picks
    // but not its note rows until some unrelated refreshAll() happens to fire.
    if (planFor(id)) refreshNotes().catch(() => {})
  }
  const setMapId = openMap

  // Closes a tab without deleting anything — the map stays registered and
  // stays in the PLANS picker, just no longer pinned to a tab.
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
    if (!focusTarget) return
    openMap(focusTarget.mapId)
    onFocusTargetConsumed?.()
  }, [focusTarget, onFocusTargetConsumed])
  // The Welcome tab opens with its example node already selected — a new
  // user sees the detail panel (and the "Open in Component Library" link)
  // immediately, instead of an empty panel until they click something.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialMapId === 'welcome' && !welcomeDismissed ? WELCOME_EXAMPLE_NODE_ID : null,
  )
  const [data, setDataRaw] = useState<GraphData>(() => graphForMap(mapId))
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [notes, setNotesRaw] = useState<GraphNode[]>([])
  const [notesEdges, setNotesEdgesRaw] = useState<GraphEdge[]>([])
  // Every planning-file change refetches all of these (see the watcher
  // subscription below), and most refetches — another window's write, a
  // stage-only touch, a re-save with nothing new — return exactly what's
  // already here. Keeping the existing value then means nothing downstream
  // (live, planView, the NODES list, the graph) recomputes for no change.
  const setData = (next: GraphData) => setDataRaw((prev) => keepIfSame(prev, next))
  const setNotes = (next: GraphNode[]) => setNotesRaw((prev) => keepIfSame(prev, next))
  const setNotesEdges = (next: GraphEdge[]) => setNotesEdgesRaw((prev) => keepIfSame(prev, next))
  // Per-node sprint stage overlay ({ [nodeId]: stage }) — hydrated onto every
  // node in `live` below, drives the card toggle + graph visuals. Kept apart
  // from the node records so build-generated nodes can be tagged too. Backed
  // by the shared stagesStore (not local state) so a stage set from any other
  // view — Workspace's file tree, Source Control — shows up here live too.
  const stages = useStages()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
        defaultProposeAssetStages(liveAsset.nodes)
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

  // Nodes created since the project opened — by Add Node, the AI, or the CLI,
  // every one of which lands in notes.json — drawn blue in the graph until
  // they're clicked. The same "new until seen" rule the Workspace tree applies
  // to files (see FolderBrowserView.ViewModel's newPaths). The baseline is the
  // first notes load; PlanningView remounts per project, so it resets with one.
  const baselineNoteIdsRef = useRef<Set<string> | null>(null)
  const seenNewIdsRef = useRef(new Set<string>())
  const [newNodeIds, setNewNodeIds] = useState<ReadonlySet<string>>(new Set())

  const refreshNotes = async () => {
    const { nodes: fresh, edges } = await getNotes()
    setNotes(fresh)
    setNotesEdges(edges)
    const baseline = baselineNoteIdsRef.current
    if (!baseline) {
      baselineNoteIdsRef.current = new Set(fresh.map((n) => n.id))
      return
    }
    const next = fresh.map((n) => n.id).filter((id) => !baseline.has(id) && !seenNewIdsRef.current.has(id))
    setNewNodeIds((prev) => (prev.size === next.length && next.every((id) => prev.has(id)) ? prev : new Set(next)))
  }

  // Clicking a new node is seeing it.
  useEffect(() => {
    if (!selectedId || !newNodeIds.has(selectedId)) return
    seenNewIdsRef.current.add(selectedId)
    setNewNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(selectedId)
      return next
    })
  }, [selectedId, newNodeIds])

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
    // A saved-plan tab renders notes three ways: those authored directly into
    // it (map === plan id), any note the plan explicitly *references* by id —
    // how a node linked in from another plan (see addLink) becomes part of this
    // one — and any plan step or planned file that belongs to it by `planId`
    // (the same membership the status bar and approvePlanNodes count). De-duped
    // against liveGenerated so a node already resolved there (a build-time node
    // the plan's nodeIds point at) isn't added twice.
    const planNodeIds = new Set(planFor(mapId)?.nodeIds ?? [])
    const generatedIds = new Set(liveGenerated.nodes.map((n) => n.id))
    const isPlanTab = !!planFor(mapId)
    const notesForMap = notes.filter(
      (n) => !generatedIds.has(n.id) && (n.map === mapId || planNodeIds.has(n.id) || (isPlanTab && n.planId === mapId)),
    )
    const noteIds = new Set(notesForMap.map((n) => n.id))
    const notesEdgesForMap = notesEdges.filter((e) => noteIds.has(e.source) || noteIds.has(e.target))
    return {
      nodes: [...liveGenerated.nodes, ...notesForMap],
      edges: [...liveGenerated.edges, ...notesEdgesForMap],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveGenerated, notes, notesEdges, mapId, plans])

  // What the open tab draws. A pinned view (graph/pinnedViews.ts) is a whole-
  // project view with no plan: the architecture, the agents' skills, or the
  // architecture under the Health lens. A plan tab shows the plan on its own
  // ('plan'), or over the project's architecture ('architecture' — see
  // graph/composePlanView.ts), remembered per plan tab for the session.
  const [planViewModes, setPlanViewModes] = useState<Record<string, PlanTabMode>>({})
  const activePlanId = planFor(mapId)?.id
  const pinnedView = pinnedViewFor(mapId)
  const planViewMode: PlanTabMode = planViewModes[mapId] ?? 'plan'
  const setPlanViewMode = (mode: PlanTabMode) => setPlanViewModes((prev) => ({ ...prev, [mapId]: mode }))
  // The lens laid over whatever's open — a plan, Architecture, Skills — without
  // changing what it shows: Health, one switch for both readings — the import
  // analysis on the graph and the rows, and where agents' effort went (from
  // the trail) in the panel beside them. For the session.
  const [overlay, setOverlay] = useState<GraphOverlay | null>(null)
  const viewMode: PlanViewMode | undefined = pinnedView?.mode ?? (activePlanId ? planViewMode : undefined)

  // The shared cached workspace scan (graph/workspaceScanCache.ts). Until it
  // arrives the plan renders alone; bumping scanVersion re-asks the cache,
  // which only does work for whatever was invalidated.
  const [workspaceScan, setWorkspaceScan] = useState<WorkspaceScan | null>(null)
  const [scanVersion, setScanVersion] = useState(0)
  // Read on every view, not only Architecture: the picker's search finds the
  // project's files from anywhere. The scan is cached (workspaceScanCache).
  useEffect(() => {
    let cancelled = false
    getWorkspaceScan()
      .then((scan) => {
        if (!cancelled) setWorkspaceScan(scan)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [scanVersion])
  // Files may have been added or removed outside Sleipnir while the window was
  // in the background — pick those up (cheaply: new files only) on return.
  useEffect(() => {
    const onFocus = () => {
      invalidateWorkspaceListing()
      setScanVersion((v) => v + 1)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  // The Health lens's numbers — tools/architecture-health.mjs, the same
  // analysis /optimize agents read, run off the main thread. Re-asked whenever
  // the scan is, but a window refocus only re-runs it once the last result is
  // HEALTH_REFRESH_MS old: on a big project the analysis takes seconds.
  const [health, setHealth] = useState<ArchitectureHealth | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const forceHealthRef = useRef(false)
  const wantsHealth = overlay === 'health'
  useEffect(() => {
    if (!wantsHealth) return
    if (health && !forceHealthRef.current && Date.now() - health.analyzedAt < HEALTH_REFRESH_MS) return
    forceHealthRef.current = false
    let cancelled = false
    analyzeWorkspace()
      .then((h) => {
        if (cancelled) return
        setHealth(h)
        setHealthError(null)
      })
      .catch((err) => {
        if (!cancelled) setHealthError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
    // `health` is read only for its age — a fresh result must not re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsHealth, scanVersion])
  // Files each step changed (from the plan's activity log), drawn beside it.
  // The log is re-read on every status report, so the map is keyed by its
  // content: only a report that actually adds changed files re-lays the graph.
  const planEvents = usePlanActivity(activePlanId)
  const stepChangesKey = useMemo(() => JSON.stringify([...changedPathsByStep(planEvents)]), [planEvents])
  const stepChanges = useMemo(() => new Map<string, string[]>(JSON.parse(stepChangesKey)), [stepChangesKey])
  // The SKILLS view's data: every skill the project's agents can run, read when
  // the view opens (tools/skillScan.mjs).
  const [skillScan, setSkillScan] = useState<SkillScan | null>(null)
  const wantsSkills = viewMode === 'skills'
  useEffect(() => {
    if (!wantsSkills) return
    let cancelled = false
    getSkills()
      .then((scan) => { if (!cancelled) setSkillScan(scan) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [wantsSkills])
  const refreshSkills = () => getSkills().then(setSkillScan).catch(() => {})
  const skillGraph = useMemo(() => (wantsSkills && skillScan ? buildSkillGraph(skillScan) : null), [wantsSkills, skillScan])
  const planView: PlanView = useMemo(
    () =>
      skillGraph
        ? { data: skillGraph, overlay: new Set<string>() }
        : viewMode && viewMode !== 'skills'
          ? composePlanView(pinnedView ? NO_PLAN : live, activePlanId ?? mapId, workspaceScan, viewMode, undefined, stepChanges)
          : { data: live, overlay: new Set<string>() },
    [skillGraph, live, activePlanId, mapId, pinnedView, workspaceScan, viewMode, stepChanges],
  )
  // Health on the open view's own nodes: each file's numbers land on the node
  // drawing it (or the folder it collapsed into). Kept apart from planView, so
  // turning the lens on never re-lays the graph.
  const healthLens = useMemo(
    () => (wantsHealth && health ? buildHealthLens(health, nodeForPath(planView.data.nodes)) : null),
    [wantsHealth, health, planView],
  )
  // The same numbers by file path, for nodes the graph doesn't key by file —
  // a plan step reads the hottest of the files it touches.
  const healthByPath = useMemo(() => (wantsHealth && health ? buildHealthLens(health, (p) => p).nodes : null), [wantsHealth, health])
  // Each node's tone: its status combined with git (graph/nodeTone.ts) — what
  // the graph and the NODES list paint. A step's own tone needs every file it
  // touches: the ones it plans, the ones it edits and the ones it changed.
  const gitDirty = useGitDirtyPaths()
  const scannedFiles = useMemo(() => (workspaceScan ? new Set(workspaceScan.files) : null), [workspaceScan])
  // Over every plan, not just the open one: a file finished in another plan
  // still reads as done work waiting for a commit, not as work in progress.
  const stepFiles = useMemo(() => {
    const files = new Map<string, string[]>()
    const add = (stepId: string, path: string) => files.set(stepId, [...(files.get(stepId) ?? []), path])
    for (const n of notes) {
      for (const p of n.type === 'plan-step' ? (n.editsPaths ?? []) : []) add(n.id, p)
      if (n.type === 'planned-file' && n.stepId && n.filePath) add(n.stepId, n.filePath)
    }
    for (const [stepId, paths] of stepChanges) for (const p of paths) add(stepId, p)
    return files
  }, [notes, stepChanges])
  const stepSets = useMemo(
    () => stepFileSets(notes.filter((n) => n.type === 'plan-step'), (s) => stepFiles.get(s.id) ?? [], stages),
    [notes, stepFiles, stages],
  )
  const toneFor = useCallback(
    (node: GraphNode) =>
      nodeTone(node, {
        stages,
        dirty: gitDirty,
        exists: scannedFiles ? (p) => scannedFiles.has(p) : undefined,
        stepFiles,
        ...stepSets,
      }),
    [stages, gitDirty, scannedFiles, stepFiles, stepSets],
  )
  const statusTones = useMemo(() => new Map(planView.data.nodes.map((n) => [n.id, toneFor(n)])), [planView, toneFor])
  // The live agent trail over whatever the graph is showing: what agents are
  // reading, editing and testing right now, at no cost to them.
  const { entries: trailEntries, now: trailNow } = useAgentTrail()
  // In the SKILLS view the trail and the tones speak in skills: which ones are
  // used, and where the agent is in its instructions right now.
  const trail = useMemo(
    () => (skillGraph && skillScan ? skillTrailView(trailEntries, skillScan, trailNow) : trailView(trailEntries, planView.data.nodes, trailNow)),
    [skillGraph, skillScan, trailEntries, planView, trailNow],
  )
  const tones = useMemo(
    () => (skillGraph && skillScan ? skillTones(skillGraph, trailEntries, skillScan) : statusTones),
    [skillGraph, skillScan, trailEntries, statusTones],
  )
  const agentNow = useMemo(() => currentActivity(trailEntries, trailNow), [trailEntries, trailNow])
  // Steering the step in progress: the files a person marked focus or avoid for
  // it, and the moments worth a look the trail raises (graph/steering.ts).
  const activeStep = useMemo(
    () => (activePlanId ? live.nodes.find((n) => n.type === 'plan-step' && n.planId === activePlanId && (stages[n.id] === 'in_progress' || stages[n.id] === 'testing')) ?? null : null),
    [activePlanId, live, stages],
  )
  const activeMarks = useMemo(() => (activeStep ? stepMarks(planEvents, activeStep.id) : { focus: [], avoid: [] }), [activeStep, planEvents])
  const steerFlags = useMemo(() => {
    if (!activeStep) return []
    const since = stepActivity(planEvents, activeStep.id).startedAt ?? 0
    return steeringFlags({ entries: trailEntries, since, stepFiles: [...(stepFiles.get(activeStep.id) ?? []), ...activeMarks.focus], marks: activeMarks })
  }, [activeStep, planEvents, trailEntries, stepFiles, activeMarks])
  const steerFile = (path: string, mark: 'focus' | 'avoid' | 'clear') => {
    if (activeStep) steerStep(activeStep.id, path, mark).catch(() => {})
  }
  // Where agents' effort went, from the same trail — part of the Health lens,
  // computed only while it's on.
  const showEffort = overlay === 'health'
  const effort = useMemo(() => (showEffort ? effortView(trailEntries, planView.data.nodes) : null), [showEffort, trailEntries, planView])

  /**
   * What the lens says about one node, for its list row: a 0–1 strength (the
   * graph's heat) and a short reading. A plan step has no file of its own, so
   * it takes the strongest of the files it plans, edits or changed. null when
   * the lens is off or has nothing on this node.
   */
  const metricFor = useCallback(
    (node: GraphNode): LensMetric | null => {
      const files = node.type === 'plan-step' ? (stepFiles.get(node.id) ?? []) : []
      if (overlay === 'health') {
        const own = healthLens?.nodes.get(node.id) ?? (node.filePath ? healthByPath?.get(node.filePath) : undefined)
        if (own) return { value: own.heat, label: `in ${own.fanIn}`, title: describeNodeHealth(own) }
        const hits = files.map((p) => healthByPath?.get(p)).filter((h): h is NodeHealth => !!h)
        if (hits.length === 0) return null
        const hottest = hits.reduce((a, b) => (b.heat > a.heat ? b : a))
        return { value: hottest.heat, label: `in ${hottest.fanIn}`, title: `Hottest of its ${hits.length} file${hits.length === 1 ? '' : 's'}: ${hottest.path} — ${describeNodeHealth(hottest)}` }
      }
      return null
    },
    [overlay, healthLens, healthByPath, stepFiles],
  )
  // Full re-read of every file (a manual refresh).
  const rescanWorkspace = () => {
    invalidateWorkspaceScan()
    forceHealthRef.current = true
    setScanVersion((v) => v + 1)
  }

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
    // A plan change can mean files were written (an approved step) — re-list.
    invalidateWorkspaceListing()
    setScanVersion((v) => v + 1)
    // A manual refresh doesn't change mapId, so the asset-plan live-resolve
    // effect above won't re-fire on its own — trigger it directly here too.
    if (plan?.assetPaths?.length || plan?.assetFolders?.length) {
      resolveAssetPlanGraph(plan)
        .then((liveAsset) => {
          const nodeGraph = resolvePlanGraph(plan.nodeIds)
          setData({ nodes: [...nodeGraph.nodes, ...liveAsset.nodes], edges: [...nodeGraph.edges, ...liveAsset.edges] })
          defaultProposeAssetStages(liveAsset.nodes)
        })
        .catch(() => {})
    }
  }

  // The Planning graph is a live view over `.planning/`'s files, full stop —
  // whatever changed them (this app's own writes, its in-app AI chat, an
  // external terminal AI agent via tools/sleipnir-plan.mjs, or a hand edit)
  // should show up here without a manual refresh (see electron/
  // planningWatcher.cjs). refreshAll is redefined every render (it closes
  // over mapId/plans/etc.), so a plain ref keeps this mount-once subscription
  // always calling the current version instead of a stale closure.
  const refreshAllRef = useRef(refreshAll)
  refreshAllRef.current = refreshAll
  useEffect(() => {
    if (!isPlanningWatchAvailable()) return
    return window.planningWatchAPI!.onChanged((info) => {
      // A stages.json-only batch (this window's own setStage write bouncing
      // back through the watcher, or an external edit to it) only needs the
      // shared stagesStore overlay re-synced — refetching+setData'ing the
      // whole graph here would rebuild GraphCanvas's `data` on every stage
      // toggle and reheat its force layout for no topology reason, flinging
      // nodes around. Anything else (plans/notes/archive) still gets the full
      // refresh.
      if (info?.stagesOnly) {
        refreshStagesStore().catch(() => {})
        return
      }
      // A canvas-only batch is the legacy .planning/canvas/ folder being
      // emptied by Canvas's board migration (boards now save to
      // .canvas/.boards/, outside .planning). Boards hold no graph nodes, so
      // there's nothing to refetch.
      if (info?.canvasOnly) return
      refreshAllRef.current().catch(() => {})
    })
  }, [])

  // Auto-opens a plan tab the moment it first appears in `plans` (App.tsx's
  // own planningWatchAPI subscription keeps that prop live — see App.tsx) —
  // "watch the AI build it" only means something if you're actually looking
  // at the tab. Skips the very first population (mount, or switching to a
  // project with existing plans) so opening a project doesn't force-open
  // every plan tab it already has; only a plan id that's genuinely new since
  // the last render counts. openMap (not raw setMapId) both opens AND makes
  // active, and already refreshes `notes` for a just-created plan on its own
  // (see openMap's own comment above) so this doesn't need to duplicate that.
  const prevPlanIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const currentIds = new Set(plans.map((p) => p.id))
    const prevIds = prevPlanIdsRef.current
    prevPlanIdsRef.current = currentIds
    if (!prevIds) return
    const arrived = plans.filter((p) => !prevIds.has(p.id))
    if (!arrived.length) return
    const newest = arrived.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
    openMap(newest.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans])

  // Live "AI is building this plan" status for whichever plan tab is active
  // — drives PlanBuildStatusBar. `expectedSteps` (tools/sleipnir-plan.mjs's
  // --total-steps) gives a real N-of-M count and a definitive completion
  // instant; without it, completion is a quiet-period guess (see the effect
  // below) since an external CLI process gives no other "I'm done" signal.
  const activePlan = planFor(mapId)
  const planStepCount = useMemo(() => {
    if (!activePlan) return 0
    const refIds = new Set(activePlan.nodeIds ?? [])
    return notes.filter((n) => n.type === 'plan-step' && (n.planId === activePlan.id || refIds.has(n.id))).length
  }, [activePlan, notes])
  const draftStepCount = useMemo(() => {
    if (!activePlan) return 0
    const refIds = new Set(activePlan.nodeIds ?? [])
    return notes.filter((n) => awaitsApproval(n, stages) && (n.planId === activePlan.id || refIds.has(n.id))).length
  }, [activePlan, notes, stages])
  // Of draftStepCount, how many need an individual file review — a staged
  // proposedFile (see backend's proposeFileNode) or planned files (see
  // ApproveStepModal). Neither is included in Approve All's bulk write (see
  // approvePlanNodes' needsReviewIds), so the status bar can say so instead of
  // silently under-counting what Approve All actually did.
  const draftFileStepCount = useMemo(() => {
    if (!activePlan) return 0
    const refIds = new Set(activePlan.nodeIds ?? [])
    const stepsWithPlannedFiles = new Set(notes.filter((n) => n.stepId).map((n) => n.stepId))
    return notes.filter(
      (n) =>
        awaitsApproval(n, stages) &&
        (!!n.proposedFile || stepsWithPlannedFiles.has(n.id)) &&
        (n.planId === activePlan.id || refIds.has(n.id)),
    ).length
  }, [activePlan, notes, stages])

  // Resets on every new step (or a different plan becoming active) and, if
  // nothing else arrives for a few seconds, treats the build as finished.
  // Runs even when --total-steps was declared: confirmed by testing (an
  // agent that declares 8 but deliberately stops at 5 — "the rest turned
  // out unnecessary") that without this fallback, `complete` (reached-count
  // only) never fires and the build sits at "5 of 8" forever with no path
  // to the completion banner or Approve All. The declared count still wins
  // when it's actually reached — that happens the instant the write lands,
  // synchronously, well before this timer would ever fire — so the common
  // accurate-count case is unaffected; this only rescues the undercount case.
  const [heuristicComplete, setHeuristicComplete] = useState(false)
  useEffect(() => {
    setHeuristicComplete(false)
    if (!activePlan || planStepCount === 0) return
    const timer = setTimeout(() => setHeuristicComplete(true), 3500)
    return () => clearTimeout(timer)
  }, [activePlan, planStepCount])

  const planBuildStatus = useMemo(() => {
    if (!activePlan || planStepCount === 0) return null
    const expectedSteps = activePlan.expectedSteps
    const reachedDeclaredCount = expectedSteps ? planStepCount >= expectedSteps : false
    return {
      planId: activePlan.id,
      label: activePlan.label,
      stepCount: planStepCount,
      draftCount: draftStepCount,
      draftFileCount: draftFileStepCount,
      expectedSteps,
      complete: reachedDeclaredCount || heuristicComplete,
      // Distinguishes "hit the number you said you'd hit" from "gave up
      // waiting, actual count fell short of what was declared" — lets the
      // status bar be honest about which one happened instead of implying
      // the bar quietly reached 100% when it visually didn't.
      stoppedShort: !reachedDeclaredCount && !!expectedSteps && heuristicComplete,
    }
  }, [activePlan, planStepCount, draftStepCount, draftFileStepCount, heuristicComplete])

  // Bulk-approves every draft step in one write (see backend's
  // approvePlanNodes) — PlanBuildStatusBar's "APPROVE ALL", the counterpart
  // to each card's own individual APPROVE button (setPlanNodeStatus below).
  const approveAllDrafts = async (planId: string) => {
    await approvePlanNodes(planId)
    await refreshNotes()
  }

  // Only meaningful for plan nodes (created via the AI chat's
  // create_plan_node tool, always start life as 'draft') — records a human's
  // approval. The backend moves the step's status along with it (approved →
  // in progress, done → completed), so the overlay is re-read after.
  const setPlanNodeStatus = async (node: GraphNode, status: NodeStatus) => {
    await setNodeStatus(node.id, status)
    await Promise.all([refreshNotes(), refreshStagesStore().catch(() => {})])
  }

  // Tags (or, passing null, clears) a node's sprint stage — the card toggle's
  // action. Delegates to the shared stagesStore, which optimistically updates
  // its cache (recoloring the graph + card, and any other mounted view, e.g.
  // Workspace's file tree, instantly) then writes through, rolling back on
  // failure. Works for any node id, generated ones included (the whole reason
  // stage lives in an overlay, not on the record).
  const setStage = async (node: GraphNode, stage: NodeStage | null) => {
    await setStageStore(nodeStageKey(node), stage).catch(() => {})
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

  // What's drawn (planView) first, so an architecture file or folder node in a
  // plan tab's architecture view has a card too.
  const selectedNode = useMemo(
    () => planView.data.nodes.find((n) => n.id === selectedId) ?? live.nodes.find((n) => n.id === selectedId) ?? null,
    [planView, live, selectedId],
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

  const sortedNodes = useMemo(() => [...live.nodes].sort((a, b) => a.label.localeCompare(b.label)), [live])

  // Every node in the current map/plan explicitly tagged 'pending' — the "RUN
  // PLAN" batch driver's queue (see PlanningView.tsx's runPlan). Untagged nodes
  // are left out so a whole build-generated map isn't queued. Same order as the NODES
  // list itself (whatever sortOrder is active); v1 deliberately doesn't try
  // to derive a dependency/topological order from edges — plan-step edges
  // only exist for AI-created nodes, import/borrows edges aren't guaranteed
  // to form a usable DAG, and the single-node BUILD WITH AI button already
  // gives manual ordering control when it matters for one node.
  const todoNodes = useMemo(() => sortedNodes.filter((n) => stages[nodeStageKey(n)] === 'pending'), [sortedNodes, stages])

  const mapLabelFor = (id: GraphMapId): string =>
    getGraphMaps().find((m) => m.id === id)?.label ?? planFor(id)?.label ?? pinnedViewFor(id)?.label ?? id

  // Every node across every registered map + Saved Plan, for the picker's
  // search (searchNodes below) — the same "resolve via
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

  // The picker's cross-map quick-jump: the best fuzzy matches for `query`
  // across every map and plan, the open view's own nodes (an Architecture
  // file, a skill) included first.
  const searchNodes = useCallback(
    (query: string, here: GraphNode[] = []): PlanningNodeRow[] => {
      const q = query.trim()
      if (!q) return []
      const seen = new Set<string>()
      const rows = [...here.map((node) => ({ node, mapId, mapLabel: mapLabelFor(mapId) })), ...allNodeRows].filter((r) => {
        const key = `${r.mapId}::${r.node.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return rows
        .map((row) => ({ row, score: fuzzyScore(q, row.node.label) }))
        .filter((r): r is { row: PlanningNodeRow; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, GLOBAL_SEARCH_LIMIT)
        .map((r) => r.row)
    },
    // mapLabelFor reads the same maps and plans allNodeRows does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allNodeRows, mapId],
  )

  const nodeRows: PlanningNodeRow[] = sortedNodes.map((node) => ({ node, mapId, mapLabel: mapLabelFor(mapId) }))

  return {
    mapId,
    setMapId,
    newNodeIds,
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
    planBuildStatus,
    approveAllDrafts,
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
    nodeRows,
    searchNodes,
    mapLabelFor,
    todoNodes,
    isPlanTab: !!activePlanId,
    pinnedView,
    viewMode,
    planView,
    tones,
    toneFor,
    trail,
    agentNow,
    skillScan: wantsSkills ? skillScan : null,
    showEffort,
    overlay,
    setOverlay,
    effort,
    metricFor,
    activeStep,
    activeMarks,
    steerFlags,
    steerFile,
    planEvents,
    refreshSkills,
    planViewMode,
    setPlanViewMode,
    workspaceScanReady: !!workspaceScan,
    rescanWorkspace,
    workspaceScan,
    health: wantsHealth ? health : null,
    healthLens,
    healthError: wantsHealth ? healthError : null,
  }
}
