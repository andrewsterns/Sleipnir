import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { WorkspaceTabStrip } from '../WorkspaceTabStrip/WorkspaceTabStrip'
import type { WorkspaceHeaderProps } from './iWorkspaceHeader'

// One row, shared by every rail-driven view (Planning, Workspace) — open
// tabs on the left, trailing actions (Delete Plan dropdown, new-plan input,
// node/edge count, ...) on the right. No separate title bar above it; this
// row sits beside the rail/sidebar, not above it (see WidgetShell/
// PlanningView, whose rail/sidebar now runs the full height instead of
// starting below this row).
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ actions, tabs, activeTabId, onActivateTab, onCloseTab, onAddTab }) => {
  if (tabs.length === 0 && !actions && !onAddTab) return null

  return (
    <Frame
      flow="horizontal"
      align="center"
      shrink={0}
      stroke={{ bottom: { color: 'rgba(255,255,255,0.08)' } }}
      fill={{ solid: 'bg-1' }}
    >
      <WorkspaceTabStrip tabs={tabs} activeTabId={activeTabId} onActivate={onActivateTab} onClose={onCloseTab} onAddTab={onAddTab} />
      {actions && (
        <Frame flow="horizontal" align="center" gap={16} shrink={0} padding={{ x: 16 }}>
          {actions}
        </Frame>
      )}
    </Frame>
  )
}
