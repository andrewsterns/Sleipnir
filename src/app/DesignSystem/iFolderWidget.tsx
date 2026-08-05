import type { WidgetEntry } from '../../00_planning/graph/types'

export interface FolderWidgetProps {
  /** A registered `kind: 'folder'` widget (e.g. Docker) — see graph/types.ts and widgets.json. */
  entry: WidgetEntry
  onAddToPlan: (label: string, paths: string[]) => void
}
