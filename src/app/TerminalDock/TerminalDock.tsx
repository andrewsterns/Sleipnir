import React, { Suspense, useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { Terminal } from '../lazyViews'
import { isTerminalAvailable } from '../Terminal/iTerminal'
import { tabsFromSessions } from '../Terminal/terminalSessions'
import { DOCK_PANEL_HEIGHT, LAYER, STATUS_BAR_HEIGHT } from '../shellLayout'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

interface TerminalDockProps {
  /** Controlled from App.tsx so only one of Terminal/AgentDock's full-width bottom panels is ever open at once. */
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Mounted once at the App shell level, not per-page. Each terminal tab's
// <Terminal /> stays mounted for the app's lifetime (hidden via CSS when it
// isn't the active tab, and the whole panel is hidden — not unmounted — when
// closed), so every shell process survives tab-switching and panel-hiding. The
// shells also outlive the page: after a reload this finds the ones still
// running and gives each its tab back. Closing a tab is the only thing that
// ends its shell.
export const TerminalDock: React.FC<TerminalDockProps> = ({ open, onOpenChange }) => {
  const [everOpened, setEverOpened] = useState(false)
  // Built the first time it opens (from the status bar), then kept.
  if (open && !everOpened) setEverOpened(true)
  // Open terminal tabs, in order — each entry is a stable id (an ever-growing
  // counter, so a closed tab's id is never reused for a different shell).
  const [terminals, setTerminals] = useState<number[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const nextId = useRef(1)
  // Which shell each tab shows: sessions found after a reload (read when the tab mounts), and new ones as they report in.
  const sessions = useRef(new Map<number, string>())
  // Whether the running shells have been asked for yet: a first terminal mustn't start before the answer.
  const [listed, setListed] = useState(false)
  /** Scopes the focus-on-open query to this panel. */
  const panelRef = useRef<HTMLElement>(null)
  const available = isTerminalAvailable()

  const addTerminal = () => {
    const id = nextId.current++
    setTerminals((ts) => [...ts, id])
    setActiveId(id)
  }

  const closeTerminal = (id: number) => {
    const session = sessions.current.get(id)
    if (session) window.terminalAPI?.kill(session)
    sessions.current.delete(id)
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

  // The shells still running from before a page reload come back as tabs.
  useEffect(() => {
    if (!available) return
    let cancelled = false
    void window.terminalAPI!.list().then((running) => {
      if (cancelled) return
      const tabs = tabsFromSessions(running, nextId.current)
      nextId.current += tabs.length
      for (const tab of tabs) sessions.current.set(tab.key, tab.sessionId)
      if (tabs.length) {
        setTerminals(tabs.map((t) => t.key))
        setActiveId(tabs[tabs.length - 1].key)
      }
      setListed(true)
    })
    return () => {
      cancelled = true
    }
  }, [available])

  // First open (or reopening after every tab was closed) spawns one terminal.
  useEffect(() => {
    if (open && everOpened && available && listed && terminals.length === 0) addTerminal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, everOpened, available, listed, terminals.length])

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
      {everOpened && (
        <Frame
          ref={panelRef}
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
                    <span style={{ fontSize: 11, color: active ? 'var(--text-1)' : 'var(--text-3)', whiteSpace: 'nowrap', ...UI_FONT }}>
                      Terminal {i + 1}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTerminal(id) }}
                      title="Close terminal"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0, ...UI_FONT }}
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
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '4px 12px', flexShrink: 0, ...UI_FONT }}
                >
                  +
                </button>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              title="Close panel"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, padding: '6px 12px', flexShrink: 0, ...UI_FONT }}
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
                    <Terminal sessionId={sessions.current.get(id)} onSession={(session) => sessions.current.set(id, session)} onExit={() => closeTerminal(id)} />
                  </Suspense>
                </div>
              ))
            ) : (
              <Frame flow="vertical" align="center" justify="center" h="fill">
                <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', ...UI_FONT }}>
                  Terminal is desktop-only — run the electron app
                </span>
              </Frame>
            )}
          </Frame>
        </Frame>
      )}
    </>
  )
}
