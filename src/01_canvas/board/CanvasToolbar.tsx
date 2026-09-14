// The tool picker: a floating pill centered over the board, near the bottom —
// Figma's placement, and close to where the cursor already is.
//
// Lives in the board's screen-space chrome layer, so it never scales with the
// camera. Its container is pointer-events:none and only the pill itself opts
// back in, so the toolbar never swallows a click meant for the board beneath it.

import { Icon, type IconName } from '../../app/UIKit/Icon/Icon'
import type { CanvasTool } from '../CanvasView.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface ToolDef {
  id: CanvasTool
  /** Icon from the shared library, or a letter when no glyph fits better. */
  icon?: IconName
  label?: string
  hint: string
}

export const CANVAS_TOOLS: ToolDef[] = [
  { id: 'select', icon: 'cursor', hint: 'Select (V)' },
  { id: 'frame', icon: 'frame', hint: 'Frame (F)' },
  // "T" is the universal text-tool glyph (Figma uses it too), and the icon set
  // has no text mark — a letter reads better here than a stand-in.
  { id: 'text', label: 'T', hint: 'Text (T)' },
]

export interface CanvasToolbarProps {
  tool: CanvasTool
  onSelectTool: (tool: CanvasTool) => void
}

export function CanvasToolbar({ tool, onSelectTool }: CanvasToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 20,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div
        data-canvas-toolbar=""
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
        {CANVAS_TOOLS.map((t) => {
          const active = tool === t.id
          return (
            <button
              key={t.id}
              type="button"
              title={t.hint}
              // Keeps a click on the toolbar from reaching the board's own
              // pointerdown, which would start a marquee or a draw behind it.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelectTool(t.id)}
              style={{
                ...MONO,
                fontSize: 11,
                width: 30,
                height: 30,
                display: 'grid',
                placeItems: 'center',
                background: active ? 'var(--bg-3)' : 'transparent',
                border: `1px solid ${active ? 'var(--border-1)' : 'transparent'}`,
                borderRadius: 6,
                color: active ? 'var(--text-1)' : 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              {t.icon ? <Icon name={t.icon} size={16} /> : t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
