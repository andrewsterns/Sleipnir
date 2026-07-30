import type { IconName } from '../../01_atoms/Icon/Icon'
import type { GraphNode } from '../../../00_planning/graph/types'

// A curated, hand-registered showcase entry with a live interactive
// render() — distinct from a real scaffolded file, which has no render.
export interface PrototypeEntry {
  id: string
  tag: string
  title: string
  description: string
  icon: IconName
  render: (onBack: () => void) => React.ReactNode
}

export type PrototypeSelection =
  | { kind: 'curated'; id: string }
  | { kind: 'scaffolded'; node: GraphNode }

export interface PrototypeRailProps {
  curated: PrototypeEntry[]
  scaffolded: GraphNode[]
  activeSelection: PrototypeSelection | null
  onSelect: (selection: PrototypeSelection) => void
  width?: number
}
