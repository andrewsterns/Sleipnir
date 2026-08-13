import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon, type IconName } from '../app/UIKit/Icon/Icon'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { Button } from '../app/UIKit/Button/Button'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { WorkspaceHeader } from '../app/WorkspaceHeader/WorkspaceHeader'
import { GraphCanvas, fileExtLabel, nodeDisplayLabel, nodeIconName } from './graph/GraphCanvas'
import { getGraphMaps, type GraphMapId, type GraphNode, type NodeStage, type SavedPlan } from './graph/types'
import { NODE_STAGES } from './graph/stages'
import { StatusGlyph } from './graph/StatusGlyph'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import type { GeneratedFile } from '../app/AgentChat/iAgentChat'
import { createPlan, getWorkspaceInfo, listWorkspaceDir } from './api/sleipnirApi'
import type { FileTreeNode } from './api/PlatformAPI'
import { usePlanningViewModel, folderPathForNode, type PlanningNodeRow } from './PlanningView.ViewModel'
import { Search } from '../app/UIKit/Search/Search'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { SidebarHeader } from '../app/UIKit/SidebarHeader/SidebarHeader'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { DeletePlanModal } from './DeletePlanModal'
import { DeleteNodeModal } from './DeleteNodeModal'
import { DismissWelcomeModal } from './DismissWelcomeModal'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { RenamePathModal } from '../app/DesignSystem/RenamePathModal'
import { AddNodeModal } from './AddNodeModal'
import { fuzzyScore } from '../utils/fuzzyMatch'
import { useAppTheme } from '../00_themes/ThemeController'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Welcome is a built-in, hand-authored guide map (graph/proposed-nodes.ts), not
// a saved plan on disk — so "deleting" it permanently is a local display
// preference rather than a filesystem op. Stored machine-wide (not per project)
// since the Welcome guide is the same onboarding content everywhere: once the
// user is done with it, it stays gone across every project. Read synchronously
// so the ViewModel can decide at first render not to auto-open a dismissed
// Welcome (an async read would flash it open first). All access is guarded —
// a locked-down localStorage just means Welcome keeps showing, never a crash.
const WELCOME_DISMISSED_KEY = 'sleipnir:welcome-dismissed'
function readWelcomeDismissed(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}
function storeWelcomeDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(WELCOME_DISMISSED_KEY, '1')
    else localStorage.removeItem(WELCOME_DISMISSED_KEY)
  } catch {
    // localStorage unavailable (private mode / disabled) — the in-memory state
    // still hides Welcome for this session; it just won't persist past reload.
  }
}

// Blue + underline, the universal "this opens something" affordance — used
// wherever a node maps to a real Workspace file you can jump to (the card's
// name/path, the LINKED rows). See workspaceFilePath for which nodes qualify.
const FILE_LINK_STYLE: React.CSSProperties = {
  color: 'var(--info-5)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
}

const KIND_FILTER_OPTIONS = [
  { id: 'built', label: 'Built' },
  { id: 'proposed', label: 'Proposed' },
]

interface LinkedRow {
  node: GraphNode
  /** 'out' = this node imports `node` (borrowsFrom); 'in' = `node` imports this one (borrowedBy). Drives both the row's arrow glyph and which ViewModel function a remove click calls. */
  direction: 'out' | 'in'
}

// One merged "Linked" list for the detail panel — replaces what used to be
// two separately-labeled, asymmetrically-editable lists ("Borrows from"/
// "Borrowed by", only the first removable). Every row is add/removable and
// every row's direction is freely toggleable now (see addLink/removeLink for
// 'out', addImporter/removeImporter for 'in', and flipLink for the toggle, all
// in PlanningView.ViewModel), so the only thing distinguishing a row is its
// direction — shown as a ↓ (imports) / ↑ (imported by) arrow rather than a
// second section heading.
function LinkedNodeList({
  rows,
  onRemove,
  // Flip a single link's direction in place (out ⇄ in) — the ↓ / ↑ arrow is a
  // live control, not just a label, and always works: a file-less note or a
  // cross-language pair simply reverses the graph edge with no import statement
  // to splice (see flipLink). Undefined leaves the row read-only.
  onToggleDirection,
  // Links can now span plans (see PlanningView.ViewModel's addLink/
  // addImporter) — a row whose node lives in a *different* plan than the one
  // currently open gets a small trailing tag naming that plan, same reason
  // the sidebar's own global search tags cross-map rows: without it, "why
  // isn't this node in this graph?" has no answer on screen.
  currentMapId,
  mapLabelFor,
  // Jump to a linked node's real file in the Workspace — the row label
  // becomes a blue underlined link when the node maps to a Workspace file
  // (see workspaceFilePath). Undefined leaves labels as plain text.
  onOpenFile,
  // Trailing control in the "LINKED (n)" header — the add-link icon/dropdown
  // (see LinkAddDropdown), shown only for a scaffolded node. Undefined leaves
  // the header a plain label.
  headerAction,
}: {
  rows: LinkedRow[]
  onRemove?: (row: LinkedRow) => void
  onToggleDirection?: (row: LinkedRow) => void
  currentMapId: string
  mapLabelFor: (id: string) => string
  onOpenFile?: (path: string) => void
  headerAction?: React.ReactNode
}) {
  // Stable display order, independent of each row's direction, so flipping a
  // row's import/export arrow never makes it jump to a new slot (the old "all
  // 'out' then all 'in'" concatenation moved a row between groups on every
  // flip). Sorted by label then id — both unchanged by a direction flip.
  const orderedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const la = nodeDisplayLabel(a.node).toLowerCase()
        const lb = nodeDisplayLabel(b.node).toLowerCase()
        if (la !== lb) return la < lb ? -1 : 1
        return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0
      }),
    [rows],
  )
  return (
    <Frame flow="vertical" gap={6}>
      <Frame flow="horizontal" align="center" justify="between" minH={20}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
          LINKED ({rows.length})
        </span>
        {headerAction}
      </Frame>
      <Frame flow="vertical" gap={2}>
        {orderedRows.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', ...MONO }}>— none —</span>
        )}
        {orderedRows.map((row) => {
          const n = row.node
          const display = nodeDisplayLabel(n)
          // Keyed by node identity, not direction, so a flip re-renders the same
          // row element in place rather than unmounting/remounting it.
          const rowKey = n.id
          const crossPlan = n.map !== currentMapId
          // Always toggleable when a handler is wired — import/export is a graph
          // edge that reverses for any node/document type (see flipLink); the
          // only read-only case is a caller that passed no onToggleDirection.
          const canToggle = !!onToggleDirection
          const openPath = workspaceFilePath(n)
          const openable = !!openPath && !!onOpenFile
          // ↓ = this node imports the row's node; ↑ = the row's node imports
          // this one (this node is "exported to" it).
          const arrowGlyph = row.direction === 'out' ? '↓' : '↑'
          const arrowTitle =
            row.direction === 'out'
              ? `Imports ${display} — click to flip to imported by`
              : `Imported by ${display} — click to flip to imports`
          return (
            <ListRow
              key={rowKey}
              indent={4}
              onClick={openable ? () => onOpenFile!(openPath!) : undefined}
              title={openable ? 'Open in Workspace' : undefined}
              // The direction arrow is the row's start icon — a live toggle
              // button when flippable, a plain glyph when read-only.
              leading={
                canToggle ? (
                  <IconButton
                    onClick={(e) => { e.stopPropagation(); onToggleDirection!(row) }}
                    title={arrowTitle}
                    glyph={arrowGlyph}
                    iconSize={12}
                    size={18}
                    textColor="var(--text-2)"
                    // Persistent border so the flip control reads as a button at
                    // rest, not just on hover.
                    stroke={{ color: 'border-1' }}
                    radius={4}
                  />
                ) : (
                  <span
                    title={row.direction === 'out' ? `Imports ${display}` : `Imported by ${display}`}
                    style={{ fontSize: 11, color: 'var(--text-3)', width: 18, flexShrink: 0, textAlign: 'center', ...MONO }}
                  >
                    {arrowGlyph}
                  </span>
                )
              }
              trailing={(hovered) => (
                <>
                  {crossPlan && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
                      {mapLabelFor(n.map)}
                    </span>
                  )}
                  {onRemove && (
                    // Fixed-width slot always reserved (when removable), so the ×
                    // appearing on hover toggles visibility in place instead of
                    // pushing the label and reflowing the row.
                    <span style={{ width: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {hovered && (
                        <IconButton
                          onClick={(e) => { e.stopPropagation(); onRemove(row) }}
                          title="Remove link"
                          glyph="×"
                          iconSize={12}
                          size={18}
                          textColor="var(--text-3)"
                        />
                      )}
                    </span>
                  )}
                </>
              )}
            >
              <span style={openable ? FILE_LINK_STYLE : { color: 'var(--text-2)' }}>
                {display}
                {/* Same dimmer file-type suffix as the graph / NODES list. */}
                {fileExtLabel(n.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(n.filePath)}</span>}
              </span>
            </ListRow>
          )
        })}
      </Frame>
    </Frame>
  )
}

