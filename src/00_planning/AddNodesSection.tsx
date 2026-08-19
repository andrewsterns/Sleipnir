import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { NODE_STAGES } from './graph/stages'
import type { NodeStage } from './graph/types'
import type { AddNodeRow, RowSuggestion } from '../app/Workspace/NewWorkspacePlanModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: '0.1em',
  color: 'var(--text-3)',
  ...MONO,
}

const ROW_INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 11,
  padding: '6px 8px',
  ...MONO,
}

const ROW_X_BUTTON: React.CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  padding: 4,
  cursor: 'pointer',
  color: 'var(--text-3)',
}

const STAGE_OPTIONS = [{ value: '', label: '— No stage —' }, ...NODE_STAGES.map((s) => ({ value: s.id, label: s.label }))]

const SUGGESTION_LIMIT_HINT = 8

type Candidate = RowSuggestion | { kind: 'create'; label: string }

// One "ADD NODES" row: an inline search-styled input with a floating,
// keyboard-navigable suggestion panel while unresolved (same portal-under-
// trigger/outside-click/arrow-key pattern PlanningView's LinkAddDropdown
// already uses), or a compact resolved chip + optional stage picker once a
// candidate — or "Create as new node" — is picked.
function AddNodeRowView({
  row,
  suggestionsFor,
  onQueryChange,
  onResolveFile,
  onResolveDir,
  onResolveNote,
  onClearResolution,
  onSetStage,
  onRemove,
}: {
  row: AddNodeRow
  suggestionsFor: (query: string) => RowSuggestion[]
  onQueryChange: (query: string) => void
  onResolveFile: (path: string) => void
  onResolveDir: (path: string) => void
  onResolveNote: (label: string) => void
  onClearResolution: () => void
  onSetStage: (stage: NodeStage | undefined) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  const trimmedQuery = row.query.trim()
  const suggestions = row.resolution === null ? suggestionsFor(row.query) : []
  const hasExactMatch = suggestions.some((s) => s.label.toLowerCase() === trimmedQuery.toLowerCase())
  const candidates: Candidate[] = trimmedQuery
    ? [...suggestions, ...(hasExactMatch ? [] : [{ kind: 'create' as const, label: trimmedQuery }])]
    : []

  useLayoutEffect(() => {
    if (!open || candidates.length === 0) return
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    let node: HTMLElement | null = triggerRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) node = node.parentElement
    setPortalTarget(node ?? document.body)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, candidates.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [row.query, open])

  const pick = (c: Candidate) => {
    if (c.kind === 'create') onResolveNote(c.label)
    else if (c.kind === 'file') onResolveFile(c.path)
    else onResolveDir(c.path)
    setOpen(false)
  }

  if (row.resolution) {
    const { resolution } = row
    const icon = resolution.kind === 'file' ? 'file' : resolution.kind === 'dir' ? 'folder' : 'plan-node'
    const label = resolution.kind === 'note' ? resolution.label : resolution.path
    return (
      <Frame flow="horizontal" align="center" gap={6}>
        <Frame
          flow="horizontal"
          align="center"
          gap={6}
          grow
          minW={0}
          fill={{ solid: 'bg-2' }}
          stroke="border-2"
          padding={{ x: 8, y: 6 }}
        >
          <Icon name={icon} size={13} className="text-[var(--text-3)] shrink-0" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-1)', ...MONO }}>
            {label}
          </span>
          <button type="button" onClick={onClearResolution} title="Change" style={ROW_X_BUTTON}>
            <Icon name="x" size={11} />
          </button>
        </Frame>
        {resolution.kind !== 'dir' && (
          <Dropdown
            options={STAGE_OPTIONS}
            value={row.stage ?? ''}
            onChange={(v) => onSetStage((v as string) === '' ? undefined : (v as NodeStage))}
            w={128}
          />
        )}
        <button type="button" onClick={onRemove} title="Remove row" style={ROW_X_BUTTON}>
          <Icon name="x" size={13} />
        </button>
      </Frame>
    )
  }

  return (
    <Frame flow="horizontal" align="center" gap={6}>
      <div ref={triggerRef} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <input
          value={row.query}
          onChange={(e) => { onQueryChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (candidates.length === 0) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % candidates.length) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length) }
            else if (e.key === 'Enter') { e.preventDefault(); const c = candidates[activeIndex]; if (c) pick(c) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Search files/dirs, or type a name to create a node…"
          style={ROW_INPUT_STYLE}
        />
      </div>
      <button type="button" onClick={onRemove} title="Remove row" style={ROW_X_BUTTON}>
        <Icon name="x" size={13} />
      </button>
      {open && candidates.length > 0 && menuRect && portalTarget &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              zIndex: 200,
              background: 'var(--bg-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            {candidates.slice(0, SUGGESTION_LIMIT_HINT + 1).map((c, i) => {
              const active = i === activeIndex
              const key = c.kind === 'create' ? `create:${c.label}` : `${c.kind}:${c.path}`
              return (
                <div
                  key={key}
                  onMouseDown={(e) => { e.preventDefault(); pick(c) }}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 6px',
                    cursor: 'pointer',
                    background: active ? 'var(--bg-3)' : 'transparent',
                    fontSize: 11,
                    ...MONO,
                  }}
                >
                  <Icon
                    name={c.kind === 'create' ? 'plan-node-add' : c.kind === 'dir' ? 'folder' : 'file'}
                    size={13}
                    className="text-[var(--text-3)] shrink-0"
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>
                    {c.kind === 'create' ? `Create "${c.label}" as new node` : c.label}
                  </span>
                </div>
              )
            })}
          </div>,
          portalTarget,
        )}
    </Frame>
  )
}

