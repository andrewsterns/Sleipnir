import { useEffect, useMemo, useState } from 'react'
import { getGraphForMap, refreshGraphForMap, partitionArchived } from './graph/combine'
import type { GraphData, GraphMapId, GraphNode } from './graph/types'
import {
  regenerateGraph,
  getArchivedPaths,
  setArchived,
  getNotes,
  addNote,
  type ArchiveEntry,
} from './api/sleipnirApi'
import { useFilteredList } from '../utils/useFilteredList'

// A node's containing folder — archiving a node archives its whole
// View/ViewModel/interface "series" as one manifest entry.
export function folderPathForNode(node: GraphNode): string | null {
  if (!node.filePath) return null
  const parts = node.filePath.replace(/^src\//, '').split('/')
  return parts.slice(0, -1).join('/')
}

export function usePlanningViewModel() {
  const [mapId, setMapId] = useState<GraphMapId>('dsm')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [data, setData] = useState<GraphData>(() => getGraphForMap(mapId))
  const [archivedEntries, setArchivedEntries] = useState<ArchiveEntry[]>([])
  const [notes, setNotes] = useState<GraphNode[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<string[]>([])

  useEffect(() => {
    setData(getGraphForMap(mapId))
  }, [mapId])

  useEffect(() => {
    getArchivedPaths().then(({ entries }) => setArchivedEntries(entries)).catch(() => {})
  }, [])

  const refreshNotes = async () => {
    const { notes: fresh } = await getNotes()
    setNotes(fresh)
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
    return { nodes: [...liveGenerated.nodes, ...notesForMap], edges: liveGenerated.edges }
  }, [liveGenerated, notes, mapId])

  const refreshAll = async () => {
    const [fresh] = await Promise.all([
      refreshGraphForMap(mapId),
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
  const filteredNodes = useFilteredList(kindFilteredNodes, query, (n) => n.label)

  return {
    mapId,
    setMapId,
    selectedId,
    setSelectedId,
    live,
    archivedEntries,
    hoveredId,
    setHoveredId,
    refreshAll,
    createNote,
    archiveNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    filteredNodes,
  }
}
