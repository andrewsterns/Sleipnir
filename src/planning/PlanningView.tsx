import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { agentName } from './activityLog'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { Button } from '../app/UIKit/Button/Button'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { WorkspaceHeader } from '../app/WorkspaceHeader/WorkspaceHeader'
import { TAB_ROW_H, TabPicker } from '../app/WorkspaceTabStrip/TabPicker'
import { GraphCanvas, fileExtLabel, nodeDisplayLabel, nodeIconName } from './graph/GraphCanvas'
import { getGraphMaps, type GraphMapId, type GraphNode, type NodeStage, type SavedPlan, type TrailEntry } from './graph/types'
import { NODE_STAGES, nodeStageKey } from './graph/stages'
import { StatusGlyph } from './graph/StatusGlyph'
import { TONE_STYLE, TONES, type Tone } from './graph/nodeTone'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import { Logo } from '../app/UIKit/Logo/Logo'
import type { GeneratedFile } from '../app/AgentChat/iAgentChat'
import { createPlan, getWorkspaceInfo, listWorkspaceDir, readWorkspaceFile, writeWorkspaceFile, appendPlanGeneratedFiles, renamePlan } from '../platform/sleipnirApi'
import type { FileTreeNode } from '../platform/PlatformAPI'
import { usePlanningViewModel, folderPathForNode, type PlanningNodeRow } from './PlanningView.ViewModel'
import { PlanBuildStatusBar } from './PlanBuildStatusBar'
import { HealthPanel } from './HealthPanel'
import { archId } from './graph/architectureScope'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { SidebarHeader } from '../app/UIKit/SidebarHeader/SidebarHeader'
import { DeletePlanModal } from './DeletePlanModal'
import { DeleteNodeModal } from './DeleteNodeModal'
import { DismissWelcomeModal } from './DismissWelcomeModal'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { RenamePathModal } from '../app/DesignSystem/RenamePathModal'
import { AddNodeModal } from './AddNodeModal'
import { ApproveStepModal } from './ApproveStepModal'
import { usePlanActivity } from './usePlanActivity'
import { ActivityPanel } from './ActivityPanel'
import { PlanStepsList } from './PlanStepsList'
import { SkillsList } from './skills/SkillsList'
import { useGraphForces } from './useGraphForces'
import { DEFAULT_FORCES, FORCE_RANGES, type GraphForces } from './graph/layout'
import { PINNED_VIEWS, pinnedViewFor, planHistory } from './graph/pinnedViews'
import { SkillCard } from './skills/SkillCard'
import { TrailInsightsPanel } from './TrailInsightsPanel'
import { NewSkillModal } from './skills/NewSkillModal'
import { skillNodeId } from './graph/skillGraph'
import { NewWorkspacePlanModal } from '../app/Workspace/NewWorkspacePlanModal'
import { fuzzyScore } from '../utils/fuzzyMatch'
import { useAppTheme } from '../themes/ThemeController'
import { TextField } from '../app/UIKit/Field/TextField'
import { LensSwitch, LensValue } from './LensControls'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

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
        <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
          Linked ({rows.length})
        </span>
        {headerAction}
      </Frame>
      <Frame flow="vertical" gap={2}>
        {orderedRows.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', ...UI_FONT }}>— none —</span>
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
                    style={{ fontSize: 11, color: 'var(--text-3)', width: 18, flexShrink: 0, textAlign: 'center', ...UI_FONT }}
                  >
                    {arrowGlyph}
                  </span>
                )
              }
              trailing={(hovered) => (
                <>
                  {crossPlan && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...UI_FONT }}>
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
                  ...UI_FONT,
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
                <span style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 8px', ...UI_FONT }}>
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
                    <span style={{ fontSize: 11, color: 'var(--text-1)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...UI_FONT }}>
                      {nodeDisplayLabel(n)}
                    </span>
                    {n.map !== currentMapId && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...UI_FONT }}>
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
          <span style={{ fontSize: 9, color: 'var(--text-3)', width: 8, display: 'inline-block', flexShrink: 0 }}>
            {collapsed ? '▸' : '▾'}
          </span>
        )}
        <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-2)', ...UI_FONT }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', color: 'var(--text-1)', ...UI_FONT }}>
            ({count})
          </span>
        )}
      </Frame>
      {right}
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
  onGetStarted,
  onCreatePlan,
  creating,
  error,
}: {
  plans: SavedPlan[]
  onOpenPlan: (id: string) => void
  /** Opens the built-in Welcome guide (un-dismissing it first if it was deleted) — Welcome no longer auto-opens on launch. */
  onGetStarted?: () => void
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
      <span style={{ display: 'flex', color: 'var(--text-2)', opacity: 0.85, marginBottom: 6 }}>
        <Logo className="h-40 w-auto" />
      </span>
      <Frame flow="vertical" align="center" gap={6}>
        <span style={{ fontSize: 14, letterSpacing: '0.04em', color: 'var(--text-1)', fontWeight: 600, ...UI_FONT }}>
          No plan open
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em', ...UI_FONT }}>
          Create a plan to start mapping out your work.
        </span>
      </Frame>
      <Frame flow="horizontal" align="center" gap={8}>
        <TextField size="lg"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="Plan name"
          disabled={creating}
          style={{ width: 220 }}
        />
        <Button variant="primary" size="sm" onClick={submit} disabled={creating || !label.trim()}>
          Create Plan
        </Button>
      </Frame>
      {error && <span style={{ fontSize: 11, color: '#e07a7a', ...UI_FONT }}>{error}</span>}

      {plans.length > 0 && (
        <Frame flow="vertical" align="center" gap={6} style={{ marginTop: 10 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
            Open a plan
          </span>
          <Frame flow="vertical" align="center" gap={2}>
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenPlan(p.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '2px 0', ...UI_FONT }}
              >
                {p.label}
              </button>
            ))}
          </Frame>
        </Frame>
      )}

      {onGetStarted && (
        <button
          onClick={onGetStarted}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, letterSpacing: '0.04em', padding: '2px 0', textDecoration: 'underline', ...UI_FONT }}
        >
          Get Started
        </button>
      )}
    </Frame>
  )
}

// The detail card's status picker: one segmented control, Proposed / In
// progress / Testing / Done, each segment its glyph in its tone (see
// graph/nodeTone.ts), with the status set named beside the label — four
// worded segments don't fit the card. Clicking the active segment again clears the status. Set
// on any node; the write goes to the overlay store via setStage, so it works
// for build-generated nodes too. `committed` (a file git sees no changes in)
// is shown beside the label rather than as a fourth choice: it's git's to say,
// not something to pick.
function StageToggle({
  value,
  committed,
  onChange,
}: {
  value?: NodeStage
  committed?: boolean
  onChange: (stage: NodeStage | null) => void
}) {
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
        Status
        {value && <span style={{ color: 'var(--text-1)' }}> · {NODE_STAGES.find((s) => s.id === value)?.label}</span>}
        {committed ? ' · committed' : ''}
      </span>
      <div
        role="radiogroup"
        aria-label="Status"
        style={{ display: 'flex', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-2)', overflow: 'hidden' }}
      >
        {NODE_STAGES.map((s, i) => {
          const active = value === s.id
          const color = TONE_STYLE[s.tone].color
          return (
            <button
              key={s.id}
              role="radio"
              aria-checked={active}
              onClick={() => onChange(active ? null : s.id)}
              title={active ? `${s.label} — click to clear` : s.label}
              style={{
                // Sized to its label, so all three fit the card's width.
                flex: '1 1 auto',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                // A faint wash of the status's own tone when it's the one set.
                background: active ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--border-2)' : 'none',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                fontSize: 10,
                padding: '6px 4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                ...UI_FONT,
              }}
            >
              <StatusGlyph stage={s.id} size={11} title={s.label} />
            </button>
          )
        })}
      </div>
    </Frame>
  )
}