export interface AddNodesSectionProps {
  rows: AddNodeRow[]
  onAddRow: () => void
  onRemoveRow: (id: string) => void
  onQueryChange: (id: string, query: string) => void
  onResolveFile: (id: string, path: string) => void
  onResolveDir: (id: string, path: string) => void
  onResolveNote: (id: string, label: string) => void
  onClearResolution: (id: string) => void
  onSetRowStage: (id: string, stage: NodeStage | undefined) => void
  suggestionsFor: (query: string) => RowSuggestion[]
}

// Repeatable "search or create, then tag a status" rows — the third way to
// seed a plan alongside NAME and the dirs/files tree above, for brand-new
// lightweight nodes and/or precise one-off existing-file/folder picks (which
// share the tree's own selection state, see NewWorkspacePlanModal.ViewModel).
export function AddNodesSection({
  rows,
  onAddRow,
  onRemoveRow,
  onQueryChange,
  onResolveFile,
  onResolveDir,
  onResolveNote,
  onClearResolution,
  onSetRowStage,
  suggestionsFor,
}: AddNodesSectionProps) {
  return (
    <Frame flow="vertical" gap={6}>
      <span style={SECTION_LABEL}>ADD NODES</span>
      <Frame flow="vertical" gap={6}>
        {rows.map((row) => (
          <AddNodeRowView
            key={row.id}
            row={row}
            suggestionsFor={suggestionsFor}
            onQueryChange={(q) => onQueryChange(row.id, q)}
            onResolveFile={(p) => onResolveFile(row.id, p)}
            onResolveDir={(p) => onResolveDir(row.id, p)}
            onResolveNote={(l) => onResolveNote(row.id, l)}
            onClearResolution={() => onClearResolution(row.id)}
            onSetStage={(s) => onSetRowStage(row.id, s)}
            onRemove={() => onRemoveRow(row.id)}
          />
        ))}
      </Frame>
      <button
        type="button"
        onClick={onAddRow}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '1px solid var(--border-2)',
          color: 'var(--text-2)',
          fontSize: 10,
          letterSpacing: '0.04em',
          padding: '5px 9px',
          cursor: 'pointer',
          ...MONO,
        }}
      >
        + Add node
      </button>
    </Frame>
  )
}
