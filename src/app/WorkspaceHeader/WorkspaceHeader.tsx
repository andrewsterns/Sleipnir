import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { WorkspaceTabStrip } from '../WorkspaceTabStrip/WorkspaceTabStrip'
import type { WorkspaceHeaderProps } from './iWorkspaceHeader'
import { TAB_ROW_H } from '../WorkspaceTabStrip/TabPicker'

// One row, shared by every rail-driven view (Planning, Workspace) — open
// tabs on the left, trailing actions (Delete Plan dropdown, new-plan input,
// node/edge count, ...) on the right. No separate title bar above it; this
// row sits beside the rail/sidebar, not above it (see WidgetShell/
// PlanningView, whose rail/sidebar now runs the full height instead of
// starting below this row).
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ leading, actions, tabs, activeTabId, onActivateTab, onCloseTab, onAddTab, onAddTabClick }) => {
  if (tabs.length === 0 && !actions && !leading && !onAddTab && !onAddTabClick) return null

  return (
    <Frame
      flow="horizontal"
      align="center"
      shrink={0}
      // Holds the tab height even with no tab open (only the picker left), so
      // the row doesn't jump — and matches Canvas's toolbar row exactly.
      minH={TAB_ROW_H}
      stroke={{ bottom: { color: 'var(--border-1)' } }}
      fill={{ solid: 'bg-1' }}
    >
      {leading && (
        <Frame flow="horizontal" align="center" gap={4} shrink={0} padding={{ left: 10, right: 4 }}>
          {leading}
        </Frame>
      )}
      <WorkspaceTabStrip tabs={tabs} activeTabId={activeTabId} onActivate={onActivateTab} onClose={onCloseTab} onAddTab={onAddTab} onAddTabClick={onAddTabClick} />
      {actions && (
        <Frame flow="horizontal" align="center" gap={16} shrink={0} padding={{ x: 16 }}>
          {actions}
        </Frame>
      )}
    </Frame>
  )
}
