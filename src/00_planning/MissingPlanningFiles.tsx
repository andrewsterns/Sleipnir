import React, { useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import type { MissingPlanningRef } from './api/PlatformAPI'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const MISSING_COLOR = '#e07a7a'

const BUTTON: React.CSSProperties = {
  background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 9,
  letterSpacing: '0.08em',
  padding: '5px 10px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  ...MONO,
}

export interface MissingPlanningActions {
  onRelink: (from: string, to: string) => Promise<void>
  /** Applies git-recorded renames only — a filename match always needs its own click. */
  onRelinkAll: () => Promise<void>
  onRemove: (path: string) => Promise<void>
  /** Jumps to the first Planning node/plan that references this path. */
  onShow: (missing: MissingPlanningRef) => void
}

function refSummary(m: MissingPlanningRef): string {
  const labels = [...new Set(m.refs.map((r) => r.label))]
  const shown = labels.slice(0, 2).join(', ')
  return labels.length > 2 ? `${shown} +${labels.length - 2}` : shown
}

// The Problems dock's "missing planned files" section — `.planning/` paths
// that no longer exist, usually moved or deleted outside Sleipnir (see
// usePlanningHealth). Nothing is rewritten without a click.
export const MissingPlanningFiles: React.FC<{ missing: MissingPlanningRef[] } & MissingPlanningActions> = ({
  missing,
  onRelink,
  onRelinkAll,
  onRemove,
  onShow,
}) => {
  const [busy, setBusy] = useState(false)
  if (missing.length === 0) return null

  const gitCount = missing.filter((m) => m.suggestion?.source === 'git').length
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const removeWithConfirm = (m: MissingPlanningRef) => {
    const notes = m.refs.filter((r) => r.kind === 'note').length
    if (notes > 0 && !window.confirm(`Remove ${m.path} from Planning? This deletes ${notes} node${notes === 1 ? '' : 's'} backed by it.`)) return
    void run(() => onRemove(m.path))
  }

  return (
    <Frame flow="vertical" shrink={0}>
      <Frame flow="horizontal" align="center" gap={12} padding={{ x: 14, y: 6 }} stroke={{ bottom: { color: 'border-1' } }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 10, letterSpacing: '0.1em', color: MISSING_COLOR, ...MONO }}>
          PLANNING — {missing.length} MISSING FILE{missing.length === 1 ? '' : 'S'} (MOVED OR DELETED OUTSIDE SLEIPNIR)
        </span>
        {gitCount > 0 && (
          <button disabled={busy} onClick={() => void run(onRelinkAll)} style={BUTTON}>
            RELINK ALL ({gitCount})
          </button>
        )}
      </Frame>
      {missing.map((m) => (
        <Frame
          key={m.path}
          flow="horizontal"
          align="center"
          gap={10}
          minH={32}
          padding={{ x: 14, y: 6 }}
          stroke={{ bottom: { color: 'border-1' } }}
        >
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, ...MONO }}>
            <span style={{ color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.path}>
              {m.path}
              {m.isDir ? '/' : ''}
            </span>
            <span style={{ color: 'var(--text-3)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.suggestion
                ? `→ ${m.suggestion.path}  (${m.suggestion.source === 'git' ? 'git rename' : 'name match'})`
                : 'no match found'}
              {`  · ${refSummary(m)}`}
            </span>
          </div>
          <button onClick={() => onShow(m)} style={BUTTON}>
            SHOW
          </button>
          {m.suggestion && (
            <button disabled={busy} onClick={() => void run(() => onRelink(m.path, m.suggestion!.path))} style={BUTTON}>
              RELINK
            </button>
          )}
          <button disabled={busy} onClick={() => removeWithConfirm(m)} style={BUTTON}>
            REMOVE
          </button>
        </Frame>
      ))}
    </Frame>
  )
}
