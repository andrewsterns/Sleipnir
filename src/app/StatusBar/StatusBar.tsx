import React from 'react'
import { Icon, type IconName } from '../UIKit/Icon/Icon'
import { STATUS_BAR_HEIGHT } from '../shellLayout'
import type { ProblemsSummary } from '../ProblemsDock/ProblemsDock'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export type DockId = 'terminal' | 'agent' | 'problems' | 'run'

interface StatusBarProps {
  /** Whichever dock panel is open — its tab reads as active. */
  activeDock: DockId | null
  onToggleDock: (id: DockId) => void
  problems: ProblemsSummary
  /** The Play button (app/Run/RunControl), at the left end. */
  runControl?: React.ReactNode
  /** Run is going — the Run tab gets a live dot even while its panel is closed. */
  running?: boolean
}

// The strip along the bottom of the window, VS Code's status bar in spirit:
// the Play control on the left, and a flat tab per dock panel on the right.
// It replaced the floating round toggles that sat over the bottom-right of
// every view. A tab whose panel is open is filled and underlined from above,
// so it's always clear which panel the strip above belongs to.
export const StatusBar: React.FC<StatusBarProps> = ({ activeDock, onToggleDock, problems, runControl, running }) => {
  const problemColor = problems.color ?? 'var(--text-2)'
  return (
    <footer
      style={{
        height: STATUS_BAR_HEIGHT,
        minHeight: STATUS_BAR_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 6px',
        background: 'var(--bg-1)',
        borderTop: '1px solid var(--border-1)',
        ...MONO,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>{runControl}</div>

      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
        {problems.text && activeDock !== 'problems' && (
          // The first problem, so you needn't open the panel to see what it is.
          <button
            type="button"
            onClick={() => onToggleDock('problems')}
            title={problems.text}
            style={{
              ...TAB_RESET,
              gap: 6,
              maxWidth: 'min(440px, 40vw)',
              color: 'var(--text-2)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: problemColor, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{problems.text}</span>
            {problems.rest > 0 && <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>+{problems.rest}</span>}
          </button>
        )}
        <DockTab
          id="problems"
          icon="alert-triangle"
          label="Problems"
          badge={problems.total > 0 ? String(problems.total) : undefined}
          badgeColor={problemColor}
          activeDock={activeDock}
          onToggle={onToggleDock}
        />
        <DockTab id="agent" icon="sparkle" label="AI" activeDock={activeDock} onToggle={onToggleDock} />
        <DockTab id="terminal" icon="terminal" label="Terminal" activeDock={activeDock} onToggle={onToggleDock} />
        <DockTab id="run" icon="player-play" label="Run" live={running} activeDock={activeDock} onToggle={onToggleDock} />
      </div>
    </footer>
  )
}

const TAB_RESET: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '0 10px',
  background: 'transparent',
  border: 'none',
  fontSize: 10,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  position: 'relative',
  fontFamily: 'var(--font-mono)',
}

function DockTab({
  id,
  icon,
  label,
  badge,
  badgeColor,
  live,
  activeDock,
  onToggle,
}: {
  id: DockId
  icon: IconName
  label: string
  badge?: string
  badgeColor?: string
  /** Something behind this tab is running. */
  live?: boolean
  activeDock: DockId | null
  onToggle: (id: DockId) => void
}) {
  const active = activeDock === id
  return (
    <button
      type="button"
      title={active ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={active}
      onClick={() => onToggle(id)}
      className="status-tab"
      style={{
        ...TAB_RESET,
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        background: active ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
      }}
    >
      {/* The open panel sits directly above; this line ties the tab to it. */}
      {active && <span style={{ position: 'absolute', top: -1, left: 0, right: 0, height: 2, background: 'var(--text-1)' }} />}
      <Icon name={icon} size={12} />
      {label}
      {badge && <span style={{ color: badgeColor, fontSize: 10 }}>{badge}</span>}
      {live && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7ec98f' }} />}
    </button>
  )
}
