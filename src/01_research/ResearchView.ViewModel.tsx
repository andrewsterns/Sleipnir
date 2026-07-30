import { useEffect, useState } from 'react'
import { getGraphForMap } from '../00_planning/graph/combine'
import type { GraphNode } from '../00_planning/graph/types'
import { readFile } from '../00_planning/api/sleipnirApi'
import { useFilteredList } from '../utils/useFilteredList'

export function useResearchViewModel() {
  const [nodes] = useState<GraphNode[]>(() => getGraphForMap('research').nodes)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [content, setContent] = useState('')

  const sortedNodes = [...nodes].sort((a, b) => a.label.localeCompare(b.label))
  const filteredNodes = useFilteredList(sortedNodes, query, (n) => n.label)

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedNode) {
      setContent('')
      return
    }
    let cancelled = false
    setContent('Loading…')
    readFile(selectedNode.id)
      .then(({ content: text }) => { if (!cancelled) setContent(text) })
      .catch((e) => { if (!cancelled) setContent(`Failed to load: ${e instanceof Error ? e.message : String(e)}`) })
    return () => { cancelled = true }
  }, [selectedNode])

  return { query, setQuery, filteredNodes, selectedId, setSelectedId, selectedNode, content }
}