const LINK_SEARCH_LIMIT = 8

const LINK_MENU_WIDTH = 224

// The detail card's "add a link" control: a single link-add icon that pops a
// portaled search menu (input + fuzzy results) on click, rather than an
// always-open search field taking up card space. A pick always creates an
// *outgoing* link (this node imports the pick); direction is flipped afterward
// per-row from the LINKED list below (see LinkedNodeList's onToggleDirection).
// Candidates span every plan, not just the currently open one — each
// suggestion is tagged with its own plan when that differs from the one
// currently open, same as LinkedNodeList's own already-linked rows.
//
// Portals the menu (same rationale as Dropdown.tsx): the card scrolls
// vertically, and a container with overflow-y:auto clips overflow-x too, so a
// non-portaled menu would be cut off.
function LinkAddDropdown({
  candidates,
  onPick,
  currentMapId,
  mapLabelFor,
  openSignal,
}: {
  candidates: GraphNode[]
  onPick: (node: GraphNode) => void
  currentMapId: string
  mapLabelFor: (id: string) => string
  /** Each change (a new value) pops the menu open — the node ⋯ menu's "Link" action drives this so linking starts from the node itself. */
  openSignal?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Which result the keyboard (↑/↓) has highlighted — Enter picks it, hover
  // syncs to it, so mouse and keyboard share one highlight.
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return candidates.slice(0, LINK_SEARCH_LIMIT)
    return candidates
      .map((n) => ({ n, score: fuzzyScore(trimmed, n.label) }))
      .filter((r): r is { n: GraphNode; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, LINK_SEARCH_LIMIT)
      .map((r) => r.n)
  }, [query, candidates])

  // Position the menu right-aligned under the icon (the icon sits near the
  // card's right edge, so the menu extends leftward) and clamped into the
  // viewport. Portals into the nearest theme scope so every var() resolves —
  // same reasoning as Dropdown.tsx.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.min(Math.max(rect.right - LINK_MENU_WIDTH, 8), window.innerWidth - LINK_MENU_WIDTH - 8)
      setMenuPos({ top: rect.bottom + 4, left })
    }
    let node: HTMLElement | null = triggerRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  // Close on outside click / Escape — the menu lives in a portal outside the
  // trigger's subtree, so both refs are checked.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Reset the keyboard highlight to the top whenever the result set changes
  // (new query) or the menu (re)opens, so ↓ always starts from the best match.
  useEffect(() => { setActiveIndex(0) }, [query, open])

  // Pop open when the ⋯ menu's "Link" action fires (openSignal bumps). Skips
  // the initial 0 so the menu isn't open on mount.
  useEffect(() => { if (openSignal) setOpen(true) }, [openSignal])

  const pick = (n: GraphNode) => {
    onPick(n)
    setQuery('')
    setOpen(false)
  }

  return (
    <>
      <IconButton
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title="Add link"
        icon="link-add"
        iconSize={14}
        textColor="var(--text-2)"
      />
      {open && menuPos && portalTarget &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: LINK_MENU_WIDTH,
              zIndex: 200,
              background: 'var(--bg-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-2)',
                padding: '5px 7px',
              }}
            >
              <Icon name="search" size={12} className="text-[var(--text-3)] shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') { const n = results[Math.min(activeIndex, results.length - 1)]; if (n) pick(n) }
                  else if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Search nodes to link…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  ...MONO,
                }}
              />
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setQuery('') }}
                  title="Clear"
                  style={{ display: 'flex', flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
            <Frame flow="vertical" gap={0} radius="var(--radius-2)" clipContent>
              {results.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 8px', ...MONO }}>
                  {candidates.length === 0 ? 'No nodes to link' : 'No matches'}
                </span>
              ) : (
                results.map((n, i) => {
                  const active = i === Math.min(activeIndex, results.length - 1)
                  return (
                  <Frame
                    as="button"
                    key={n.id}
                    // mousedown (not click) + preventDefault fires before the
                    // outside-click handler can act — picking stays reliable.
                    onMouseDown={(e) => { e.preventDefault(); pick(n) }}
                    // Hover and keyboard share one highlight (see activeIndex).
                    onMouseEnter={() => setActiveIndex(i)}
                    w="fill"
                    flow="horizontal"
                    align="center"
                    justify="between"
                    gap={8}
                    padding={{ x: 8, y: 6 }}
                    fill={{ solid: active ? 'bg-3' : 'transparent' }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-1)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...MONO }}>
                      {nodeDisplayLabel(n)}
                    </span>
                    {n.map !== currentMapId && (
                      <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
                        {mapLabelFor(n.map)}
                      </span>
                    )}
                  </Frame>
                  )
                })
              )}
            </Frame>
          </div>,
          portalTarget,
        )}
    </>
  )
}

// Small "▸/▾ LABEL" header shared by every collapsible section/group in this
// sidebar (PLANS, SAVED PLANS, NODES, ARCHIVED) — click anywhere on it to
// toggle. `right` is an optional trailing slot (e.g. PLANS' own row count),
// rendered outside the click target so it never fights a nested control.
function CollapsibleHeader({
  label,
  count,
  collapsed,
  onToggle,
  right,
}: {
  label: string
  /** Item count shown after the label in a bolder weight — reads as a type/class tag ("PLANS (5)") distinct from the label text itself. Omit to show no count. */
  count?: number
  /** Omit both `collapsed`/`onToggle` for a static, always-expanded header with no chevron and no click-to-toggle (e.g. PLANS, which doesn't need to collapse — see its own usage below). */
  collapsed?: boolean
  onToggle?: () => void
  right?: React.ReactNode
}) {
  return (
    <Frame flow="horizontal" align="center" justify="between" minH={20} shrink={0}>
      <Frame
        as={onToggle ? 'button' : 'div'}
        onClick={onToggle}
        flow="horizontal"
        align="center"
        gap={4}
        variant="none"
        cursor={onToggle ? 'pointer' : 'default'}
        padding={0}
      >
        {onToggle && (
          <span style={{ fontSize: 8, color: 'var(--text-3)', width: 8, display: 'inline-block', flexShrink: 0 }}>
            {collapsed ? '▸' : '▾'}
          </span>
        )}
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)', ...MONO }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', color: 'var(--text-1)', ...MONO }}>
            ({count})
          </span>
        )}
      </Frame>
      {right}
    </Frame>
  )
}

