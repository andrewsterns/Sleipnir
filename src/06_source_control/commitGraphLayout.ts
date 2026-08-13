import type { GitCommitNode } from '../00_planning/api/sleipnirApi'

// Shared geometry + lane-packing for the commit-graph views (CommitGraphView
// and ConstellationView both draw the same commit spine). Kept in its own,
// component-free module so each view file exports only components (Fast Refresh)
// and the layout math lives in one place.

// Matches the list-row rhythm (LIST_ROW_MIN_H = 28) so each commit's dot in the
// SVG gutter lines up with its text row to the pixel.
export const ROW_H = 28
export const LANE_W = 16
export const DOT_R = 4
export const GRAPH_PAD_L = 12

// Lane colours cycle by column — a small palette that reads on both grounds,
// same spirit as the planning graph's node accents.
const LANE_COLORS = ['#7aa8e0', '#7ec98f', '#e0a458', '#c98fd6', '#e07a7a', '#5fc9c1', '#b0b84f']
export const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]

export type Placed = { commit: GitCommitNode; row: number; lane: number }
export type Edge = { id: string; d: string; color: string; dashed: boolean }

// Classic git-graph lane packing over commits already in --date-order (newest
// first): each lane remembers the hash it's waiting to place next. A commit
// takes the lane awaiting it (or a free one), continues that lane to its first
// parent, and opens extra lanes for the remaining parents of a merge.
export function buildLayout(commits: GitCommitNode[]): { placed: Placed[]; edges: Edge[]; laneCount: number } {
  const pos = new Map<string, { row: number; lane: number }>()
  const lanes: (string | null)[] = []

  const placed: Placed[] = commits.map((commit, row) => {
    let lane = lanes.indexOf(commit.hash)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) { lane = lanes.length; lanes.push(null) }
    }
    pos.set(commit.hash, { row, lane })

    // Other lanes awaiting this same commit are branches merging into it — free them.
    for (let i = 0; i < lanes.length; i++) {
      if (i !== lane && lanes[i] === commit.hash) lanes[i] = null
    }

    const [firstParent, ...otherParents] = commit.parents
    lanes[lane] = firstParent ?? null
    for (const p of otherParents) {
      if (lanes.indexOf(p) !== -1) continue
      let pl = lanes.indexOf(null)
      if (pl === -1) { pl = lanes.length; lanes.push(null) }
      lanes[pl] = p
    }
    return { commit, row, lane }
  })

  const laneCount = Math.max(1, ...placed.map((p) => p.lane + 1), lanes.length)
  const x = (lane: number) => GRAPH_PAD_L + lane * LANE_W + LANE_W / 2
  const y = (row: number) => row * ROW_H + ROW_H / 2

  const edges: Edge[] = []
  for (const { commit, row, lane } of placed) {
    for (const parent of commit.parents) {
      const color = laneColor(lane)
      const x1 = x(lane)
      const y1 = y(row)
      const pp = pos.get(parent)
      if (!pp) {
        // Parent scrolled past the history cap — stub the line off the bottom.
        edges.push({ id: `${commit.hash}-${parent}`, d: `M ${x1} ${y1} L ${x1} ${y1 + ROW_H * 0.8}`, color, dashed: true })
        continue
      }
      const x2 = x(pp.lane)
      const y2 = y(pp.row)
      let d: string
      if (x1 === x2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`
      } else {
        // Run straight down the child's lane, then curve into the parent's lane
        // right at the parent row, so unbranched through-lines stay crisp.
        const bend = Math.min(ROW_H * 0.6, (y2 - y1) * 0.5)
        d = `M ${x1} ${y1} L ${x1} ${y2 - bend} C ${x1} ${y2} ${x2} ${y2 - bend} ${x2} ${y2}`
      }
      edges.push({ id: `${commit.hash}-${parent}`, d, color, dashed: false })
    }
  }

  return { placed, edges, laneCount }
}
