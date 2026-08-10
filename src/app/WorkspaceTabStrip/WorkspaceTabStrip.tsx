import React, { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { WorkspaceTabStripProps } from './iWorkspaceTabStrip'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Lists every open "page" regardless of kind — the generalized version of
// what OpenEditorsView used to render just for opened files. Rendered inside
// WorkspaceHeader's own row (which owns the border/background) so it can
// share that row with trailing actions instead of owning a full-width strip
// of its own.
export const WorkspaceTabStrip: React.FC<WorkspaceTabStripProps> = ({ tabs, activeTabId, onActivate, onClose, onAddTab }) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  if (tabs.length === 0 && !onAddTab) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAddTab?.(trimmed)
    setAdding(false)
    setName('')
  }

  return (
    <Frame
      flow="horizontal"
      align="center"
      grow
      minW={0}
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
      {onAddTab && (
        adding ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setAdding(false); setName('') }
            }}
            onBlur={() => { if (!name) setAdding(false) }}
            placeholder="filename"
            style={{
              flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 'var(--radius-2)',
              color: 'var(--text-1)',
              fontSize: 12,
              padding: '4px 6px',
              margin: '0 8px',
              width: 130,
              ...MONO,
            }}
          />
        ) : (
          <IconButton
            onClick={() => setAdding(true)}
            title="New tab"
            glyph="+"
            iconSize={16}
          />
        )
      )}
    </Frame>
  )
}
