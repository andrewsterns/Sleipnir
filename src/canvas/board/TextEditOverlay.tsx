// Typing into a text layer right on the board (double-click it). A textarea
// laid exactly over the layer — inside the camera's transformed viewport, so it
// pans and zooms with the board — with the layer's own font, while the layer's
// rendered text is hidden underneath so nothing doubles up.
//
// Every keystroke is a live edit (one undo step per typing run, via the
// ViewModel's gesture coalescing). Escape, Ctrl/Cmd+Enter or clicking away
// finishes; Enter is a new line, as it is in the text itself.

import { useEffect, useRef } from 'react'
import { textCss, toCss } from '../../document/toCss'
import type { CanvasRect, CanvasTextNode } from '../../document/types'

export function TextEditOverlay({
  node,
  rect,
  onChange,
  onDone,
}: {
  node: CanvasTextNode
  /** Where the layer is drawn, in board space (rectOf — measured under auto layout). */
  rect: CanvasRect
  onChange: (text: string) => void
  onDone: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [node.id])

  // The layer's own padding and alignment, so the caret sits on the glyphs.
  const own = toCss(node.style, { text: true })
  return (
    <>
      <style>{`[data-canvas-node="${CSS.escape(node.id)}"] > span { visibility: hidden; }`}</style>
      <textarea
        ref={ref}
        data-canvas-text-editor=""
        value={node.text}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault()
            onDone()
          }
        }}
        // The board starts drags and drills on these; inside the editor they
        // place the caret and select words instead.
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.w,
          minHeight: rect.h,
          margin: 0,
          border: 'none',
          outline: '1px solid #6fa8dc',
          background: 'transparent',
          resize: 'none',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          font: 'inherit',
          color: 'var(--text-1)',
          padding: own.padding ?? 0,
          ...textCss(node.font),
          userSelect: 'text',
          WebkitUserSelect: 'text',
          cursor: 'text',
          zIndex: 1,
        }}
      />
    </>
  )
}