// One row in the left "PLANS" list — every registered map (Welcome, the
// fixed workspace maps), always present regardless of whether it's
// currently open as a tab. Mirrors the hover-reveals-an-action pattern
// LeftRailing uses for Workspace. Unlike the tab strip's × (which only
// *closes* an open tab), the sidebar's hover action is a trash can that
// *permanently deletes* the plan — routed through a confirm modal by the
// caller (see onDelete). Just the title — no per-row expand, no preview of
// contents underneath (plans don't need to; see NODES below for the one
// place expand/collapse still applies).
function PlanRow({
  map,
  active,
  onOpen,
  onDelete,
  icon,
}: {
  map: { id: string; label: string }
  active: boolean
  onOpen: () => void
  /** Trash action for the sidebar scroll list — permanently deletes the plan (the caller opens a confirm modal first). Omitted for built-in maps like Welcome, which can't be deleted; closing a tab is the tab strip's × instead. */
  onDelete?: () => void
  /** Prefixed before the label — every row gets the same 'network' icon (NavRail's own Planning icon), Welcome included, so any open tab reads as the same identifiable type at a glance. */
  icon?: IconName
}) {
  // Full-bleed row: negative margins cancel the sidebar's 8px padding so the
  // hover/active fill spans edge-to-edge — same ListRow the file tree uses.
  return (
    <ListRow
      selected={active}
      indent={8}
      style={{ marginLeft: -8, marginRight: -8, flexShrink: 0 }}
      onClick={onOpen}
      leading={icon ? <span style={{ display: 'flex', opacity: 0.7 }}><Icon name={icon} size={12} /></span> : undefined}
      trailing={(hovered) =>
        onDelete && hovered ? (
          <IconButton
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Delete plan"
            icon="trash"
            iconSize={13}
            textColor="var(--text-3)"
          />
        ) : null
      }
    >
      <span style={{ fontWeight: active ? 700 : 400 }}>{map.label}</span>
    </ListRow>
  )
}

// Saved plan rows, listed directly under PLANS with no title/accordion of
// their own — collapsing is governed entirely by PLANS' own header above.
function PlanGroup({
  plans,
  mapId,
  onOpen,
  onDelete,
  icon,
}: {
  plans: SavedPlan[]
  mapId: string
  onOpen: (id: string) => void
  onDelete: (plan: SavedPlan) => void
  icon?: IconName
}) {
  if (plans.length === 0) return null
  return (
    <Frame flow="vertical" gap={0} shrink={0}>
      {plans.map((plan) => (
        <PlanRow
          key={plan.id}
          map={plan}
          active={plan.id === mapId}
          onOpen={() => onOpen(plan.id)}
          onDelete={() => onDelete(plan)}
          icon={icon}
        />
      ))}
    </Frame>
  )
}

// Shown in the main content area whenever no tab is open — reached by closing
// the last remaining tab (Welcome included). Mirrors the Workspace's "no
// folder open" start page (see WorkspaceView): a centered prompt with an
// inline create field, plus quick links to reopen any existing plan or the
// built-in Welcome map, so the closed-everything state is a launch pad rather
// than a blank void.
function PlanningEmptyState({
  plans,
  onOpenPlan,
  onOpenWelcome,
  onRestoreWelcome,
  onCreatePlan,
  creating,
  error,
}: {
  plans: SavedPlan[]
  onOpenPlan: (id: string) => void
  onOpenWelcome?: () => void
  /** Escape hatch shown only once Welcome has been permanently deleted (see PlanningView's welcomeDismissed) — brings the built-in guide back. Mutually exclusive with onOpenWelcome, which the caller passes only while Welcome is still present. */
  onRestoreWelcome?: () => void
  onCreatePlan: (label: string) => void
  creating: boolean
  error: string | null
}) {
  const [label, setLabel] = useState('')
  const submit = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    onCreatePlan(trimmed)
    setLabel('')
  }
  return (
    <Frame flow="vertical" grow align="center" justify="center" gap={18} padding={24}>
      <span style={{ display: 'flex', color: 'var(--text-3)', opacity: 0.5 }}>
        <Icon name="network" size={40} />
      </span>
      <Frame flow="vertical" align="center" gap={6}>
        <span style={{ fontSize: 14, letterSpacing: '0.08em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
          No plan open
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', ...MONO }}>
          Create a plan to start mapping out your work.
        </span>
      </Frame>
      <Frame flow="horizontal" align="center" gap={8}>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Plan name"
          disabled={creating}
          style={{
            width: 220,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--radius-2)',
            color: 'var(--text-1)',
            fontSize: 12,
            padding: '8px 10px',
            ...MONO,
          }}
        />
        <Button variant="primary" size="sm" onClick={submit} disabled={creating || !label.trim()}>
          Create Plan
        </Button>
      </Frame>
      {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

      {plans.length > 0 && (
        <Frame flow="vertical" align="center" gap={6} style={{ marginTop: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
            OPEN A PLAN
          </span>
          <Frame flow="vertical" align="center" gap={2}>
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenPlan(p.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '2px 0', ...MONO }}
              >
                {p.label}
              </button>
            ))}
          </Frame>
        </Frame>
      )}

      {onOpenWelcome && (
        <button
          onClick={onOpenWelcome}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, letterSpacing: '0.04em', padding: '2px 0', textDecoration: 'underline', ...MONO }}
        >
          Open Welcome
        </button>
      )}

      {onRestoreWelcome && (
        <button
          onClick={onRestoreWelcome}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, letterSpacing: '0.04em', padding: '2px 0', textDecoration: 'underline', ...MONO }}
        >
          Restore Welcome
        </button>
      )}
    </Frame>
  )
}

// The detail card's sprint-stage picker — one chip per stage (see
// graph/stages.ts), the active one lit in its own color. Clicking the active
// chip again clears the stage (back to untagged / kind-based rendering). Set
// on any node; the write goes to the overlay store via setStage, so it works
// for build-generated nodes too.
function StageToggle({ value, onChange }: { value?: NodeStage; onChange: (stage: NodeStage | null) => void }) {
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>STATUS</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {NODE_STAGES.map((s) => {
          const active = value === s.id
          return (
            <button
              key={s.id}
              onClick={() => onChange(active ? null : s.id)}
              title={active ? `${s.label} — click to clear` : s.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                // Faint wash of the stage's own color when active — color-mix so
                // it works for CSS-var colours (e.g. proposed's var(--text-1)),
                // not just hex; plain outline otherwise.
                background: active ? `color-mix(in srgb, ${s.color} 13%, transparent)` : 'transparent',
                border: `1px solid ${active ? s.color : 'var(--border-2)'}`,
                borderRadius: 'var(--radius-2)',
                color: active ? s.color : 'var(--text-3)',
                fontSize: 10,
                letterSpacing: '0.02em',
                padding: '4px 7px',
                cursor: 'pointer',
                ...MONO,
              }}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>{s.glyph}</span>
              {s.label}
            </button>
          )
        })}
      </div>
    </Frame>
  )
}

