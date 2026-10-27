import { describe, it, expect } from 'vitest'
import { createDoc, createFrameNode, createVectorNode } from './doc'
import { isLayoutPositioned } from './layout'
import { distanceAlong, guidePolyline, itemDistances, layoutAlongPath, moveToPathSlot, pathStartOf, reflowPaths, slideOffset } from './pathFlow'
import { positionCss } from './toCss'
import type { AlongPath, CanvasFrameNode, CanvasNode } from './types'

// A straight horizontal guide 0→200 at y=50, as a two-point pen path.
const line = () =>
  createVectorNode({ x: 0, y: 50, w: 200, h: 0 }, 'path', {
    points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    closed: false,
    viewBox: { w: 200, h: 0 },
  })

const box = (name: string, w = 20, h = 10) => createFrameNode({ x: 999, y: 999, w, h }, name)

function pathFrame(children: CanvasNode[], alongPath: AlongPath = {}, gap?: number): CanvasFrameNode {
  const frame = createFrameNode({ x: 0, y: 0, w: 300, h: 300 }, 'Path')
  return { ...frame, style: { ...frame.style, alongPath, gap }, children }
}

const centers = (frame: CanvasFrameNode) =>
  frame.children.filter((c) => c.kind !== 'vector').map((c) => ({ x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2 }))

describe('layoutAlongPath', () => {
  it('spreads children evenly along an open path, ends included', () => {
    const out = layoutAlongPath(pathFrame([line(), box('a'), box('b'), box('c')]))
    expect(centers(out)).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 200, y: 50 }])
  })

  it('spaces children a fixed gap apart, edge to edge, from the offset', () => {
    const out = layoutAlongPath(pathFrame([line(), box('a', 20), box('b', 40)], { spacing: 'gap', offset: 10 }, 5))
    // a: 10 + 20/2 = 20; b: 20 + 10 + 5 + 20 = 55
    expect(centers(out).map((c) => c.x)).toEqual([20, 55])
  })

  it('leaves the guide where it is, and does nothing without one', () => {
    const guide = line()
    const out = layoutAlongPath(pathFrame([guide, box('a')]))
    expect(out.children[0]).toBe(guide)
    const noGuide = pathFrame([box('a')])
    expect(layoutAlongPath(noGuide)).toBe(noGuide)
  })

  it('rings a closed ellipse from 12 o’clock', () => {
    const ring = createVectorNode({ x: 0, y: 0, w: 100, h: 100 }, 'ellipse')
    const out = layoutAlongPath(pathFrame([ring, box('a', 10, 10), box('b', 10, 10), box('c', 10, 10), box('d', 10, 10)]))
    const c = centers(out).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
    expect(c).toEqual([{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }])
  })

  it('turns children to follow the curve when orient is on, and clears it when off', () => {
    const diagonal = createVectorNode({ x: 0, y: 0, w: 100, h: 100 }, 'path', {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      closed: false,
      viewBox: { w: 100, h: 100 },
    })
    const oriented = layoutAlongPath(pathFrame([diagonal, box('a')], { orient: true }))
    expect(oriented.children[1].style.rotate).toBe(45)
    const plain = layoutAlongPath({ ...oriented, style: { ...oriented.style, alongPath: {} } })
    expect(plain.children[1].style.rotate).toBeUndefined()
  })

  it('follows a curved pen segment', () => {
    const arc = createVectorNode({ x: 0, y: 0, w: 100, h: 50 }, 'path', {
      points: [{ x: 0, y: 50, out: { x: 0, y: 0 } }, { x: 100, y: 50, in: { x: 100, y: 0 } }],
      closed: false,
      viewBox: { w: 100, h: 50 },
    })
    const { points } = guidePolyline(arc)
    expect(points.length).toBeGreaterThan(10)
    const out = layoutAlongPath(pathFrame([arc, box('a', 0, 0), box('b', 0, 0), box('c', 0, 0)]))
    const mid = centers(out)[1]
    expect(Math.round(mid.x)).toBe(50)
    expect(mid.y).toBeLessThan(20) // up on the hump, not on the straight chord at y=50
  })
})

describe('itemDistances', () => {
  it('puts a lone child mid-path, and shares a closed path without doubling the seam', () => {
    expect(itemDistances([10], 200, false, {}, 0)).toEqual([100])
    expect(itemDistances([1, 1, 1, 1], 400, true, {}, 0)).toEqual([0, 100, 200, 300])
  })
})

