import { useEffect, useMemo, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import {
  getCommitGraph,
  getCommitFileMap,
  getNotes,
  type GitCommitGraph,
  type GitCommitFileMap,
} from '../00_planning/api/sleipnirApi'
import type { GraphNode } from '../00_planning/graph/types'
import { buildLayout, laneColor, ROW_H, LANE_W, GRAPH_PAD_L } from './commitGraphLayout'
import { CommitMarker } from './CommitGraphView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// The constellation weaves the commit spine (left) together with the planning
// graph's file-backed nodes (right): each plan node is drawn beside the
// commit(s) that actually touched its file, joined on the workspace-relative
// path both sides speak. Hovering either end lights the thread between them.
const COMMIT_LABEL_W = 196
const ARC_GAP = 120
const NODE_X_PAD = 8
const NODE_W = 196
const NODE_H = 34
const NODE_SPACING = 42
const PROV_COLOR = '#c98fd6'

type Hover = { kind: 'node'; id: string } | { kind: 'commit'; id: string } | null

// Only file-backed nodes can ever join to git — scaffolded nodes (role set) and
// workspace-asset nodes carry a real workspace-relative filePath; generated
// library nodes are SRC_ROOT-relative and never match, so we drop them.
function isJoinable(n: GraphNode): boolean {
  return !!n.filePath && (n.role != null || n.type === 'workspace-file' || n.type === 'scaffold')
}

export function ConstellationView({ reloadToken }: { reloadToken: number }) {
  const [graph, setGraph] = useState<GitCommitGraph | null>(null)
  const [fileMap, setFileMap] = useState<GitCommitFileMap | null>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getCommitGraph(), getCommitFileMap(), getNotes()])
      .then(([g, fm, notes]) => {
        if (cancelled) return
        setGraph(g)
        setFileMap(fm)
        setNodes(notes.nodes)
        setError(null)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadToken])

  const model = useMemo(() => {
    if (!graph || !fileMap) return null
    const { placed, edges, laneCount } = buildLayout(graph.commits)
    const hashToY = new Map(placed.map((p) => [p.commit.hash, p.row * ROW_H + ROW_H / 2]))

    // Invert the per-commit file lists into path → the commits that touched it.
    const pathToHashes = new Map<string, string[]>()
    for (const [hash, files] of Object.entries(fileMap.files)) {
      if (!hashToY.has(hash)) continue // commit outside the drawn/capped set
      for (const f of files) {
        const arr = pathToHashes.get(f)
        if (arr) arr.push(hash)
        else pathToHashes.set(f, [hash])
      }
    }

    const joinable = nodes.filter(isJoinable)
    const linked = joinable
      .map((node) => ({ node, hashes: pathToHashes.get(node.filePath!) ?? [] }))
      .filter((n) => n.hashes.length > 0)
    const unlinked = joinable.filter((n) => !(pathToHashes.get(n.filePath!)?.length))

    // Place each linked node at the average height of its commits, then push
    // any overlaps downward so chips never collide.
    const sorted = linked
      .map(({ node, hashes }) => {
        const ys = hashes.map((h) => hashToY.get(h)!).filter((v) => v != null)
        return { node, hashes, desired: ys.reduce((a, b) => a + b, 0) / ys.length }
      })
      .sort((a, b) => a.desired - b.desired)

    let lastY = -Infinity
    const positioned = sorted.map(({ node, hashes, desired }) => {
      const y = Math.max(desired - NODE_H / 2, lastY + NODE_SPACING)
      lastY = y
      return { node, hashes, y }
    })

    // Unlinked-but-joinable nodes (a file scaffolded but not yet committed)
    // stack in a faint column below, no threads.
    const commitTotalH = graph.commits.length * ROW_H
    let unlinkedY = Math.max(lastY + NODE_SPACING * 1.4, 8)
    const unlinkedPos = unlinked.map((node) => {
      const y = unlinkedY
      unlinkedY += NODE_SPACING
      return { node, y }
    })

    const gutterW = GRAPH_PAD_L + laneCount * LANE_W
    const commitColRight = gutterW + COMMIT_LABEL_W
    const nodeX = commitColRight + ARC_GAP
    const totalWidth = nodeX + NODE_W + 16
    const totalHeight = Math.max(commitTotalH, unlinkedY, lastY + NODE_H + 16) + 12

    const arcPath = (x1: number, y1: number, x2: number, y2: number) => {
      const mx = (x1 + x2) / 2
      return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
    }
    const arcs = positioned.flatMap(({ node, hashes, y }) =>
      hashes.map((hash) => ({
        id: `${node.id}::${hash}`,
        nodeId: node.id,
        hash,
        d: arcPath(commitColRight, hashToY.get(hash)!, nodeX, y + NODE_H / 2),
      })),
    )

    return {
      placed, edges, gutterW, commitColRight, nodeX, totalWidth, totalHeight,
      positioned, unlinkedPos, arcs, hashToY,
    }
  }, [graph, fileMap, nodes])

  if (loading && !model) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', padding: 12, display: 'block', ...MONO }}>Loading constellation…</span>
  }
  if (error && !model) {
    return <span style={{ fontSize: 10, color: '#e07a7a', padding: 12, display: 'block', ...MONO }}>{error}</span>
  }
  if (!model || !graph) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', padding: 12, display: 'block', ...MONO }}>Nothing to show yet.</span>
  }

  // Which commits/nodes are lit by the current hover (linked brushing).
  const activeHashes = new Set<string>()
  const activeNodeIds = new Set<string>()
  if (hover?.kind === 'node') {
    activeNodeIds.add(hover.id)
    model.positioned.find((p) => p.node.id === hover.id)?.hashes.forEach((h) => activeHashes.add(h))
  } else if (hover?.kind === 'commit') {
    activeHashes.add(hover.id)
    model.positioned.forEach((p) => { if (p.hashes.includes(hover.id)) activeNodeIds.add(p.node.id) })
  }
  const dim = hover != null

  const commitSubject = (hash: string) => graph.commits.find((c) => c.hash === hash)?.subject ?? ''

  if (model.positioned.length === 0 && model.unlinkedPos.length === 0) {
    return (
      <Frame flow="vertical" gap={6} padding={16}>
        <span style={{ fontSize: 11, color: 'var(--text-2)', ...MONO }}>No file-backed plan nodes to weave in yet.</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          The constellation links planning nodes to the commits that touched their files. Scaffold nodes from a Workspace
          (Planning → Add Node) so they carry a real file path, then their history shows up here.
        </span>
      </Frame>
    )
  }

  return (
    <Frame flow="vertical" gap={0} w="fill">
      <Frame flow="horizontal" gap={14} align="center" wrap="wrap" padding={{ x: 10, y: 8 }} stroke={{ bottom: { color: 'var(--border-1)' } }}>
        <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em', ...MONO }}>commits</span>
        <span style={{ fontSize: 9, color: PROV_COLOR, letterSpacing: '0.04em', ...MONO }}>— thread — plan nodes</span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em', ...MONO }}>hover to trace provenance</span>
      </Frame>

      <div style={{ overflowX: 'auto', width: '100%' }}>
      <div style={{ position: 'relative', width: model.totalWidth, height: model.totalHeight, minWidth: '100%' }}>
        <svg width={model.totalWidth} height={model.totalHeight} style={{ position: 'absolute', inset: 0, display: 'block' }}>
          {/* commit lane edges */}
          {model.edges.map((e) => (
            <path key={e.id} d={e.d} fill="none" stroke={e.color} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray={e.dashed ? '3 3' : undefined} pointerEvents="none" />
          ))}
          {/* provenance threads */}
          {model.arcs.map((a) => {
            const lit = (hover?.kind === 'node' && hover.id === a.nodeId) || (hover?.kind === 'commit' && hover.id === a.hash)
            return (
              <path
                key={a.id}
                d={a.d}
                fill="none"
                stroke={PROV_COLOR}
                strokeWidth={lit ? 1.8 : 1}
                strokeOpacity={dim ? (lit ? 0.95 : 0.05) : 0.28}
                pointerEvents="none"
              />
            )
          })}
          {/* commit dots */}
          {model.placed.map((p) => (
            <g
              key={p.commit.hash}
              opacity={dim && !activeHashes.has(p.commit.hash) ? 0.3 : 1}
              onMouseEnter={() => setHover({ kind: 'commit', id: p.commit.hash })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'default' }}
            >
              <CommitMarker cx={GRAPH_PAD_L + p.lane * LANE_W + LANE_W / 2} cy={p.row * ROW_H + ROW_H / 2} color={laneColor(p.lane)} commit={p.commit} />
            </g>
          ))}
        </svg>

        {/* commit labels */}
        {model.placed.map((p) => (
          <div
            key={p.commit.hash}
            onMouseEnter={() => setHover({ kind: 'commit', id: p.commit.hash })}
            onMouseLeave={() => setHover(null)}
            style={{
              position: 'absolute',
              left: model.gutterW + 4,
              top: p.row * ROW_H,
              width: COMMIT_LABEL_W - 8,
              height: ROW_H,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflow: 'hidden',
              opacity: dim && !activeHashes.has(p.commit.hash) ? 0.3 : 1,
              cursor: 'default',
              ...MONO,
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{p.commit.shortHash}</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.commit.subject}</span>
          </div>
        ))}

        {/* linked plan-node chips */}
        {model.positioned.map(({ node, hashes, y }) => (
          <NodeChip
            key={node.id}
            x={model.nodeX}
            y={y}
            node={node}
            accent={PROV_COLOR}
            subtitle={`${hashes.length} commit${hashes.length === 1 ? '' : 's'} · ${node.filePath}`}
            dimmed={dim && !activeNodeIds.has(node.id)}
            title={hashes.map((h) => `${h.slice(0, 7)} ${commitSubject(h)}`).join('\n')}
            onEnter={() => setHover({ kind: 'node', id: node.id })}
            onLeave={() => setHover(null)}
          />
        ))}

        {/* unlinked (file exists, no commit yet) */}
        {model.unlinkedPos.map(({ node, y }) => (
          <NodeChip
            key={node.id}
            x={model.nodeX}
            y={y}
            node={node}
            accent="var(--text-3)"
            subtitle={`not yet committed · ${node.filePath}`}
            dimmed={dim}
            title="This node's file has no commit in the current history."
            onEnter={() => undefined}
            onLeave={() => undefined}
          />
        ))}
      </div>
      </div>

      {graph.truncated && (
        <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '8px 10px', display: 'block', ...MONO }}>
          … older history truncated — provenance only covers the shown commits.
        </span>
      )}
    </Frame>
  )
}

function NodeChip({
  x, y, node, accent, subtitle, dimmed, title, onEnter, onLeave,
}: {
  x: number
  y: number
  node: GraphNode
  accent: string
  subtitle: string
  dimmed: boolean
  title: string
  onEnter: () => void
  onLeave: () => void
}) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={title}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: NODE_W - NODE_X_PAD,
        minHeight: NODE_H,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        padding: '5px 8px',
        borderRadius: 5,
        background: 'var(--bg-2)',
        border: '1px solid var(--border-2)',
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 90ms ease',
        cursor: 'default',
        ...MONO,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.label}</span>
      </div>
      <span style={{ fontSize: 8, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 13 }}>{subtitle}</span>
    </div>
  )
}
