import { Frame } from '../app/UIKit/Frame/Frame'
import { parseUnifiedDiff, type DiffLine } from './parseDiffHunks'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface DiffViewProps {
  diff: string
  loading: boolean
  mode: 'unified' | 'side-by-side'
}

function DiffCell({ line }: { line: DiffLine | null }) {
  let color = 'var(--text-2)'
  let bg = 'transparent'
  if (line?.type === 'add') { color = '#7ec98f'; bg = 'rgba(126,201,143,0.08)' }
  else if (line?.type === 'remove') { color = '#e07a7a'; bg = 'rgba(224,122,122,0.08)' }
  return (
    <div style={{ flex: 1, minWidth: 0, color, background: bg, whiteSpace: 'pre', overflow: 'hidden', padding: '0 8px' }}>
      {line ? line.text || ' ' : ''}
    </div>
  )
}

export function DiffView({ diff, loading, mode }: DiffViewProps) {
  if (loading) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Loading diff…</span>
  }
  if (!diff) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Select a changed file to view its diff.</span>
  }

  if (mode === 'side-by-side') {
    const hunks = parseUnifiedDiff(diff)
    return (
      <Frame flow="vertical" gap={0} style={{ ...MONO, fontSize: 11, lineHeight: '18px' }}>
        {hunks.map((hunk, hi) => (
          <div key={hi}>
            <div style={{ color: '#7aa8e0', padding: '2px 8px' }}>{hunk.header}</div>
            {hunk.rows.map((row, ri) => (
              <div key={ri} style={{ display: 'flex' }}>
                <DiffCell line={row.left} />
                <DiffCell line={row.right} />
              </div>
            ))}
          </div>
        ))}
      </Frame>
    )
  }

  const lines = diff.split('\n')
  return (
    <Frame flow="vertical" gap={0} style={{ ...MONO, fontSize: 11, lineHeight: '18px' }}>
      {lines.map((line, i) => {
        let color = 'var(--text-2)'
        let bg = 'transparent'
        if (line.startsWith('+') && !line.startsWith('+++')) { color = '#7ec98f'; bg = 'rgba(126,201,143,0.08)' }
        else if (line.startsWith('-') && !line.startsWith('---')) { color = '#e07a7a'; bg = 'rgba(224,122,122,0.08)' }
        else if (line.startsWith('@@')) { color = '#7aa8e0' }
        else if (line.startsWith('diff --git') || line.startsWith('index ')) { color = 'var(--text-3)' }
        return (
          <div key={i} style={{ color, background: bg, whiteSpace: 'pre', padding: '0 8px' }}>
            {line || ' '}
          </div>
        )
      })}
    </Frame>
  )
}
