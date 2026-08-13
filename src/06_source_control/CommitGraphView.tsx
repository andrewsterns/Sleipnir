import { useEffect, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { cn } from '../utils/cn'
import { getCommitGraph, type GitCommitGraph, type GitCommitNode } from '../00_planning/api/sleipnirApi'
import { buildLayout, laneColor, ROW_H, LANE_W, DOT_R, GRAPH_PAD_L } from './commitGraphLayout'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function stateLabel(c: GitCommitNode): string {
  if (c.pushed && c.local) return 'pushed'
  if (c.local) return 'local — not pushed yet'
  return 'fetched — not in a local branch'
}

function refStyle(ref: string): { bg: string; color: string } {
  if (ref.startsWith('tag:')) return { bg: 'rgba(224,164,88,0.18)', color: '#e0a458' }
  if (ref.includes('/')) return { bg: 'rgba(122,168,224,0.18)', color: '#7aa8e0' } // origin/… remote refs
  return { bg: 'rgba(126,201,143,0.18)', color: '#7ec98f' } // local branch
}

export function CommitMarker({ cx, cy, color, commit }: { cx: number; cy: number; color: string; commit: GitCommitNode }) {
  const synced = commit.pushed && commit.local
  const fetchedOnly = commit.pushed && !commit.local
  return (
    <g>
      {commit.isHead && (
        <circle cx={cx} cy={cy} r={DOT_R + 3} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.5} />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={DOT_R}
        // Filled = pushed & present locally; hollow (ground fill) = local-only,
        // not pushed; dashed muted ring = fetched-only, not in a local branch.
        fill={synced ? color : 'var(--bg-1)'}
        stroke={fetchedOnly ? 'var(--text-3)' : color}
        strokeWidth={1.5}
        strokeDasharray={fetchedOnly ? '2 2' : undefined}
      >
        <title>{`${commit.shortHash} · ${commit.subject}\n${commit.author} · ${commit.date}\n${stateLabel(commit)}`}</title>
      </circle>
    </g>
  )
}

function CommitRow({ commit, selected, onClick }: { commit: GitCommitNode; selected: boolean; onClick: () => void }) {
  return (
    <div
      // is-connected (outline) rather than is-selected (solid fill) keeps the
      // explicitly-coloured hash/date legible when a row is picked.
      className={cn('srow', selected && 'is-connected')}
      onClick={onClick}
      title={`${commit.subject}\n${commit.author} · ${commit.date} · ${stateLabel(commit)}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, height: ROW_H, padding: '0 10px', cursor: 'pointer', fontSize: 12, letterSpacing: '0.02em', ...MONO }}
    >
      <span style={{ color: 'var(--text-3)', flexShrink: 0, width: 52 }}>{commit.shortHash}</span>
      {commit.refs.map((ref) => {
        const s = refStyle(ref)
        return (
          <span key={ref} style={{ fontSize: 8, letterSpacing: '0.04em', padding: '1px 4px', borderRadius: 3, background: s.bg, color: s.color, flexShrink: 0, whiteSpace: 'nowrap', ...MONO }}>
            {ref.replace(/^tag:\s*/, '')}
          </span>
        )
      })}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'inherit' }}>
        {commit.subject}
      </span>
      <span style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: 10 }}>
        {commit.author.split(' ')[0]} · {commit.date}
      </span>
    </div>
  )
}

function LegendDot({ variant }: { variant: 'pushed' | 'local' | 'fetched' }) {
  const color = '#7aa8e0'
  const common = { display: 'inline-block', width: 9, height: 9, borderRadius: '50%', boxSizing: 'border-box' as const }
  if (variant === 'pushed') return <span style={{ ...common, background: color }} />
  if (variant === 'local') return <span style={{ ...common, border: `1.5px solid ${color}`, background: 'var(--bg-1)' }} />
  return <span style={{ ...common, border: '1.5px dashed var(--text-3)', background: 'var(--bg-1)' }} />
}

function Legend() {
  const item = (v: 'pushed' | 'local' | 'fetched', label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.04em', ...MONO }}>
      <LegendDot variant={v} /> {label}
    </span>
  )
  return (
    <Frame flow="horizontal" gap={14} align="center" wrap="wrap" padding={{ x: 10, y: 8 }} stroke={{ bottom: { color: 'var(--border-1)' } }}>
      {item('pushed', 'pushed')}
      {item('local', 'local — unpushed')}
      {item('fetched', 'fetched — not merged')}
    </Frame>
  )
}

// The commit-graph view: fetches the real parent-linked DAG (getCommitGraph)
// and lays it out as lanes with per-commit push/fetch state. Self-contained —
// it loads its own data lazily (only mounted when this pane is shown) and
// reloads whenever `reloadToken` changes (bumped by the ViewModel after any git
// op). Replaces the old flat CommitDot list as the Source Control main view.
export function CommitGraphView({ reloadToken }: { reloadToken: number }) {
  const [graph, setGraph] = useState<GitCommitGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCommitGraph()
      .then((g) => { if (!cancelled) { setGraph(g); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadToken])

  if (loading && !graph) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', padding: 12, display: 'block', ...MONO }}>Loading commit graph…</span>
  }
  if (error && !graph) {
    return <span style={{ fontSize: 10, color: '#e07a7a', padding: 12, display: 'block', ...MONO }}>{error}</span>
  }
  if (!graph || graph.commits.length === 0) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', padding: 12, display: 'block', ...MONO }}>No commits yet.</span>
  }

  const { placed, edges, laneCount } = buildLayout(graph.commits)
  const graphWidth = GRAPH_PAD_L + laneCount * LANE_W
  const totalH = graph.commits.length * ROW_H

  return (
    <Frame flow="vertical" gap={0} w="fill">
      <Legend />
      <div style={{ display: 'flex', width: '100%' }}>
        <svg width={graphWidth} height={totalH} style={{ flexShrink: 0, display: 'block' }}>
          {edges.map((e) => (
            <path key={e.id} d={e.d} fill="none" stroke={e.color} strokeWidth={1.5} strokeOpacity={0.55} strokeDasharray={e.dashed ? '3 3' : undefined} />
          ))}
          {placed.map(({ commit, row, lane }) => (
            <CommitMarker key={commit.hash} cx={GRAPH_PAD_L + lane * LANE_W + LANE_W / 2} cy={row * ROW_H + ROW_H / 2} color={laneColor(lane)} commit={commit} />
          ))}
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          {placed.map(({ commit }) => (
            <CommitRow
              key={commit.hash}
              commit={commit}
              selected={selected === commit.hash}
              onClick={() => setSelected((s) => (s === commit.hash ? null : commit.hash))}
            />
          ))}
        </div>
      </div>
      {graph.truncated && (
        <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '8px 10px', display: 'block', ...MONO }}>
          … older history truncated.
        </span>
      )}
    </Frame>
  )
}
