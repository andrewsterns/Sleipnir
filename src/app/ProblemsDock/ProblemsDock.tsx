import React, { useEffect, useState, type MutableRefObject } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { FolderBrowserHandle } from '../DesignSystem/iFolderBrowserView'
import { DOCK_PANEL_HEIGHT, DOCK_TOGGLE_MARGIN, DOCK_TOGGLE_RAISED, LAYER } from '../shellLayout'
import type { MissingPlanningRef } from '../../00_planning/api/PlatformAPI'
import { MissingPlanningFiles, type MissingPlanningActions } from '../../00_planning/MissingPlanningFiles'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const POLL_MS = 2000
const TOGGLE_RIGHT = 116
const TOGGLE_SIZE = 40

interface ProblemRow {
  categoryId: string
  path: string
  count: number
}

interface ProblemsDockProps {
  /** Controlled from App.tsx so it shares the exclusive bottom-panel slot with TerminalDock/AgentDock. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** App.tsx's own browserRefs map — same one the File menu's Save/Save All already reaches through. */
  browserRefs: MutableRefObject<Map<string, FolderBrowserHandle | null>>
  /** NavRail's display title for a category id, for the row's category tag. */
  categoryLabel?: (id: string) => string
  /** Switches to `categoryId` and focuses `path` within it. */
  onJump?: (categoryId: string, path: string) => void
  /** True whenever any dock (this one or a sibling) is open — App.tsx reclaims DOCK_PANEL_HEIGHT from the layout above when that happens, so every dock's own toggle button shifts up in lockstep to stay clear of whichever panel is now occupying that space, rather than floating on top of it. */
  shiftUp?: boolean
  /** `.planning/` paths that no longer exist (App.tsx's usePlanningHealth), listed above the editor diagnostics. */
  missingPlanning?: MissingPlanningRef[]
  planningActions?: MissingPlanningActions
}

