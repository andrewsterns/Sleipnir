// The layers panel's sections: the board's top-level layers by the plane each
// stands on (src/canvas/LAYOUT.md — the left panel lists what's in the scene).

import type { CanvasDoc, CanvasNode } from '../../document/types'
import type { DefaultPlane } from '../../document/objects'

/** A section of the layers panel: the sketches standing on one plane, or on faces, or placed freely. */
export interface PlaneGroup {
  id: string
  label: string
  plane?: DefaultPlane
  nodes: CanvasNode[]
}

/**
 * The board's top-level layers by the plane each stands on: Front, Top and
 * Side always (a layer never placed is on Front, facing the board), then
 * sketches on faces and ones placed freely, when there are any. A sketch
 * offset from a default plane belongs with that plane.
 */
export function planeGroupsOf(doc: CanvasDoc): PlaneGroup[] {
  const groups: PlaneGroup[] = [
    { id: 'front', label: 'Front', plane: 'front', nodes: [] },
    { id: 'top', label: 'Top', plane: 'top', nodes: [] },
    { id: 'side', label: 'Side', plane: 'side', nodes: [] },
    { id: 'faces', label: 'On faces', nodes: [] },
    { id: 'free', label: 'Placed freely', nodes: [] },
  ]
  const byId = new Map(groups.map((g) => [g.id, g]))
  for (const node of doc.nodes) {
    let ref = node.sketch?.plane
    while (ref?.kind === 'offset') ref = ref.from
    const id = ref?.kind === 'default' ? ref.plane : ref?.kind === 'face' ? 'faces' : ref?.kind === 'custom' || node.space ? 'free' : 'front'
    byId.get(id)!.nodes.push(node)
  }
  return groups.filter((g) => g.plane || g.nodes.length)
}
