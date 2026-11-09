// The toolbox's registry (src/canvas/LAYOUT.md): every tool that draws or
// shapes, grouped by what it acts on, defined once so the 2D board and the 3D
// view show the same tools under the same names. CanvasToolbar draws it.

import type { IconName } from '../../app/UIKit/Icon/Icon'
import type { CanvasTool, ShapeTool } from '../boardEditing'
import type { GizmoMode } from '../../modeling/viewport/Viewport3D.ViewModel'
import type { StarterShape } from '../../modeling/scene3d/starterShapes'
import { findNode } from '../../document/doc'
import { isTextNode, isVectorNode, type CanvasDoc, type CanvasNode, type NodeId } from '../../document/types'

export type ToolboxView = '2d' | '3d'

export interface ToolDef {
  id: CanvasTool
  /** Icon from the shared library, or a letter when no glyph fits better. */
  icon?: IconName
  label?: string
  hint: string
}

// ── Select and draw (2D) ───────────────────────────────────────────────────

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

// ── Shape (3D): solids from sketches ───────────────────────────────────────

export type SolidTool = 'extrude' | 'revolve' | 'sweep' | 'loft'

export const SOLID_TOOLS: { id: SolidTool; icon: IconName; name: string; hint: string }[] = [
  { id: 'extrude', icon: 'extrude', name: 'Extrude', hint: 'Extrude — push the selected shape out of its plane; with a face picked, grow that face (E)' },
  { id: 'revolve', icon: 'revolve', name: 'Revolve', hint: 'Revolve — spin the selected shape about its middle' },
  { id: 'sweep', icon: 'sweep', name: 'Sweep', hint: 'Sweep — carry a shape along a path (select both)' },
  { id: 'loft', icon: 'loft', name: 'Loft', hint: 'Loft — a skin through several shapes' },
]

export interface SolidToolState {
  enabled: boolean
  /** Why it can't be used right now — shown in place of the hint. */
  why?: string
}

const hasOutline = (node: CanvasNode | null): node is CanvasNode => !!node && !isTextNode(node) && node.rect.w > 0 && node.rect.h > 0

/** For Sweep: of two selected layers, the path (a vector, an open one first) and the profile it carries. */
export function sweepPair(doc: CanvasDoc, selectedIds: ReadonlySet<NodeId>): { profile: NodeId; path: NodeId } | null {
  const nodes = [...selectedIds].map((id) => findNode(doc, id))
  if (nodes.length !== 2 || !nodes.every(hasOutline)) return null
  const [a, b] = nodes as CanvasNode[]
  const openPath = (n: CanvasNode) => isVectorNode(n) && n.shape === 'path' && !n.closed
  const path = openPath(a) ? a : openPath(b) ? b : isVectorNode(b) ? b : isVectorNode(a) ? a : null
  if (!path) return null
  return { path: path.id, profile: (path === a ? b : a).id }
}

/** Which shaping tools can act on the selection, and why not when one can't. */
export function solidToolStates(doc: CanvasDoc | null, selectedIds: ReadonlySet<NodeId>): Record<SolidTool, SolidToolState> {
  const one = doc && selectedIds.size === 1 ? findNode(doc, [...selectedIds][0]) : null
  const single: SolidToolState = hasOutline(one) ? { enabled: true } : { enabled: false, why: 'Select one shape first' }
  return {
    extrude: single,
    revolve: single,
    sweep: doc && sweepPair(doc, selectedIds) ? { enabled: true } : { enabled: false, why: 'Select a shape and the path to sweep it along' },
    loft: { enabled: false, why: "Lofts aren't built yet" },
  }
}

// ── Starter shapes (3D) ────────────────────────────────────────────────────

export const STARTER_SHAPES: { id: StarterShape; icon: IconName; name: string; hint: string }[] = [
  { id: 'box', icon: 'box', name: 'Box', hint: 'Box — a square on the Top plane, extruded' },
  { id: 'cylinder', icon: 'cylinder', name: 'Cylinder', hint: 'Cylinder — a circle on the Top plane, extruded' },
  { id: 'sphere', icon: 'sphere', name: 'Sphere', hint: 'Sphere — a circle on the Front plane, revolved' },
  { id: 'cone', icon: 'cone', name: 'Cone', hint: 'Cone — a triangle on the Front plane, revolved' },
  { id: 'torus', icon: 'torus', name: 'Torus', hint: 'Torus — a circle off the axis, revolved' },
  { id: 'polygon', icon: 'prism', name: 'Polygon', hint: 'Polygon — a hexagon on the Top plane, extruded; set its sides on its shape in the right panel' },
]

// ── Transform (3D) ─────────────────────────────────────────────────────────

export const TRANSFORM_TOOLS: { id: GizmoMode; icon: IconName; hint: string }[] = [
  { id: 'translate', icon: 'move', hint: 'Move handles on the selection (or G, then move the mouse)' },
  { id: 'rotate', icon: 'rotate', hint: 'Rotate handles on the selection (or R)' },
  { id: 'scale', icon: 'scale', hint: 'Scale handles on the selection (or S)' },
]