describe('reflowPaths', () => {
  it('returns the same doc when there is no path frame', () => {
    const doc = { ...createDoc('b'), nodes: [box('a')] }
    expect(reflowPaths(doc)).toBe(doc)
  })

  it('lays out a path frame nested anywhere on the board', () => {
    const outer = createFrameNode({ x: 0, y: 0, w: 500, h: 500 }, 'Outer')
    const doc = { ...createDoc('b'), nodes: [{ ...outer, children: [pathFrame([line(), box('a')])] }] }
    const next = reflowPaths(doc)
    const placed = (next.nodes[0] as CanvasFrameNode).children[0] as CanvasFrameNode
    expect(centers(placed)).toEqual([{ x: 100, y: 50 }])
    expect(reflowPaths(next)).toBe(next) // already in place: no churn
  })
})

describe('around a path frame', () => {
  it('marks the spaced children (not the guide) as positioned by the layout', () => {
    const guide = line()
    const a = box('a')
    const doc = { ...createDoc('b'), nodes: [pathFrame([guide, a])] }
    expect(isLayoutPositioned(doc, a.id)).toBe(true)
    expect(isLayoutPositioned(doc, guide.id)).toBe(false)
  })

  it('emits a rotation as a CSS transform', () => {
    expect(positionCss({ x: 1, y: 2, w: 3, h: 4 }, 'freeform', { rotate: 30 }).transform).toBe('rotate(30deg)')
  })
})

describe('big patterns', () => {
  function bigPattern(offset = 0) {
    const ring = createVectorNode({ x: 0, y: 0, w: 2000, h: 2000 }, 'ellipse')
    const frame = createFrameNode({ x: 0, y: 0, w: 2000, h: 2000 }, 'Ring')
    const dot = createFrameNode({ x: 0, y: 0, w: 12, h: 12 }, 'Dot')
    return { ...createDoc('b'), nodes: [{ ...frame, style: { ...frame.style, alongPath: { repeat: 400, orient: true, offset } }, children: [ring, dot] }] }
  }

  it('lays out a 400-item pattern well inside a frame budget, and re-flows an unchanged board for free', () => {
    let t = performance.now()
    const doc = reflowPaths(bigPattern())
    const first = performance.now() - t
    expect((doc.nodes[0] as CanvasFrameNode).children).toHaveLength(401)

    t = performance.now()
    expect(reflowPaths(doc)).toBe(doc)
    expect(performance.now() - t).toBeLessThan(5)

    // Sliding the offset (a drag on the field) moves every item but rebuilds none.
    const frame = doc.nodes[0] as CanvasFrameNode
    const slid = { ...doc, nodes: [{ ...frame, style: { ...frame.style, alongPath: { ...frame.style.alongPath, offset: 30 } } }] }
    t = performance.now()
    const moved = reflowPaths(slid)
    const slide = performance.now() - t
    const before = frame.children[5]
    const after = (moved.nodes[0] as CanvasFrameNode).children[5]
    expect(after.rect.x).not.toBe(before.rect.x)
    expect(first).toBeLessThan(250)
    expect(slide).toBeLessThan(50)
  })
})

describe('editing along the path', () => {
  it('projects a point onto the curve as a distance along it', () => {
    expect(distanceAlong([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, { x: 110, y: 40 })).toBe(140)
  })

  it('slides the offset by how far the pointer moved along the guide', () => {
    const frame = pathFrame([line(), box('a')], { offset: 10 })
    expect(slideOffset(frame, 10, { x: 20, y: 60 }, { x: 70, y: 30 })).toBe(60)
  })

  it('takes the short way round a closed path across its seam', () => {
    const ring = createVectorNode({ x: 0, y: 0, w: 100, h: 100 }, 'ellipse')
    const frame = pathFrame([ring, box('a')], {})
    // Just left of 12 o'clock to just right of it: a small step, not a lap.
    const delta = slideOffset(frame, 0, { x: 45, y: 0 }, { x: 55, y: 0 })
    expect(Math.abs(delta)).toBeLessThan(15)
  })

  it('reports where the run starts and which way it heads', () => {
    const start = pathStartOf(pathFrame([line(), box('a')], { offset: 50 }))!
    expect(start).toMatchObject({ x: 50, y: 50, angle: 0, closed: false })
  })
})

describe('moveToPathSlot', () => {
  it('moves a piece to the slot nearest the pointer, keeping the guide in place', () => {
    const guide = line()
    const a = box('a')
    const b = box('b')
    const c = box('c')
    const frame = layoutAlongPath(pathFrame([guide, a, b, c]))
    // Slots sit at x = 0, 100, 200; dropping `a` near x=190 makes it last.
    const out = moveToPathSlot(frame, a.id, { x: 190, y: 50 })
    expect(out.children.map((n) => n.name)).toEqual([guide.name, 'b', 'c', 'a'])
    expect(moveToPathSlot(out, a.id, { x: 195, y: 50 })).toBe(out)
  })
})