export interface PlanningViewProps {
  /** Set by App.tsx to force a specific map tab open (e.g. 'claude', to watch AI build nodes live) even when Planning is already mounted. Consumed once. */
  focusMapId?: GraphMapId | null
  onFocusMapIdConsumed?: () => void
  /** Fired once the generate_code tool stages files for an approved plan node — the host app opens them in the Workspace Code Editor for review. `planId`, when the plan tab that node belongs to is open, records which files that plan produced (see DeletePlanModal). */
  onCodeGenerated?: (planNodeId: string, files: GeneratedFile[], planId?: string) => void
  /** Owned by App.tsx (fetched once, appended to locally on create) — see its `plans` state doc comment. */
  plans: SavedPlan[]
  onCreatePlan: (plan: SavedPlan) => void
  onDeletePlan: (id: string, opts?: { deleteFiles?: boolean }) => void
  /** Reflects a plan whose `nodeIds` changed in-view (see the ViewModel's addLink cross-plan pull-in) back into App.tsx's owning `plans` state. */
  onUpdatePlan: (plan: SavedPlan) => void
  /** Opens a Workspace-relative file path in the Workspace Code Editor (App.tsx's jumpToProjectFile) — powers the card's file links and double-click-to-open on graph nodes / the NODES list. No-op when omitted or no Workspace is open. */
  onOpenFile?: (path: string) => void
}

// A node's file is openable in the Workspace only when it actually lives
// there: scaffolded nodes (role set) and plan asset nodes (type
// 'workspace-file') are Workspace-relative, whereas a generated library
// node's filePath is SRC_ROOT-relative — a different root the Workspace jump
// can't resolve — and a plain note has no file at all.
function workspaceFilePath(node: GraphNode): string | null {
  if (!node.filePath) return null
  return node.role || node.type === 'workspace-file' ? node.filePath : null
}

function flattenFilePaths(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'file') into.push(n.path)
    if (n.children) flattenFilePaths(n.children, into)
  }
  return into
}

