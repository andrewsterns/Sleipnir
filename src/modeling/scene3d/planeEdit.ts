// Plane edit: drawing on a layer placed in 3D, face on. The 2D board is the
// front view, so a sketch on the Top or Side plane is edge-on there and can't
// be drawn on. Plane edit shows the board a view of the document holding just
// that layer, flat and straight-on where its plane's origin projects, and
// merges whatever the board does to that view back into the real document.
//
// The real document is what's saved, undone, and shown in 3D; only the board
// works on the view.

import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { frontPoint } from '../../document/frontView'
import { planeToWorld } from '../../document/placement'
import type { Vec3 } from '../../document/sceneTypes'

/** The layer plane edit can open: a top-level layer placed in 3D. */
export function planeEditTarget(doc: CanvasDoc | null, id: NodeId | null): (CanvasNode & { space: NonNullable<CanvasNode['space']> }) | null {
  const node = id ? doc?.nodes.find((n) => n.id === id) : undefined
  return node?.space ? (node as CanvasNode & { space: NonNullable<CanvasNode['space']> }) : null
}

/** What the board shows while editing `id` on its plane: that layer alone, without its placement. */
export function planeEditView(doc: CanvasDoc | null, id: NodeId | null): CanvasDoc | null {
  const target = planeEditTarget(doc, id)
  if (!doc || !target) return doc
  const { space: _space, ...flat } = target
  return { ...doc, nodes: [flat] }
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000
const px = (n: number) => Math.round(n * 1000) / 1000

/**
 * `next` — the board's edit of planeEditView(doc, id) — merged back into the
 * real document. The edited layer gets its placement back; moving or resizing
 * it face on moves its plane along itself in 3D (depth included), so the
 * plane stays where it is in the scene. New top-level layers (a paste, a
 * frame drawn beside it) land next to it, and deleting it removes it.
 */
export function mergePlaneEdit(doc: CanvasDoc, next: CanvasDoc, id: NodeId): CanvasDoc {
  const target = planeEditTarget(doc, id)
  if (!target) return next
  const restored = next.nodes.map((node) => {
    if (node.id !== id) return node
    // Placed on purpose while editing (the inspector's plane controls) — that placement stands.
    if (node.space) return node
    const du = node.rect.x - target.rect.x
    const dv = node.rect.y - target.rect.y
    if (!du && !dv) return { ...node, space: target.space }
    const position = planeToWorld(target.space, du, dv).map(round4) as Vec3
    const at = frontPoint(position)
    // A sketch held to a plane keeps its spot in the plane's terms (scene3d/planeRefs.ts).
    const spot = target.sketch?.at ?? { u: 0, v: 0 }
    const sketch = target.sketch && target.sketch.plane.kind !== 'custom' ? { ...target.sketch, at: { u: px(spot.u + du), v: px(spot.v + dv) } } : target.sketch
    return { ...node, rect: { ...node.rect, x: px(at.x), y: px(at.y) }, space: { ...target.space, position }, ...(sketch ? { sketch } : {}) }
  })
  const nodes = doc.nodes.flatMap((node) => (node.id === id ? restored : [node]))
  return { ...next, nodes }
}