// Sits beside TerminalDock/AgentDock's toggles (68px button spacing each —
// 20, 68, 116). Diagnostics themselves are already pushed reactively by the
// LSP client into each open CodeEditorView (see CodeEditorView.ViewModel's
// updateListener), but there's no push channel from there up to this
// App-shell-level dock — so this polls each open FolderBrowserView's own
// getProblems(). It polls even while closed, so the one-line summary beside
// the toggle can show the first problem without opening the panel; cheap,
// since it only reads already-computed state off each handle.
export const ProblemsDock: React.FC<ProblemsDockProps> = ({
  open,
  onOpenChange,
  browserRefs,
  categoryLabel = (id) => id,
  onJump,
  shiftUp,
  missingPlanning = [],
  planningActions,
}) => {
  const [everOpened, setEverOpened] = useState(false)
  const [rows, setRows] = useState<ProblemRow[]>([])

  useEffect(() => {
    const poll = () => {
      const next: ProblemRow[] = []
      for (const [categoryId, handle] of browserRefs.current) {
        if (!handle) continue
        for (const p of handle.getProblems()) next.push({ categoryId, ...p })
      }
      setRows((prev) =>
        prev.length === next.length && prev.every((r, i) => r.path === next[i].path && r.count === next[i].count && r.categoryId === next[i].categoryId)
          ? prev
          : next,
      )
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [browserRefs])

  const setOpen = (next: boolean) => {
    onOpenChange(next)
    if (next) setEverOpened(true)
  }

  const codeTotal = rows.reduce((sum, r) => sum + r.count, 0)
  const total = codeTotal + missingPlanning.length

  // The first problem, read out beside the toggle — a missing planned file
  // first (it's a broken reference, not just a lint), then the first file with
  // diagnostics — with everything else collapsed into "(+n more…)".
  const summary = (() => {
    if (missingPlanning.length > 0) {
      const first = missingPlanning[0]
      return { color: '#e07a7a', text: `Missing planned file: ${first.path}`, rest: total - 1 }
    }
    if (rows.length > 0) {
      const first = rows[0]
      return { color: '#e0a040', text: `${first.path}: ${first.count} problem${first.count === 1 ? '' : 's'}`, rest: total - first.count }
    }
    return null
  })()

  const bottom = shiftUp ? DOCK_TOGGLE_RAISED : DOCK_TOGGLE_MARGIN

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        title="Problems"
        style={{
          position: 'fixed',
          right: TOGGLE_RIGHT,
          bottom,
          zIndex: LAYER.dock,
          width: TOGGLE_SIZE,
          height: TOGGLE_SIZE,
          borderRadius: '50%',
          background: open ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'rgba(var(--item-ink, 255,255,255), 0.08)',
          border: '1px solid var(--border-2)',
          color: missingPlanning.length > 0 ? '#e07a7a' : total > 0 ? '#e0a040' : 'var(--text-1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'bottom 0.15s ease',
        }}
      >
        <Icon name="alert-triangle" size={15} />
      </button>

      {summary && !open && (
        <button
          onClick={() => setOpen(true)}
          title={summary.text}
          style={{
            position: 'fixed',
            right: TOGGLE_RIGHT + TOGGLE_SIZE + 8,
            bottom: bottom + 6,
            height: TOGGLE_SIZE - 12,
            maxWidth: 'min(520px, calc(100vw - 320px))',
            zIndex: LAYER.dock,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            borderRadius: 14,
            background: 'var(--bg-1)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'bottom 0.15s ease',
            ...MONO,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: summary.color, flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary.text}</span>
          {summary.rest > 0 && (
            <span style={{ color: 'var(--text-3)', flexShrink: 0, whiteSpace: 'nowrap' }}>(+{summary.rest} more…)</span>
          )}
        </button>
      )}

      {everOpened && (
        <Frame
          flow="vertical"
          gap={0}
          style={{
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: 0,
            height: DOCK_PANEL_HEIGHT,
            zIndex: LAYER.dock,
            display: open ? 'flex' : 'none',
          }}
          fill={{ solid: 'bg-1' }}
          stroke={{ top: { color: 'border-2' } }}
        >
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 14, y: 6 }}
            stroke={{ bottom: { color: 'border-1' } }}
            shrink={0}
          >
            <span style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
              PROBLEMS{total > 0 ? ` (${total})` : ''}
            </span>
            <IconButton
              onClick={() => onOpenChange(false)}
              title="Close"
              glyph="×"
              iconSize={14}
              size={24}
              textColor="var(--text-3)"
            />
          </Frame>
          <Frame grow minH={0} scroll="y" flow="vertical">
            {planningActions && <MissingPlanningFiles missing={missingPlanning} {...planningActions} />}
            {rows.length === 0 && missingPlanning.length === 0 ? (
              <Frame flow="vertical" align="center" justify="center" h="fill">
                <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
                  NO PROBLEMS
                </span>
              </Frame>
            ) : (
              rows.map((row) => (
                <Frame
                  as="button"
                  key={`${row.categoryId}:${row.path}`}
                  onClick={() => onJump?.(row.categoryId, row.path)}
                  flow="horizontal"
                  align="center"
                  justify="between"
                  w="fill"
                  minH={32}
                  variant="none"
                  hoverFill="bg-3"
                  stroke={{ bottom: { color: 'border-1' } }}
                  cursor="pointer"
                  padding={{ x: 14, y: 8 }}
                  textColor="var(--text-1)"
                  style={{ textAlign: 'left', fontSize: 12, ...MONO }}
                >
                  <span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11, letterSpacing: '0.06em', marginRight: 8 }}>
                      {categoryLabel(row.categoryId).toUpperCase()}
                    </span>
                    {row.path}
                  </span>
                  <span style={{ color: '#e0a040', fontSize: 11 }}>{row.count}</span>
                </Frame>
              ))
            )}
          </Frame>
        </Frame>
      )}
    </>
  )
}
