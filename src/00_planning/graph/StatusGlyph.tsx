import { stageConfig, STAGE_PATH_LENGTH } from './stages'
import type { NodeStage } from './types'

// The planning "status" as a standalone glyph, so any list row — planning
// nodes, git files, workspace/research files — can show a node's sprint stage
// the same way. Drawn as the exact same stroked/dashed/filled SVG circle a
// graph node uses for its stage ring (see GraphCanvas's circleStyle), just at
// icon scale, so a status reads identically whether it's a dot on the graph
// canvas or a glyph in a list row — one status-icon language, not two.
// 'proposed' is the universal default: an item with no stage set still reads as
// proposed (a simple ink ring), so this always renders something.
//
// The default size matches the card's STATUS toggle (see PlanningView's
// StageToggle), so the mark is the same size everywhere it appears in the
// chrome — planning NODES rows, the Workspace file tree, Source Control — and
// reads as a quiet status dot at the end of a row rather than an icon
// competing with the row's own type icon.
export function StatusGlyph({ stage, size = 11, title }: { stage?: NodeStage | null; size?: number; title?: string }) {
  const st = stageConfig(stage ?? 'proposed')
  if (!st) return null
  const strokeWidth = st.fill === 'solid' ? 0 : st.strokeWidth
  const c = size / 2
  const r = Math.max(0, c - strokeWidth / 2 - 0.5)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <title>{title ?? st.label}</title>
      <circle
        cx={c}
        cy={c}
        r={r}
        fill={st.fill === 'solid' ? st.color : 'none'}
        stroke={st.color}
        strokeWidth={strokeWidth}
        strokeDasharray={st.dash}
        pathLength={st.dash ? STAGE_PATH_LENGTH : undefined}
      />
      {st.centerDot && <circle cx={c} cy={c} r={size * 0.16} fill={st.color} />}
    </svg>
  )
}
