import { useEffect, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { parseUnifiedDiff, type DiffLine } from './parseDiffHunks'
import { collapsedByDefault, diffPath, highlightLines, type DiffToken } from './diffHighlight'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const ADD = { color: '#7ec98f', bg: 'rgba(126,201,143,0.08)' }
const REMOVE = { color: '#e07a7a', bg: 'rgba(224,122,122,0.08)' }

export interface DiffViewProps {
  diff: string
  loading: boolean
  mode: 'unified' | 'side-by-side'
}

// Syntax tokens per diff line, keyed `u<line>` (unified) or `<hunk>:<row>:<l|r>`
// (side by side). Each hunk side is parsed as one run of lines, so strings and
// comments spanning lines color the way they do in the file. Empty until the
// file's grammar has loaded; lines then render plain.
function useDiffTokens(diff: string, mode: DiffViewProps['mode'], path: string | null) {
  const [tokens, setTokens] = useState<Map<string, DiffToken[]>>(new Map())
  useEffect(() => {
    setTokens(new Map())
    if (!diff || !path) return
    let current = true
    const runs: { keys: string[]; texts: string[] }[] = []
    if (mode === 'unified') {
      let run: { keys: string[]; texts: string[] } | null = null
      diff.split('\n').forEach((line, i) => {
        if (line.startsWith('@@')) {
          run = { keys: [], texts: [] }
          runs.push(run)
        } else if (run && /^[ +-]/.test(line)) {
          run.keys.push(`u${i}`)
          run.texts.push(line.slice(1))
        }
      })
    } else {
      parseUnifiedDiff(diff).forEach((hunk, hi) => {
        for (const side of ['l', 'r'] as const) {
          const run = { keys: [] as string[], texts: [] as string[] }
          hunk.rows.forEach((row, ri) => {
            const line = side === 'l' ? row.left : row.right
            if (!line) return
            run.keys.push(`${hi}:${ri}:${side}`)
            run.texts.push(line.text)
          })
          runs.push(run)
        }
      })
    }
    Promise.all(runs.map((run) => highlightLines(path, run.texts))).then((results) => {
      if (!current) return
      const next = new Map<string, DiffToken[]>()
      results.forEach((lines, i) => lines.forEach((t, j) => next.set(runs[i].keys[j], t)))
      setTokens(next)
    })
    return () => {
      current = false
    }
  }, [diff, mode, path])
  return tokens
}

function Tokens({ tokens, fallback }: { tokens: DiffToken[] | undefined; fallback: string }) {
  if (!tokens) return <>{fallback || ' '}</>
  return (
    <>
      {tokens.map((t, i) => (
        <span key={i} style={t.style}>
          {t.text}
        </span>
      ))}
      {tokens.every((t) => !t.text) && ' '}
    </>
  )
}

function DiffCell({ line, tokens }: { line: DiffLine | null; tokens: DiffToken[] | undefined }) {
  const paint = line?.type === 'add' ? ADD : line?.type === 'remove' ? REMOVE : null
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        color: tokens ? 'var(--text-1)' : (paint?.color ?? 'var(--text-2)'),
        background: paint?.bg ?? 'transparent',
        boxShadow: paint ? `inset 2px 0 ${paint.color}` : undefined,
        whiteSpace: 'pre',
        overflow: 'hidden',
        padding: '0 8px',
      }}
    >
      {line ? <Tokens tokens={tokens} fallback={line.text} /> : ''}
    </div>
  )
}

export function DiffView({ diff, loading, mode }: DiffViewProps) {
  const path = diffPath(diff)
  const tokens = useDiffTokens(diff, mode, path)
  // Lockfiles and build output open folded (see diffHighlight's collapsedByDefault).
  const [expandedFor, setExpandedFor] = useState<string | null>(null)

  if (loading) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Loading diff…</span>
  }
  if (!diff) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Select a changed file to view its diff.</span>
  }

  if (collapsedByDefault(path) && expandedFor !== diff) {
    const changed = diff.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length
    return (
      <Frame flow="horizontal" align="center" gap={10} style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>
        <span>
          {path} is generated — {changed} changed lines folded.
        </span>
        <button
          type="button"
          onClick={() => setExpandedFor(diff)}
          style={{ ...MONO, fontSize: 10, color: 'var(--info-5)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Show diff
        </button>
      </Frame>
    )
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
                <DiffCell line={row.left} tokens={tokens.get(`${hi}:${ri}:l`)} />
                <DiffCell line={row.right} tokens={tokens.get(`${hi}:${ri}:r`)} />
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
        const lineTokens = tokens.get(`u${i}`)
        let color = 'var(--text-2)'
        let bg = 'transparent'
        let edge: string | undefined
        if (line.startsWith('+') && !line.startsWith('+++')) [color, bg, edge] = [ADD.color, ADD.bg, ADD.color]
        else if (line.startsWith('-') && !line.startsWith('---')) [color, bg, edge] = [REMOVE.color, REMOVE.bg, REMOVE.color]
        else if (line.startsWith('@@')) color = '#7aa8e0'
        else if (line.startsWith('diff --git') || line.startsWith('index ')) color = 'var(--text-3)'
        return (
          <div key={i} style={{ color, background: bg, boxShadow: edge ? `inset 2px 0 ${edge}` : undefined, whiteSpace: 'pre', padding: '0 8px' }}>
            {lineTokens ? (
              <>
                {/* The +/- stays in the change's color; the code wears its syntax colors. */}
                <span>{line[0]}</span>
                <span style={{ color: 'var(--text-1)' }}>
                  <Tokens tokens={lineTokens} fallback={line.slice(1)} />
                </span>
              </>
            ) : (
              line || ' '
            )}
          </div>
        )
      })}
    </Frame>
  )
}
