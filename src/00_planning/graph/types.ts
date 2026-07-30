export type GraphMapId = 'dsm' | 'prototypes' | 'research' | 'validation' | 'todo'

export type NodeKind = 'built' | 'proposed'

export interface GraphNode {
  id: string
  label: string
  kind: NodeKind
  map: string
  filePath?: string
  type?: string
  description?: string
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'borrows'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const GRAPH_MAPS: { id: GraphMapId; label: string }[] = [
  { id: 'dsm', label: 'DSM' },
  { id: 'prototypes', label: 'Prototypes' },
  { id: 'research', label: 'Research' },
  { id: 'validation', label: 'Validation' },
  { id: 'todo', label: 'TODO' },
]
