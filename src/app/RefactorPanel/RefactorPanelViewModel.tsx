import { useEffect, useMemo, useState } from 'react'
import {
  previewRefactor,
  applyRefactor,
  getCurrentArchitecture,
  listLibraries,
  type Architecture,
  type LibraryEntry,
  type RefactorPlan,
} from '../../00_planning/api/sleipnirApi'
import { getGraphForMap } from '../../00_planning/graph/combine'
import type { GraphData, GraphNode } from '../../00_planning/graph/types'
import { RefactorPanelProps } from './iRefactorPanel'

export const ARCHITECTURE_OPTIONS: { value: Architecture; label: string }[] = [
  { value: 'atomic', label: 'Atomic' },
  { value: 'mvvm', label: 'MVVM' },
  { value: 'mvc', label: 'MVC' },
  { value: 'mvp', label: 'MVP' },
]

export interface ArchitectureBucket {
  label: string
  nodeIds: string[]
}

const LIBRARY_TIER_LABEL: Record<string, string> = {
  atom: 'Atoms',
  molecule: 'Molecules',
  organism: 'Organisms',
  template: 'Templates',
  page: 'Pages',
}
const LIBRARY_TYPES = new Set(Object.keys(LIBRARY_TIER_LABEL))

// Mirrors tools/refactor-engine.mjs's LAYOUT — role-folder label per
// architecture. Display-only: this buckets the mini preview instantly from
// already-loaded graph nodes, without a network round trip per tab. The
// fetched RefactorPlan (below) remains the actual source of truth for what
// really moves.
const ROLE_FOLDER_LABEL: Record<Exclude<Architecture, 'atomic'>, Record<'view' | 'viewModel' | 'interface', string>> = {
  mvvm: { view: 'Views', viewModel: 'ViewModels', interface: 'Interfaces' },
  mvc: { view: 'Views', viewModel: 'Controllers', interface: 'Models' },
  mvp: { view: 'Views', viewModel: 'Presenters', interface: 'Models' },
}

const BUCKET_ORDER: Record<Architecture, string[]> = {
  atomic: ['Atoms', 'Molecules', 'Organisms', 'Templates', 'Pages'],
  mvvm: ['Views', 'ViewModels', 'Interfaces'],
  mvc: ['Views', 'Controllers', 'Models'],
  mvp: ['Views', 'Presenters', 'Models'],
}

// Mirrors refactor-engine.mjs's roleForFile, but classifies an already-built
// GraphNode (label + id) instead of reading a file off disk.
function roleForNode(node: GraphNode): 'view' | 'viewModel' | 'interface' {
  if (/ViewModel$/.test(node.label)) return 'viewModel'
  const segments = node.id.split('/')
  const folder = segments.length >= 2 ? segments[segments.length - 2] : node.label
  if (node.label === `i${folder}`) return 'interface'
  return 'view'
}

function bucketsForArchitecture(nodes: GraphNode[], architecture: Architecture): ArchitectureBucket[] {
  const groups = new Map<string, string[]>()
  for (const node of nodes) {
    if (!node.type || !LIBRARY_TYPES.has(node.type)) continue
    const label = architecture === 'atomic'
      ? LIBRARY_TIER_LABEL[node.type]
      : ROLE_FOLDER_LABEL[architecture][roleForNode(node)]
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(node.id)
  }
  const order = BUCKET_ORDER[architecture]
  return [...groups.entries()]
    .map(([label, nodeIds]) => ({ label, nodeIds }))
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
}

// Every view/viewModel/interface file gains exactly one folder level under a
// role-foldered architecture (see refactor-engine.mjs's targetPathFor) —
// atomic has none. A plain, deterministic structural tradeoff, independent
// of which files actually move in the currently-open preview.
function folderDepthFor(architecture: Architecture): number {
  return architecture === 'atomic' ? 4 : 5
}

// Fixed by bucket POSITION (not label), so "the first bucket" (Views, or
// Atoms) reads as the same color across every architecture tab — makes
// cycling tabs read as "the same files recolored", not a new palette each time.
const BUCKET_COLORS = ['#7aa7e9', '#e0a458', '#c77dd1', '#6cc9a4', '#e06c6c']

