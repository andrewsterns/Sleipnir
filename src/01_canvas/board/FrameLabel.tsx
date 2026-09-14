// The name chip above a top-level frame — Figma's artboard label.
//
// It exists because of the selection rule, not as decoration. A top-level frame
// is an artboard, so a click reaches straight to its contents (see doc.ts's
// pickForScope). That is what makes designing inside a frame bearable, but it
// also means a frame whose children cover it edge to edge has no background left
// to click. Figma's answer is the label, and this is that label: press it to
// select the frame, drag it to move the frame and everything in it.
//
// Lives in the board's SCREEN-space chrome layer, like ComponentLabel, so it
// stays legible at any zoom and is never clipped by a frame's own clipContent.

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface FrameLabelProps {
  name: string
  /** Screen-space position of the frame's top-left corner. */
  x: number
  y: number
  selected: boolean
  /** Selects the frame and begins a move drag on it. */
  onPointerDown: (e: React.PointerEvent) => void
}

export function FrameLabel({ name, x, y, selected, onPointerDown }: FrameLabelProps) {
  return (
    <button
      type="button"
      data-canvas-frame-label={name}
      onPointerDown={onPointerDown}
      title={`${name} — click to select the frame, drag to move it`}
      style={{
        ...MONO,
        position: 'absolute',
        left: x,
        // Clears the label's own height so it sits on the frame's top edge
        // without overlapping the first thing inside it.
        top: y - 16,
        maxWidth: 240,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 9,
        lineHeight: 1,
        padding: '3px 2px',
        background: 'transparent',
        border: 'none',
        color: selected ? 'var(--accent, #6fa8dc)' : 'var(--text-3)',
        // The chrome layer is inert; this is one of the few things in it that
        // must actually take a pointer.
        pointerEvents: 'auto',
        cursor: 'move',
        touchAction: 'none',
      }}
    >
      {name}
    </button>
  )
}
