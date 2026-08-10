import React, { useMemo, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon, type IconName } from '../app/UIKit/Icon/Icon'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { Button } from '../app/UIKit/Button/Button'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { WorkspaceHeader } from '../app/WorkspaceHeader/WorkspaceHeader'
import { GraphCanvas, fileExtLabel } from './graph/GraphCanvas'
import { getGraphMaps, type GraphMapId, type GraphNode, type NodeStage, type SavedPlan } from './graph/types'
import { NODE_STAGES, stageConfig } from './graph/stages'
import { SleipnirLoader } from '../app/UIKit/SleipnirLoader/SleipnirLoader'
import type { GeneratedFile } from '../app/AgentChat/iAgentChat'
import { createPlan, getWorkspaceInfo, listWorkspaceDir } from './api/sleipnirApi'
import type { FileTreeNode } from './api/PlatformAPI'
import { usePlanningViewModel, folderPathForNode, type PlanningNodeRow } from './PlanningView.ViewModel'
import { Search } from '../app/UIKit/Search/Search'
import { SidebarHeader } from '../app/UIKit/SidebarHeader/SidebarHeader'
import { Dropdown } from '../app/UIKit/Dropdown/Dropdown'
import { DeletePlanModal } from './DeletePlanModal'
import { DeleteNodeModal } from './DeleteNodeModal'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { RenamePathModal } from '../app/DesignSystem/RenamePathModal'
import { AddNodeModal } from './AddNodeModal'
import { fuzzyScore } from '../utils/fuzzyMatch'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

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
// "Borrowed by", only the first removable). Every row is add/removable now
// (see addLink/removeLink for 'out', addImporter/removeImporter for 'in' in
// PlanningView.ViewModel), so the only thing distinguishing a row is its
// direction — shown as a → / ← glyph rather than a second section heading.
function LinkedNodeList({
  rows,
  onRemove,
  // Flip a single link's direction in place (out ⇄ in) — the → / ← glyph is
  // now a live control, not just a label. Undefined leaves the row read-only.
  // Feasibility is guarded per row below: turning an outgoing link incoming
  // means the *other* node has to gain an import statement, so it needs its
  // own file+language; the incoming→outgoing flip always works (a file-less
  // target just gets a bare graph edge — see addLink).
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
}: {
  rows: LinkedRow[]
  onRemove?: (row: LinkedRow) => void
  onToggleDirection?: (row: LinkedRow) => void
  currentMapId: string
  mapLabelFor: (id: string) => string
  onOpenFile?: (path: string) => void
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
        LINKED ({rows.length})
      </span>
      <Frame flow="vertical" gap={4}>
        {rows.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)', ...MONO }}>— none —</span>
        )}
        {rows.map((row) => {
          const n = row.node
          const rowKey = `${row.direction}:${n.id}`
          const crossPlan = n.map !== currentMapId
          const canToggle = !!onToggleDirection && (row.direction === 'in' || (!!n.filePath && !!n.language))
          const openPath = workspaceFilePath(n)
          const openable = !!openPath && !!onOpenFile
          return (
            <div
              key={rowKey}
              onMouseEnter={() => setHoveredId(rowKey)}
              onMouseLeave={() => setHoveredId((h) => (h === rowKey ? null : h))}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {canToggle ? (
                <IconButton
                  onClick={(e) => { e.stopPropagation(); onToggleDirection!(row) }}
                  title={row.direction === 'out' ? `Imports ${n.label} — click to flip to imported by` : `Imported by ${n.label} — click to flip to imports`}
                  glyph={row.direction === 'out' ? '→' : '←'}
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
                  title={row.direction === 'out' ? `Imports ${n.label}` : `Imported by ${n.label}`}
                  style={{ fontSize: 11, color: 'var(--text-3)', width: 18, flexShrink: 0, textAlign: 'center', ...MONO }}
                >
                  {row.direction === 'out' ? '→' : '←'}
                </span>
              )}
              <span
                onClick={openable ? () => onOpenFile!(openPath!) : undefined}
                title={openable ? 'Open in Workspace' : undefined}
                style={{
                  fontSize: 12,
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...MONO,
                  ...(openable ? FILE_LINK_STYLE : { color: 'var(--text-2)' }),
                }}
              >
                {n.label}
                {/* Same dimmer file-type suffix as the graph / NODES list. */}
                {fileExtLabel(n.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(n.filePath)}</span>}
              </span>
              {crossPlan && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
                  {mapLabelFor(n.map)}
                </span>
              )}
              {onRemove && (
                // Fixed-width slot always reserved (when removable), so the ×
                // appearing on hover toggles visibility in place instead of
                // pushing the label and reflowing the row — that shove was the
                // hover "jitter".
                <span style={{ width: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hoveredId === rowKey && (
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
            </div>
          )
        })}
      </Frame>
    </Frame>
  )
}

const LINK_SEARCH_LIMIT = 8

// Fuzzy-search combobox for the detail panel's link editor — one standalone
// search field (icon + input + clear), no leading mode button: a pick always
// creates an *outgoing* link (this node imports the pick), and direction is
// flipped afterward per-row from the LINKED list below (see
// LinkedNodeList's onToggleDirection). Candidates span every plan, not just
// the currently open one (see PlanningView's `notes` usage below) — each
// suggestion is tagged with its own plan when that differs from the one
// currently open, same as LinkedNodeList's own already-linked rows.
//
// No portal: this panel already scrolls vertically on its own, and the
// suggestion list never needs to escape sideways the way Dropdown's menu
// does (see Dropdown.tsx's own comment on why *it* has to portal).
function LinkSearchField({
  candidates,
  onPick,
  currentMapId,
  mapLabelFor,
}: {
  candidates: GraphNode[]
  onPick: (node: GraphNode) => void
  currentMapId: string
  mapLabelFor: (id: string) => string
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

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

  const pick = (n: GraphNode) => {
    onPick(n)
    setQuery('')
  }

  return (
    <Frame flow="vertical" gap={6}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
        ADD LINK
      </span>
      <Frame flow="vertical" gap={4}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 'var(--radius-2)',
            padding: '5px 7px',
          }}
        >
          <Icon name="search" size={12} className="text-[var(--text-3)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) pick(results[0])
              if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() }
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
              // mousedown + preventDefault so clearing doesn't blur the input
              // out from under the click (same reason the result rows below do).
              onMouseDown={(e) => { e.preventDefault(); setQuery('') }}
              title="Clear"
              style={{ display: 'flex', flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-3)' }}
            >
              <Icon name="x" size={11} />
            </button>
          )}
        </div>
        {focused && results.length > 0 && (
          <Frame flow="vertical" gap={0} radius="var(--radius-2)" stroke={{ color: 'border-1' }} clipContent>
            {results.map((n) => (
              <Frame
                as="button"
                key={n.id}
                // mousedown (not click) + preventDefault fires before the
                // input's onBlur — picking a result this way keeps focus in
                // the field instead of the list vanishing out from under the
                // click.
                onMouseDown={(e) => { e.preventDefault(); pick(n) }}
                w="fill"
                flow="horizontal"
                align="center"
                justify="between"
                gap={8}
                padding={{ x: 8, y: 6 }}
                hoverFill="bg-3"
                fill={{ solid: 'transparent' }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-1)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...MONO }}>
                  {n.label}
                </span>
                {n.map !== currentMapId && (
                  <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
                    {mapLabelFor(n.map)}
                  </span>
                )}
              </Frame>
            ))}
          </Frame>
        )}
      </Frame>
    </Frame>
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
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Full-bleed row: negative margins cancel the sidebar's 16px padding so
      // the hover/active fill spans edge-to-edge (flat, no inset), with the
      // padding added back inside so the label sits where it always did — same
      // full-width row treatment the file tree uses.
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 28,
        flexShrink: 0,
        marginLeft: -16,
        marginRight: -16,
        paddingLeft: 16,
        paddingRight: 8,
        background: active ? 'rgba(255,255,255,0.10)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}
    >
      {icon && (
        <span style={{ display: 'flex', color: 'var(--text-3)', marginRight: 5, flexShrink: 0 }}>
          <Icon name={icon} size={12} />
        </span>
      )}
      <span
        onClick={onOpen}
        style={{
          fontSize: 12,
          lineHeight: '28px',
          letterSpacing: '0.02em',
          color: active ? 'var(--text-1)' : 'var(--text-2)',
          fontWeight: active ? 700 : 400,
          opacity: active ? 1 : 0.85,
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          ...MONO,
        }}
      >
        {map.label}
      </span>
      {onDelete && hovered && (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete plan"
          icon="trash"
          iconSize={13}
          textColor="var(--text-3)"
        />
      )}
    </div>
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
  onCreatePlan,
  creating,
  error,
}: {
  plans: SavedPlan[]
  onOpenPlan: (id: string) => void
  onOpenWelcome?: () => void
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
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
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
                // Faint wash of the stage's own color when active (…22 = ~13%
                // alpha on the 6-digit hex), plain outline otherwise.
                background: active ? `${s.color}22` : 'transparent',
                border: `1px solid ${active ? s.color : 'rgba(255,255,255,0.15)'}`,
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
  /** Set by App.tsx to force a specific map tab open (e.g. 'claude', to watch Claude build nodes live) even when Planning is already mounted. Consumed once. */
  focusMapId?: GraphMapId | null
  onFocusMapIdConsumed?: () => void
  /** Fired once the generate_code tool stages files for an approved plan node — the host app opens them in the Workspace Code Editor for review. `planId`, when the plan tab that node belongs to is open, records which files that plan produced (see DeletePlanModal). */
  onCodeGenerated?: (planNodeId: string, files: GeneratedFile[], planId?: string) => void
  /** Owned by App.tsx (fetched once, appended to locally on create) — see its `plans` state doc comment. */
  plans: SavedPlan[]
  onCreatePlan: (plan: SavedPlan) => void
  onDeletePlan: (id: string, opts?: { deleteFiles?: boolean }) => void
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
  onOpenFile,
}) => {
  const removablePlanFor = (mapId: GraphMapId) => plans.find((p) => p.id === mapId)
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
    hoveredId,
    setHoveredId,
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
  } = usePlanningViewModel('welcome', focusMapId, onFocusMapIdConsumed, plans)

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

  // The one node-creation entry point (see AddNodeModal) — used to have a
  // second, separate "Scaffold Files…" button/modal alongside a plain inline
  // "New Node" form; the two were confusing as siblings, so they're now one
  // modal reached from this one flag.
  const [isAddingNode, setIsAddingNode] = useState(false)

  // Flip an existing link's direction in place — a pick from the search field
  // always creates an outgoing link (this node imports the pick), and the
  // LINKED list's per-row → / ← button switches it afterward. Delegates to the
  // ViewModel's flipLink, which reverses the edge in a *single* refresh so the
  // graph keeps every node fixed and just redraws the arrow (see GraphCanvas's
  // topologyKey) rather than reheating the layout.
  const toggleLinkDirection = (row: LinkedRow) => flipLink(row.node, row.direction)

  const [nodesCollapsed, setNodesCollapsed] = useState(false)
  const [archivedCollapsed, setArchivedCollapsed] = useState(false)
  // Parent plan-step ids currently collapsed — only plan-step nodes (the
  // 'claude' map's AI-created checklist items, see createPlanNode's
  // plan-step edges) ever have children, so this is a no-op set everywhere
  // else.
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set())
  const toggleNodeCollapsed = (id: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activateMap = (id: GraphMapId) => {
    openMap(id)
    setSelectedId(null)
  }

  // `labelOverride` lets the tab strip's own "+" (see WorkspaceHeader's
  // onAddTab below) submit a name directly, same underlying create as the
  // PLANS header's inline form, which instead reads from newPlanLabel state.
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
      setGenerateError("Claude responded without generating code — try again, or rephrase the plan step's description.")
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

  // Parent -> child ids via plan-step edges (see createPlanNode's doc
  // comment) — the only hierarchy the NODES list has today, so this is an
  // empty map on every map/tab except 'claude'. Collapsing a parent hides
  // its children from the flat list below rather than reshaping it into a
  // real tree, so search/kind-filter/hover/status all keep working exactly
  // as they already do.
  const childIdsOf = new Map<string, string[]>()
  for (const e of live.edges) {
    if (e.kind !== 'plan-step') continue
    const list = childIdsOf.get(e.source) ?? []
    list.push(e.target)
    childIdsOf.set(e.source, list)
  }
  const childNodeIds = new Set([...childIdsOf.values()].flat())
  const hiddenByCollapse = new Set<string>()
  for (const parentId of collapsedNodeIds) {
    for (const childId of childIdsOf.get(parentId) ?? []) hiddenByCollapse.add(childId)
  }
  // Hierarchy/collapse only makes sense within one map's own tree — a global
  // search's results span every map at once, so it always shows flat.
  const visibleNodeRows = isGlobalSearch ? nodeRows : nodeRows.filter((row) => !hiddenByCollapse.has(row.node.id))

  // Ids of every notes.json-backed node (note/scaffolded/plan-step) — the only
  // ones eligible for permanent delete (deleteNode). Build-generated src nodes
  // aren't in here; they only ever get the restorable archive × below.
  const noteIdSet = new Set(notes.map((nn) => nn.id))

  return (
    <Frame theme="tactical" h="fill" flow="horizontal" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      {/* Sidebar — runs the full height from the true top; the tab strip
          sits beside it (in the column to the right), not above it. */}
      <ScrollWindow
        axis="y"
        flow="vertical"
        gap={0}
        padding={16}
        w={200}
        shrink={0}
        stroke={{ right: { color: 'rgba(255,255,255,0.08)' } }}
      >
        {/* Title row above the search box — the same SidebarHeader
            Research/Workspace use above their own file-tree search (see
            LeftRailingView), borrowed here rather than hand-rolled so the
            two stay identical. */}
        <Frame padding={{ bottom: 10 }} shrink={0}>
          <SidebarHeader label="PLANNING" />
        </Frame>

        {/* Search sits above everything — Plans, Nodes, all of it — same
            placement Research/Workspace use for their own search box (right
            at the top, always visible, not scoped inside any one
            collapsible section). */}
        <div style={{ flexShrink: 0, marginBottom: 10 }}>
          <Search
            value={query}
            onChange={setQuery}
            placeholder="Search nodes…"
            w="fill"
            filters={{ options: KIND_FILTER_OPTIONS, active: kindFilter, onChange: setKindFilter }}
          />
        </div>

        <Frame flow="vertical" gap={0} shrink={0} padding={{ bottom: 10 }}>
          <CollapsibleHeader
            label="PLANS"
            count={plans.length}
            right={
              !isCreatingPlan && (
                <IconButton onClick={() => setIsCreatingPlan(true)} title="New plan" icon="plan-add" iconSize={13} textColor="var(--text-2)" />
              )
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
                placeholder="Plan name"
                disabled={creatingPlan}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 'var(--radius-2)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  padding: '4px 6px',
                  ...MONO,
                }}
              />
              <IconButton onClick={() => submitNewPlan()} title="Create plan" icon="plan-add" iconSize={13} textColor="var(--text-2)" />
            </Frame>
          )}
          {createPlanError && (
            <span style={{ fontSize: 10, color: '#e07a7a', display: 'block', paddingTop: 4, ...MONO }}>{createPlanError}</span>
          )}
          <Frame flow="vertical" gap={0} padding={{ top: 6 }}>
            {welcomeMap && (
              // No onDelete — Welcome is a built-in map, not a saved plan, so
              // it can't be permanently deleted; it's only ever opened/closed
              // as a tab.
              <PlanRow
                map={welcomeMap}
                active={welcomeMap.id === mapId}
                onOpen={() => activateMap(welcomeMap.id)}
                icon="network"
              />
            )}
            <PlanGroup plans={plans} mapId={mapId} onOpen={activateMap} onDelete={setDeletingPlan} icon="network" />
          </Frame>
        </Frame>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0, marginBottom: 10 }} />

        <Frame flow="vertical" gap={0} shrink={0} padding={{ bottom: 10 }}>
          <CollapsibleHeader
            label={isGlobalSearch ? 'RESULTS' : 'NODES'}
            count={isGlobalSearch ? nodeRows.length : live.nodes.length}
            collapsed={nodesCollapsed}
            onToggle={() => setNodesCollapsed((v) => !v)}
            right={
              // A plan tab's nodes all belong to other maps — a plan id
              // isn't a registered map, so the backend would reject a create
              // against it (see isValidMapId in tools/sleipnir-backend.mjs).
              !removablePlanFor(mapId) && (
                <Frame flow="horizontal" align="center" gap={2}>
                  <IconButton onClick={() => setIsAddingNode(true)} title="Add node…" icon="plan-node-add" iconSize={13} textColor="var(--text-2)" />
                  {/* Header-level shortcut for exactly what the detail
                      panel's own "+ Add Link" does — only meaningful once a
                      real (scaffolded) node is selected, since linking edits
                      that node's actual file. */}
                  {selectedNode?.role && (
                    <Dropdown
                      options={live.nodes
                        .filter((n) => n.role && n.filePath && n.id !== selectedNode.id && !borrowsFrom.some((b) => b.id === n.id))
                        .map((n) => ({ value: n.id, label: n.label }))}
                      onChange={(v) => {
                        const targetId = Array.isArray(v) ? v[0] : v
                        const target = live.nodes.find((n) => n.id === targetId)
                        if (target) addLink(target)
                      }}
                      variant="none"
                      trigger={
                        <IconButton as="span" title={`Link "${selectedNode.label}" to…`} icon="link" iconSize={13} textColor="var(--text-2)" />
                      }
                      w="auto"
                    />
                  )}
                </Frame>
              )
            }
          />
        </Frame>
        {!nodesCollapsed && (
          <>
        {visibleNodeRows.map((row) => {
            const n = row.node
            const children = childIdsOf.get(n.id)
            const hasChildren = !isGlobalSearch && !!children?.length
            const isChild = !isGlobalSearch && childNodeIds.has(n.id)
            const rowCollapsed = collapsedNodeIds.has(n.id)
            // The right-click / ⋯ menu is meaningless on a plan tab or during a
            // global search (a row there may belong to a map other than the
            // active one), same gate the row's own delete/archive already use.
            const menuEnabled = !isGlobalSearch && !removablePlanFor(mapId)
            const isRowHovered = hoveredId === n.id
            return (
            <div
              key={isGlobalSearch ? `${row.mapId}::${n.id}` : n.id}
              onMouseEnter={() => setHoveredId(n.id)}
              onMouseLeave={() => setHoveredId((h) => (h === n.id ? null : h))}
              onContextMenu={menuEnabled ? (e) => nodeMenu.openFromEvent(e, n) : undefined}
              // Full-bleed row (see PlanRow) — negative margins cancel the
              // sidebar's 16px padding so the fill spans edge-to-edge; the base
              // 16px is added back inside, with child rows indented a further 16.
              style={{ display: 'flex', alignItems: 'center', minHeight: 28, flexShrink: 0, marginLeft: -16, marginRight: -16, paddingLeft: 16 + (isChild ? 16 : 0), paddingRight: 8, background: n.id === selectedId ? 'rgba(255,255,255,0.10)' : isRowHovered ? 'rgba(255,255,255,0.06)' : 'transparent' }}
            >
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleNodeCollapsed(n.id) }}
                  title={rowCollapsed ? 'Expand' : 'Collapse'}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, width: 14, flexShrink: 0, color: 'var(--text-3)', fontSize: 9 }}
                >
                  {rowCollapsed ? '▸' : '▾'}
                </button>
              ) : (
                !isGlobalSearch && <span style={{ width: 14, flexShrink: 0 }} />
              )}
              {n.status && (
                <span
                  title={n.status}
                  style={{
                    fontSize: 11,
                    marginRight: 5,
                    color: n.status === 'done' ? 'var(--text-1)' : n.status === 'approved' ? '#e0a040' : 'var(--text-3)',
                    ...MONO,
                  }}
                >
                  {n.status === 'done' ? '☑' : n.status === 'approved' ? '◐' : '☐'}
                </span>
              )}
              {/* Sprint-stage glyph — the same status marker the detail card's
                  STATUS toggle and the graph node itself show (see
                  graph/stages.ts), in the stage's own color. */}
              {(() => {
                const st = stageConfig(stages[n.id])
                if (!st) return null
                return (
                  <span
                    title={st.label}
                    style={{
                      fontSize: 11,
                      lineHeight: 1,
                      marginRight: 6,
                      flexShrink: 0,
                      color: st.color,
                      ...MONO,
                    }}
                  >
                    {st.glyph}
                  </span>
                )
              })()}
              <span
                onClick={() => selectNodeRow(row)}
                // Double-click jumps to the real file in the Workspace (same
                // as double-clicking the node in the graph), when it has one.
                onDoubleClick={() => {
                  const filePath = workspaceFilePath(n)
                  if (filePath && onOpenFile) onOpenFile(filePath)
                }}
                title={workspaceFilePath(n) ? 'Double-click to open in Workspace' : undefined}
                style={{
                  fontSize: 12,
                  lineHeight: '28px',
                  letterSpacing: '0.02em',
                  color: n.id === selectedId ? 'var(--text-1)' : 'var(--text-2)',
                  opacity: n.id === selectedId ? 1 : 0.85,
                  cursor: 'pointer',
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...MONO,
                }}
              >
                {n.label}
                {/* Same ".tsx"/".rs" suffix (dimmer) the graph label shows,
                    so a node reads identically in both places. */}
                {fileExtLabel(n.filePath) && <span style={{ opacity: 0.5 }}>{fileExtLabel(n.filePath)}</span>}
              </span>
              {/* Only meaningful during global search — a per-map row
                  trivially belongs to the already-visible active tab, so
                  tagging it there would just be clutter. */}
              {isGlobalSearch && (
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-3)',
                    marginLeft: 6,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    ...MONO,
                  }}
                >
                  {row.mapLabel}
                </span>
              )}
              {/* One unified ⋯ menu replaces the old standalone archive-×/
                  delete-trash buttons — Rename / Copy path / Delete (or the
                  restorable archive for build-generated src nodes) all live in
                  nodeMenu now (see its items below). Gated off plan tabs and
                  global search for the same reason those actions were: a row
                  there may belong to a map other than the active one. */}
              {menuEnabled && isRowHovered && (
                <IconButton
                  onClick={(e) => { e.stopPropagation(); nodeMenu.openFromButton(e, n) }}
                  title="More actions"
                  glyph="⋯"
                  iconSize={16}
                  textColor="var(--text-3)"
                />
              )}
            </div>
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
              // Flat full-bleed hover row, same treatment as PLANS/NODES above
              // and the file tree's own ARCHIVED list — negative margins cancel
              // the sidebar padding so the hover fill spans edge-to-edge.
              <Frame
                key={entry.path}
                as="button"
                onClick={() => restoreEntry(entry)}
                title="Restore"
                flow="horizontal"
                align="center"
                w="fill"
                minH={28}
                variant="none"
                hoverFill="bg-3"
                radius={0}
                cursor="pointer"
                textColor="var(--text-3)"
                padding={{ left: 16, right: 8, y: 6 }}
                style={{
                  marginLeft: -16,
                  marginRight: -16,
                  textAlign: 'left',
                  fontSize: 12,
                  letterSpacing: '0.02em',
                  textDecoration: 'line-through',
                  opacity: 0.6,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  ...MONO,
                }}
              >
                {entry.label}
              </Frame>
            ))}
          </Frame>
        )}
      </ScrollWindow>

      <Frame flow="vertical" grow minW={0} h="fill">
        <WorkspaceHeader
          // No node/edge count (nor a Delete-Plan menu) on the create-a-plan
          // start page — there's no active graph to describe. The tab strip's
          // "+" still shows, since onAddTab stays wired below.
          actions={
            noOpenTabs ? undefined : (
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
          // Same "+ add a tab" pattern Workspace/Research use — here it
          // creates a new plan (the same action as the PLANS header's own
          // "+"), just reachable from the tab strip too.
          onAddTab={submitNewPlan}
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
                ...(renamable ? [{ label: 'Rename', onSelect: () => setRenamingNode(n) }] : []),
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
          {noOpenTabs ? (
            <PlanningEmptyState
              plans={plans}
              onOpenPlan={activateMap}
              onOpenWelcome={welcomeMap ? () => activateMap(welcomeMap.id) : undefined}
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
              stroke={{ left: { color: 'rgba(255,255,255,0.08)' } }}
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
                      {selectedNode.label}
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
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
              <StageToggle
                value={stages[selectedNode.id]}
                onChange={(stage) => setStage(selectedNode, stage)}
              />

              {selectedNode.status && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
                  {selectedNode.status === 'draft' ? (
                    <button
                      onClick={() => setPlanNodeStatus(selectedNode, 'approved')}
                      style={{
                        background: 'rgba(255,255,255,0.10)',
                        border: '1px solid rgba(255,255,255,0.15)',
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
                          background: 'rgba(255,255,255,0.10)',
                          border: '1px solid rgba(255,255,255,0.15)',
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

              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

              {/* Link editor — only meaningful for a scaffolded node (a real
                  per-language file to round-trip); see addLink/removeLink
                  (outgoing) and addImporter/removeImporter (incoming) for
                  why adding either direction edits a *different* file
                  depending on which one. Candidates search `notes` (every
                  plan), not `live.nodes` (just the one open right now) — a
                  link can point anywhere in the workspace's plans, not only
                  within the currently active one. The 'in' direction still
                  requires a real file+language, since addImporter has to
                  splice an import into *that* node's own file; 'out' doesn't
                  (a target with no file just gets a bare graph edge, no
                  splice — see addLink). */}
              {selectedNode.role && (
                <LinkSearchField
                  // A pick always adds an outgoing link (this node imports it);
                  // exclude only what's already outgoing. Direction is flipped
                  // afterward from the LINKED list's per-row control below.
                  candidates={notes.filter((n) =>
                    n.id !== selectedNode.id &&
                    !borrowsFrom.some((b) => b.id === n.id),
                  )}
                  onPick={(n) => addLink(n)}
                  // selectedNode.map, not mapId — a plan *tab*'s id isn't a
                  // real map (see isValidMapId in tools/sleipnir-backend.mjs),
                  // and selectedNode's own home map is what "cross-plan"
                  // should actually be relative to, whether you got here via
                  // a real map tab or a saved-plan tab referencing the node.
                  currentMapId={selectedNode.map}
                  mapLabelFor={mapLabelFor}
                />
              )}

              <LinkedNodeList
                rows={[
                  ...borrowsFrom.map((n) => ({ node: n, direction: 'out' as const })),
                  ...borrowedBy.map((n) => ({ node: n, direction: 'in' as const })),
                ]}
                onRemove={
                  selectedNode.role
                    ? (row) => (row.direction === 'out' ? removeLink(row.node) : removeImporter(row.node))
                    : undefined
                }
                onToggleDirection={selectedNode.role ? toggleLinkDirection : undefined}
                currentMapId={selectedNode.map}
                mapLabelFor={mapLabelFor}
                onOpenFile={onOpenFile}
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
