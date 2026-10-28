import React, { useEffect, useState, type MutableRefObject } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { FolderBrowserHandle } from '../DesignSystem/iFolderBrowserView'
import { DOCK_PANEL_HEIGHT, LAYER, STATUS_BAR_HEIGHT } from '../shellLayout'
import type { MissingPlanningRef } from '../../00_planning/api/PlatformAPI'
import { MissingPlanningFiles, type MissingPlanningActions } from '../../00_planning/MissingPlanningFiles'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const POLL_MS = 2000

interface ProblemRow {
  categoryId: string
  path: string
  count: number
}

/** What the status bar shows on its Problems toggle. */
export interface ProblemsSummary {
  total: number
  /** The first problem, read out — null when there are none. */
  text: string | null
  color: string | null
  /** How many more beyond the first. */
  rest: number
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
  /** Reports the count and first problem whenever they change — the status bar shows them on its Problems toggle. */
  onSummaryChange?: (summary: ProblemsSummary) => void
  /** `.planning/` paths that no longer exist (App.tsx's usePlanningHealth), listed above the editor diagnostics. */
  missingPlanning?: MissingPlanningRef[]
  planningActions?: MissingPlanningActions
}

// Toggled from the status bar. Diagnostics themselves are already pushed reactively by the
// LSP client into each open CodeEditorView (see CodeEditorView.ViewModel's
// updateListener), but there's no push channel from there up to this
// App-shell-level dock — so this polls each open FolderBrowserView's own
// getProblems(). It polls even while closed, so the status bar can show the
// count and first problem without opening the panel; cheap,
// since it only reads already-computed state off each handle.
export const ProblemsDock: React.FC<ProblemsDockProps> = ({
  open,
  onOpenChange,
  browserRefs,
  categoryLabel = (id) => id,
  onJump,
  onSummaryChange,
  missingPlanning = [],
  planningActions,
}) => {
  const [everOpened, setEverOpened] = useState(false)
  if (open && !everOpened) setEverOpened(true)
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

  const codeTotal = rows.reduce((sum, r) => sum + r.count, 0)
  const total = codeTotal + missingPlanning.length

  // The first problem, read out on the status bar — a missing planned file
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

  const summaryText = summary?.text ?? null
  const summaryColor = summary?.color ?? null
  const summaryRest = summary?.rest ?? 0
  useEffect(() => {
    onSummaryChange?.({ total, text: summaryText, color: summaryColor, rest: summaryRest })
  }, [onSummaryChange, total, summaryText, summaryColor, summaryRest])

  return (
    <>
      {everOpened && (
        <Frame
          flow="vertical"
          gap={0}
          style={{
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: STATUS_BAR_HEIGHT,
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
