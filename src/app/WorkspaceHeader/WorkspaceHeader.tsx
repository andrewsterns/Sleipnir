import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { WorkspaceTabStrip } from '../WorkspaceTabStrip/WorkspaceTabStrip'
import type { WorkspaceHeaderProps } from './iWorkspaceHeader'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// The "title bar, then its open tabs beneath it" header shared by every
// rail-driven view (Planning, Components, Prototypes, folder widgets, Open
// Files) — lifted from PlanningView.tsx so "title on top, tabs underneath,
// same padding/type everywhere" is a property of the shell itself instead of
// something each view has to hand-roll and keep in sync.
export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  actions,
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
}) => (
  <>
    {(title || actions) && (
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'rgba(255,255,255,0.07)' } }}
      >
        {title && (
          <span style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
            {title}
          </span>
        )}
        {actions && (
          <Frame flow="horizontal" align="center" gap={16}>
            {actions}
          </Frame>
        )}
      </Frame>
    )}
    <WorkspaceTabStrip tabs={tabs} activeTabId={activeTabId} onActivate={onActivateTab} onClose={onCloseTab} />
  </>
)
