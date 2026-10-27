import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { Terminal } from '../lazyViews'
import { isTerminalAvailable } from '../Terminal/iTerminal'
import { DOCK_PANEL_HEIGHT, DOCK_TOGGLE_MARGIN, DOCK_TOGGLE_RAISED, LAYER } from '../shellLayout'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface TerminalDockProps {
  /** Controlled from App.tsx so only one of Terminal/AgentDock's full-width bottom panels is ever open at once. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** True whenever any dock (this one or a sibling) is open — App.tsx reclaims DOCK_PANEL_HEIGHT from the layout above when that happens, so every dock's own toggle button shifts up in lockstep to stay clear of whichever panel is now occupying that space, rather than floating on top of it. */
  shiftUp?: boolean
}

// Mounted once at the App shell level, not per-page. Each terminal tab's
// <Terminal /> stays mounted for the app's lifetime (hidden via CSS when it
// isn't the active tab, and the whole panel is hidden — not unmounted — when
// closed), so every shell process survives tab-switching and panel-hiding.
// Closing a tab explicitly is the only thing that unmounts a <Terminal /> and
// kills its shell.
export const TerminalDock: React.FC<TerminalDockProps> = ({ open, onOpenChange, shiftUp }) => {
  const [everOpened, setEverOpened] = useState(false)
  // Open terminal tabs, in order — each entry is a stable id (an ever-growing
  // counter, so a closed tab's id is never reused for a different shell).
  const [terminals, setTerminals] = useState<number[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const nextId = useRef(1)
  /** Scopes the focus-on-open query to this panel. */
  const panelRef = useRef<HTMLElement>(null)
  const available = isTerminalAvailable()

  const addTerminal = () => {
    const id = nextId.current++
    setTerminals((ts) => [...ts, id])
    setActiveId(id)
  }

  const closeTerminal = (id: number) => {
    setTerminals((ts) => {
      const idx = ts.indexOf(id)
      const next = ts.filter((t) => t !== id)
      // If the active tab closed, fall back to its left neighbour; closing the
      // last tab collapses the whole panel.
      setActiveId((cur) => (cur === id ? (next[Math.max(0, idx - 1)] ?? null) : cur))
      if (next.length === 0) onOpenChange(false)
      return next
    })
  }

  const toggle = () => {
    onOpenChange(!open)
    if (!open) setEverOpened(true)
  }

  // First open (or reopening after every tab was closed) spawns one terminal.
  useEffect(() => {
    if (open && everOpened && available && terminals.length === 0) addTerminal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, everOpened, available, terminals.length])

  // Opening the panel puts the caret in the shell, the way Ctrl+` does in VS
  // Code — a terminal you have to click before you can type in is half a
  // shortcut. xterm's input is a hidden textarea it manages itself, so the only
  // handle on it is the DOM; the query is scoped to this panel's own subtree so
  // it can never reach for someone else's field. Deferred a frame because the
  // panel is display:none until this render commits, and a hidden element
  // cannot take focus.
  useEffect(() => {
    if (!open || activeId === null) return
    const frame = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLTextAreaElement>('[data-terminal-active] .xterm-helper-textarea')
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, activeId])

  return (
    <>
      <button
        onClick={toggle}
        title="Terminal"
        style={{
          position: 'fixed',
          right: 20,
          bottom: shiftUp ? DOCK_TOGGLE_RAISED : DOCK_TOGGLE_MARGIN,
          zIndex: LAYER.dock,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: open ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'rgba(var(--item-ink, 255,255,255), 0.08)',
          border: '1px solid var(--border-2)',
          color: 'var(--text-1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'bottom 0.15s ease',
        }}
      >
        <Icon name="terminal" size={15} />
      </button>

      {everOpened && (
        <Frame
          ref={panelRef}
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
          {/* Tab strip — one tab per shell, a "+" to spawn another, and the
              panel-collapse × pinned right. */}
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            stroke={{ bottom: { color: 'border-1' } }}
            shrink={0}
          >
            <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflowX: 'auto' }}>
              {terminals.map((id, i) => {
                const active = id === activeId
                return (
                  <div
                    key={id}
                    onClick={() => setActiveId(id)}
                    onAuxClick={(e) => { if (e.button === 1) closeTerminal(id) }}
                    title={`Terminal ${i + 1}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px 6px 10px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      borderRight: '1px solid var(--border-1)',
                      background: active ? 'var(--bg-2)' : 'transparent',
                    }}
                  >
                    <Icon name="terminal" size={11} />
                    <span style={{ fontSize: 10, color: active ? 'var(--text-1)' : 'var(--text-3)', whiteSpace: 'nowrap', ...MONO }}>
                      Terminal {i + 1}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTerminal(id) }}
                      title="Close terminal"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, ...MONO }}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              {available && (
                <button
                  onClick={addTerminal}
                  title="New terminal"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '4px 12px', flexShrink: 0, ...MONO }}
                >
                  +
                </button>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              title="Close panel"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, padding: '6px 12px', flexShrink: 0, ...MONO }}
            >
              ×
            </button>
          </Frame>

          {/* Bodies — every shell stays mounted; only the active one is shown.
              A shell exiting (typed `exit`) auto-closes its tab. */}
          <Frame grow minH={0} style={{ position: 'relative' }}>
            {available ? (
              terminals.map((id) => (
                <div
                  key={id}
                  // Marks which shell the focus-on-open effect should reach for.
                  data-terminal-active={id === activeId ? '' : undefined}
                  style={{ position: 'absolute', inset: 0, display: id === activeId ? 'flex' : 'none' }}
                >
                  <Suspense fallback={null}>
                    <Terminal onExit={() => closeTerminal(id)} />
                  </Suspense>
                </div>
              ))
            ) : (
              <Frame flow="vertical" align="center" justify="center" h="fill">
                <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
                  TERMINAL IS DESKTOP-ONLY — RUN THE ELECTRON APP
                </span>
              </Frame>
            )}
          </Frame>
        </Frame>
      )}
    </>
  )
}
