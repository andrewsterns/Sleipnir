// The lens, in the left panel: the Health switch at the top, and the reading
// each list row carries in its [lens] column — the same strength the graph's
// heat shows, so a row and its node agree.
//
// Health covers both readings: the code's shape (imports: what leans on a
// file, loops, upward imports, unused files, hotspots) on the graph and the
// rows, and the agents' effort (files read over and over, test loops, search
// streaks) in the panel under the health report.

import type { GraphOverlay, LensMetric } from './PlanningView.ViewModel'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

const TITLE =
  "The code's shape — what leans on each file, import loops, upward imports, unused files and hotspots — and where agents' effort went, from the agent trail at no token cost."

export function LensSwitch({ value, onChange }: { value: GraphOverlay | null; onChange: (lens: GraphOverlay | null) => void }) {
  const on = value === 'health'
  return (
    <label
      title={TITLE}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border-1)', cursor: 'pointer' }}
    >
      <span style={{ fontSize: 12, color: on ? 'var(--text-1)' : 'var(--text-2)', ...UI_FONT }}>Health</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Health"
        onClick={() => onChange(on ? null : 'health')}
        style={{
          position: 'relative',
          width: 28,
          height: 16,
          flexShrink: 0,
          padding: 0,
          border: 'none',
          borderRadius: 999,
          cursor: 'pointer',
          background: on ? 'var(--text-1)' : 'rgba(var(--item-ink, 255,255,255), 0.2)',
          transition: 'background-color 160ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: on ? 'var(--bg-1)' : 'var(--text-1)',
            transform: on ? 'translateX(12px)' : 'none',
            transition: 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms ease',
          }}
        />
      </button>
    </label>
  )
}

/** A row's [lens] column: a short bar of the node's strength and its reading. Fixed width, so the column lines up down the list. */
export function LensValue({ metric }: { metric: LensMetric | null }) {
  return (
    <span
      title={metric?.title}
      style={{ width: 52, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}
    >
      {metric && (
        <>
          {/* currentColor, so a picked (inverted) row keeps its reading. */}
          <span style={{ fontSize: 10, opacity: 0.7, whiteSpace: 'nowrap', ...UI_FONT }}>{metric.label}</span>
          <span style={{ position: 'relative', width: 14, height: 3, borderRadius: 1, flexShrink: 0, overflow: 'hidden' }}>
            <span style={{ position: 'absolute', inset: 0, background: 'currentColor', opacity: 0.2 }} />
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(8, Math.round(metric.value * 100))}%`, borderRadius: 1, background: 'currentColor' }} />
          </span>
        </>
      )}
    </span>
  )
}
