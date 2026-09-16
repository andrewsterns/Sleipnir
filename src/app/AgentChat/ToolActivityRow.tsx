import React, { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { DiffView } from '../../06_source_control/DiffView'
import type { ChangeSet, ToolActivity, ToolDecision } from './iAgentChat'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const STATUS_GLYPH: Record<ToolActivity['status'], string> = {
  running: '◌',
  'awaiting-approval': '?',
  done: '✓',
  denied: '⊘',
  error: '✕',
}

const STATUS_COLOR: Record<ToolActivity['status'], string> = {
  running: 'var(--text-3)',
  'awaiting-approval': '#e0a040',
  done: '#7ec98f',
  denied: 'var(--text-3)',
  error: '#e07a7a',
}

const APPROVAL_TITLE: Record<ToolActivity['kind'], string> = {
  read: 'Allow this?',
  edit: 'Apply this change?',
  exec: 'Run this?',
  external: 'Allow this outside tool?',
}

interface ToolActivityRowProps {
  tool: ToolActivity
  onDecide: (callId: string, decision: ToolDecision, paths?: string[]) => void
  onUndo: (callId: string, changeSetId: string) => void
  onReapply: (callId: string, changeSetId: string) => void
}

const smallText: React.CSSProperties = { fontSize: 10, color: 'var(--text-2)', ...MONO }

function ChangeSetFiles({
  changeSet,
  selectable,
  selected,
  onToggle,
}: {
  changeSet: ChangeSet
  selectable: boolean
  selected: Set<string>
  onToggle: (path: string) => void
}) {
  const [open, setOpen] = useState<string | null>(changeSet.files.length === 1 ? changeSet.files[0].path : null)
  return (
    <Frame flow="vertical" gap={4}>
      {changeSet.files.map((f) => (
        <Frame key={f.path} flow="vertical" gap={4}>
          <Frame flow="horizontal" align="center" gap={8}>
            {selectable && (
              <input
                type="checkbox"
                checked={selected.has(f.path)}
                onChange={() => onToggle(f.path)}
                aria-label={`Include ${f.path}`}
                style={{ margin: 0 }}
              />
            )}
            <button
              onClick={() => setOpen((p) => (p === f.path ? null : f.path))}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                flex: 1,
                minWidth: 0,
                color: 'var(--text-1)',
                fontSize: 11,
                wordBreak: 'break-all',
                ...MONO,
              }}
            >
              {open === f.path ? '▾' : '▸'} {f.path}
            </button>
            <span style={{ ...smallText, color: 'var(--text-3)', flexShrink: 0 }}>
              {f.status === 'added' ? 'new · ' : f.status === 'unchanged' ? 'unchanged · ' : ''}
              <span style={{ color: '#7ec98f' }}>+{f.additions}</span> <span style={{ color: '#e07a7a' }}>−{f.deletions}</span>
              {f.applied ? ' · written' : ''}
            </span>
          </Frame>
          {open === f.path && (
            <div style={{ maxHeight: 260, overflow: 'auto', background: 'var(--bg-0)', border: '1px solid var(--border-1)' }}>
              <DiffView diff={f.diff} loading={false} mode="unified" />
            </div>
          )}
        </Frame>
      ))}
    </Frame>
  )
}

export function ToolActivityRow({ tool, onDecide, onUndo, onReapply }: ToolActivityRowProps) {
  const [expanded, setExpanded] = useState(false)
  const changeSet = tool.changeSet
  // Tracked as exclusions, not selections: the change set arrives in a later
  // patch than the row itself, and every file starts out included.
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set())
  const selected = new Set((changeSet?.files ?? []).map((f) => f.path).filter((p) => !excluded.has(p)))
  const awaiting = tool.status === 'awaiting-approval'

  const toggle = (path: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const approveOnce = () => {
    if (changeSet && selected.size < changeSet.files.length) onDecide(tool.callId, 'once', [...selected])
    else onDecide(tool.callId, 'once')
  }

  const hasDetail = !!tool.output || (!!tool.inputPreview && !changeSet)
  const showDetail = expanded || (awaiting && !changeSet)

  return (
    <Frame
      flow="vertical"
      gap={6}
      padding={8}
      fill={{ solid: 'bg-0' }}
      stroke={{ color: awaiting ? 'rgba(224,160,64,0.6)' : 'var(--border-1)' }}
    >
      <Frame flow="horizontal" align="center" gap={8}>
        <span style={{ width: 12, textAlign: 'center', color: STATUS_COLOR[tool.status], fontSize: 11, ...MONO }}>
          {STATUS_GLYPH[tool.status]}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-1)', ...MONO }}>{tool.name}</span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--text-2)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...MONO,
          }}
          title={tool.summary}
        >
          {tool.summary}
        </span>
        {hasDetail && !awaiting && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 9, ...MONO }}
          >
            {expanded ? 'HIDE' : 'DETAILS'}
          </button>
        )}
      </Frame>

      {awaiting && (
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#e0a040', ...MONO }}>{APPROVAL_TITLE[tool.kind]}</span>
      )}

      {showDetail && tool.inputPreview && !changeSet && tool.name !== 'run_command' && (
        <pre style={{ margin: 0, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...smallText }}>
          {tool.inputPreview}
        </pre>
      )}

      {changeSet && (
        <ChangeSetFiles
          changeSet={changeSet}
          selectable={awaiting && changeSet.files.length > 1}
          selected={selected}
          onToggle={toggle}
        />
      )}

      {(expanded || tool.name === 'run_command') && tool.output && (
        <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...smallText }}>
          {tool.output}
        </pre>
      )}

      {tool.status === 'done' && tool.exitCode !== undefined && (
        <span style={{ ...smallText, color: 'var(--text-3)' }}>
          {tool.timedOut ? 'Timed out' : `Exit code: ${tool.exitCode}`}
        </span>
      )}

      {tool.error && <span style={{ ...smallText, color: '#e07a7a', whiteSpace: 'pre-wrap' }}>{tool.error}</span>}

      {awaiting && (
        <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
          <Button variant="ghost" size="sm" onClick={() => onDecide(tool.callId, 'deny')}>
            {changeSet ? 'Discard' : 'Deny'}
          </Button>
          {tool.canRemember && (
            <Button variant="outline" size="sm" onClick={() => onDecide(tool.callId, 'always')}>
              Always allow in this project
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={approveOnce} disabled={!!changeSet && selected.size === 0}>
            {changeSet
              ? selected.size < changeSet.files.length
                ? `Apply ${selected.size} of ${changeSet.files.length}`
                : 'Apply'
              : tool.kind === 'exec'
                ? 'Run'
                : 'Allow once'}
          </Button>
        </Frame>
      )}

      {changeSet && !awaiting && (
        <Frame flow="horizontal" gap={8} justify="between" align="center">
          <span style={{ ...smallText, color: 'var(--text-3)' }}>
            {changeSet.state === 'applied'
              ? 'Written to disk'
              : changeSet.state === 'reverted'
                ? 'Undone'
                : changeSet.state === 'discarded'
                  ? 'Discarded'
                  : ''}
          </span>
          {changeSet.state === 'applied' && (
            <Button variant="outline" size="sm" onClick={() => onUndo(tool.callId, changeSet.id)}>
              Undo
            </Button>
          )}
          {(changeSet.state === 'reverted' || changeSet.state === 'discarded') && (
            <Button variant="ghost" size="sm" onClick={() => onReapply(tool.callId, changeSet.id)}>
              Apply anyway
            </Button>
          )}
        </Frame>
      )}
    </Frame>
  )
}
