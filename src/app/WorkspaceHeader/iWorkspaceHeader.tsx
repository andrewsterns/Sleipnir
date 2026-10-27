import type { ReactNode } from 'react'
import type { WorkspaceTabStripItem } from '../WorkspaceTabStrip/iWorkspaceTabStrip'

export interface WorkspaceHeaderProps {
  /** Left of the tabs — the everything-picker (see TabPicker) and its actions. */
  leading?: ReactNode
  /** Right-aligned controls (Delete Plan dropdown, node/edge count, ...), trailing the tabs in the same row — there's no separate title bar above them. */
  actions?: ReactNode
  tabs: WorkspaceTabStripItem[]
  activeTabId: string
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  /** Passed straight through to WorkspaceTabStrip's own "+" — see its doc comment. */
  onAddTab?: (name: string) => void
  /** Alternative "+" behavior with no inline input — see WorkspaceTabStrip's onAddTabClick. */
  onAddTabClick?: () => void
}
