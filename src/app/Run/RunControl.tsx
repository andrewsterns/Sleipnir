import React, { useState } from 'react'
import { Dropdown } from '../UIKit/Dropdown/Dropdown'
import type { DropdownOption } from '../UIKit/Dropdown/iDropdown'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { CUSTOM_TARGET_ID, type Runner } from './useRunner'
import type { RunTarget } from './iRun'
import { phaseColor, targetLabel } from './runLabels'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const RESCAN_VALUE = '__rescan__'

const KIND_LABEL: Record<RunTarget['kind'], string> = { web: 'web', app: 'app', task: 'task', static: 'site' }

interface RunControlProps {
  run: Runner
  /** Opens the Run dock — Play does this itself, so you see the output as it starts. */
  onShowPanel: () => void
  onTogglePanel: () => void
  panelOpen: boolean
}

// The title bar's Play button: pick what to run, hit ▶, and the Run dock
// opens with its output and (for a web target) a live preview. ▶ while
// something runs restarts it; ■ stops it.
export const RunControl: React.FC<RunControlProps> = ({ run, onShowPanel, onTogglePanel, panelOpen }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!run.available) return null

  const options: DropdownOption[] = run.targets.map((t) => ({
    value: t.id,
    label: `${t.label}  · ${KIND_LABEL[t.kind]}`,
    group: t.dir ? `${t.dir.toUpperCase()}/` : 'PROJECT',
  }))
  options.push(
    { value: CUSTOM_TARGET_ID, label: run.custom ? `Custom: ${run.custom}` : 'Custom command…', group: 'MORE' },
    { value: RESCAN_VALUE, label: 'Rescan project', group: 'MORE' },
  )

  const change = (value: string | string[]) => {
    const v = value as string
    if (v === RESCAN_VALUE) {
      run.rescan()
      return
    }
    if (v === CUSTOM_TARGET_ID) {
      setDraft(run.custom)
      setEditing(true)
      return
    }
    run.select(v)
  }

  const commitCustom = () => {
    const line = draft.trim()
    setEditing(false)
    if (line) run.setCustomCommand(line)
  }

  const play = () => {
    run.play()
    onShowPanel()
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 14 }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          placeholder="e.g. npm run dev"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitCustom()
            if (e.key === 'Escape') setEditing(false)
          }}
          style={{
            width: 220,
            height: 22,
            padding: '0 8px',
            fontSize: 11,
            background: 'var(--bg-2)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-2)',
            borderRadius: 3,
            outline: 'none',
            ...MONO,
          }}
        />
      ) : (
        <Dropdown
          options={options}
          value={run.selectedId ?? undefined}
          onChange={change}
          variant="none"
          trigger={
            <span
              title={run.selected?.detail ?? 'What the Play button runs'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 6px',
                height: 22,
                fontSize: 11,
                color: 'var(--text-2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                ...MONO,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: phaseColor(run.status.phase), flexShrink: 0 }} />
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{targetLabel(run.selected, run)}</span>
              <span style={{ fontSize: 8, color: 'var(--text-3)' }}>▼</span>
            </span>
          }
        />
      )}

      <IconButton
        onClick={play}
        disabled={!run.canPlay}
        title={run.active ? 'Restart' : 'Run'}
        size={24}
        iconSize={13}
        textColor={run.canPlay ? '#7ec98f' : 'var(--text-3)'}
        hoverTextColor="#9fdcab"
        icon="player-play"
      />
      {run.active && (
        <IconButton onClick={run.stop} title="Stop" icon="player-stop" size={24} iconSize={13} textColor="#e07a7a" hoverTextColor="#f09a9a" />
      )}
      <IconButton
        onClick={onTogglePanel}
        title={panelOpen ? 'Hide run panel' : 'Show run panel'}
        size={24}
        textColor={panelOpen ? 'var(--text-1)' : 'var(--text-3)'}
        icon="layout-columns"
        iconSize={13}
      />
    </span>
  )
}
