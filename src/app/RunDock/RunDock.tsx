import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { DOCK_PANEL_HEIGHT, LAYER, STATUS_BAR_HEIGHT } from '../shellLayout'
import { TITLE_BAR_HEIGHT } from '../TitleBar/TitleBar'
import { phaseColor, targetLabel } from '../Run/runLabels'
import type { Runner } from '../Run/useRunner'
import type { RunPhase } from '../Run/iRun'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const PHASE_LABEL: Record<RunPhase, string> = {
  idle: 'STOPPED',
  installing: 'INSTALLING',
  starting: 'STARTING',
  running: 'RUNNING',
  ready: 'LIVE',
  exited: 'FINISHED',
  error: 'FAILED',
}

type RunView = 'preview' | 'output'

interface RunDockProps {
  run: Runner
  /** Controlled from App.tsx — shares the exclusive bottom-panel slot with Terminal/AI Chat/Problems. */
  open: boolean
  onOpenChange: (open: boolean) => void
}

// The Play button's panel, opened from the status bar's Run tab (Play opens
// it automatically). A web target that's
// serving gets a live, embedded preview; everything else shows its output.
// Mounted once and hidden via CSS like its sibling docks, so the preview
// frame keeps its page state while the panel is closed.
export const RunDock: React.FC<RunDockProps> = ({ run, open, onOpenChange }) => {
  const [view, setView] = useState<RunView>('output')
  const [expanded, setExpanded] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const outputRef = useRef<HTMLPreElement>(null)
  const stickToBottom = useRef(true)

  const { phase, url, message } = run.status
  // Only a server that answered gets embedded — an app's printed URL (e.g.
  // electron:dev's renderer) stays a link, since the app has its own window.
  const previewUrl = phase === 'ready' && url ? url : null

  // A fresh run starts on its output; once it's serving, flip to the preview
  // (once per run, so choosing Output by hand afterwards sticks). A failure
  // always surfaces the output, where the reason is.
  const switchedForRun = useRef(-1)
  useEffect(() => {
    if (phase === 'ready' && url && switchedForRun.current !== run.runId) {
      switchedForRun.current = run.runId
      setView('preview')
    }
    if (phase === 'error') setView('output')
  }, [phase, url, run.runId])
  useEffect(() => {
    setView('output')
  }, [run.runId])

  useLayoutEffect(() => {
    const el = outputRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [run.output, view])

  const showPreview = view === 'preview' && !!previewUrl

  return (
    <Frame
      flow="vertical"
      gap={0}
      style={{
        position: 'fixed',
        right: 0,
        left: 0,
        bottom: STATUS_BAR_HEIGHT,
        // Expanded fills the window between the title bar and the status bar, over the content —
        // an explicit "look at my app" mode; collapsed lands in the strip
        // App.tsx reserves for the dock like every sibling.
        ...(expanded ? { top: TITLE_BAR_HEIGHT } : { height: DOCK_PANEL_HEIGHT }),
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
        gap={12}
        padding={{ x: 14, y: 4 }}
        stroke={{ bottom: { color: 'border-1' } }}
        shrink={0}
      >
        <Frame flow="horizontal" align="center" gap={10} minW={0}>
          <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>RUN</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, letterSpacing: '0.1em', color: phaseColor(phase), ...MONO }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: phaseColor(phase) }} />
            {PHASE_LABEL[phase]}
            {phase === 'exited' && run.status.code != null ? ` (${run.status.code})` : ''}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...MONO }}>
            {targetLabel(run.selected, run)}
          </span>
          {url && (
            <button
              onClick={() => run.openExternal(url)}
              title="Open in your browser"
              style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: '#7aa8e0', whiteSpace: 'nowrap', ...MONO }}
            >
              {url.replace(/^https?:\/\//, '')} ↗
            </button>
          )}
          {message && (
            <span title={message} style={{ fontSize: 10, color: phase === 'error' ? '#e07a7a' : 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...MONO }}>
              {message}
            </span>
          )}
        </Frame>

        <Frame flow="horizontal" align="center" gap={2} shrink={0}>
          {previewUrl && (
            <span style={{ display: 'inline-flex', marginRight: 8, border: '1px solid var(--border-1)', borderRadius: 3 }}>
              {(['preview', 'output'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
                    border: 'none',
                    padding: '3px 10px',
                    cursor: 'pointer',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    color: view === v ? 'var(--text-1)' : 'var(--text-3)',
                    ...MONO,
                  }}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </span>
          )}
          {showPreview && (
            <IconButton onClick={() => setReloadNonce((n) => n + 1)} title="Reload preview" glyph="↻" iconSize={14} size={24} textColor="var(--text-3)" />
          )}
          {view === 'output' && run.output && (
            <IconButton onClick={run.clearOutput} title="Clear output" glyph="⌫" iconSize={12} size={24} textColor="var(--text-3)" />
          )}
          {run.active ? (
            <IconButton onClick={run.stop} title="Stop" icon="player-stop" iconSize={13} size={24} textColor="#e07a7a" hoverTextColor="#f09a9a" />
          ) : (
            <IconButton onClick={run.play} disabled={!run.canPlay} title="Run" icon="player-play" iconSize={13} size={24} textColor="#7ec98f" hoverTextColor="#9fdcab" />
          )}
          <IconButton
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? 'Shrink panel' : 'Expand panel'}
            glyph={expanded ? '⤓' : '⤢'}
            iconSize={13}
            size={24}
            textColor="var(--text-3)"
          />
          <IconButton onClick={() => onOpenChange(false)} title="Close panel" glyph="×" iconSize={14} size={24} textColor="var(--text-3)" />
        </Frame>
      </Frame>

      <Frame grow minH={0} style={{ position: 'relative' }}>
        {previewUrl && (
          <iframe
            key={`${previewUrl}#${reloadNonce}`}
            src={previewUrl}
            title="Run preview"
            // No allow-top-navigation (a preview must never navigate Sleipnir
            // itself away) and no allow-popups (a popup would become a bare
            // Electron window outside the app's window bookkeeping).
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-pointer-lock"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
              display: showPreview ? 'block' : 'none',
            }}
          />
        )}
        <pre
          ref={outputRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          style={{
            position: 'absolute',
            inset: 0,
            margin: 0,
            padding: '10px 14px',
            overflow: 'auto',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-2)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: showPreview ? 'none' : 'block',
            ...MONO,
          }}
        >
          {run.output || (
            <span style={{ color: 'var(--text-3)' }}>
              {run.targets.length === 0 && !run.scanning
                ? 'Nothing runnable was found in this project — pick “Custom command…” from the run menu in the title bar.'
                : 'Press ▶ in the title bar to run this project.'}
            </span>
          )}
        </pre>
      </Frame>
    </Frame>
  )
}
