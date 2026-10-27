// The tool picker: a floating pill centered over the board, near the bottom —
// Figma's placement, and close to where the cursor already is.
//
// Lives in the board's screen-space chrome layer, so it never scales with the
// camera. Its container is pointer-events:none and only the pill itself opts
// back in, so the toolbar never swallows a click meant for the board beneath it.
//
// The shape tools share one slot, as in Figma: the button is the last shape
// used, and its chevron opens the menu of the others.

import { useEffect, useState } from 'react'
import { Icon, type IconName } from '../../app/UIKit/Icon/Icon'
import { isShapeTool, type CanvasTool, type ShapeTool } from '../CanvasView.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface ToolDef {
  id: CanvasTool
  /** Icon from the shared library, or a letter when no glyph fits better. */
  icon?: IconName
  label?: string
  hint: string
}

export const SHAPE_TOOL_DEFS: (ToolDef & { id: ShapeTool; name: string })[] = [
  { id: 'rectangle', icon: 'shape-rectangle', name: 'Rectangle', hint: 'Rectangle (R) — Shift: square · Alt: from center' },
  { id: 'ellipse', icon: 'shape-ellipse', name: 'Ellipse', hint: 'Ellipse (O) — Shift: circle · Alt: from center' },
  { id: 'polygon', icon: 'shape-triangle', name: 'Triangle', hint: 'Triangle — Shift: equal sides · Alt: from center' },
]

export const CANVAS_TOOLS: ToolDef[] = [
  { id: 'select', icon: 'cursor', hint: 'Select (V)' },
  { id: 'frame', icon: 'frame', hint: 'Frame (F) — Shift: square · Alt: from center' },
  ...SHAPE_TOOL_DEFS,
  {
    id: 'pen',
    icon: 'pen',
    hint: 'Pen (P) — click for corners, drag for curves, click the first point to close · Shift: 45° · Alt: break the handle · Backspace: undo a point · Enter: finish',
  },
  // "T" is the universal text-tool glyph (Figma uses it too), and the icon set
  // has no text mark — a letter reads better here than a stand-in.
  { id: 'text', label: 'T', hint: 'Text (T)' },
]

export interface CanvasToolbarProps {
  tool: CanvasTool
  onSelectTool: (tool: CanvasTool) => void
}

function toolButtonStyle(active: boolean, width = 30): React.CSSProperties {
  return {
    ...MONO,
    fontSize: 11,
    width,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    background: active ? 'var(--bg-3)' : 'transparent',
    border: `1px solid ${active ? 'var(--border-1)' : 'transparent'}`,
    borderRadius: 6,
    color: active ? 'var(--text-1)' : 'var(--text-2)',
    cursor: 'pointer',
    padding: 0,
  }
}

// Keeps a click on the toolbar from reaching the board's own pointerdown,
// which would start a marquee or a draw behind it.
const stop = (e: React.PointerEvent) => e.stopPropagation()

function ToolButton({ def, active, onSelect }: { def: ToolDef; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" title={def.hint} onPointerDown={stop} onClick={onSelect} style={toolButtonStyle(active)}>
      {def.icon ? <Icon name={def.icon} size={16} /> : def.label}
    </button>
  )
}

