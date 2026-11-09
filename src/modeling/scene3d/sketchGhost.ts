// Sketch mode's backdrop: every object's body seen straight down the open
// sketch's normal, flattened onto its plane, so you can draw against the solids
// you're sketching on — Onshape shows the part behind a sketch the same way. A
// faint silhouette (so a sphere, which has no edges, still shows) and the
// bodies' edges over it, in the board coordinates the open sketch is drawn in.

import type { CanvasDoc, NodeId } from '../../document/types'
import { worldToPlane } from '../../document/placement'
import type { Placement3D, Vec3 } from '../../document/sceneTypes'
import { bodiesOf, type Body } from '../geometry/body'

/** SVG path data, in board px: the bodies' filled silhouette, and their edges as lines. */
export interface SketchGhost {
  faces: string
  edges: string
}

const fmt = (n: number) => Math.round(n * 100) / 100

/**
 * The scene's bodies as seen from the front of a sketch's plane, drawn where
 * the sketch shows face on: `placement` is its plane, `origin` the board point
 * of its top-left. Null when there's nothing to show.
 */
export function ghostOnPlane(doc: CanvasDoc, placement: Placement3D, origin: { x: number; y: number }): SketchGhost | null {
  const toBoard = (p: Vec3): [number, number] => {
    const { u, v } = worldToPlane(placement, p)
    return [fmt(origin.x + u), fmt(origin.y + v)]
  }
  const faces: string[] = []
  const edges: string[] = []
  for (const body of bodiesOf(doc).values()) {
    faces.push(silhouette(body, toBoard))
    for (const edge of body.edges) {
      if (edge.points.length > 1) edges.push(`M${edge.points.map((p) => toBoard(p).join(' ')).join('L')}`)
    }
  }
  const faceData = faces.join('')
  return faceData || edges.length ? { faces: faceData, edges: edges.join('') } : null
}

/**
 * Every triangle as a closed subpath, all wound the same way on the plane so
 * the nonzero fill takes their union — a front face and the back face behind
 * it would otherwise wind opposite and cancel into a hole.
 */
function silhouette(body: Body, toBoard: (p: Vec3) => [number, number]): string {
  const p = body.mesh.positions
  const at = (i: number): Vec3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]
  let out = ''
  for (let t = 0; t < body.mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => toBoard(at(body.mesh.indices[t + k])))
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    if (area === 0) continue
    const [second, third] = area < 0 ? [c, b] : [b, c]
    out += `M${a.join(' ')}L${second.join(' ')}L${third.join(' ')}Z`
  }
  return out
}

/** The ghost for the sketch open face on, if the board has one: its plane and where the board shows it. */
export function ghostForSketch(doc: CanvasDoc, sketchId: NodeId, origin: { x: number; y: number }): SketchGhost | null {
  const sketch = doc.nodes.find((n) => n.id === sketchId)
  return sketch?.space ? ghostOnPlane(doc, sketch.space, origin) : null
}