// What the agent is doing this moment, top-left of the canvas — the trail's
// latest line in words. Gone a while after it goes quiet.
const AGENT_VERB: Record<TrailEntry['kind'], string> = {
  read: 'reading',
  search: 'searching',
  edit: 'editing',
  run: 'running',
  test: 'testing',
  tested: 'tested',
  tool: 'using',
  instruction: 'reading',
  skill: 'using',
  prompt: 'thinking',
  session: 'starting',
  idle: 'idle',
}
function AgentCaption({ entry }: { entry: TrailEntry }) {
  const what = entry.kind === 'skill' && entry.skill ? `/${entry.skill}` : entry.paths?.[0] ?? entry.query ?? entry.cmd ?? entry.tool ?? ''
  const color = entry.kind === 'edit' ? TONE_STYLE.in_progress.color : entry.kind === 'test' ? TONE_STYLE.testing.color : 'var(--text-2)'
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: 12,
        maxWidth: 'calc(100% - 24px)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 'var(--radius-2)',
        pointerEvents: 'none',
        fontSize: 10,
        letterSpacing: '0.04em',
        ...UI_FONT,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color: 'var(--text-3)' }}>{entry.agent ? agentName(entry.agent) : 'An agent'}</span>
      <span style={{ color }}>{AGENT_VERB[entry.kind]}</span>
      <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{what}</span>
    </div>
  )
}

// A flag the trail raised for the step in progress (graph/steering.ts), under
// the caption: one line, the most pressing first.
function SteerFlagChip({ text, more, below }: { text: string; more: number; below: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: below ? 44 : 12,
        maxWidth: 'calc(100% - 24px)',
        padding: '5px 9px',
        background: 'var(--bg-1)',
        border: '1px dashed var(--graph-node, #ffffff)',
        borderRadius: 'var(--radius-2)',
        pointerEvents: 'none',
        fontSize: 10,
        letterSpacing: '0.03em',
        color: 'var(--text-1)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...UI_FONT,
      }}
    >
      Worth a look · {text}
      {more > 0 ? ` (+${more})` : ''}
    </div>
  )
}

// On a file's card while a step is in progress: ask the agent to work here, or
// to leave the file alone. It reads the mark the next time it reads its step.
function SteerRow({ stepLabel, mark, onMark }: { stepLabel: string; mark: 'focus' | 'avoid' | null; onMark: (mark: 'focus' | 'avoid' | 'clear') => void }) {
  const button = (value: 'focus' | 'avoid', label: string) => (
    <button
      type="button"
      aria-pressed={mark === value}
      onClick={() => onMark(mark === value ? 'clear' : value)}
      style={{
        flex: 1,
        fontSize: 10,
        letterSpacing: '0.04em',
        padding: '5px 6px',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-2)',
        background: mark === value ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'transparent',
        color: mark === value ? 'var(--text-1)' : 'var(--text-3)',
        cursor: 'pointer',
        ...UI_FONT,
      }}
    >
      {label}
    </button>
  )
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>For the agent</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }} title={stepLabel}>
        While it works on “{stepLabel}”
      </span>
      <Frame flow="horizontal" gap={6}>
        {button('focus', 'Focus here')}
        {button('avoid', "Don't touch")}
      </Frame>
    </Frame>
  )
}

// What the graph's shapes mean, in the corner of the canvas: the tones, in the
// order work moves through them, on a solid ground so edges don't show through.
function ToneLegend() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        display: 'flex',
        gap: 12,
        padding: '5px 9px',
        pointerEvents: 'none',
      }}
    >
      {TONES.map((tone: Tone) => (
        <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
          <StatusGlyph tone={tone} size={9} />
          {TONE_STYLE[tone].label}
        </span>
      ))}
    </div>
  )
}

// The graph's forces, in the canvas's bottom-right corner — Obsidian's two
// layout dials (graph/layout.ts applyForces): CENTER pulls everything toward
// the middle, REPEL pushes nodes apart. Double-click a dial to reset it.
function ForcesPanel({ forces, onChange }: { forces: GraphForces; onChange: (patch: Partial<GraphForces>) => void }) {
  const dial = (key: keyof GraphForces, label: string, hint: string) => {
    const range = FORCE_RANGES[key]
    return (
      <label title={`${hint} Double-click to reset.`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 44, fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>{label}</span>
        <input
          type="range"
          aria-label={label}
          min={range.min}
          max={range.max}
          step={range.step}
          value={forces[key]}
          onChange={(e) => onChange({ [key]: Number(e.target.value) })}
          onDoubleClick={() => onChange({ [key]: DEFAULT_FORCES[key] })}
          className="thin-range"
          style={{ width: 96 }}
        />
        <span style={{ width: 26, textAlign: 'right', fontSize: 10, color: 'var(--text-2)', ...UI_FONT }}>
          {key === 'center' ? forces[key].toFixed(2) : forces[key].toFixed(1)}
        </span>
      </label>
    )
  }
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 9px',
        zIndex: 1,
      }}
    >
      {dial('center', 'Center', 'How strongly everything is pulled toward the middle.')}
      {dial('repel', 'Repel', 'How hard nodes push each other apart.')}
    </div>
  )
}

/** The left panel holds everything beside the graph — steps, details, Health, skills — so it's wider than other views' side panels. */
const AGENT_PANEL_W = 320

// A step's approval, in the step list: offered only while the step is still a
// proposal waiting on a person — never once an agent is on it or it's done.
function ApproveAction({ step, hasPlannedFiles, waiting, onApprove }: { step: GraphNode; hasPlannedFiles: boolean; waiting: boolean; onApprove: () => void }) {
  if (step.status !== 'draft' || !waiting) return null
  return (
    <button
      type="button"
      onClick={onApprove}
      style={{ alignSelf: 'flex-start', fontSize: 10, letterSpacing: '0.04em', padding: '6px 10px', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-2)', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', ...UI_FONT }}
    >
      {hasPlannedFiles || step.proposedFile ? 'Review & approve' : 'Approve'}
    </button>
  )
}

export interface PlanningViewProps {
  /** Set by App.tsx to force a specific map/tab open (e.g. 'claude', to watch AI build nodes live) even when Planning is already mounted, and — when nodeId is present — to select and center that node too (cross-section jumps like "Show in Planning"). Consumed once. */
  focusTarget?: { mapId: GraphMapId; nodeId?: string } | null
  onFocusTargetConsumed?: () => void
  /** Fired once the generate_code tool stages files for an approved plan node — the host app opens them in the Workspace Code Editor for review. `planId`, when the plan tab that node belongs to is open, records which files that plan produced (see DeletePlanModal). */
  onCodeGenerated?: (planNodeId: string, files: GeneratedFile[], planId?: string) => void
  /** Owned by App.tsx (fetched once, appended to locally on create) — see its `plans` state doc comment. */
  plans: SavedPlan[]
  onCreatePlan: (plan: SavedPlan) => void
  onDeletePlan: (id: string, opts?: { deleteFiles?: boolean; deleteNodes?: boolean }) => void | Promise<void>
  /** Reflects a plan whose `nodeIds` changed in-view (see the ViewModel's addLink cross-plan pull-in) back into App.tsx's owning `plans` state. */
  onUpdatePlan: (plan: SavedPlan) => void
  /** Opens a Workspace-relative file path in the Workspace Code Editor (App.tsx's jumpToProjectFile) — powers the card's file links and double-click-to-open on graph nodes / the NODES list. No-op when omitted or no Workspace is open. */
  onOpenFile?: (path: string) => void
  /** "Show in Canvas" from a node's context menu (App.tsx's jumpToCanvasComponent) — only offered when canvasComponentPaths says this node's file has a written component. */
  onShowInCanvas?: (filePath: string) => void
  /**
   * Every filePath with a written canvas component, across every board —
   * owned by App.tsx (see useCanvasComponentPaths), same "one fetch, many
   * consumers" reasoning as `plans`. Kept out of PlanningView's own imports
   * deliberately: canvas already imports from planning in several
   * places, and this file staying import-free of canvas keeps that a
   * one-way dependency rather than a cycle.
   */
  canvasComponentPaths: Set<string>
  /** Fired after node creation writes real files into the project (AddNodeModal's scaffolding branch), so App.tsx can refresh the Workspace tab's file tree — it otherwise refetches only on mount and project change, leaving the new files invisible. */
  onWorkspaceChanged?: () => void
  /** `.planning/` paths that no longer exist on disk (App.tsx's usePlanningHealth) — nodes backed by one get a dashed danger ring. The list and fixes live in the Problems dock. */
  missingPaths?: Set<string>
}

