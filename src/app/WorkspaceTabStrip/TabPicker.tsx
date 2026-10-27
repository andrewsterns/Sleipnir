import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Icon, type IconName } from '../UIKit/Icon/Icon'
import { ListRow } from '../UIKit/ListRow/ListRow'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface TabPickerItem {
  id: string
  label: string
}

export interface TabPickerProps {
  /** Plural noun for what's listed — "Plans", "Boards". */
  noun: string
  /** Leading icon on every row — the same one the tabs carry. */
  icon: IconName
  items: TabPickerItem[]
  /** Items open as tabs — marked in the list. */
  openIds: string[]
  /** The tab showing right now. */
  activeId: string | null
  /** Opens (or switches to) that item's tab. */
  onPick: (id: string) => void
  /**
   * The trailing "create" row. Gets whatever has been typed, so a search that
   * finds nothing turns straight into creating that thing.
   */
  create?: { label: (query: string) => string; onCreate: (query: string) => void; icon: IconName }
}

const POPOVER_MIN_W = 280

/** Height of a tab row (WorkspaceHeader, Canvas's toolbar): a tab plus the row's 1px bottom border, held even when no tab is open. */
export const TAB_ROW_H = 41

/** Splits `label` around the first match of `query`, so the match can carry the emphasis. */
function matchParts(label: string, query: string): [string, string, string] | null {
  if (!query) return null
  const at = label.toLowerCase().indexOf(query.toLowerCase())
  if (at === -1) return null
  return [label.slice(0, at), label.slice(at, at + query.length), label.slice(at + query.length)]
}

