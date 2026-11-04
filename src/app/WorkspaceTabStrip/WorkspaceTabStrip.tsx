import React, { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { WorkspaceTabStripProps } from './iWorkspaceTabStrip'
import { TextField } from '../UIKit/Field/TextField'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

// Lists every open "page" regardless of kind — the generalized version of
// what OpenEditorsView used to render just for opened files. Rendered inside
// WorkspaceHeader's own row (which owns the border/background) so it can
// share that row with trailing actions instead of owning a full-width strip
// of its own.
export const WorkspaceTabStrip: React.FC<WorkspaceTabStripProps> = ({ tabs, activeTabId, onActivate, onClose, onAddTab, onAddTabClick, addPlaceholder = 'filename', onRename }) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  // The tab being renamed in place, and its draft label.
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null)
  const commitRename = () => {
    if (!renaming) return
    const next = renaming.draft.trim()
    const tab = tabs.find((t) => t.id === renaming.id)
    if (next && tab && next !== tab.label) onRename?.(renaming.id, next)
    setRenaming(null)
  }

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
            {renaming?.id === tab.id ? (
              <TextField size="md"
                autoFocus
                value={renaming.draft}
                onChange={(e) => setRenaming({ id: tab.id, draft: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.target.select()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
                style={{ fontSize: 12, padding: '1px 4px', width: Math.max(80, renaming.draft.length * 8) }}
              />
            ) : (
              <span
                title={onRename && active ? 'Double-click to rename' : undefined}
                onDoubleClick={onRename && active ? () => setRenaming({ id: tab.id, draft: tab.label }) : undefined}
                style={{ fontSize: 12, letterSpacing: '0.02em', color: active ? 'var(--text-1)' : 'var(--text-3)', ...UI_FONT }}
              >
                {tab.label}
              </span>
            )}
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
          <TextField size="md"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setAdding(false); setName('') }
            }}
            onBlur={() => { if (!name) setAdding(false) }}
            placeholder={addPlaceholder}
            style={{ flexShrink: 0, margin: '0 8px', width: 130 }}
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
