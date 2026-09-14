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
export const WorkspaceTabStrip: React.FC<WorkspaceTabStripProps> = ({ tabs, activeTabId, onActivate, onClose, onAddTab, onAddTabClick }) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  if (tabs.length === 0 && !onAddTab && !onAddTabClick) return null

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
      className="scroll-window--no-scrollbar"
      style={{ overflowX: 'auto' }}
      onWheel={(e) => {
        if (e.deltaY === 0) return
        e.currentTarget.scrollLeft += e.deltaY
      }}
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
            fill={{ solid: active ? 'rgba(var(--item-ink, 255,255,255), 0.05)' : 'transparent' }}
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
              // Extra left margin (on top of the row's gap) pushes the close
              // clear of the label toward the tab's right edge.
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
                style={{ marginLeft: 6 }}
              />
            )}
          </Frame>
        )
      })}
      {(onAddTab || onAddTabClick) && (
        // onAddTabClick short-circuits the inline input entirely — the "+"
        // just fires the callback (Planning opens its full-page create screen).
        adding && !onAddTabClick ? (
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
              background: 'var(--bg-2)',
              border: '1px solid var(--border-2)',
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
            onClick={() => (onAddTabClick ? onAddTabClick() : setAdding(true))}
            title="New tab"
            glyph="+"
            iconSize={16}
          />
        )
      )}
    </Frame>
  )
}
