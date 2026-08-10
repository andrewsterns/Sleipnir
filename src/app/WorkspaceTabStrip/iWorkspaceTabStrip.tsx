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
  /**
   * Renders a "+" after the last tab — click reveals an inline filename
   * input right there in the strip; Enter creates and opens it as a new
   * tab, Escape cancels. Omit to hide the control entirely (e.g. Planning,
   * whose tabs are maps/plans, not files, so "add a tab" has no meaning).
   */
  onAddTab?: (name: string) => void
}
