import type { IconName } from '../UIKit/Icon/Icon'

// Deliberately dumb/generic — doesn't know about App.tsx's richer WorkspaceTab
// (kind, libraryId, path, ...), just enough to render a strip and report
// clicks back up. Every open "page" (Planning, a library, a file, a widget,
// ...) reduces to one of these.
export interface WorkspaceTabStripItem {
  id: string
  label: string
  icon?: IconName
  closable: boolean
}

export interface WorkspaceTabStripProps {
  tabs: WorkspaceTabStripItem[]
  activeTabId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
}
