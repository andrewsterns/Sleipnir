import { describe, it, expect } from 'vitest'
import { boardBoundsOf, createDoc, createFrameNode, hitTest, nodesInRect, orientedBoxOf } from './doc'
import { apply, invert, nodeMatrix, normalizeDegrees, orientedCorners, quadOf, snapAngle } from './rotation'
import type { CanvasDoc, CanvasFrameNode } from './types'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

function rotated(rect: { x: number; y: number; w: number; h: number }, rotate: number, name = 'F'): CanvasFrameNode {
  const f = createFrameNode(rect, name)
  return { ...f, style: { ...f.style, rotate } }
}

const docOf = (...nodes: CanvasFrameNode[]): CanvasDoc => ({ ...createDoc('b'), nodes })

describe('rotation math', () => {
  it('turns a box about its own center, clockwise', () => {
    // A 100×20 bar at the origin, turned 90°: it stands upright around (50, 10).
    const [tl, tr, br, bl] = quadOf(nodeMatrix({ x: 0, y: 0, w: 100, h: 20 }, 90), 100, 20)
    close(tl.x, 60)
    close(tl.y, -40)
    close(tr.x, 60)
    close(tr.y, 60)
    close(br.x, 40)
    close(br.y, 60)
    close(bl.x, 40)
    close(bl.y, -40)
  })

  it('round-trips points through a map and its inverse', () => {
    const m = nodeMatrix({ x: 30, y: -12, w: 80, h: 40 }, 33)
    const p = apply(invert(m), apply(m, { x: 7, y: 19 }))
    close(p.x, 7)
    close(p.y, 19)
  })

  it('normalizes and snaps angles', () => {
    expect(normalizeDegrees(270)).toBe(-90)
    expect(normalizeDegrees(-180)).toBe(180)
    expect(normalizeDegrees(720)).toBe(0)
    expect(snapAngle(52)).toBe(45)
    expect(snapAngle(-8)).toBe(-15)
  })
})

describe('rotated nodes on the board', () => {
  it('hits a rotated node by its turned shape, not its upright box', () => {
    const bar = rotated({ x: 0, y: 0, w: 100, h: 20 }, 90)
    const doc = docOf(bar)
    expect(hitTest(doc, 50, 50)?.id).toBe(bar.id) // inside the upright, turned bar
    expect(hitTest(doc, 5, 10)).toBeNull() // inside the drawn rect, outside the turned bar
  })

  it('carries a parent’s rotation down to its children', () => {
    const child = createFrameNode({ x: 80, y: 0, w: 20, h: 20 }, 'Child')
    const parent: CanvasFrameNode = { ...rotated({ x: 0, y: 0, w: 100, h: 100 }, 180), children: [child] }
    const doc = docOf(parent)
    // Turned 180° about (50, 50), the child's top-right corner lands bottom-left.
    const box = orientedBoxOf(doc, child.id)!
    close(box.cx, 10)
    close(box.cy, 90)
    expect(box.angle).toBe(180)
    expect(hitTest(doc, 10, 90)?.id).toBe(child.id)
  })

  it('marquee-selects by the turned corners', () => {
    const bar = rotated({ x: 0, y: 0, w: 100, h: 20 }, 90)
    const doc = docOf(bar)
    expect(nodesInRect(doc, { x: 35, y: -45, w: 30, h: 110 }).map((n) => n.id)).toEqual([bar.id])
    expect(nodesInRect(doc, { x: -1, y: -1, w: 102, h: 22 })).toEqual([])
  })

  it('reports the box around a turned node', () => {
    const doc = docOf(rotated({ x: 0, y: 0, w: 100, h: 20 }, 90))
    const b = boardBoundsOf(doc, doc.nodes[0].id)!
    close(b.x, 40)
    close(b.y, -40)
    close(b.w, 20)
    close(b.h, 100)
  })

  it('gives the corners of an oriented box', () => {
    const [tl] = orientedCorners({ cx: 50, cy: 10, w: 100, h: 20, angle: 90 })
    close(tl.x, 60)
    close(tl.y, -40)
  })
})
