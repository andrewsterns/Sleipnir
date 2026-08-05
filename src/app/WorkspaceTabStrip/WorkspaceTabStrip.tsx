import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { WorkspaceTabStripProps } from './iWorkspaceTabStrip'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Sits between TitleBar and the NavRail+content row, listing every open
// "page" regardless of kind — the generalized version of what
// OpenEditorsView used to render just for opened files. Visuals lifted
// directly from that component's tab strip (already right, just needed to
// stop being file-only).
export const WorkspaceTabStrip: React.FC<WorkspaceTabStripProps> = ({ tabs, activeTabId, onActivate, onClose }) => {
  if (tabs.length === 0) return null

  return (
    <Frame
      flow="horizontal"
      align="center"
      shrink={0}
      stroke={{ bottom: { color: 'rgba(255,255,255,0.08)' } }}
      fill={{ solid: 'bg-1' }}
      style={{ overflowX: 'auto' }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <Frame
            key={tab.id}
            flow="horizontal"
            align="center"
            gap={8}
            padding={{ x: 12, y: 8 }}
            onClick={() => onActivate(tab.id)}
            stroke={active ? { bottom: { color: 'var(--text-1)', width: 2 } } : undefined}
            fill={{ solid: active ? 'rgba(255,255,255,0.05)' : 'transparent' }}
            style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {tab.icon && (
              <span style={{ display: 'flex', color: active ? 'var(--text-1)' : 'var(--text-3)', opacity: active ? 1 : 0.7 }}>
                <Icon name={tab.icon} size={12} />
              </span>
            )}
            <span style={{ fontSize: 12, letterSpacing: '0.02em', color: active ? 'var(--text-1)' : 'var(--text-3)', ...MONO }}>
              {tab.label}
            </span>
            {tab.closable && (
              <IconButton
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                title="Close"
                glyph="×"
                iconSize={13}
                size={22}
                textColor="var(--text-3)"
              />
            )}
          </Frame>
        )
      })}
    </Frame>
  )
}
