import { describe, it, expect } from 'vitest'
import type { CanvasDoc } from '../../document/types'
import { objectsOf } from '../../document/objects'
import { bodyOf } from '../geometry/body'
import { addStarterShape, type StarterShape } from './starterShapes'

const empty: CanvasDoc = { version: 1, id: 'b', name: 'b', nodes: [], components: [], createdAt: 0, updatedAt: 0 }
const extent = (positions: number[], axis: number) => {
  const values = positions.filter((_, i) => i % 3 === axis)
  return [Math.min(...values), Math.max(...values)]
}

describe('starter shapes', () => {
  it('makes each as a sketch plus the feature that turns it solid', () => {
    let doc = empty
    for (const kind of ['box', 'cylinder', 'sphere', 'cone', 'torus', 'polygon'] as StarterShape[]) doc = addStarterShape(doc, kind).doc
    expect(doc.nodes.map((n) => n.name)).toEqual(['Box 1', 'Cylinder 1', 'Sphere 1', 'Cone 1', 'Torus 1', 'Polygon 1'])
    expect(objectsOf(doc).map((o) => `${o.name}:${o.features[0].kind}`)).toEqual([
      'Box 1:extrude',
      'Cylinder 1:extrude',
      'Sphere 1:revolve',
      'Cone 1:revolve',
      'Torus 1:revolve',
      'Polygon 1:extrude',
    ])
    expect(doc.nodes.every((n) => n.sketch?.plane.kind === 'default')).toBe(true)
  })

  it('stands a box on the ground, a meter each way and centered', () => {
    const { doc, id } = addStarterShape(empty, 'box')
    const body = bodyOf(doc, objectsOf(doc)[0])
    expect(body.faces).toHaveLength(6)
    const [x0, x1] = extent(body.mesh.positions, 0)
    const [y0, y1] = extent(body.mesh.positions, 1)
    const [z0, z1] = extent(body.mesh.positions, 2)
    expect([x0, x1, y0, y1, z0, z1].map((n) => Math.round(n * 1000) / 1000 || 0)).toEqual([-0.5, 0.5, 0, 1, -0.5, 0.5])
    expect(doc.nodes.find((n) => n.id === id)!.sketch!.plane).toEqual({ kind: 'default', plane: 'top' })
  })

  it('spins a sphere and a torus about the vertical axis through the origin, on the ground', () => {
    for (const kind of ['sphere', 'torus'] as StarterShape[]) {
      const { doc } = addStarterShape(empty, kind)
      const p = bodyOf(doc, objectsOf(doc)[0]).mesh.positions
      const [x0, x1] = extent(p, 0)
      const [z0, z1] = extent(p, 2)
      // Round about Y: as wide in X as in Z, centered on the origin.
      expect(x0 + x1).toBeCloseTo(0, 2)
      expect(x1 - x0).toBeCloseTo(z1 - z0, 2)
      // Resting on the ground, not half under it.
      expect(extent(p, 1)[0]).toBeCloseTo(0, 2)
    }
  })

  it('numbers repeats, and stands each new one clear of the last', () => {
    const once = addStarterShape(empty, 'box').doc
    const twice = addStarterShape(once, 'box').doc
    expect(twice.nodes.map((n) => n.name)).toEqual(['Box 1', 'Box 2'])
    const [first, second] = objectsOf(twice).map((o) => extent(bodyOf(twice, o).mesh.positions, 0))
    expect(second[0]).toBeGreaterThan(first[1])
  })
})
