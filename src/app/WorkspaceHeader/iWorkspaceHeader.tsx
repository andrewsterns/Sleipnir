import type { ReactNode } from 'react'
import type { WorkspaceTabStripItem } from '../WorkspaceTabStrip/iWorkspaceTabStrip'

export interface WorkspaceHeaderProps {
  /** Left-aligned label — e.g. "00 — PLANNING · DSM". Omit entirely (along with `actions`) to collapse to a bare tab strip — no full file-path heading, just the open tabs. */
  title?: ReactNode
  /** Right-aligned controls (Refactor button, node/edge count, ...). Omit for a plain title-only bar. */
  actions?: ReactNode
  tabs: WorkspaceTabStripItem[]
  activeTabId: string
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
}
