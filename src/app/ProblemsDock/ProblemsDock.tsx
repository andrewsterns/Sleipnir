import React, { useEffect, useState, type MutableRefObject } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { IconButton } from '../UIKit/IconButton/IconButton'
import type { FolderBrowserHandle } from '../DesignSystem/iFolderBrowserView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const POLL_MS = 2000

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
  categoryLabel: (id: string) => string
  /** Switches to `categoryId` and focuses `path` within it. */
  onJump: (categoryId: string, path: string) => void
  /** True whenever any dock (this one or a sibling) is open — App.tsx reclaims DOCK_PANEL_HEIGHT from the layout above when that happens, so every dock's own toggle button shifts up in lockstep to stay clear of whichever panel is now occupying that space, rather than floating on top of it. */
  shiftUp?: boolean
}

// Sits beside TerminalDock/AgentDock's toggles (68px button spacing each —
// 20, 68, 116). Diagnostics themselves are already pushed reactively by the
// LSP client into each open CodeEditorView (see CodeEditorView.ViewModel's
// updateListener), but there's no push channel from there up to this
// App-shell-level dock — so this polls each open FolderBrowserView's own
// getProblems() while the panel is open, cheap since it's just reading
// already-computed state off each handle.
export const ProblemsDock: React.FC<ProblemsDockProps> = ({ open, onOpenChange, browserRefs, categoryLabel, onJump, shiftUp }) => {
  const [everOpened, setEverOpened] = useState(false)
  const [rows, setRows] = useState<ProblemRow[]>([])

  useEffect(() => {
    if (!open) return
    const poll = () => {
      const next: ProblemRow[] = []
      for (const [categoryId, handle] of browserRefs.current) {
        if (!handle) continue
        for (const p of handle.getProblems()) next.push({ categoryId, ...p })
      }
      setRows(next)
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [open, browserRefs])

  const toggle = () => {
    onOpenChange(!open)
    setEverOpened(true)
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <>
      <button
        onClick={toggle}
        title="Problems"
        style={{
          position: 'fixed',
          right: 116,
          bottom: shiftUp ? 340 : 20,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: open ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: total > 0 ? '#e0a040' : 'var(--text-1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'bottom 0.15s ease',
        }}
      >
        <Icon name="alert-triangle" size={15} />
      </button>

      {everOpened && (
        <Frame
          flow="vertical"
          gap={0}
          style={{
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: 0,
            height: 320,
            zIndex: 999,
            display: open ? 'flex' : 'none',
          }}
          fill={{ solid: 'bg-1' }}
          stroke={{ top: { color: 'rgba(255,255,255,0.12)' } }}
        >
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 14, y: 6 }}
            stroke={{ bottom: { color: 'rgba(255,255,255,0.08)' } }}
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
            {rows.length === 0 ? (
              <Frame flow="vertical" align="center" justify="center" h="fill">
                <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.08em', ...MONO }}>
                  NO PROBLEMS IN OPEN FILES
                </span>
              </Frame>
            ) : (
              rows.map((row) => (
                <Frame
                  as="button"
                  key={`${row.categoryId}:${row.path}`}
                  onClick={() => onJump(row.categoryId, row.path)}
                  flow="horizontal"
                  align="center"
                  justify="between"
                  w="fill"
                  minH={32}
                  variant="none"
                  hoverFill="bg-3"
                  stroke={{ bottom: { color: 'rgba(255,255,255,0.05)' } }}
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
