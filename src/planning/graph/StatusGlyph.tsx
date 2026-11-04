import { STAGE_PATH_LENGTH } from './stages'
import { TONE_STYLE, toneOfStage, type Tone } from './nodeTone'
import type { NodeStage } from './types'

// The planning status as a standalone glyph, so any list row — planning nodes,
// git files, workspace/research files — shows it the way the graph draws it:
// the same tone (graph/nodeTone.ts), the same ring or dot, at icon scale. One
// status-icon language, not two.
//
// Pass `tone` when it's known (the Planning list, which knows git too);
// otherwise the status alone decides, and no status reads as settled — a faint
// dot, so a list of untouched files stays quiet.
//
// The default size matches the card's STATUS toggle (see PlanningView's
// StageToggle), so the mark is the same size everywhere it appears in the
// chrome — planning NODES rows, the Workspace file tree, Source Control — and
// reads as a quiet status dot at the end of a row rather than an icon
// competing with the row's own type icon.
export function StatusGlyph({
  stage,
  tone,
  size = 11,
  title,
}: {
  stage?: NodeStage | null
  tone?: Tone
  size?: number
  title?: string
}) {
  const style = TONE_STYLE[tone ?? toneOfStage(stage)]
  const ring = style.fill === 'none'
  const strokeWidth = ring ? 1.5 : 0
  const c = size / 2
  // A dot sits a little smaller than a ring, so the two read as one size.
  const committed = (tone ?? toneOfStage(stage)) === 'committed'
  const r = ring ? Math.max(0, c - strokeWidth / 2 - 0.5) : Math.max(0, c - 1.5) * (committed ? 0.55 : 1)
  // Testing is the in-progress ring inside the corner box the graph blinks
  // around a step being tested (FocusBox.tsx), at glyph size.
  const testing = (tone ?? toneOfStage(stage)) === 'testing'
  const ringR = testing ? r * 0.55 : r
  const arm = size * 0.28
  const e = 0.75
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <title>{title ?? style.label}</title>
      {testing && (
        <path
          d={`M ${e} ${e + arm} V ${e} H ${e + arm} M ${size - e - arm} ${e} H ${size - e} V ${e + arm} M ${size - e} ${size - e - arm} V ${size - e} H ${size - e - arm} M ${e + arm} ${size - e} H ${e} V ${size - e - arm}`}
          fill="none"
          style={{ stroke: style.color }}
          strokeWidth={1}
        />
      )}
      <circle
        cx={c}
        cy={c}
        r={ringR}
        style={{ fill: ring ? 'none' : style.color, stroke: ring ? style.color : 'none' }}
        strokeWidth={strokeWidth}
        strokeDasharray={style.dash}
        pathLength={style.dash ? STAGE_PATH_LENGTH : undefined}
      />
    </svg>
  )
}