export function CanvasToolbar({ tool, onSelectTool }: CanvasToolbarProps) {
  const [lastShape, setLastShape] = useState<ShapeTool>('rectangle')
  const [menuOpen, setMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    if (isShapeTool(tool)) setLastShape(tool)
  }, [tool])

  const shape = SHAPE_TOOL_DEFS.find((t) => t.id === lastShape)!
  const byId = (id: CanvasTool) => CANVAS_TOOLS.find((t) => t.id === id)!

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
          position: 'relative',
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
        {(['select', 'frame'] as const).map((id) => (
          <ToolButton key={id} def={byId(id)} active={tool === id} onSelect={() => onSelectTool(id)} />
        ))}

        {/* The shape slot: the last shape used, plus the menu of all of them. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ToolButton def={shape} active={isShapeTool(tool)} onSelect={() => onSelectTool(shape.id)} />
          <button
            type="button"
            title="Shapes"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onPointerDown={stop}
            onClick={() => setMenuOpen((open) => !open)}
            style={{ ...toolButtonStyle(menuOpen, 14), border: '1px solid transparent' }}
          >
            <Icon name="chevron-down" size={12} />
          </button>
        </div>
        {menuOpen && (
          <div
            role="menu"
            onPointerDown={stop}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: 64,
              minWidth: 150,
              padding: 4,
              background: 'var(--bg-1)',
              border: '1px solid var(--border-1)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {SHAPE_TOOL_DEFS.map((def) => {
              const active = tool === def.id
              const key = def.hint.match(/\((\w)\)/)?.[1]
              return (
                <button
                  key={def.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectTool(def.id)
                    setMenuOpen(false)
                  }}
                  style={{
                    ...MONO,
                    fontSize: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: active ? 'var(--bg-3)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon name={def.icon!} size={14} />
                  <span style={{ flex: 1 }}>{def.name}</span>
                  {key && <span style={{ color: 'var(--text-3)' }}>{key}</span>}
                </button>
              )
            })}
          </div>
        )}

        {(['pen', 'text'] as const).map((id) => (
          <ToolButton key={id} def={byId(id)} active={tool === id} onSelect={() => onSelectTool(id)} />
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border-1)', margin: '0 2px' }} />
        <button
          type="button"
          title="Keyboard shortcuts"
          aria-expanded={helpOpen}
          onPointerDown={stop}
          onClick={() => {
            setHelpOpen((open) => !open)
            setMenuOpen(false)
          }}
          style={toolButtonStyle(helpOpen, 24)}
        >
          ?
        </button>
        {helpOpen && <ShortcutSheet />}
      </div>
    </div>
  )
}

/** Every modifier the canvas honours, where someone can find them — they're invisible otherwise. */
const SHORTCUTS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'TOOLS',
    rows: [['V', 'Select'], ['F', 'Frame'], ['R', 'Rectangle'], ['O', 'Ellipse'], ['P', 'Pen'], ['T', 'Text']],
  },
  {
    group: 'DRAW & RESIZE',
    rows: [['Shift', 'Square / keep proportions'], ['Alt', 'From the center']],
  },
  {
    group: 'MOVE',
    rows: [['Shift', 'Lock to an axis'], ['Alt + drag', 'Duplicate'], ['Ctrl', 'Ignore snapping'], ['Arrows', 'Nudge (Shift: 10px)']],
  },
  {
    group: 'PEN',
    rows: [['Shift', '45° angles'], ['Alt + drag', 'Break the handle'], ['Backspace', 'Remove last point'], ['Enter / Esc', 'Finish']],
  },
  {
    group: 'EDIT POINTS',
    rows: [
      ['Double-click', 'Edit a shape’s points'],
      ['Shift + click', 'Add to selection'],
      ['Drag empty', 'Box-select anchors'],
      ['Ctrl + click outline', 'Add a point (a dot shows where)'],
      ['Ctrl + click anchor', 'Sharp ↔ smooth'],
      ['Click handle, Delete', 'Make that side sharp'],
      ['Alt + drag handle', 'Break the pair'],
      ['Shift + drag', 'Lock to an axis / 45°'],
      ['Delete', 'Remove selected'],
      ['Ctrl + A', 'Select all'],
      ['Esc', 'Deselect, then finish'],
    ],
  },
  {
    group: 'EDIT',
    rows: [['Ctrl + Z', 'Undo (Shift: redo)'], ['Ctrl + D', 'Duplicate'], ['Ctrl + G', 'Group (Shift: ungroup)'], ['Delete', 'Delete']],
  },
]

function ShortcutSheet() {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onPointerDown={stop}
      style={{
        ...MONO,
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        right: 0,
        width: 300,
        maxHeight: 420,
        overflowY: 'auto',
        padding: 10,
        background: 'var(--bg-1)',
        border: '1px solid var(--border-1)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {SHORTCUTS.map((section) => (
        <div key={section.group} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)' }}>{section.group}</span>
          {section.rows.map(([keys, action]) => (
            <div key={keys + action} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
              <span style={{ color: 'var(--text-2)' }}>{action}</span>
              <span style={{ color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{keys}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