export const PlanningView: React.FC<PlanningViewProps> = ({
  focusMapId,
  onFocusMapIdConsumed,
  onCodeGenerated,
  plans,
  onCreatePlan,
  onDeletePlan,
  onUpdatePlan,
  onOpenFile,
}) => {
  const { theme } = useAppTheme()
  const removablePlanFor = (mapId: GraphMapId) => plans.find((p) => p.id === mapId)
  // Whether the built-in Welcome guide has been permanently dismissed (see
  // storeWelcomeDismissed). Seeded synchronously from localStorage so the
  // ViewModel below can skip auto-opening it as the initial tab; flipped live
  // by deleteWelcome without needing a reload.
  const [welcomeDismissed, setWelcomeDismissed] = useState(readWelcomeDismissed)
  const [confirmingWelcomeDelete, setConfirmingWelcomeDelete] = useState(false)
  const {
    mapId,
    openMapIds,
    openMap,
    closeMap,
    switchToMap,
    selectedId,
    setSelectedId,
    live,
    stages,
    notes,
    archivedEntries,
    refreshAll,
    setPlanNodeStatus,
    setStage,
    archiveNode,
    deleteNode,
    renameNode,
    restoreEntry,
    selectedNode,
    borrowsFrom,
    borrowedBy,
    addLink,
    removeLink,
    removeImporter,
    flipLink,
    query,
    setQuery,
    kindFilter,
    setKindFilter,
    nodeRows,
    isGlobalSearch,
    mapLabelFor,
  } = usePlanningViewModel('welcome', focusMapId, onFocusMapIdConsumed, plans, onUpdatePlan, welcomeDismissed)

  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<SavedPlan | null>(null)
  const [deletingNode, setDeletingNode] = useState<GraphNode | null>(null)
  const [renamingNode, setRenamingNode] = useState<GraphNode | null>(null)
  // Right-click / ⋯ menu for the NODES list rows (see nodeMenuItems below).
  const nodeMenu = useContextMenu<GraphNode>()

  const copyNodeRelativePath = (node: GraphNode) => {
    if (node.filePath) void navigator.clipboard.writeText(node.filePath)
  }
  const copyNodeAbsolutePath = async (node: GraphNode) => {
    const rel = workspaceFilePath(node)
    if (!rel) return
    const info = await getWorkspaceInfo()
    void navigator.clipboard.writeText(info.root ? `${info.root}/${rel}` : rel)
  }
  const [isCreatingPlan, setIsCreatingPlan] = useState(false)
  const [newPlanLabel, setNewPlanLabel] = useState('')
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [createPlanError, setCreatePlanError] = useState<string | null>(null)
  // Forces the full-page create-plan screen (PlanningEmptyState) even while
  // tabs are open — the tab strip's "+" sets this (see onAddTabClick below),
  // as opposed to the sidebar PLANS "+" which stays an inline type-it-out box.
  // Cleared the moment any plan is opened/created (see activateMap).
  const [showCreatePlan, setShowCreatePlan] = useState(false)

  // The one node-creation entry point (see AddNodeModal) — used to have a
  // second, separate "Scaffold Files…" button/modal alongside a plain inline
  // "New Node" form; the two were confusing as siblings, so they're now one
  // modal reached from this one flag.
  const [isAddingNode, setIsAddingNode] = useState(false)
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false)
  const nodeSearchRef = useRef<HTMLElement>(null)
  // Bumped by the node ⋯ menu's "Link" action to pop the selected node's
  // add-link search open (see LinkAddDropdown's openSignal).
  const [linkOpenSignal, setLinkOpenSignal] = useState(0)

  useEffect(() => {
    if (!nodeSearchOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Element
      if (nodeSearchRef.current?.contains(t)) return
      if (t.closest('[data-floating-menu]')) return
      setNodeSearchOpen(false)
      setQuery('')
      setKindFilter([])
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [nodeSearchOpen, setQuery, setKindFilter])

  // Flip an existing link's direction in place — a pick from the search field
  // always creates an outgoing link (this node imports the pick), and the
  // LINKED list's per-row → / ← button switches it afterward. Delegates to the
  // ViewModel's flipLink, which reverses the edge in a *single* refresh so the
  // graph keeps every node fixed and just redraws the arrow (see GraphCanvas's
  // topologyKey) rather than reheating the layout.
  const toggleLinkDirection = (row: LinkedRow) => flipLink(row.node, row.direction)

  const [nodesCollapsed, setNodesCollapsed] = useState(false)
  const [archivedCollapsed, setArchivedCollapsed] = useState(false)

  const activateMap = (id: GraphMapId) => {
    openMap(id)
    setSelectedId(null)
    // Opening or creating a plan dismisses the full-page create screen — this
    // covers create (submitNewPlan ends here), open-existing, and open-Welcome,
    // as well as clicking a tab to back out of the create screen.
    setShowCreatePlan(false)
  }

  // Permanently dismiss the built-in Welcome guide: persist the flag, hide it
  // from the PLANS list + empty state going forward, and close its tab if it
  // happens to be open right now (closeMap falls through to a neighboring tab
  // or the empty state). Reversible only by clearing the stored flag — this is
  // the "delete permanently" the sidebar trash offers for real plans, adapted
  // for a map that has no on-disk plan to remove.
  const deleteWelcome = () => {
    storeWelcomeDismissed(true)
    setWelcomeDismissed(true)
    closeMap('welcome')
    setConfirmingWelcomeDelete(false)
  }

  // Undo a permanent Welcome dismissal — clears the stored flag and opens the
  // guide again so it's immediately visible (and back in the PLANS list). Only
  // surfaced from the empty start page while Welcome is currently dismissed.
  const restoreWelcome = () => {
    storeWelcomeDismissed(false)
    setWelcomeDismissed(false)
    activateMap('welcome')
  }

  // `labelOverride` lets the full-page create screen (PlanningEmptyState,
  // reached via the tab strip's "+" or the empty state) submit its own typed
  // name directly — same underlying create as the sidebar PLANS header's
  // inline form, which instead reads from newPlanLabel state.
  const submitNewPlan = async (labelOverride?: string) => {
    const label = (labelOverride ?? newPlanLabel).trim()
    if (!label) return
    setCreatingPlan(true)
    setCreatePlanError(null)
    try {
      const { plan } = await createPlan(label, [])
      onCreatePlan(plan)
      setIsCreatingPlan(false)
      setNewPlanLabel('')
      activateMap(plan.id)
    } catch (e) {
      setCreatePlanError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingPlan(false)
    }
  }

  // Double-click a graph node: jump straight to its real file in the
  // Workspace when it has one, otherwise just select it (single-click already
  // selected it, so this is a harmless no-op for file-less notes).
  const handleActivateNode = (id: string) => {
    const node = live.nodes.find((n) => n.id === id)
    if (!node) return
    const filePath = workspaceFilePath(node)
    if (filePath && onOpenFile) {
      onOpenFile(filePath)
      return
    }
    setSelectedId(node.id)
  }

  // The NODES search box's cross-map quick-jump (ROADMAP.md's Phase 1
  // follow-up) — takes the already-known GraphNode straight from the
  // aggregate (usePlanningViewModel's nodeRows) rather than re-looking it up
  // in `live.nodes`, since switchToMap's data refetch is async and wouldn't
  // be visible on this same tick.
  const selectNodeRow = (row: PlanningNodeRow) => {
    if (row.mapId !== mapId) switchToMap(row.mapId).catch(() => {})
    setSelectedId(row.node.id)
  }

  // The ⋯ menu's "Link" action: select the node (so its detail card opens) and
  // signal its LINKED add-link search to pop open, so linking is one click from
  // the node itself rather than a hunt for a separate control.
  const linkNode = (node: GraphNode) => {
    setSelectedId(node.id)
    setLinkOpenSignal((s) => s + 1)
  }

  // Headless — doesn't touch the visible AgentChat conversation at all, just
  // a one-off chat session dedicated to this single generate_code request.
  // The SleipnirLoader in the detail panel below is the only "it's working"
  // signal, same role the chat panel's own loader plays for a live chat turn.
  const generateCode = async (node: GraphNode) => {
    const api = window.chatAPI
    if (!api) {
      setGenerateError('AI chat is desktop-only — run the Electron app.')
      return
    }
    setGenerateError(null)
    setGeneratingNodeId(node.id)
    const sessionId = crypto.randomUUID()
    // Captured at click time — the plan tab (if any) that's open right now
    // is the one credited with whatever files this run produces (see
    // App.tsx's onCodeGenerated/appendPlanGeneratedFiles).
    const activePlanId = removablePlanFor(mapId)?.id

    // Loosely match the plan step's label against the open Workspace's file
    // list so the model has a real shot at editing the actual existing file
    // instead of guessing a path or duplicating one that already exists.
    const nameGuess = node.label.replace(/\s+component$/i, '').trim()
    const info = await getWorkspaceInfo()
    let candidateHint: string
    if (info.root) {
      const { tree } = await listWorkspaceDir('').catch(() => ({ tree: [] as FileTreeNode[] }))
      const candidates = flattenFilePaths(tree)
        .map((path) => ({ path, score: fuzzyScore(nameGuess, path) }))
        .filter((r): r is { path: string; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((r) => r.path)
      candidateHint = candidates.length
        ? `Likely existing file(s) this refers to — edit one via its exact path if it matches: ${candidates.join(', ')}`
        : 'No obviously matching existing file was found in the Workspace. If this is a new file, create it fresh.'
    } else {
      candidateHint = 'No Workspace is open yet — if this is a new file, generate_code will create one once a Workspace folder is chosen.'
    }

    const prompt = [
      'Generate code for this approved plan step using the generate_code tool.',
      `Label: ${node.label}`,
      node.description ? `Description: ${node.description}` : null,
      candidateHint,
    ].filter(Boolean).join('\n')

    let settled = false
    const cleanup = () => {
      settled = true
      unsubCode()
      unsubDone()
      unsubError()
    }
    const unsubCode = api.onCodeGenerated(sessionId, (payload) => {
      cleanup()
      setGeneratingNodeId(null)
      onCodeGenerated?.(node.id, payload.files, activePlanId)
    })
    const unsubDone = api.onDone(sessionId, () => {
      if (settled) return
      cleanup()
      setGeneratingNodeId(null)
      setGenerateError("AI responded without generating code — try again, or rephrase the plan step's description.")
    })
    const unsubError = api.onError(sessionId, (message) => {
      cleanup()
      setGeneratingNodeId(null)
      setGenerateError(message)
    })

    api.sendMessage(sessionId, [], prompt)
  }

  const allMaps = getGraphMaps()
  // Saved plans are never in getGraphMaps() (see App.tsx's plans state doc
  // comment) — used only for resolving an open tab's label/icon.
  const allMapsWithPlans = [...allMaps, ...plans]
  const openTabs = openMapIds
    .map((id) => allMapsWithPlans.find((m) => m.id === id))
    .filter((m): m is { id: string; label: string } => !!m)
  const welcomeMap = allMaps.find((m) => m.id === 'welcome')
  // Keyed off the *resolved* tabs, not openMapIds, so a just-deleted plan
  // (still lingering in openMapIds until closeMap runs, but already gone from
  // `plans`) correctly counts as "no tabs" and flips in the create-a-plan
  // start page below — same fallback the Workspace shows with no folder open.
  const noOpenTabs = openTabs.length === 0
  // The create-a-plan start page shows either when nothing's open at all, or
  // when the tab strip's "+" explicitly asked for it (showCreatePlan).
  const showCreateScreen = noOpenTabs || showCreatePlan

  // The NODES list is a flat list (like PLANS) — every node sits at the same
  // left margin, no parent/child nesting or expand/collapse. Plan-step edges
  // still drive the graph and the LINKED panel; they just don't reshape this
  // list into a tree.
  const visibleNodeRows = nodeRows

  // Ids of every notes.json-backed node (note/scaffolded/plan-step) — the only
  // ones eligible for permanent delete (deleteNode). Build-generated src nodes
  // aren't in here; they only ever get the restorable archive × below.
  const noteIdSet = new Set(notes.map((nn) => nn.id))

  // Which nodes have at least one link — drives each NODES row's leading
  // connectivity glyph (linked → 'plan-node' with its connection line,
  // unlinked → 'plan-node-plain' ring). Scoped to live.edges (the current
  // map), the same edges the graph draws; a cross-map global-search row has no
  // edge here and so reads as unlinked.
  const connectedNodeIds = new Set<string>()
  for (const e of live.edges) {
    connectedNodeIds.add(e.source)
    connectedNodeIds.add(e.target)
  }

  return (
    <Frame theme={theme} h="fill" flow="horizontal" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      {/* Sidebar — runs the full height from the true top; the tab strip
          sits beside it (in the column to the right), not above it. */}
      <ScrollWindow
        axis="y"
        flow="vertical"
        gap={0}
        padding={{ x: 8, y: 16 }}
        w={200}
        shrink={0}
        stroke={{ right: { color: 'border-1' } }}
      >
        {/* Title row — the search trigger lives in the header actions; opening
            it slides the input over the "PLANNING" title (see SidebarHeader's
            search mode), same collapsed-by-default pattern as LeftRailingView. */}
        <Frame ref={nodeSearchRef} padding={{ bottom: 10 }} shrink={0}>
          <SidebarHeader
            label="PLANNING"
            searchOpen={nodeSearchOpen || !!query}
            actions={
              !nodeSearchOpen && !query ? (
                <IconButton
                  as="span"
                  icon="search"
                  iconSize={14}
                  title="Search nodes"
                  textColor="var(--text-3)"
                  onClick={() => setNodeSearchOpen(true)}
                />
              ) : undefined
            }
            search={
              <Search
                value={query}
                onChange={setQuery}
                placeholder="Search in Planning…"
                w="fill"
                autoFocus={nodeSearchOpen && !query}
                filters={{ options: KIND_FILTER_OPTIONS, active: kindFilter, onChange: setKindFilter }}
              />
            }
          />
        </Frame>

        <Frame flow="vertical" gap={0} shrink={0} padding={{ bottom: 10 }}>
          <CollapsibleHeader
            label="PLANS"
            count={plans.length}
            right={
              // The one and only add-plan control — always here next to
              // "PLANS (n)", never relocated into the input row below. Opening
              // the inline field doesn't move or duplicate it.
              <IconButton onClick={() => setIsCreatingPlan(true)} title="New plan" icon="plan-add" iconSize={13} textColor="var(--text-2)" />
            }
          />
          {isCreatingPlan && (
            <Frame flow="horizontal" align="center" gap={4} padding={{ top: 6 }}>
              <input
                autoFocus
                value={newPlanLabel}
                onChange={(e) => setNewPlanLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewPlan()
                  if (e.key === 'Escape') { setIsCreatingPlan(false); setNewPlanLabel('') }
                }}
                // Click-away with nothing typed cancels rather than leaving an
                // empty unnamed field hanging — same blur-to-dismiss the file
                // tree's InlineCreateForm uses. Enter is the only way to create;
                // an unnamed plan is never created.
                onBlur={() => { if (!newPlanLabel.trim()) { setIsCreatingPlan(false); setNewPlanLabel('') } }}
                placeholder="Plan name (Enter to create)"
                disabled={creatingPlan}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--radius-2)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  padding: '4px 6px',
                  ...MONO,
                }}
              />
            </Frame>
          )}
          {createPlanError && (
            <span style={{ fontSize: 10, color: '#e07a7a', display: 'block', paddingTop: 4, ...MONO }}>{createPlanError}</span>
          )}
          <Frame flow="vertical" gap={0} padding={{ top: 6 }}>
            {welcomeMap && !welcomeDismissed && (
              // Welcome is a built-in guide map, not a saved plan on disk — its
              // trash routes through a confirm (DismissWelcomeModal) that
              // persists a local "hidden" flag rather than deleting anything,
              // permanently removing it from this list + the empty state (see
              // deleteWelcome / welcomeDismissed).
              <PlanRow
                map={welcomeMap}
                active={welcomeMap.id === mapId}
                onOpen={() => activateMap(welcomeMap.id)}
                onDelete={() => setConfirmingWelcomeDelete(true)}
                icon="network"
              />
            )}
            <PlanGroup plans={plans} mapId={mapId} onOpen={activateMap} onDelete={setDeletingPlan} icon="network" />
          </Frame>
        </Frame>
        <div style={{ height: 1, background: 'var(--border-1)', flexShrink: 0, marginBottom: 10 }} />

        <Frame flow="vertical" gap={0} shrink={0} padding={{ bottom: 10 }}>
          <CollapsibleHeader
            label={isGlobalSearch ? 'RESULTS' : 'NODES'}
            count={isGlobalSearch ? nodeRows.length : live.nodes.length}
            collapsed={nodesCollapsed}
            onToggle={() => setNodesCollapsed((v) => !v)}
            right={
              // Add-node works on plan tabs too now: a note authored here is
              // tagged with the plan's id as its map (see AddNodeModal ->
              // addNote/scaffoldNodes, and isNoteTarget in
              // tools/sleipnir-backend.mjs, which accepts an existing plan id),
              // and shows up on this plan's tab via the ViewModel's `live`
              // notes merge — so a freshly-created plan is no longer a dead end.
              // Just Add-node here now — linking moved off this header onto the
              // node itself: right-click / ⋯ a node → "Link", or the add-link
              // control in the selected node's LINKED panel (see nodeMenu items
              // and LinkedNodeList's headerAction below).
              <IconButton onClick={() => setIsAddingNode(true)} title="Add node…" icon="plan-node-add" iconSize={13} textColor="var(--text-2)" />
            }
          />
        </Frame>
        {!nodesCollapsed && (
          <>
        {visibleNodeRows.map((row) => {
            const n = row.node
            // The ⋯ menu is meaningless during a global search (a row there may
            // belong to a map other than the active one). On a plan tab it's
            // scoped to notes authored directly into *this* plan (map === the
            // plan id) — the plan's resolved/borrowed nodes live in other maps,
            // so rename/delete from here would act on the wrong place.
            const menuEnabled =
              !isGlobalSearch &&
              (!removablePlanFor(mapId) || (noteIdSet.has(n.id) && n.map === mapId))
            return (
            <ListRow
              key={isGlobalSearch ? `${row.mapId}::${n.id}` : n.id}
              selected={n.id === selectedId}
              // Full-bleed flat row — negative margins cancel the sidebar's 8px
              // padding so the fill spans edge-to-edge. No child indent: the
              // NODES list is flat, like PLANS.
              indent={8}
              style={{ marginLeft: -8, marginRight: -8, flexShrink: 0 }}
              onClick={() => selectNodeRow(row)}
              // Double-click jumps to the real file in the Workspace (same as
              // double-clicking the node in the graph), when it has one.
              onDoubleClick={() => {
                const filePath = workspaceFilePath(n)
                if (filePath && onOpenFile) onOpenFile(filePath)
              }}
              onContextMenu={menuEnabled ? (e) => nodeMenu.openFromEvent(e, n) : undefined}
              title={workspaceFilePath(n) ? 'Double-click to open in Workspace' : undefined}
              // Type icon: a code-backed node (.tsx/.rs/.py/…) shows the file
              // icon; a markdown note or file-less idea node keeps the node glyph
              // — the connection-line mark when linked, the plain ring otherwise
              // (see nodeIconName). Inherits the row colour so it flips with
              // hover/selection just like the label.
              iconStart={
                <span title={connectedNodeIds.has(n.id) ? 'Linked' : 'No links'} style={{ display: 'inline-flex', flexShrink: 0 }}>
                  <Icon name={nodeIconName(n, connectedNodeIds.has(n.id))} size={14} />
                </span>
              }
              trailing={(hovered) => {
                const showMenu = menuEnabled && hovered
                return (
                  <>
                    {/* Map tag only during global search — a per-map row trivially
                        belongs to the active tab, so tagging it there is clutter. */}
                    {isGlobalSearch && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
                        {row.mapLabel}
                      </span>
                    )}
                    {showMenu ? (
                      // Unified ⋯ menu (Rename / Copy path / Delete / archive) —
                      // gated off plan tabs and global search: a row there may
                      // belong to a map other than the active one.
                      <IconButton
                        onClick={(e) => { e.stopPropagation(); nodeMenu.openFromButton(e, n) }}
                        title="More actions"
                        glyph="⋯"
                        iconSize={16}
                        textColor="var(--text-3)"
                      />
                    ) : (
                      // Status at rest, right-aligned: the AI plan-step status
                      // (☐/◐/☑) and the sprint-stage glyph, in the stage's colour.
                      // Swapped out for ⋯ on hover (see showMenu).
                      <>
                        {n.status && (
                          <span
                            title={n.status}
                            // `done` uses inherit so its ☑ flips with the row and
                            // never vanishes on the solid selected fill; the others
                            // keep their own signal colours.
                            style={{ fontSize: 11, color: n.status === 'done' ? 'inherit' : n.status === 'approved' ? '#e0a040' : 'var(--text-3)', ...MONO }}
                          >
                            {n.status === 'done' ? '☑' : n.status === 'approved' ? '◐' : '☐'}
                          </span>
                        )}
                        {/* Sprint stage — defaults to 'proposed' for any untagged
                            node (the universal default), via StatusGlyph. */}
                        <StatusGlyph stage={stages[n.id]} size={13} />
                      </>
                    )}
                  </>
                )
              }}
            >
              {nodeDisplayLabel(n)}
              {/* Same ".tsx"/".rs" suffix (dimmer) the graph label shows, so a
                  node reads identically in both places. */}
              {fileExtLabel(n.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(n.filePath)}</span>}
            </ListRow>
            )
          })}
          </>
        )}

        {archivedEntries.length > 0 && (
          <Frame flow="vertical" gap={0} padding={{ top: 12 }} shrink={0}>
            <CollapsibleHeader
              label={`ARCHIVED (${archivedEntries.length})`}
              collapsed={archivedCollapsed}
              onToggle={() => setArchivedCollapsed((v) => !v)}
            />
            {!archivedCollapsed && archivedEntries.map((entry) => (
              // Flat full-bleed row, same ListRow as PLANS/NODES above and the
              // file tree — dimmed + struck-through to read as archived, and it
              // brightens on hover like any de-emphasised row.
              <ListRow
                key={entry.path}
                indent={8}
                labelOpacity={0.6}
                title="Restore"
                onClick={() => restoreEntry(entry)}
                style={{ marginLeft: -8, marginRight: -8, flexShrink: 0 }}
              >
                <span style={{ textDecoration: 'line-through' }}>{entry.label}</span>
              </ListRow>
            ))}
          </Frame>
        )}
      </ScrollWindow>

      <Frame flow="vertical" grow minW={0} h="fill">
        <WorkspaceHeader
          // No node/edge count (nor a Delete-Plan menu) on the create-a-plan
          // start page — there's no active graph to describe. The tab strip's
          // "+" still shows, since onAddTabClick stays wired below.
          actions={
            showCreateScreen ? undefined : (
            <>
              {removablePlanFor(mapId) && (
                <Dropdown
                  options={[{ value: 'delete', label: 'Delete Plan' }]}
                  onChange={() => {
                    const plan = removablePlanFor(mapId)
                    if (plan) setDeletingPlan(plan)
                  }}
                  variant="none"
                  w="auto"
                  trigger={
                    <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 4px', ...MONO }} title="Plan actions">
                      ⋯
                    </span>
                  }
                />
              )}
              <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
                {live.nodes.length} NODES · {live.edges.length} EDGES
              </span>
            </>
            )
          }
          tabs={openTabs.map((m) => ({
            id: m.id,
            label: m.label,
            closable: true,
            // Same 'network' icon NavRail's own Planning item and every
            // sidebar PLANS row use — Welcome included, so every open tab
            // reads as the same identifiable type at a glance, not just
            // plain text.
            icon: removablePlanFor(m.id) || m.id === 'welcome' ? 'network' : undefined,
          }))}
          activeTabId={mapId}
          onActivateTab={activateMap}
          onCloseTab={closeMap}
          // The tab strip's "+" opens the full-page blank create-plan screen
          // (PlanningEmptyState), rather than the inline name box the sidebar
          // PLANS "+" uses — onAddTabClick fires immediately with no inline
          // input of its own (see WorkspaceTabStrip).
          onAddTabClick={() => setShowCreatePlan(true)}
        />

        {deletingPlan && (
          <DeletePlanModal
            plan={deletingPlan}
            onClose={() => setDeletingPlan(null)}
            onDeletePlan={onDeletePlan}
            onDeleted={() => {
              // Close the just-deleted plan's tab rather than force-opening
              // Welcome: if it was the last tab, closeMap falls through to
              // 'welcome' as the active id but leaves nothing open, so the
              // create-a-plan start page shows. Deleting a plan whose tab
              // isn't open is a no-op here (closeMap ignores an unknown id).
              closeMap(deletingPlan.id)
              setDeletingPlan(null)
            }}
          />
        )}

        {deletingNode && (
          <DeleteNodeModal
            node={deletingNode}
            onClose={() => setDeletingNode(null)}
            onDelete={deleteNode}
            onDeleted={() => setDeletingNode(null)}
          />
        )}

        {confirmingWelcomeDelete && (
          <DismissWelcomeModal
            onClose={() => setConfirmingWelcomeDelete(false)}
            onConfirm={deleteWelcome}
          />
        )}

        {renamingNode && (
          <RenamePathModal
            name={renamingNode.label}
            isDir={false}
            title="RENAME NODE"
            rename={(newName) => renameNode(renamingNode, newName)}
            onClose={() => setRenamingNode(null)}
            onRenamed={() => setRenamingNode(null)}
          />
        )}

        {nodeMenu.menu && (() => {
          const n = nodeMenu.menu.data
          const renamable = noteIdSet.has(n.id)
          const archivable = !n.role && !!folderPathForNode(n)
          return (
            <ContextMenu
              x={nodeMenu.menu.x}
              y={nodeMenu.menu.y}
              anchorEl={nodeMenu.menu.anchorEl}
              onClose={nodeMenu.close}
              items={[
                // Link lives on the node itself now (was a header shortcut):
                // selects it and pops its LINKED add-link search open (see
                // linkNode / LinkAddDropdown's openSignal).
                { label: 'Link', icon: 'link-add' as const, onSelect: () => linkNode(n) },
                ...(renamable ? [{ label: 'Rename', separator: true, onSelect: () => setRenamingNode(n) }] : []),
                ...(workspaceFilePath(n) ? [{ label: 'Copy path', separator: true, onSelect: () => copyNodeAbsolutePath(n) }] : []),
                ...(n.filePath ? [{ label: 'Copy relative path', separator: !workspaceFilePath(n), onSelect: () => copyNodeRelativePath(n) }] : []),
                ...(renamable
                  ? [{ label: 'Delete node', separator: true, destructive: true, onSelect: () => setDeletingNode(n) }]
                  : archivable
                    ? [{ label: 'Remove', separator: true, destructive: true, onSelect: () => archiveNode(n) }]
                    : []),
              ]}
            />
          )
        })()}

        {isAddingNode && (
          <AddNodeModal
            mapId={mapId}
            onClose={() => setIsAddingNode(false)}
            onCreated={async (nodes) => {
              await refreshAll()
              if (nodes[0]) setSelectedId(nodes[0].id)
            }}
          />
        )}

        {/* Body: the create-a-plan start page when nothing's open (mirrors
            the Workspace's "no folder open" state), otherwise the graph
            canvas + detail panel for the active tab. */}
        <Frame flow="horizontal" grow minH={0}>
          {showCreateScreen ? (
            <PlanningEmptyState
              plans={plans}
              onOpenPlan={activateMap}
              onOpenWelcome={welcomeMap && !welcomeDismissed ? () => activateMap(welcomeMap.id) : undefined}
              onRestoreWelcome={welcomeMap && welcomeDismissed ? restoreWelcome : undefined}
              onCreatePlan={submitNewPlan}
              creating={creatingPlan}
              error={createPlanError}
            />
          ) : (
          <>
          <Frame grow minW={0} style={{ position: 'relative' }}>
            <GraphCanvas
              data={live}
              selectedId={selectedId}
              stages={stages}
              onSelectNode={(id) => setSelectedId(id || null)}
              onActivateNode={handleActivateNode}
            />
          </Frame>

          {selectedNode && (
            <Frame
              flow="vertical"
              minW={260}
              w={260}
              h="fill"
              fill={{ solid: 'bg-1' }}
              stroke={{ left: { color: 'border-1' } }}
              padding={20}
              gap={14}
              scroll="y"
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  color: selectedNode.kind === 'proposed' ? '#e0a040' : 'var(--text-3)',
                  ...MONO,
                }}
              >
                {selectedNode.kind === 'proposed' ? 'PROPOSED' : 'BUILT'} · {(selectedNode.type ?? '').toUpperCase()}
              </span>

              {(() => {
                const openPath = workspaceFilePath(selectedNode)
                const openable = !!openPath && !!onOpenFile
                return (
                  <>
                    <span
                      onClick={openable ? () => onOpenFile!(openPath!) : undefined}
                      title={openable ? 'Open in Workspace' : undefined}
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        ...MONO,
                        ...(openable ? FILE_LINK_STYLE : { color: 'var(--text-1)' }),
                      }}
                    >
                      {nodeDisplayLabel(selectedNode)}
                      {/* Same dimmer ".tsx"/".rs" suffix the graph + NODES
                          list show, so the card title reads identically. */}
                      {fileExtLabel(selectedNode.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(selectedNode.filePath)}</span>}
                    </span>

                    {selectedNode.filePath && (
                      <span
                        onClick={openable ? () => onOpenFile!(openPath!) : undefined}
                        title={openable ? 'Open in Workspace' : undefined}
                        style={{
                          fontSize: 9,
                          letterSpacing: '0.02em',
                          wordBreak: 'break-all',
                          ...MONO,
                          ...(openable ? FILE_LINK_STYLE : { color: 'var(--text-3)' }),
                        }}
                      >
                        {selectedNode.filePath}
                      </span>
                    )}
                  </>
                )
              })()}

              {selectedNode.description && (
                <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
                  {selectedNode.description}
                </span>
              )}

              {/* Sprint stage — settable on every node (see StageToggle),
                  drives the node's color + stroke in the graph. Independent of
                  the AI plan-step approve/generate flow below. */}
              <div style={{ height: 1, background: 'var(--border-1)' }} />
              <StageToggle
                value={stages[selectedNode.id]}
                onChange={(stage) => setStage(selectedNode, stage)}
              />

              {selectedNode.status && (
                <>
                  <div style={{ height: 1, background: 'var(--border-1)' }} />
                  {selectedNode.status === 'draft' ? (
                    <button
                      onClick={() => setPlanNodeStatus(selectedNode, 'approved')}
                      style={{
                        background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
                        border: '1px solid var(--border-2)',
                        color: 'var(--text-1)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        ...MONO,
                      }}
                    >
                      APPROVE
                    </button>
                  ) : selectedNode.status === 'approved' ? (
                    generatingNodeId === selectedNode.id ? (
                      <Frame flow="horizontal" align="center" gap={8}>
                        <SleipnirLoader size={28} />
                        <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
                          GENERATING…
                        </span>
                      </Frame>
                    ) : (
                      <button
                        onClick={() => generateCode(selectedNode)}
                        style={{
                          background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
                          border: '1px solid var(--border-2)',
                          color: 'var(--text-1)',
                          fontSize: 10,
                          letterSpacing: '0.08em',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          ...MONO,
                        }}
                      >
                        GENERATE CODE
                      </button>
                    )
                  ) : (
                    <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
                      {selectedNode.status.toUpperCase()}
                    </span>
                  )}
                  {generateError && generatingNodeId === null && (
                    <span style={{ fontSize: 9, color: '#e07a7a', lineHeight: 1.5, ...MONO }}>{generateError}</span>
                  )}
                </>
              )}

              <div style={{ height: 1, background: 'var(--border-1)' }} />

              {/* Link editor — the add-link control now lives in the LINKED
                  header (see LinkedNodeList's headerAction / LinkAddDropdown),
                  only for a scaffolded node (a real per-language file to
                  round-trip); see addLink/removeLink (outgoing) and
                  addImporter/removeImporter (incoming) for why adding either
                  direction edits a *different* file depending on which one.
                  Candidates search `notes` (every plan), not `live.nodes`
                  (just the one open right now) — a link can point anywhere in
                  the workspace's plans, not only within the currently active
                  one. Both directions always record a graph edge for any
                  node/document type; a real import statement is only spliced
                  when both ends are same-language files (see canSpliceImport in
                  addImporter/flipLink), so a note or a cross-language pair just
                  flips the edge. */}
              <LinkedNodeList
                rows={[
                  ...borrowsFrom.map((n) => ({ node: n, direction: 'out' as const })),
                  ...borrowedBy.map((n) => ({ node: n, direction: 'in' as const })),
                ]}
                onRemove={(row) => (row.direction === 'out' ? removeLink(row.node) : removeImporter(row.node))}
                // Any node can flip any link's direction — the arrow reverses
                // the graph edge for every node/document type (see flipLink);
                // the import splice is best-effort for same-language file pairs.
                onToggleDirection={toggleLinkDirection}
                currentMapId={selectedNode.map}
                mapLabelFor={mapLabelFor}
                onOpenFile={onOpenFile}
                headerAction={
                  <LinkAddDropdown
                    // Any node can be linked to now — candidates span every node
                    // in this graph plus every note across plans (deduped),
                    // minus this node and anything it already links to. A pick
                    // adds an outgoing link (this node → pick); a same-language
                    // file pair also splices a real import (see addLink).
                    candidates={(() => {
                      const byId = new Map<string, GraphNode>()
                      for (const cn of [...live.nodes, ...notes]) {
                        if (cn.id !== selectedNode.id && !borrowsFrom.some((b) => b.id === cn.id)) byId.set(cn.id, cn)
                      }
                      return [...byId.values()]
                    })()}
                    onPick={(n) => addLink(n)}
                    // selectedNode.map, not mapId — a plan *tab*'s id isn't a
                    // real map (see isValidMapId in tools/sleipnir-backend.mjs),
                    // and selectedNode's own home map is what "cross-plan"
                    // should actually be relative to.
                    currentMapId={selectedNode.map}
                    mapLabelFor={mapLabelFor}
                    openSignal={linkOpenSignal}
                  />
                }
              />
            </Frame>
          )}
          </>
          )}
        </Frame>
      </Frame>
    </Frame>
  )
}
