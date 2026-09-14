// Align / distribute / group controls for the current selection.
//
// Appears only when a selection can actually use it, so the board stays quiet
// while you are drawing. Sits in the board's screen-space chrome beside the tool
// pill, with pointer-events opted back in on the pill itself.

import type { AlignMode, DistributeMode } from '../model/align'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const ALIGN_BUTTONS: { mode: AlignMode; glyph: string; hint: string }[] = [
  { mode: 'left', glyph: '⇤', hint: 'Align left' },
  { mode: 'center-x', glyph: '↔', hint: 'Align horizontal centers' },
  { mode: 'right', glyph: '⇥', hint: 'Align right' },
  { mode: 'top', glyph: '⤒', hint: 'Align top' },
  { mode: 'center-y', glyph: '↕', hint: 'Align vertical centers' },
  { mode: 'bottom', glyph: '⤓', hint: 'Align bottom' },
]

const DISTRIBUTE_BUTTONS: { mode: DistributeMode; glyph: string; hint: string }[] = [
  { mode: 'horizontal', glyph: '⇹', hint: 'Distribute horizontal spacing' },
  { mode: 'vertical', glyph: '⇳', hint: 'Distribute vertical spacing' },
]

function PillButton({
  glyph,
  hint,
  disabled,
  onClick,
}: {
  glyph: string
  hint: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        ...MONO,
        fontSize: 12,
        width: 26,
        height: 26,
        display: 'grid',
        placeItems: 'center',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 5,
        color: disabled ? 'var(--text-3)' : 'var(--text-2)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      {glyph}
    </button>
  )
}

export interface AlignToolbarProps {
  canAlign: boolean
  canDistribute: boolean
  canGroup: boolean
  canUngroup: boolean
  onAlign: (mode: AlignMode) => void
  onDistribute: (mode: DistributeMode) => void
  onGroup: () => void
  onUngroup: () => void
}

export function AlignToolbar({
  canAlign,
  canDistribute,
  canGroup,
  canUngroup,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
}: AlignToolbarProps) {
  // Nothing selected that could use any of this — stay out of the way.
  if (!canAlign && !canGroup && !canUngroup) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 12,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div
        data-canvas-align-toolbar=""
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 4,
          background: 'var(--bg-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        {ALIGN_BUTTONS.map((b) => (
          <PillButton
            key={b.mode}
            glyph={b.glyph}
            hint={b.hint}
            disabled={!canAlign}
            onClick={() => onAlign(b.mode)}
          />
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-1)', margin: '0 2px' }} />

        {DISTRIBUTE_BUTTONS.map((b) => (
          <PillButton
            key={b.mode}
            glyph={b.glyph}
            hint={b.hint}
            disabled={!canDistribute}
            onClick={() => onDistribute(b.mode)}
          />
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-1)', margin: '0 2px' }} />

        <PillButton glyph="⊞" hint="Group (Ctrl+G)" disabled={!canGroup} onClick={onGroup} />
        <PillButton glyph="⊟" hint="Ungroup (Ctrl+Shift+G)" disabled={!canUngroup} onClick={onUngroup} />
      </div>
    </div>
  )
}
