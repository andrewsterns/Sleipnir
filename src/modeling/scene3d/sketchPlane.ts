// Sketching across planes. Drawing one object as Front, Top and Side views only
// works if the views line up — a point at some X in the front view is at the
// same X in the top view. So while a placed layer's plane is open face on
// (scene3d/planeEdit.ts), every anchor of the other placed layers is projected
// onto it and drawn on the 2D board as guide lines through that point: the
// blueprint construction lines a drafter draws by hand between views.

import type { Guide } from '../../document/align'
import type { CanvasDoc, CanvasNode, CanvasRect, NodeId } from '../../document/types'
import { childrenOf } from '../../document/types'
import { guidePolyline } from '../../document/pathGuide'
import { placementOf, planeToWorld, worldToPlane } from '../../document/placement'

// More lines than this is noise, not guidance.
const MAX_GUIDES = 240
// How far past the selected layer's edges a guide reaches, in board px.
const OVERHANG = 24

/**
 * The guide lines to draw on `target`'s 2D sketch: one vertical and one
 * horizontal line through each anchor of every other top-level layer that has
 * been placed in 3D, projected onto `target`'s plane. Board coordinates.
 * `rectOf` gives where each layer really sits on the board.
 */
export function planeGuides(doc: CanvasDoc, target: NodeId, rectOf: (id: NodeId) => CanvasRect | null): Guide[] {
  const self = doc.nodes.find((n) => n.id === target)
  const selfRect = self ? rectOf(self.id) : null
  if (!self || !selfRect) return []
  const into = placementOf(self)
  const seen = new Set<string>()
  const guides: Guide[] = []
  const add = (axis: 'x' | 'y', at: number) => {
    const key = `${axis}:${Math.round(at * 2) / 2}`
    if (seen.has(key) || guides.length >= MAX_GUIDES) return
    seen.add(key)
    const [start, end] = axis === 'x' ? [selfRect.y - OVERHANG, selfRect.y + selfRect.h + OVERHANG] : [selfRect.x - OVERHANG, selfRect.x + selfRect.w + OVERHANG]
    guides.push({ axis, position: at, start, end })
  }

  for (const other of doc.nodes) {
    if (other.id === target || other.hidden || !other.space) continue
    const otherRect = rectOf(other.id)
    if (!otherRect) continue
    const from = placementOf(other)
    for (const [bx, by] of anchorsOf(other, rectOf)) {
      // The anchor on the other layer's plane → space → this layer's plane.
      const world = planeToWorld(from, bx - otherRect.x, by - otherRect.y)
      const { u, v } = worldToPlane(into, world)
      add('x', selfRect.x + u)
      add('y', selfRect.y + v)
    }
  }
  return guides
}

/** Every anchor of a layer and its descendants, in board coordinates: a path's points, any other layer's corners. */
function anchorsOf(node: CanvasNode, rectOf: (id: NodeId) => CanvasRect | null): [number, number][] {
  const out: [number, number][] = []
  const visit = (n: CanvasNode) => {
    if (n.hidden) return
    const r = rectOf(n.id)
    if (!r) return
    if (n.kind === 'vector' && n.shape === 'path') {
      // guidePolyline places the path in its parent's space; shift it to the board.
      const { points } = guidePolyline(n)
      for (const p of points) out.push([r.x + (p.x - n.rect.x), r.y + (p.y - n.rect.y)])
    } else {
      out.push([r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h])
    }
    for (const c of childrenOf(n)) visit(c)
  }
  visit(node)
  return out
}
