import { describe, it, expect } from 'vitest'
import { extrude, revolve, signedVolume, sweep, triangleCount } from './modifiers'
import { ellipse, shapeArea, type Shape } from './shape'

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
]

describe('extrude', () => {
  it('pushes a square into a box: two caps, four walls, the right volume, facing out', () => {
    const mesh = extrude({ contours: [square(0, 0, 100)] }, { w: 100, h: 100 }, 50)
    expect(triangleCount(mesh)).toBe(2 * 2 + 4 * 2)
    expect(signedVolume(mesh)).toBeCloseTo(100 * 100 * 50, 6)
  })

  it('lights every face from outside: each triangle winds toward its own normal', () => {
    // A rounded square and a pentagon came out with their front caps lit from behind once.
    for (const contour of [ellipse(50, 50, 50, 30), square(0, 0, 100).reverse()]) {
      const mesh = extrude({ contours: [contour] }, { w: 100, h: 100 }, 20)
      const p = mesh.positions
      const n = mesh.normals
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3]
        const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
        const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
        const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        expect(face[0] * n[a] + face[1] * n[a + 1] + face[2] * n[a + 2]).toBeGreaterThanOrEqual(0)
      }
      expect(signedVolume(mesh)).toBeGreaterThan(0)
    }
  })

  it('keeps holes hollow all the way through', () => {
    const ring: Shape = { contours: [square(0, 0, 100), square(25, 25, 50)] }
    expect(signedVolume(extrude(ring, { w: 100, h: 100 }, 10))).toBeCloseTo((10000 - 2500) * 10, 6)
  })

  it('reads a curved outline as smooth walls and a squared one as hard edges', () => {
    const disc = extrude({ contours: [ellipse(50, 50, 50, 50)] }, { w: 100, h: 100 }, 10)
    // On a circle the two wall vertices at one corner share a normal…
    const n = disc.normals
    const capVerts = (disc.positions.length / 3 - ellipse(50, 50, 50, 50).length * 4) // caps come first
    const first = capVerts * 3
    const secondEdgeStart = first + 4 * 3
    expect(n[first + 3]).toBeCloseTo(n[secondEdgeStart], 9)
    // …while a box's corner keeps two different ones.
    const box = extrude({ contours: [square(0, 0, 10)] }, { w: 10, h: 10 }, 10)
    const boxFirst = 8 * 3
    expect(box.normals[boxFirst + 3]).not.toBeCloseTo(box.normals[boxFirst + 12], 3)
  })
})

describe('revolve', () => {
  it('spins a rectangle at the axis into a cylinder', () => {
    // 10 wide from the left edge (the axis), 20 tall: radius 10, height 20.
    const mesh = revolve({ contours: [square(0, 0, 10).map((p) => ({ x: p.x, y: p.y * 2 }))] }, { w: 10, h: 20 }, 'left', 360, 128)
    expect(signedVolume(mesh) / (Math.PI * 10 * 10 * 20)).toBeCloseTo(1, 2)
  })

  it('spins a whole silhouette around its center line, using only the half on one side', () => {
    // A 20 x 20 square drawn whole: around its center it is a cylinder of radius 10, not 20.
    const mesh = revolve({ contours: [square(0, 0, 20)] }, { w: 20, h: 20 }, 'center', 360, 128)
    expect(signedVolume(mesh) / (Math.PI * 10 * 10 * 20)).toBeCloseTo(1, 2)
  })

  it('counts its polygons as profile points times steps', () => {
    const mesh = revolve({ contours: [square(0, 0, 10)] }, { w: 10, h: 10 }, 'left', 360, 24)
    expect(triangleCount(mesh)).toBe(4 * 24 * 2)
  })
})

describe('sweep', () => {
  it('carries a circle along a straight path into a capped tube', () => {
    const r = 10
    const circle: Shape = { contours: [ellipse(r, r, r, r, 0.05)] }
    const mesh = sweep(circle, { w: 2 * r, h: 2 * r }, [{ x: 0, y: 0 }, { x: 100, y: 0 }], false)
    expect(signedVolume(mesh)).toBeCloseTo(shapeArea(circle) * 100, 6)
  })
})