function bucketColorMap(buckets: ArchitectureBucket[]): Map<string, string> {
  const map = new Map<string, string>()
  buckets.forEach((bucket, i) => {
    const color = BUCKET_COLORS[i % BUCKET_COLORS.length]
    for (const id of bucket.nodeIds) map.set(id, color)
  })
  return map
}

export function useRefactorPanelViewModel({ onApplied, libraryId: initialLibraryId = 'dsm' }: RefactorPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [libraryId, setLibraryId] = useState(initialLibraryId)
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [current, setCurrent] = useState<Architecture>('atomic')
  const [activeArchitecture, setActiveArchitecture] = useState<Architecture>('atomic')
  // Keyed by "libraryId:architecture" so switching libraries never shows a
  // stale plan/cache entry meant for a different one.
  const [plans, setPlans] = useState<Partial<Record<string, RefactorPlan>>>({})
  const [loading, setLoading] = useState<Partial<Record<string, boolean>>>({})
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [isApplying, setIsApplying] = useState(false)

  const cacheKey = `${libraryId}:${activeArchitecture}`

  // RefactorPanel can persist across a parent's context change (e.g.
  // Planning switching tabs without unmounting) — re-sync from the prop
  // whenever it changes, but only while closed, so an explicit in-panel
  // library pick isn't yanked away mid-session by an unrelated prop update.
  useEffect(() => {
    if (!isOpen) setLibraryId(initialLibraryId)
  }, [initialLibraryId, isOpen])

  useEffect(() => {
    getCurrentArchitecture(libraryId).then(({ current }) => setCurrent(current)).catch(() => {})
  }, [libraryId])

  const dsmGraph: GraphData = useMemo(() => getGraphForMap(libraryId), [libraryId])

  const open = () => {
    listLibraries('component').then(({ libraries }) => setLibraries(libraries)).catch(() => {})
    setActiveArchitecture(current)
    setIsOpen(true)
  }

  const close = () => setIsOpen(false)

  // Fetch-on-demand: each library+architecture's real plan (the move/rewrite
  // list) loads once per panel session and is cached, so re-visiting a tab
  // is instant — only the mini preview + depth metric need to be instant on
  // the very first switch, which they are (computed from dsmGraph locally).
  useEffect(() => {
    if (!isOpen) return
    if (plans[cacheKey] || loading[cacheKey]) return
    setLoading((l) => ({ ...l, [cacheKey]: true }))
    previewRefactor(activeArchitecture, libraryId)
      .then((plan) => {
        setPlans((p) => ({ ...p, [cacheKey]: plan }))
        setErrors((e) => ({ ...e, [cacheKey]: undefined }))
      })
      .catch((e) => {
        setErrors((er) => ({ ...er, [cacheKey]: e instanceof Error ? e.message : String(e) }))
      })
      .finally(() => {
        setLoading((l) => ({ ...l, [cacheKey]: false }))
      })
  }, [isOpen, cacheKey, activeArchitecture, libraryId, plans, loading])

  const confirmApply = async () => {
    setIsApplying(true)
    try {
      await applyRefactor(activeArchitecture, libraryId)
      setCurrent(activeArchitecture)
      setIsOpen(false)
      setPlans({})
      onApplied?.()
    } catch (e) {
      setErrors((er) => ({ ...er, [cacheKey]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setIsApplying(false)
    }
  }

  const buckets = useMemo(
    () => bucketsForArchitecture(dsmGraph.nodes, activeArchitecture),
    [dsmGraph, activeArchitecture],
  )

  const colorMap = useMemo(() => bucketColorMap(buckets), [buckets])
  const bucketColorForId = (id: string) => colorMap.get(id) ?? null

  return {
    options: ARCHITECTURE_OPTIONS,
    libraryId,
    setLibraryId,
    libraries,
    current,
    isOpen,
    open,
    close,
    activeArchitecture,
    setActiveArchitecture,
    plan: plans[cacheKey] ?? null,
    isLoadingPlan: loading[cacheKey] ?? false,
    error: errors[cacheKey] ?? null,
    isApplying,
    confirmApply,
    buckets,
    bucketColorForId,
    folderDepth: folderDepthFor(activeArchitecture),
    dsmGraph,
  }
}