// The everything-list beside a tab strip (Planning's plans, Canvas's boards):
// the tabs are what's open, this is what exists. One combobox, not a dropdown
// plus a search box — focus it and type to filter, ↑/↓ + Enter to open, Esc to
// back out, or keep typing a name nothing matches and create it.
//
// It lives at the top, beside the tabs, in every view: the top row answers
// "which document am I in", the left rail answers "what's inside it" (NODES,
// LAYERS). Searching plans from the rail would put two scopes in one place.
export const TabPicker: React.FC<TabPickerProps> = ({ noun, icon, items, openIds, activeId, onPick, create }) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null)
  const listId = useId()

  const q = query.trim()
  const matches = useMemo(() => {
    if (!q) return items
    const needle = q.toLowerCase()
    const hits = items.filter((item) => item.label.toLowerCase().includes(needle))
    // Prefix hits first — typing "che" should put "Checkout" above "Paycheck".
    return [...hits.filter((i) => i.label.toLowerCase().startsWith(needle)), ...hits.filter((i) => !i.label.toLowerCase().startsWith(needle))]
  }, [items, q])

  // The create row is the last stop for the keyboard, after every match.
  const rowCount = matches.length + (create ? 1 : 0)
  const createIndex = create ? matches.length : -1

  useEffect(() => setHighlight(0), [q, open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const commit = (index: number) => {
    if (index === createIndex && create) {
      create.onCreate(q)
    } else {
      const item = matches[index]
      if (!item) return
      onPick(item.id)
    }
    close()
    inputRef.current?.blur()
  }

  // Positioned against the field each time it opens; the list is portaled to
  // body so the header's own clipping and stacking can't cut it off.
  useLayoutEffect(() => {
    if (!open || !fieldRef.current) return
    const r = fieldRef.current.getBoundingClientRect()
    setAnchor({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, POPOVER_MIN_W) })
  }, [open])

  // One short settle-in when the list appears — skipped for reduced motion.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!open || !el || !anchor) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { opacity: 0, transform: 'translateY(-4px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 140, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  }, [open, anchor])

  // Keep the keyboard highlight in view in a long list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-picker-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (query) setQuery('')
      else {
        close()
        inputRef.current?.blur()
      }
      return
    }
    if (!open) setOpen(true)
    if (rowCount === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((i) => (i + 1) % rowCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((i) => (i - 1 + rowCount) % rowCount)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(highlight)
    }
  }

  const openSet = new Set(openIds)
  const nounLower = noun.toLowerCase()

  return (
    <>
      <div
        ref={fieldRef}
        onMouseDown={(e) => {
          // A press anywhere on the field (icon, chevron) focuses the input.
          if (e.target !== inputRef.current) {
            e.preventDefault()
            inputRef.current?.focus()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: 188,
          flexShrink: 0,
          padding: '5px 8px',
          borderRadius: 'var(--radius-control)',
          background: 'var(--bg-2)',
          border: `1px solid ${open ? 'var(--border-2)' : 'var(--border-1)'}`,
          cursor: 'text',
          transition: 'border-color 120ms ease-out',
        }}
      >
        <span style={{ display: 'flex', color: 'var(--text-3)', flexShrink: 0 }}>
          <Icon name="search" size={12} />
        </span>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={`Search or open ${nounLower}`}
          aria-activedescendant={open && rowCount > 0 ? `${listId}-${highlight}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          placeholder={open ? `Search ${nounLower}…` : `${noun.toUpperCase()} (${items.length})`}
          spellCheck={false}
          style={{
            ...MONO,
            flex: 1,
            minWidth: 0,
            fontSize: 10,
            letterSpacing: open ? '0.02em' : '0.06em',
            color: 'var(--text-1)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
          }}
        />
        <span
          aria-hidden
          style={{
            display: 'flex',
            color: 'var(--text-3)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 140ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <Icon name="chevron-down" size={12} />
        </span>
      </div>

      {open &&
        anchor &&
        ReactDOM.createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={noun}
            // Pressing a row must not blur the input first — that would close
            // the list before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'fixed',
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              maxHeight: 360,
              overflowY: 'auto',
              zIndex: 3000,
              padding: '4px 8px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--radius-2)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
              ...MONO,
            }}
          >
            {matches.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '8px 2px', lineHeight: 1.5 }}>
                {items.length === 0 ? `No ${nounLower} yet.` : `No ${nounLower} match “${q}”.`}
              </div>
            )}
            {matches.map((item, index) => {
              const parts = matchParts(item.label, q)
              const isOpen = openSet.has(item.id)
              return (
                <div key={item.id} id={`${listId}-${index}`} role="option" aria-selected={item.id === activeId} data-picker-index={index}>
                  <ListRow
                    selected={item.id === activeId}
                    connected={index === highlight && item.id !== activeId}
                    indent={6}
                    style={{ marginLeft: -8, marginRight: -8 }}
                    onClick={() => commit(index)}
                    onMouseEnter={() => setHighlight(index)}
                    leading={
                      <span style={{ display: 'flex', opacity: 0.7 }}>
                        <Icon name={icon} size={12} />
                      </span>
                    }
                    trailing={
                      isOpen && item.id !== activeId ? (
                        // Already a tab — picking it switches rather than opens.
                        <span
                          title="Open in a tab"
                          style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.6, marginRight: 4 }}
                        />
                      ) : undefined
                    }
                  >
                    {parts ? (
                      <span>
                        {parts[0]}
                        <span style={{ fontWeight: 700, color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>{parts[1]}</span>
                        {parts[2]}
                      </span>
                    ) : (
                      item.label
                    )}
                  </ListRow>
                </div>
              )
            })}
            {create && (
              <div
                id={`${listId}-${createIndex}`}
                role="option"
                aria-selected={false}
                data-picker-index={createIndex}
                style={{ borderTop: matches.length > 0 ? '1px solid var(--border-1)' : undefined, marginTop: matches.length > 0 ? 4 : 0, paddingTop: matches.length > 0 ? 4 : 0 }}
              >
                <ListRow
                  connected={highlight === createIndex}
                  indent={6}
                  style={{ marginLeft: -8, marginRight: -8 }}
                  onClick={() => commit(createIndex)}
                  onMouseEnter={() => setHighlight(createIndex)}
                  leading={
                    <span style={{ display: 'flex', opacity: 0.7 }}>
                      <Icon name={create.icon} size={12} />
                    </span>
                  }
                >
                  {create.label(q)}
                </ListRow>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
