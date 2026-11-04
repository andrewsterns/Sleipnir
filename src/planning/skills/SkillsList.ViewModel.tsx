import type { LensMetric } from '../PlanningView.ViewModel'
import { useEffect, useState } from 'react'
import { skillNodeId } from '../graph/skillGraph'
import type { GraphNode, SkillScan } from '../graph/types'
import type { Tone } from '../graph/nodeTone'

export interface SkillsListProps {
  scan: SkillScan | null
  /** The node picked on the graph — a skill's opens its row. */
  selectedId: string | null
  /** Picks a node on the graph (and centres it). */
  onSelect: (nodeId: string) => void
  toneFor: (node: GraphNode) => Tone
  /** The skill graph's nodes, for each row's tone. */
  nodes: readonly GraphNode[]
  onOpenFile?: (path: string) => void
  /** After a skill's text is saved: the skills are read again. */
  onSaved: () => void
  /** The lens's reading for a skill's node, for its [lens] column; omit while no lens is on. */
  metricFor?: (node: GraphNode) => LensMetric | null
}

// The Skills view's left panel: the instruction files every agent loads, then
// each skill as a row that opens in place to its card — the same reading the
// plan's steps get, so the graph needs no second panel.
export function useSkillsListViewModel({ scan, selectedId, nodes, toneFor }: SkillsListProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  // A skill picked on the graph opens when it's picked; a closed one stays closed.
  const picked = scan?.skills.find((s) => skillNodeId(s.id) === selectedId)?.id
  useEffect(() => {
    if (picked) setOpen((prev) => (prev.has(picked) ? prev : new Set(prev).add(picked)))
  }, [picked])
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // An agent in a skill right now shows on its row the way it does on the graph.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const toneOf = (nodeId: string): Tone | undefined => {
    const node = byId.get(nodeId)
    return node ? toneFor(node) : undefined
  }

  const instructionTokens = (scan?.instructions ?? []).reduce((sum, i) => sum + i.tokens, 0)
  return { open, toggle, toneOf, instructionTokens }
}
