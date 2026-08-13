import { stageConfig } from './stages'
import type { NodeStage } from './types'

const MONO_FONT = 'var(--font-mono)'

// The planning "status" as a standalone glyph, so any list row — planning
// nodes, git files, workspace/research files — can show a node's sprint stage
// the same way: the exact glyph + colour from graph/stages.ts (● ○ ◐ ◑ ⊘ ●).
// 'proposed' is the universal default: an item with no stage set still reads as
// proposed (a simple ink circle), so this always renders something.
export function StatusGlyph({ stage, size = 13, title }: { stage?: NodeStage | null; size?: number; title?: string }) {
  const st = stageConfig(stage ?? 'proposed')
  if (!st) return null
  return (
    <span title={title ?? st.label} style={{ fontSize: size, lineHeight: 1, color: st.color, fontFamily: MONO_FONT, flexShrink: 0 }}>
      {st.glyph}
    </span>
  )
}