// A node's file is openable in the Workspace only when it actually lives
// there: scaffolded nodes (role set) and plan asset nodes (type
// 'workspace-file') are Workspace-relative, whereas a generated library
// node's filePath is SRC_ROOT-relative — a different root the Workspace jump
// can't resolve — and a plain note has no file at all.
function workspaceFilePath(node: GraphNode): string | null {
  // A planned file doesn't exist until its step is approved — nothing to open.
  if (!node.filePath || node.planned) return null
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
  focusTarget,
  onFocusTargetConsumed,
  onCodeGenerated,
  plans,
  onCreatePlan,
  onDeletePlan,
  onUpdatePlan,
  onOpenFile,
  onShowInCanvas,
  canvasComponentPaths,
  onWorkspaceChanged,
  missingPaths,
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
    planBuildStatus,
    approveAllDrafts,
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
    nodeRows,
    searchNodes,
    mapLabelFor,
    todoNodes,
    isPlanTab,
    planView,
    tones,
    toneFor,
    trail,
    agentNow,
    skillScan,
    refreshSkills,
    showEffort,
    overlay,
    setOverlay,
    metricFor,
    effort,
    activeStep,
    activeMarks,
    steerFlags,
    steerFile,
    planEvents,
    planViewMode,
    pinnedView,
    viewMode,
    setPlanViewMode,
    rescanWorkspace,
    workspaceScan,
    health,
    healthLens,
    healthError,
  } = usePlanningViewModel('welcome', focusTarget, onFocusTargetConsumed, plans, onUpdatePlan, welcomeDismissed)
  const [forces, setForces] = useGraphForces()
  // What the selected step's agents reported, and what it changed (ActivityPanel).
  const planActivity = usePlanActivity(selectedNode?.type === 'plan-step' ? selectedNode.planId : undefined)

  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null)
  // The SKILLS view: the selected skill node's skill, and the new-skill form.
  const selectedSkill = selectedNode?.type === 'skill' ? skillScan?.skills.find((s) => skillNodeId(s.id) === selectedNode.id) ?? null : null
  const [creatingSkill, setCreatingSkill] = useState(false)
  // A plan step with planned files whose review/approve modal is open.
  const [approvingStep, setApprovingStep] = useState<GraphNode | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  // "RUN PLAN" batch driver state — runningPlan gates the trigger/single-node
  // BUILD WITH AI buttons so only one headless chat session runs at a time;
  // runProgress drives the header's "Building N of M" text while it's live.
  const [runningPlan, setRunningPlan] = useState(false)
  const [runProgress, setRunProgress] = useState<{ index: number; total: number; label: string } | null>(null)
  const [deletingPlan, setDeletingPlan] = useState<SavedPlan | null>(null)
  const [renamingPlan, setRenamingPlan] = useState<SavedPlan | null>(null)
  const [deletingNode, setDeletingNode] = useState<GraphNode | null>(null)
  const [renamingNode, setRenamingNode] = useState<GraphNode | null>(null)
  // Right-click / ⋯ menu for the NODES list rows (see nodeMenuItems below).
  const nodeMenu = useContextMenu<GraphNode>()
  // Same pattern for the open plan's actions button beside the PLANS picker —
  // saved plans only (Welcome keeps its own hide flow/trash icon).
  const planMenu = useContextMenu<SavedPlan>()

  const copyNodeRelativePath = (node: GraphNode) => {
    if (node.filePath) void navigator.clipboard.writeText(node.filePath)
  }
  const copyNodeAbsolutePath = async (node: GraphNode) => {
    const rel = workspaceFilePath(node)
    if (!rel) return
    const info = await getWorkspaceInfo()
    void navigator.clipboard.writeText(info.root ? `${info.root}/${rel}` : rel)
  }
  // The PLANS picker's "+ New plan…" opens the same Add-Plan-from-Workspace popup the
  // Workspace/Research file trees use (see WorkspaceView) instead of a bare
  // inline name box — reused wholesale rather than reimplemented, so the
  // name+search+filter+tree picker behaves identically everywhere it appears.
  const [addingPlan, setAddingPlan] = useState(false)
  // What was typed into the PLANS picker when "New plan" was chosen — seeds the modal's name.
  const [newPlanName, setNewPlanName] = useState('')
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [createPlanError, setCreatePlanError] = useState<string | null>(null)
  // Forces the full-page create-plan screen (PlanningEmptyState) even while
  // tabs are open — the tab strip's "+" sets this (see onAddTabClick below),
  // as opposed to the PLANS picker's "+ New plan…", which opens NewWorkspacePlanModal.
  // Cleared the moment any plan is opened/created (see activateMap).
  const [showCreatePlan, setShowCreatePlan] = useState(false)

  // The one node-creation entry point (see AddNodeModal) — used to have a
  // second, separate "Scaffold Files…" button/modal alongside a plain inline
  // "New Node" form; the two were confusing as siblings, so they're now one
  // modal reached from this one flag.
  const [isAddingNode, setIsAddingNode] = useState(false)
  // Bumped by the node ⋯ menu's "Link" action to pop the selected node's
  // add-link search open (see LinkAddDropdown's openSignal).
  const [linkOpenSignal, setLinkOpenSignal] = useState(0)

  // Bumped by the NODES list's single-click (see selectNodeRow) to tell
  // GraphCanvas to explicitly center on the now-selected node — see
  // GraphCanvas's centerSignal doc comment for why selecting a node from
  // *within* the graph itself deliberately does not do this.
  const [centerSignal, setCenterSignal] = useState(0)

  // The node-selection half of a cross-section jump ("Show in Planning" from
  // Workspace/Canvas) — the map-switching half lives in the ViewModel's own
  // focusTarget effect, since selecting + centering needs centerSignal, which
  // lives here rather than there. Same "select immediately, don't wait for
  // the map's data refetch to land" reasoning as selectNodeRow below.
  useEffect(() => {
    if (!focusTarget?.nodeId) return
    setSelectedId(focusTarget.nodeId)
    setCenterSignal((s) => s + 1)
  }, [focusTarget])

  // Flip an existing link's direction in place — a pick from the search field
  // always creates an outgoing link (this node imports the pick), and the
  // LINKED list's per-row → / ← button switches it afterward. Delegates to the
  // ViewModel's flipLink, which reverses the edge in a *single* refresh so the
  // graph keeps every node fixed and just redraws the arrow (see GraphCanvas's
  // topologyKey) rather than reheating the layout.
  const toggleLinkDirection = (row: LinkedRow) => flipLink(row.node, row.direction)

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

  // Backs the full-page create screen only (PlanningEmptyState, reached via
  // the tab strip's "+" or closing every tab) — the PLANS picker's "+ New plan…" instead
  // opens NewWorkspacePlanModal (see addingPlan), which creates its own plan
  // directly via createPlan and reports back through onCreated below.
  const submitNewPlan = async (label: string) => {
    if (!label.trim()) return
    setCreatingPlan(true)
    setCreatePlanError(null)
    try {
      const { plan } = await createPlan(label.trim(), [])
      onCreatePlan(plan)
      activateMap(plan.id)
    } catch (e) {
      setCreatePlanError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingPlan(false)
    }
  }

  // The NODES search box's cross-map quick-jump (ROADMAP.md's Phase 1
  // follow-up) — takes the already-known GraphNode straight from the
  // aggregate (usePlanningViewModel's nodeRows) rather than re-looking it up
  // in `live.nodes`, since switchToMap's data refetch is async and wouldn't
  // be visible on this same tick. A list row's single-click both selects
  // (opens the card) and centers the graph on it — unlike clicking a node
  // directly in the graph, which only selects (see GraphCanvas's
  // centerSignal doc comment for why the two differ).
  const selectNodeRow = (row: PlanningNodeRow) => {
    if (row.mapId !== mapId) switchToMap(row.mapId).catch(() => {})
    setSelectedId(row.node.id)
    setCenterSignal((s) => s + 1)
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

    // Headless: this session has no chat UI mounted to show an approval card
    // in, so anything that would need one (commands, git) is never offered,
    // and generate_code hands its files to onCodeGenerated instead of writing.
    api.sendMessage(sessionId, [], prompt, { mode: 'headless' })
  }

  // Builds the generate_code prompt for the new stage-driven build flow
  // (buildNodeWithAI below) — deliberately separate from generateCode's own
  // prompt-building above rather than a shared extraction, so the existing
  // APPROVE/GENERATE CODE flow (status-gated block below) can stay completely
  // untouched. The one real difference from generateCode's prompt: a node
  // that already has a backing file reads its current content and asks for
  // an edit, instead of always asking for a fresh scaffold + fuzzy-guessing
  // whether a matching file already exists.
  const buildPromptForNode = async (node: GraphNode): Promise<string> => {
    if (node.filePath) {
      const existing = await readWorkspaceFile(node.filePath).catch(() => null)
      if (existing) {
        return [
          'Update this existing file using the generate_code tool — return its FULL updated content for the exact same path, preserving structure/exports except where the requested change requires otherwise.',
          `Path: ${node.filePath}`,
          `Label: ${node.label}`,
          node.description ? `What to change: ${node.description}` : null,
          'Current content:',
          '```',
          existing.content,
          '```',
        ].filter(Boolean).join('\n')
      }
    }
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
    return [
      'Generate code for this plan item using the generate_code tool.',
      `Label: ${node.label}`,
      node.description ? `Description: ${node.description}` : null,
      candidateHint,
    ].filter(Boolean).join('\n')
  }

  // Headless build for one node, shared by the single-node "BUILD WITH AI"
  // button and the "RUN PLAN" batch driver below — same session mechanics
  // generateCode uses, resolving instead of mutating component state
  // directly so both callers can await a plain result.
  const buildNodeWithAI = (node: GraphNode): Promise<{ ok: true; files: GeneratedFile[] } | { ok: false; error: string }> => {
    const api = window.chatAPI
    if (!api) return Promise.resolve({ ok: false, error: 'AI chat is desktop-only — run the Electron app.' })
    return buildPromptForNode(node).then(
      (prompt) =>
        new Promise((resolve) => {
          const sessionId = crypto.randomUUID()
          let settled = false
          const cleanup = () => {
            settled = true
            unsubCode()
            unsubDone()
            unsubError()
          }
          const unsubCode = api.onCodeGenerated(sessionId, (payload) => {
            cleanup()
            resolve({ ok: true, files: payload.files })
          })
          const unsubDone = api.onDone(sessionId, () => {
            if (settled) return
            cleanup()
            resolve({ ok: false, error: "AI responded without generating code — try again, or rephrase the plan item's description." })
          })
          const unsubError = api.onError(sessionId, (message) => {
            cleanup()
            resolve({ ok: false, error: message })
          })
          api.sendMessage(sessionId, [], prompt, { mode: 'headless' })
        }),
    )
  }

  // Approving a step: one with planned files reviews and writes them in
  // ApproveStepModal; one carrying a staged file goes through the editor's
  // review; anything else is simply approved (which starts it).
  const approveStep = (step: GraphNode) => {
    if (live.nodes.some((n) => n.stepId === step.id)) setApprovingStep(step)
    else if (step.proposedFile) onCodeGenerated?.(step.id, [{ path: step.proposedFile.path, content: step.proposedFile.content }], removablePlanFor(mapId)?.id)
    else void setPlanNodeStatus(step, 'approved')
  }

  // Single-node build for a node whose status is pending — the new,
  // generalized trigger: unlike generateCode/APPROVE, this fires off `stages`
  // and works for ANY node (custom notes, file-backed asset nodes), not just
  // AI-created plan-step nodes that happen to carry a `status` field.
  const runSingleNodeBuild = async (node: GraphNode) => {
    setGenerateError(null)
    setGeneratingNodeId(node.id)
    await setStage(node, 'in_progress')
    const activePlanId = removablePlanFor(mapId)?.id
    const result = await buildNodeWithAI(node)
    setGeneratingNodeId(null)
    if (result.ok) {
      // The agent's part is done; its files wait for review in the opened tab.
      onCodeGenerated?.(node.id, result.files, activePlanId)
      await setStage(node, 'completed')
    } else {
      setGenerateError(result.error)
      // Back to pending — the error shows under the BUILD WITH AI button.
      await setStage(node, 'pending')
    }
  }

  // Batch-builds every pending node in sequence — snapshots the queue at click
  // time (stages change as the run proceeds, so re-reading todoNodes live
  // mid-loop would shrink/reorder it under its own feet) and awaits each
  // node fully before starting the next, both to avoid overlapping headless
  // chat sessions and because setStage/appendPlanGeneratedFiles do the same
  // kind of unsynchronized read-modify-write notes.json/stages.json do (see
  // NewWorkspacePlanModal.ViewModel's submit). Unlike the single-node path,
  // generated files are written straight to disk rather than staged as a
  // single unsaved editor tab — App.tsx's pendingOverride is one slot
  // app-wide and can't hold a whole batch's worth of unreviewed edits, so a
  // "Run Plan" review happens afterward via Source Control's diff instead.
  const runPlan = async () => {
    if (runningPlan || todoNodes.length === 0) return
    const queue = todoNodes
    setRunningPlan(true)
    const activePlanId = removablePlanFor(mapId)?.id
    let plan = removablePlanFor(mapId)
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i]
      setRunProgress({ index: i + 1, total: queue.length, label: node.label })
      setGeneratingNodeId(node.id)
      await setStage(node, 'in_progress')
      const result = await buildNodeWithAI(node)
      if (result.ok) {
        for (const file of result.files) {
          await writeWorkspaceFile(file.path, file.content).catch(() => {})
        }
        if (activePlanId && plan) {
          const paths = result.files.map((f) => f.path)
          const updated = await appendPlanGeneratedFiles(activePlanId, paths).catch(() => null)
          if (updated) {
            onUpdatePlan(updated.plan)
            plan = updated.plan
          }
        }
        await setStage(node, 'completed')
      } else {
        // One bad node doesn't abort the run — it goes back to pending and
        // the rest still get a shot.
        await setStage(node, 'pending')
      }
      setGeneratingNodeId(null)
    }
    setRunProgress(null)
    setRunningPlan(false)
    await refreshAll()
  }
  // No UI trigger for now — the header's RUN PLAN button was removed; this
  // batch driver is kept for the upcoming AI tooling to call.
  void runPlan

  const allMaps = getGraphMaps()
  // Saved plans are never in getGraphMaps() (see App.tsx's plans state doc
  // comment) — used only for resolving an open tab's label/icon.
  const allMapsWithPlans = [...allMaps, ...PINNED_VIEWS, ...plans]
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
  // With no plan open (start page), the NODES list is empty — the active id
  // falls back to 'welcome' internally, but its nodes must not leak in here.
  // Architecture lists what it draws — its folders and files; Skills has its
  // own list (SkillsList).
  const listsView = pinnedView?.mode === 'architecture'
  const nodesHidden = noOpenTabs || (!!pinnedView && !listsView)
  // On a plan tab the left panel is the plan: its steps 1..n, each opening in
  // place (PlanStepsList), with their planned files inside them — and every
  // other node listed after. The right panel is then only for files and skills.
  const listedPlan = !nodesHidden ? removablePlanFor(mapId) : undefined
  const planSteps = listedPlan
    ? live.nodes.filter((n) => n.type === 'plan-step' && n.planId === listedPlan.id).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    : []
  const showStepList = !!listedPlan && planSteps.length > 0
  const plannedByStep = new Map<string, GraphNode[]>()
  if (showStepList) for (const n of live.nodes) if (n.type === 'planned-file' && n.stepId) plannedByStep.set(n.stepId, [...(plannedByStep.get(n.stepId) ?? []), n])
  const inStepList = (n: GraphNode) => showStepList && (n.type === 'plan-step' || (n.type === 'planned-file' && !!n.stepId && plannedByStep.has(n.stepId)))
  const visibleNodeRows: PlanningNodeRow[] = nodesHidden
    ? []
    : listsView
      ? [...planView.data.nodes].sort((a, b) => a.label.localeCompare(b.label)).map((node) => ({ node, mapId, mapLabel: pinnedView!.label }))
      : nodeRows.filter((row) => !inStepList(row.node))

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


  // A node's details — what a picked node shows. Under its own row when it has
  // one (the row is the header, so the name isn't repeated), or at the top of
  // the panel for a node no list carries (a planned file picked on the graph).
  const renderNodeDetails = (selectedNode: GraphNode, inRow: boolean) => (
              <Frame
                flow="vertical"
                gap={14}
                padding={inRow ? { left: 28, right: 4, top: 6, bottom: 14 } : { x: 4, top: 4, bottom: 16 }}
                stroke={{ bottom: { color: 'border-1' } }}
                shrink={0}
              >
                {!inRow && (
                  <Frame flow="horizontal" align="center" justify="between">
                    <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>Selected</span>
                    <IconButton onClick={() => setSelectedId(null)} title="Close" glyph="×" iconSize={14} size={18} textColor="var(--text-3)" />
                  </Frame>
                )}
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.04em',
                    color: selectedNode.kind === 'proposed' && selectedNode.type !== 'plan-step' ? '#e0a040' : 'var(--text-3)',
                    ...UI_FONT,
                  }}
                >
                  {/* A plan step's state is its STATUS below; "proposed" here
                      would read as a second, contradicting one. */}
                  {selectedNode.type === 'plan-step'
                    ? 'Plan step'
                    : `${selectedNode.kind === 'proposed' ? 'Proposed' : 'Built'} · ${(selectedNode.type ?? '')}`}
                </span>

                {(() => {
                  const openPath = workspaceFilePath(selectedNode)
                  const openable = !!openPath && !!onOpenFile
                  return (
                    <>
                      {!inRow && <span
                        onClick={openable ? () => onOpenFile!(openPath!) : undefined}
                        title={openable ? 'Open in Workspace' : undefined}
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                          ...UI_FONT,
                          ...(openable ? FILE_LINK_STYLE : { color: 'var(--text-1)' }),
                        }}
                      >
                        {nodeDisplayLabel(selectedNode)}
                        {/* Same dimmer ".tsx"/".rs" suffix the graph + NODES
                            list show, so the card title reads identically. */}
                        {fileExtLabel(selectedNode.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(selectedNode.filePath)}</span>}
                      </span>}

                      {selectedNode.filePath && (
                        <span
                          onClick={openable ? () => onOpenFile!(openPath!) : undefined}
                          title={openable ? 'Open in Workspace' : undefined}
                          style={{
                            fontSize: 10,
                            letterSpacing: '0.02em',
                            wordBreak: 'break-all',
                            ...UI_FONT,
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
                  <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, ...UI_FONT }}>
                    {selectedNode.description}
                  </span>
                )}

                {/* A plan step's place in its plan: order, the new files it will
                    create (select one to see it in the graph), the existing files
                    it edits, and the plan's generated plan.md. */}
                {selectedNode.type === 'plan-step' && (() => {
                  const plannedFiles = live.nodes.filter((n) => n.stepId === selectedNode.id)
                  const edits = selectedNode.editsPaths ?? []
                  const docPath = plans.find((p) => p.id === selectedNode.planId)?.docPath
                  const sectionLabel: React.CSSProperties = { fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }
                  const pathRow: React.CSSProperties = { fontSize: 11, wordBreak: 'break-all', ...UI_FONT }
                  if (selectedNode.order === undefined && !plannedFiles.length && !edits.length && !docPath) return null
                  return (
                    <Frame flow="vertical" gap={6}>
                      {selectedNode.order !== undefined && (
                        <span style={{ ...sectionLabel, color: 'var(--graph-plan, #5b9dff)' }}>Step {selectedNode.order}</span>
                      )}
                      {plannedFiles.length > 0 && (
                        <>
                          <span style={sectionLabel}>New files ({plannedFiles.length})</span>
                          {plannedFiles.map((f) => (
                            <span key={f.id} onClick={() => setSelectedId(f.id)} title="Select in graph" style={{ ...pathRow, ...FILE_LINK_STYLE }}>
                              {f.filePath}
                              {f.role && <span style={{ opacity: 0.5 }}> · {f.role}</span>}
                            </span>
                          ))}
                        </>
                      )}
                      {edits.length > 0 && (
                        <>
                          <span style={sectionLabel}>Edits ({edits.length})</span>
                          {edits.map((p) => (
                            <span
                              key={p}
                              onClick={onOpenFile ? () => onOpenFile(p) : undefined}
                              title={onOpenFile ? 'Open in Workspace' : undefined}
                              style={{ ...pathRow, ...(onOpenFile ? FILE_LINK_STYLE : { color: 'var(--text-2)' }) }}
                            >
                              {p}
                            </span>
                          ))}
                        </>
                      )}
                      {docPath && onOpenFile && (
                        <span onClick={() => onOpenFile(docPath)} title={docPath} style={{ ...pathRow, ...FILE_LINK_STYLE }}>
                          Open plan.md
                        </span>
                      )}
                    </Frame>
                  )
                })()}

                {selectedNode.planned && (() => {
                  const step = live.nodes.find((n) => n.id === selectedNode.stepId)
                  return (
                    <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, ...UI_FONT }}>
                      Planned {selectedNode.role ?? ''} file — created when{' '}
                      {step ? (
                        <span onClick={() => setSelectedId(step.id)} title="Select step" style={FILE_LINK_STYLE}>
                          {step.order !== undefined ? `step ${step.order}: ` : ''}{step.label}
                        </span>
                      ) : (
                        'its step'
                      )}{' '}
                      is approved.
                    </span>
                  )
                })()}

                {/* Status — settable on every node (see StageToggle), drives
                    the node's shape in the graph, and reported by the agent
                    working a plan step. Independent of the approve/generate
                    action below. */}
                <div style={{ height: 1, background: 'var(--border-1)' }} />
                <StageToggle
                  value={stages[nodeStageKey(selectedNode)]}
                  committed={!!selectedNode.filePath && toneFor(selectedNode) === 'committed'}
                  onChange={(stage) => setStage(selectedNode, stage)}
                />
                {/* The moments worth a look while this step is being worked. */}
                {activeStep?.id === selectedNode.id && steerFlags.length > 0 && (
                  <Frame flow="vertical" gap={4}>
                    <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>Worth a look</span>
                    {steerFlags.map((f) => (
                      <span key={`${f.kind}:${f.path ?? ''}`} style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.5 }}>{f.text}</span>
                    ))}
                  </Frame>
                )}
                {selectedNode.type === 'plan-step' && (
                  <ActivityPanel events={planActivity} stepId={selectedNode.id} onOpenFile={onOpenFile} />
                )}
                {/* Steer the step in progress from any file: work here, or leave it alone. */}
                {activeStep && selectedNode.filePath && selectedNode.type !== 'plan-step' && (
                  <SteerRow
                    stepLabel={activeStep.label}
                    mark={activeMarks.focus.includes(selectedNode.filePath) ? 'focus' : activeMarks.avoid.includes(selectedNode.filePath) ? 'avoid' : null}
                    onMark={(mark) => steerFile(selectedNode.filePath!, mark)}
                  />
                )}

                {/* Approval is an action, not a status: the step's one status is
                    the toggle above, and approving moves it to in progress. Once
                    there's nothing left to approve or generate — or an agent
                    already completed the step — nothing shows. */}
                {(selectedNode.status === 'draft' || selectedNode.status === 'approved') &&
                  stages[nodeStageKey(selectedNode)] !== 'completed' && (
                  <>
                    <div style={{ height: 1, background: 'var(--border-1)' }} />
                    {selectedNode.status === 'draft' ? (
                      <button
                        onClick={() => {
                          // A staged file-carrying node never gets bulk/blind-
                          // approved — same trust boundary as generate_code
                          // (see chat.cjs's TOOL_DEFS comment): nothing hits
                          // real disk until a human sees the actual content.
                          // Routing through onCodeGenerated reuses that exact
                          // staged-editor-tab review flow (see App.tsx's
                          // pendingOverride) instead of writing here directly —
                          // WorkspaceView's handleOverrideSaved already flips
                          // this node to 'done' the moment it's actually saved.
                          // A step with planned files reviews and writes them in
                          // ApproveStepModal — the only place they become real.
                          if (live.nodes.some((n) => n.stepId === selectedNode.id)) {
                            setApprovingStep(selectedNode)
                          } else if (selectedNode.proposedFile) {
                            const activePlanId = removablePlanFor(mapId)?.id
                            onCodeGenerated?.(
                              selectedNode.id,
                              [{ path: selectedNode.proposedFile.path, content: selectedNode.proposedFile.content }],
                              activePlanId,
                            )
                          } else {
                            setPlanNodeStatus(selectedNode, 'approved')
                          }
                        }}
                        style={{
                          background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
                          border: '1px solid var(--border-2)',
                          color: 'var(--text-1)',
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          ...UI_FONT,
                        }}
                      >
                        {selectedNode.proposedFile || live.nodes.some((n) => n.stepId === selectedNode.id) ? 'Review & approve' : 'Approve'}
                      </button>
                    ) : generatingNodeId === selectedNode.id ? (
                      <Frame flow="horizontal" align="center" gap={8}>
                        <SleipnirLoader size={28} />
                        <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
                          Generating…
                        </span>
                      </Frame>
                    ) : (
                      <button
                        onClick={() => generateCode(selectedNode)}
                        style={{
                          background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
                          border: '1px solid var(--border-2)',
                          color: 'var(--text-1)',
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          ...UI_FONT,
                        }}
                      >
                        Generate code
                      </button>
                    )}
                    {generateError && generatingNodeId === null && (
                      <span style={{ fontSize: 10, color: '#e07a7a', lineHeight: 1.5, ...UI_FONT }}>{generateError}</span>
                    )}
                  </>
                )}

                {/* AI build, gated on the node's status rather than the plan
                    step's approval record above — works for every node (custom
                    notes, file-backed asset nodes), not just AI-created ones.
                    Offered until the node is completed; while this window is
                    building it, the loader shows instead. (A node left in
                    progress by an interrupted build, or by an agent working
                    elsewhere, can be built again from here.) */}
                {(stages[nodeStageKey(selectedNode)] ?? 'pending') !== 'completed' && (
                  <>
                    <div style={{ height: 1, background: 'var(--border-1)' }} />
                    {/* The approval block above shows the same error when it's there. */}
                    {generateError && generatingNodeId === null && selectedNode.status !== 'draft' && selectedNode.status !== 'approved' && (
                      <span style={{ fontSize: 10, color: '#e07a7a', lineHeight: 1.5, ...UI_FONT }}>{generateError}</span>
                    )}
                    {generatingNodeId === selectedNode.id ? (
                      <Frame flow="horizontal" align="center" gap={8}>
                        <SleipnirLoader size={28} />
                        <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
                          Building…
                        </span>
                      </Frame>
                    ) : (
                      <button
                        onClick={() => runSingleNodeBuild(selectedNode)}
                        disabled={runningPlan || generatingNodeId !== null}
                        style={{
                          background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
                          border: '1px solid var(--border-2)',
                          color: 'var(--text-1)',
                          fontSize: 11,
                          letterSpacing: '0.04em',
                          padding: '8px 12px',
                          cursor: runningPlan || generatingNodeId !== null ? 'default' : 'pointer',
                          opacity: runningPlan || generatingNodeId !== null ? 0.5 : 1,
                          ...UI_FONT,
                        }}
                      >
                        Build with AI
                      </button>
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
  )
  // Whether a node has a row of its own in the panel — a plan's steps, the
  // listed nodes, or a skill — and so opens there rather than at the top.
  const isListed = (node: GraphNode) =>
    (showStepList && node.type === 'plan-step' && planSteps.some((st) => st.id === node.id)) ||
    visibleNodeRows.some((row) => row.node.id === node.id) ||
    viewMode === 'skills'

  return (
    <Frame theme={theme} h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={UI_FONT}>
      <Frame flow="horizontal" grow minH={0}>
        {/* The left panel: what's here (the picker, which is also the search),
            then what's inside it — a plan's steps, a view's list, a picked
            node's card. The tabs run beside it, over the graph. */}
        <Frame flow="vertical" w={AGENT_PANEL_W} shrink={0} minH={0} stroke={{ right: { color: 'border-1' } }}>
          <Frame flow="horizontal" align="center" gap={4} shrink={0} minH={TAB_ROW_H} padding={{ left: 10, right: 6 }} stroke={{ bottom: { color: 'border-1' } }}>
            {/* What the Agent area holds: the views that are always there
                (the project's architecture, the agents' skills), then what
                the chats made — every plan, newest first with its date and
                progress. */}
            <TabPicker
              noun="Views, chats and nodes"
              summary="Architecture · skills · chats"
              width="fill"
              icon="network"
              items={[
                ...PINNED_VIEWS.map((v) => ({ id: v.id, label: v.label, icon: v.icon, title: v.hint, section: 'Views' })),
                ...(welcomeMap && !welcomeDismissed ? [{ id: welcomeMap.id, label: welcomeMap.label, section: 'Views' }] : []),
                ...planHistory(plans, notes, stages).map((row) => ({ ...row, section: 'Chats & plans' })),
              ]}
              openIds={openTabs.map((m) => m.id)}
              activeId={showCreateScreen ? null : mapId}
              onPick={activateMap}
              // The panel's one search: typing also finds nodes in every plan,
              // and the open view's own (Architecture's files) first.
              // Then the project's files, which open on Architecture unless the
              // open view already draws them.
              search={(q) => {
                const rows = searchNodes(q, planView.data.nodes)
                const listed = new Set(rows.map((row) => row.node.filePath))
                const files = (workspaceScan?.files ?? [])
                  .filter((path) => !listed.has(path))
                  .map((path) => ({ path, score: fuzzyScore(q, path.split('/').pop() ?? path) }))
                  .filter((f): f is { path: string; score: number } => f.score !== null)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 30)
                return [
                  ...rows.map((row) => ({
                    id: `${row.mapId}::${row.node.id}`,
                    label: nodeDisplayLabel(row.node),
                    icon: nodeIconName(row.node, true),
                    meta: row.mapLabel,
                    title: row.node.filePath,
                    section: 'Nodes',
                    onPick: () => selectNodeRow(row),
                  })),
                  ...files.map(({ path }) => ({
                    id: `file::${path}`,
                    label: path.split('/').pop() ?? path,
                    icon: 'file' as const,
                    meta: path.split('/').slice(0, -1).join('/'),
                    title: path,
                    section: 'Files',
                    onPick: () => {
                      if (!planView.data.nodes.some((n) => n.id === archId(path))) activateMap('view:architecture')
                      setSelectedId(archId(path))
                      setCenterSignal((s) => s + 1)
                    },
                  })),
                ]
              }}
              create={{
                icon: 'plan-add',
                label: (q) => (q ? `New plan “${q}”…` : 'New plan…'),
                onCreate: (q) => {
                  setNewPlanName(q)
                  setAddingPlan(true)
                },
              }}
            />
            {/* The open plan's own actions (rename/delete), which the old
                PLANS rows carried on right-click / "⋯". Welcome is a
                built-in guide: it can only be hidden. */}
            {!showCreateScreen && removablePlanFor(mapId) ? (
              <IconButton
                onClick={(e) => planMenu.openFromButton(e, removablePlanFor(mapId)!)}
                title="Plan actions"
                glyph="⋯"
                iconSize={16}
                textColor="var(--text-3)"
              />
            ) : !showCreateScreen && mapId === 'welcome' && !welcomeDismissed ? (
              <IconButton
                onClick={() => setConfirmingWelcomeDelete(true)}
                title="Hide the Welcome guide"
                icon="trash"
                iconSize={13}
                textColor="var(--text-3)"
              />
            ) : null}
          </Frame>
          {!nodesHidden && <LensSwitch value={overlay} onChange={setOverlay} />}
          <SidebarHeader
            framed
            label={pinnedView ? `${pinnedView.label}${listsView ? ` (${visibleNodeRows.length})` : ''}` : showStepList ? `Steps (${planSteps.length})` : `Nodes (${nodesHidden ? 0 : live.nodes.length})`}
            actions={
              // Add-node works on plan tabs too: a note authored here is
              // tagged with the plan's id as its map (see AddNodeModal and
              // isNoteTarget in tools/sleipnir-backend.mjs). Linking lives on
              // the node itself (right-click / ⋯ → "Link").
              !nodesHidden && !pinnedView ? (
                <IconButton onClick={() => setIsAddingNode(true)} title="Add node…" icon="plan-node-add" iconSize={13} textColor="var(--text-2)" />
              ) : undefined
            }
          />
          <ScrollWindow axis="y" flow="vertical" gap={0} padding={{ x: 8, y: 6 }} grow minH={0}>
            {/* What the right panel used to show, at the top of the left one:
                the Health report on the Health view (unless a plan step is
                picked, which keeps its own card), the effort insights, a picked
                skill, or any picked node's card. */}
            {overlay === 'health' && !selectedNode ? (
              <>
                <HealthPanel
                  health={health}
                  error={healthError}
                  scan={workspaceScan}
                  selectedPath={null}
                  onSelectPath={(path) => {
                    setSelectedId(archId(path))
                    setCenterSignal((s) => s + 1)
                  }}
                  onOpenFile={onOpenFile}
                  onRescan={rescanWorkspace}
                />
                {showEffort && effort && (
                  <Frame flow="vertical" padding={{ x: 4, top: 12, bottom: 16 }} stroke={{ bottom: { color: 'border-1' } }}>
                    <TrailInsightsPanel
                      insights={effort.insights}
                      onSelectPath={(path) => {
                        const node = planView.data.nodes.find((n) => n.filePath === path)
                        if (node) {
                          setSelectedId(node.id)
                          setCenterSignal((s) => s + 1)
                        }
                      }}
                    />
                  </Frame>
                )}
              </>
            ) : selectedSkill ? (
              // The Skills view opens it in its list (SkillsList), in place.
              viewMode === 'skills' ? null : <SkillCard skill={selectedSkill} onOpenFile={onOpenFile} onSaved={refreshSkills} />
            ) : selectedNode && !isListed(selectedNode) && renderNodeDetails(selectedNode, false)}
              {viewMode === 'skills' && (
                <SkillsList
                  scan={skillScan}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setCenterSignal((s) => s + 1)
                  }}
                  toneFor={toneFor}
                  nodes={planView.data.nodes}
                  onOpenFile={onOpenFile}
                  onSaved={refreshSkills}
                  metricFor={overlay ? metricFor : undefined}
                />
              )}
              {listsView && !selectedNode && (
                <Frame flow="vertical" gap={8} padding={{ x: 4, top: 4, bottom: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>{pinnedView!.hint}.</span>
                </Frame>
              )}
              {showStepList && listedPlan && (
                <PlanStepsList
                  plan={listedPlan}
                  steps={planSteps}
                  plannedByStep={plannedByStep}
                  toneFor={toneFor}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setCenterSignal((s) => s + 1)
                  }}
                  events={planEvents}
                  onOpenFile={onOpenFile}
                  renderStatus={(step) => <StageToggle value={stages[step.id]} onChange={(stage) => setStage(step, stage)} />}
                  renderActions={(step) => <ApproveAction step={step} hasPlannedFiles={plannedByStep.has(step.id)} waiting={toneFor(step) === 'proposed'} onApprove={() => approveStep(step)} />}
                  flagsFor={(id) => (activeStep?.id === id ? steerFlags : [])}
                  metricFor={overlay ? metricFor : undefined}
                />
              )}
              {showStepList && visibleNodeRows.length > 0 && (
                <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)', padding: '14px 4px 4px', ...UI_FONT }}>Other nodes</span>
              )}
              <Frame flow="vertical" gap={0} shrink={0}>
            {visibleNodeRows.map((row) => {
                const n = row.node
                // On a plan tab the ⋯ menu is scoped to notes authored directly
                // into *this* plan (map === the plan id) — the plan's
                // resolved/borrowed nodes live in other maps, so rename/delete
                // from here would act on the wrong place. Architecture's rows
                // are the project's own files: read-only here.
                const menuEnabled = !listsView && (!removablePlanFor(mapId) || (noteIdSet.has(n.id) && n.map === mapId))
                return (
                <Fragment key={n.id}>
                <ListRow
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
                        {overlay && <LensValue metric={metricFor(n)} />}
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
                          // Status at rest, right-aligned — ONE status mark per row,
                          // the status ring, identical to the dot on the graph canvas
                          // and the glyph in the card's STATUS toggle. Deliberately
                          // not paired with the AI plan-step `status` (draft/approved/
                          // done): a row showing two different status symbols reads as
                          // two competing states, and which one a node gets would then
                          // depend on whether an AI or a human made it. The AI approval
                          // step still lives in the detail card, where it belongs — as
                          // the APPROVE / GENERATE CODE action, not a second glyph.
                          // Defaults to 'pending' for any untagged node (the universal
                          // default), via StatusGlyph. Swapped out for ⋯ on hover.
                          <StatusGlyph tone={toneFor(n)} />
                        )}
                      </>
                    )
                  }}
                >
                  {/* A discovered node (pulled in by the asset-plan reference walk,
                      never explicitly added — see GraphNode.discovered) reads as
                      context here too, same treatment as the graph canvas. */}
                  <span style={n.discovered ? { opacity: 0.6 } : undefined}>
                    {nodeDisplayLabel(n)}
                    {/* Same ".tsx"/".rs" suffix (dimmer) the graph label shows, so a
                        node reads identically in both places. */}
                    {fileExtLabel(n.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(n.filePath)}</span>}
                  </span>
                </ListRow>
                {/* Picked: it opens in place, like a plan's steps. */}
                {n.id === selectedId && selectedNode && renderNodeDetails(selectedNode, true)}
                </Fragment>
                )
              })}
              </Frame>

            {archivedEntries.length > 0 && (
              <Frame flow="vertical" gap={0} padding={{ top: 12 }} shrink={0}>
                <CollapsibleHeader
                  label={`Archived (${archivedEntries.length})`}
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
        </Frame>

        <Frame flow="vertical" grow minW={0} h="fill">
          <WorkspaceHeader
            // No node/edge count (nor a Delete-Plan menu) on the create-a-plan
            // start page — there's no active graph to describe. The tab strip's
            // "+" still shows, since onAddTabClick stays wired below.
            actions={
              showCreateScreen ? undefined : (
              <>
                {/* A plan tab: the plan on its own, or over the project's
                    architecture. The whole-project views (Architecture, Skills,
                    Health) are pinned tabs of their own, in the picker. */}
                {isPlanTab && (
                  <Frame flow="horizontal" align="center" gap={0} radius="var(--radius-control)" stroke={{ color: 'border-2' }} clipContent>
                    {(['plan', 'architecture'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={planViewMode === mode}
                        onClick={() => setPlanViewMode(mode)}
                        title={mode === 'plan' ? 'Show the plan on its own' : 'Show the plan over the project architecture'}
                        style={{
                          fontSize: 10,
                          letterSpacing: '0.04em',
                          padding: '4px 8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: planViewMode === mode ? 'var(--bg-3)' : 'transparent',
                          color: planViewMode === mode ? 'var(--text-1)' : 'var(--text-3)',
                          ...UI_FONT,
                        }}
                      >
                        {mode === 'plan' ? 'Plan' : 'In project'}
                      </button>
                    ))}
                  </Frame>
                )}
                {viewMode === 'skills' && (
                  <button
                    type="button"
                    onClick={() => setCreatingSkill(true)}
                    title="A new skill for your agents — Sleipnir writes it in each agent's format"
                    style={{ fontSize: 10, letterSpacing: '0.04em', padding: '4px 8px', marginLeft: 8, border: '1px solid var(--border-2)', borderRadius: 'var(--radius-control)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', ...UI_FONT }}
                  >
                    + skill
                  </button>
                )}
                {creatingSkill && (
                  <NewSkillModal
                    onClose={() => setCreatingSkill(false)}
                    onCreated={(id) => {
                      void refreshSkills()
                      setSelectedId(skillNodeId(id))
                    }}
                  />
                )}
                {runningPlan && runProgress ? (
                  <Frame flow="horizontal" align="center" gap={6}>
                    <SleipnirLoader size={16} />
                    <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
                      Building {runProgress.index} of {runProgress.total}: {runProgress.label}…
                    </span>
                  </Frame>
                ) : (
                  <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
                    {planView.data.nodes.length} nodes · {planView.data.edges.length} links
                  </span>
                )}
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
              icon: pinnedViewFor(m.id)?.icon ?? (removablePlanFor(m.id) || m.id === 'welcome' ? 'network' : undefined),
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
                // A "delete everything" removes the plan's nodes from notes.json;
                // reload so they vanish from every open map at once instead of
                // lingering until the next remount. Harmless for a plan-only
                // delete — notes are unchanged, so the graph re-reads identically.
                void refreshAll()
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

          {renamingPlan && (
            <RenamePathModal
              name={renamingPlan.label}
              isDir={false}
              title="Rename plan"
              // Label only — renamePlan deliberately leaves the id alone, because
              // graph nodes and open tabs reference it. See its doc comment.
              rename={async (label) => {
                const { plan } = await renamePlan(renamingPlan.id, label)
                onUpdatePlan(plan)
              }}
              onClose={() => setRenamingPlan(null)}
              onRenamed={() => setRenamingPlan(null)}
            />
          )}

          {renamingNode && (
            <RenamePathModal
              name={renamingNode.label}
              isDir={false}
              title="Rename node"
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
                  ...(workspaceFilePath(n) && onOpenFile
                    ? [{ label: 'Show in Workspace', separator: true, onSelect: () => onOpenFile(workspaceFilePath(n)!) }]
                    : []),
                  ...(workspaceFilePath(n) && onShowInCanvas && canvasComponentPaths.has(workspaceFilePath(n)!)
                    ? [{ label: 'Show in Canvas', separator: !onOpenFile, onSelect: () => onShowInCanvas(workspaceFilePath(n)!) }]
                    : []),
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

          {planMenu.menu && (
            <ContextMenu
              x={planMenu.menu.x}
              y={planMenu.menu.y}
              anchorEl={planMenu.menu.anchorEl}
              onClose={planMenu.close}
              items={[
                { label: 'Rename plan', onSelect: () => setRenamingPlan(planMenu.menu!.data) },
                { label: 'Delete plan', separator: true, destructive: true, onSelect: () => setDeletingPlan(planMenu.menu!.data) },
              ]}
            />
          )}

          {isAddingNode && (
            <AddNodeModal
              mapId={mapId}
              onClose={() => setIsAddingNode(false)}
              onCreated={async (nodes) => {
                await refreshAll()
                if (nodes[0]) setSelectedId(nodes[0].id)
                // Scaffolding writes real files into the open project (see
                // AddNodeModal.ViewModel's scaffoldNodes), but the Workspace
                // tab's tree only refetches on mount and project change — so
                // without this they sit on disk unseen until the project is
                // switched and switched back, which reads as "it didn't create
                // them". Harmless for a note-only creation, which writes nothing.
                onWorkspaceChanged?.()
              }}
            />
          )}

          {addingPlan && (
            <NewWorkspacePlanModal
              initialLabel={newPlanName}
              onClose={() => setAddingPlan(false)}
              onCreated={(plan) => {
                setAddingPlan(false)
                onCreatePlan(plan)
                activateMap(plan.id)
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
                onGetStarted={welcomeMap ? restoreWelcome : undefined}
                onCreatePlan={submitNewPlan}
                creating={creatingPlan}
                error={createPlanError}
              />
            ) : (
            <>
            <Frame grow minW={0} style={{ position: 'relative' }}>
              <GraphCanvas
                data={planView.data}
                overlay={planView.overlay}
                selectedId={selectedId}
                stages={stages}
                tones={tones}
                trail={trail}
                onSelectNode={(id) => setSelectedId(id || null)}
                centerSignal={centerSignal}
                missingPaths={missingPaths}
                health={healthLens}
                forces={forces}
              />
              {overlay !== 'health' && <ToneLegend />}
              <ForcesPanel forces={forces} onChange={setForces} />
              {agentNow && <AgentCaption entry={agentNow} />}
              {steerFlags.length > 0 && <SteerFlagChip text={steerFlags[0].text} more={steerFlags.length - 1} below={!!agentNow} />}
            </Frame>

            </>
            )}
          </Frame>
          {planBuildStatus && <PlanBuildStatusBar status={planBuildStatus} onApproveAll={approveAllDrafts} />}
          {approvingStep && (
            <ApproveStepModal
              step={approvingStep}
              plannedNodes={live.nodes.filter((n) => n.type === 'planned-file' && n.planId === approvingStep.planId)}
              edges={live.edges}
              planId={removablePlanFor(mapId)?.id}
              onClose={() => setApprovingStep(null)}
              onApproved={() => {
                setApprovingStep(null)
                refreshAll().catch(() => {})
                onWorkspaceChanged?.()
              }}
            />
          )}
        </Frame>
      </Frame>
    </Frame>
  )
}
