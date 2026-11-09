// The tool picker: a floating pill centered over the board, near the bottom —
// Figma's placement, and close to where the cursor already is.
//
// Lives in the board's screen-space chrome layer, so it never scales with the
// camera. Its container is pointer-events:none and only the pill itself opts
// back in, so the toolbar never swallows a click meant for the board beneath it.
//
// The shape tools share one slot, as in Figma: the button is the last shape
// used, and its chevron opens the menu of the others.

import { useEffect, useRef, useState } from 'react'
import { ContextMenu, type ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import { Icon, type IconName } from '../../app/UIKit/Icon/Icon'
import { isShapeTool, type CanvasTool, type ShapeTool } from '../boardEditing'
import { CANVAS_TOOLS, SHAPE_TOOL_DEFS, SOLID_TOOLS, STARTER_SHAPES, TRANSFORM_TOOLS, type SolidTool, type SolidToolState, type ToolDef, type ToolboxView } from './toolbox'
import type { StarterShape } from '../../modeling/scene3d/starterShapes'
import type { GizmoMode } from '../../modeling/viewport/Viewport3D.ViewModel'
import type { SelectMode } from '../../modeling/viewport/selectionModes'

const SELECT_MODES: { id: SelectMode; icon: IconName; name: string; key: string }[] = [
  { id: 'object', icon: 'click', name: 'Objects', key: 'Tab' },
  { id: 'vertex', icon: 'select-vertex', name: 'Points', key: '1' },
  { id: 'edge', icon: 'select-edge', name: 'Edges', key: '2' },
  { id: 'face', icon: 'select-face', name: 'Faces', key: '3' },
]

export { CANVAS_TOOLS, SHAPE_TOOL_DEFS, type ToolDef } from './toolbox'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

export interface CanvasToolbarProps {
  tool: CanvasTool
  onSelectTool: (tool: CanvasTool) => void
  /** Which view it's over: 2D shows the drawing tools, 3D the transforms. Both show the shaping tools and starter shapes. */
  view?: ToolboxView
  /** The 3D groups: shaping the selection, and — outside sketch mode — starter shapes. */
  modeling?: {
    states: Record<SolidTool, SolidToolState>
    onSolid: (tool: SolidTool) => void
    onStarter?: (shape: StarterShape) => void
  }
  /** An environment's first tool, Sketch: + Sketch's choices (a plane, a face, from a sketch). */
  sketchMenu?: ContextMenuItem[]
  /** 3D: what Select picks — whole layers, or the parts' points, edges or faces (Tab, 1 / 2 / 3). */
  selectModes?: { mode: SelectMode; onMode: (mode: SelectMode) => void }
  /** 2D: Edit points on the selected shape (Enter, or double-click it). Absent when nothing editable is selected. */
  editPoints?: { active: boolean; onToggle: () => void }
  /** 3D only: which handles the gizmo shows. */
  transform?: { mode: GizmoMode; onMode: (mode: GizmoMode) => void }
}

/**
 * A slot holding a group of one-shot tools: the button is the last one used,
 * its chevron opens the rest — the shape slot's pattern, for the 3D groups.
 */
function ActionSlot<T extends string>({
  label,
  items,
  enabled,
  onPick,
}: {
  label: string
  items: { id: T; icon: IconName; name: string; hint: string }[]
  /** Which items can act right now, and why not; all of them when absent. */
  enabled?: (id: T) => SolidToolState
  onPick: (id: T) => void
}) {
  const [last, setLast] = useState<T>(items[0].id)
  const [open, setOpen] = useState(false)
  const current = items.find((i) => i.id === last) ?? items[0]
  const state = (id: T) => enabled?.(id) ?? { enabled: true }
  const pick = (id: T) => {
    if (!state(id).enabled) return
    setLast(id)
    setOpen(false)
    onPick(id)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        title={state(current.id).enabled ? current.hint : `${current.name} — ${state(current.id).why}`}
        aria-disabled={!state(current.id).enabled}
        onPointerDown={stop}
        onClick={() => pick(current.id)}
        style={{ ...toolButtonStyle(false), opacity: state(current.id).enabled ? 1 : 0.45 }}
      >
        <Icon name={current.icon} size={16} />
      </button>
      <button
        type="button"
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={stop}
        onClick={() => setOpen((o) => !o)}
        style={{ ...toolButtonStyle(open, 14), border: '1px solid transparent' }}
      >
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div
          role="menu"
          data-canvas-toolbox-menu={label}
          onPointerDown={stop}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 10px)',
            left: 0,
            minWidth: 190,
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
          {items.map((item) => {
            const s = state(item.id)
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-disabled={!s.enabled}
                title={s.enabled ? item.hint : s.why}
                onClick={() => pick(item.id)}
                style={{
                  ...UI_FONT,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: s.enabled ? 'var(--text-1)' : 'var(--text-3)',
                  cursor: s.enabled ? 'pointer' : 'default',
                  textAlign: 'left',
                }}
              >
                <Icon name={item.icon} size={14} />
                <span style={{ flex: 1 }}>{item.name}</span>
                {!s.enabled && <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{s.why}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Divider = () => <div style={{ width: 1, height: 18, background: 'var(--border-1)', margin: '0 2px' }} />

function toolButtonStyle(active: boolean, width = 30): React.CSSProperties {
  return {
    ...UI_FONT,
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

export function CanvasToolbar({ tool, onSelectTool, view = '2d', modeling, transform, sketchMenu, selectModes, editPoints }: CanvasToolbarProps) {
  const [lastShape, setLastShape] = useState<ShapeTool>('rectangle')
  const sketchButton = useRef<HTMLButtonElement>(null)
  const [sketchAt, setSketchAt] = useState<{ x: number; y: number } | null>(null)
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
        {(view === '3d' ? (['select'] as const) : (['select', 'frame'] as const)).map((id) => (
          <ToolButton key={id} def={byId(id)} active={view === '3d' || tool === id} onSelect={() => onSelectTool(id)} />
        ))}

        {/* 3D: what Select picks, beside it — objects, or (edit mode) points, edges, faces. */}
        {view === '3d' && selectModes && (
          <div role="group" aria-label="Select mode" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {SELECT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                title={`${m.name} (${m.key})`}
                aria-pressed={selectModes.mode === m.id}
                onPointerDown={stop}
                onClick={() => selectModes.onMode(m.id)}
                style={toolButtonStyle(selectModes.mode === m.id, 26)}
              >
                <Icon name={m.icon} size={14} />
              </button>
            ))}
          </div>
        )}

        {/* An environment's first tool: a new sketch — on a plane, a face, or from a Sketch document. */}
        {view === '3d' && sketchMenu && (
          <>
            <button
              ref={sketchButton}
              type="button"
              title="Sketch — on a plane, a face, or placed from a sketch"
              aria-haspopup="menu"
              aria-expanded={!!sketchAt}
              onPointerDown={stop}
              onClick={() => {
                const r = sketchButton.current?.getBoundingClientRect()
                // Above the toolbox, which sits at the bottom of the view.
                if (r) setSketchAt(sketchAt ? null : { x: r.left, y: r.top - 8 - 30 * sketchMenu.length })
              }}
              style={toolButtonStyle(!!sketchAt)}
            >
              <Icon name="pen" size={16} />
            </button>
            {sketchAt && <ContextMenu x={sketchAt.x} y={sketchAt.y} anchorEl={sketchButton.current} items={sketchMenu} onClose={() => setSketchAt(null)} />}
          </>
        )}

        {view === '2d' && (
        <>

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
                    ...UI_FONT,
                    fontSize: 11,
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
        {/* Edit points: the selected shape's anchors, the toolbox's way in (Enter or a double-click also work). */}
        {editPoints && (
          <button
            type="button"
            title={editPoints.active ? 'Done editing points (Enter)' : 'Edit points (Enter)'}
            aria-pressed={editPoints.active}
            onPointerDown={stop}
            onClick={editPoints.onToggle}
            style={toolButtonStyle(editPoints.active)}
          >
            <Icon name="select-vertex" size={16} />
          </button>
        )}
        </>
        )}

        {modeling && (
          <>
            <Divider />
            <ActionSlot label="Shape tools" items={SOLID_TOOLS} enabled={(id) => modeling.states[id]} onPick={modeling.onSolid} />
            {modeling.onStarter && <ActionSlot label="Starter shapes" items={STARTER_SHAPES} onPick={modeling.onStarter} />}
          </>
        )}

        {view === '3d' && transform && (
          <>
            <Divider />
            {TRANSFORM_TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                aria-pressed={transform.mode === t.id}
                onPointerDown={stop}
                onClick={() => transform.onMode(t.id)}
                style={toolButtonStyle(transform.mode === t.id)}
              >
                <Icon name={t.icon} size={16} />
              </button>
            ))}
          </>
        )}

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
        {helpOpen && <ShortcutSheet groups={view === '3d' ? ENVIRONMENT_SHORTCUTS : SHORTCUTS} />}
      </div>
    </div>
  )
}

/** Every modifier the canvas honours, where someone can find them — they're invisible otherwise. */
const SHORTCUTS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'Tools',
    rows: [['V', 'Select'], ['F', 'Frame'], ['R', 'Rectangle'], ['O', 'Ellipse'], ['P', 'Pen'], ['T', 'Text']],
  },
  {
    group: 'Draw & resize',
    rows: [['Shift', 'Square / keep proportions'], ['Alt', 'From the center']],
  },
  {
    group: 'Move',
    rows: [['Shift', 'Lock to an axis'], ['Alt + drag', 'Duplicate'], ['Ctrl', 'Ignore snapping'], ['Arrows', 'Nudge (Shift: 10px)']],
  },
  {
    group: 'Pen',
    rows: [['Shift', '45° angles'], ['Alt + drag', 'Break the handle'], ['Backspace', 'Remove last point'], ['Enter / Esc', 'Finish']],
  },
  {
    group: 'Edit points',
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
    group: 'Edit',
    rows: [['Ctrl + Z', 'Undo (Shift: redo)'], ['Ctrl + D', 'Duplicate'], ['Ctrl + G', 'Group (Shift: ungroup)'], ['Delete', 'Delete']],
  },
]

/** An environment's keys — Blender's, so R is rotate here and never Rectangle. */
const ENVIRONMENT_SHORTCUTS: { group: string; rows: [string, string][] }[] = [
  { group: 'Tools', rows: [['V', 'Select']] },
  {
    group: 'Move',
    rows: [
      ['G / R / S', 'Grab, rotate, scale what’s selected'],
      ['X / Y / Z', 'Lock to an axis (again: free)'],
      ['Type a number', 'Exact meters, degrees or times'],
      ['Ctrl', 'Snap'],
      ['Enter or click', 'Keep'],
      ['Esc or right-click', 'Put back'],
      ['G on one face', 'Push or pull it'],
      ['E on one face', 'Extrude new material from it'],
    ],
  },
  { group: 'View', rows: [['Drag', 'Orbit'], ['Space + drag', 'Pan'], ['Scroll', 'Up and down'], ['Ctrl + scroll', 'Zoom'], ['Ctrl + 1', 'Fit everything']] },
  { group: 'Views', rows: [['Click an axis', 'Look straight down it'], ['Click the middle', 'Back to perspective']] },
  { group: 'Edit mode', rows: [['Tab', 'Object ↔ edit mode'], ['1 / 2 / 3', 'Points / edges / faces'], ['Shift + click', 'Add to the pick'], ['A', 'Pick all'], ['Alt + A', 'Pick none'], ['B', 'Box select']] },
  { group: 'Sketches', rows: [['Enter', 'Edit the selected sketch'], ['Esc', 'Finish sketch / stop picking']] },
  { group: 'Edit', rows: [['Ctrl + Z', 'Undo (Shift: redo)'], ['Delete', 'Delete']] },
]

function ShortcutSheet({ groups }: { groups: { group: string; rows: [string, string][] }[] }) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onPointerDown={stop}
      style={{
        ...UI_FONT,
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
      {groups.map((section) => (
        <div key={section.group} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)' }}>{section.group}</span>
          {section.rows.map(([keys, action]) => (
            <div key={keys + action} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--text-2)' }}>{action}</span>
              <span style={{ color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{keys}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
