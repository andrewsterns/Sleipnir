import { describe, it, expect } from 'vitest'
import type { CanvasDoc } from '../../document/types'
import { addStarterShape } from './starterShapes'
import { ghostOnPlane } from './sketchGhost'

const empty: CanvasDoc = { version: 1, id: 'b', name: 'b', nodes: [], components: [], createdAt: 0, updatedAt: 0 }
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('the sketch-mode backdrop', () => {
  it('shows a box from above as its square outline, where the sketch is drawn', () => {
    const { doc } = addStarterShape(empty, 'box')
    // A sketch on the Top plane, its top-left at the origin, shown with that corner at board (200, 300).
    const ghost = ghostOnPlane(doc, { position: [0, 0, 0], rotation: [-90, 0, 0] }, { x: 200, y: 300 })!
    const xs = numbers(ghost.edges).filter((_, i) => i % 2 === 0)
    const ys = numbers(ghost.edges).filter((_, i) => i % 2 === 1)
    // The 1 m box centered on the origin: 100 px across, centered on the sketch's corner.
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([150, 250, 250, 350])
    expect(ghost.faces.length).toBeGreaterThan(0)
  })

  it('still shows a sphere, which has no edges, by its silhouette', () => {
    const { doc } = addStarterShape(empty, 'sphere')
    const ghost = ghostOnPlane(doc, { position: [0, 0, 0], rotation: [0, 0, 0] }, { x: 0, y: 0 })!
    expect(ghost.edges).toBe('')
    expect(ghost.faces.length).toBeGreaterThan(0)
  })

  it('has nothing to show on a board without objects', () => {
    expect(ghostOnPlane(empty, { position: [0, 0, 0], rotation: [0, 0, 0] }, { x: 0, y: 0 })).toBeNull()
  })
})
