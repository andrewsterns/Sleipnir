import { describe, it, expect } from 'vitest'
import { alignOffsets, distributeOffsets, snapRect, SNAP_THRESHOLD } from './align'
import type { CanvasRect } from './types'

const box = (x: number, y: number, w = 100, h = 50): CanvasRect => ({ x, y, w, h })

describe('snapRect', () => {
  it('does nothing without candidates', () => {
    expect(snapRect(box(13, 27), [])).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('snaps a near-miss left edge into exact alignment', () => {
    const moving = box(103, 300)
    const result = snapRect(moving, [box(100, 0)])
    expect(result.dx).toBe(-3)
    expect(moving.x + result.dx).toBe(100)
  })

  it('leaves a box alone when nothing is within the threshold', () => {
    // Far from every line of the candidate on both axes.
    const result = snapRect(box(337, 300), [box(100, 0)])
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([])
  })

  it('still draws a guide for boxes that are ALREADY aligned', () => {
    // Moving left edge (200) is exactly the candidate's right edge — flush.
    // Zero delta, but the guide is what tells you the alignment is real.
    const result = snapRect(box(200, 0, 100, 50), [box(100, 0, 100, 50)])
    expect(result.dx).toBe(0)
    expect(result.guides.some((g) => g.axis === 'x' && g.position === 200)).toBe(true)
  })

  it('respects the threshold boundary exactly', () => {
    const within = snapRect(box(100 + SNAP_THRESHOLD, 300), [box(100, 0)])
    expect(within.dx).toBe(-SNAP_THRESHOLD)

    const beyond = snapRect(box(100 + SNAP_THRESHOLD + 1, 300), [box(100, 0)])
    expect(beyond.dx).toBe(0)
  })

  it('snaps each axis independently, to different neighbours', () => {
    // Left edge near one box, top edge near another.
    const result = snapRect(box(102, 198), [box(100, 0), box(500, 200)])
    expect(result.dx).toBe(-2)
    expect(result.dy).toBe(2)
  })

  it('snaps centers, not just edges', () => {
    // Moving box center-x is 51; candidate center-x is 50.
    const result = snapRect(box(1, 500, 100, 50), [box(0, 0, 100, 50)])
    expect(result.dx).toBe(-1)
  })

  it('snaps a left edge to a right edge, so boxes sit flush', () => {
    // Candidate right edge is 100; moving left edge at 102.
    const result = snapRect(box(102, 0, 50, 50), [box(0, 0, 100, 50)])
    expect(result.dx).toBe(-2)
  })

  it('prefers the nearest of several competing candidates', () => {
    const result = snapRect(box(105, 500), [box(100, 0), box(103, 0)])
    expect(result.dx).toBe(-2) // 103 is nearer than 100
  })

  it('emits guides describing where the alignment happened', () => {
    const result = snapRect(box(103, 300), [box(100, 0)])
    const vertical = result.guides.filter((g) => g.axis === 'x')
    expect(vertical.length).toBeGreaterThan(0)
    expect(vertical[0].position).toBe(100)
    // The guide spans both boxes so it visibly connects them.
    expect(vertical[0].start).toBeLessThanOrEqual(0)
    expect(vertical[0].end).toBeGreaterThanOrEqual(350)
  })

  it('reports every coinciding line, so aligning to three things draws three guides', () => {
    // After snapping, the left edge coincides with three candidates' left edges.
    const result = snapRect(box(101, 500), [box(100, 0), box(100, 100), box(100, 200)])
    const vertical = result.guides.filter((g) => g.axis === 'x' && g.position === 100)
    expect(vertical.length).toBe(3)
  })
})

describe('alignOffsets', () => {
  const rects = [box(0, 0, 100, 50), box(50, 100, 200, 80), box(20, 300, 60, 40)]

  it('aligns left edges to the group bounding box', () => {
    const offsets = alignOffsets(rects, 'left')
    rects.forEach((rect, i) => expect(rect.x + offsets[i].dx).toBe(0))
  })

  it('aligns right edges', () => {
    const offsets = alignOffsets(rects, 'right')
    const maxRight = Math.max(...rects.map((r) => r.x + r.w))
    rects.forEach((rect, i) => expect(rect.x + offsets[i].dx + rect.w).toBe(maxRight))
  })

  it('aligns horizontal centers', () => {
    const offsets = alignOffsets(rects, 'center-x')
    const centers = rects.map((rect, i) => rect.x + offsets[i].dx + rect.w / 2)
    expect(new Set(centers).size).toBe(1)
  })

  it('aligns top, bottom, and vertical centers', () => {
    const top = alignOffsets(rects, 'top')
    rects.forEach((rect, i) => expect(rect.y + top[i].dy).toBe(0))

    const bottom = alignOffsets(rects, 'bottom')
    const maxBottom = Math.max(...rects.map((r) => r.y + r.h))
    rects.forEach((rect, i) => expect(rect.y + bottom[i].dy + rect.h).toBe(maxBottom))

    const middle = alignOffsets(rects, 'center-y')
    const centers = rects.map((rect, i) => rect.y + middle[i].dy + rect.h / 2)
    expect(new Set(centers).size).toBe(1)
  })

  it('only moves along the axis being aligned', () => {
    for (const mode of ['left', 'center-x', 'right'] as const) {
      expect(alignOffsets(rects, mode).every((o) => o.dy === 0)).toBe(true)
    }
    for (const mode of ['top', 'center-y', 'bottom'] as const) {
      expect(alignOffsets(rects, mode).every((o) => o.dx === 0)).toBe(true)
    }
  })

  it('handles an empty or single-item selection without throwing', () => {
    expect(alignOffsets([], 'left')).toEqual([])
    expect(alignOffsets([box(5, 5)], 'left')).toEqual([{ dx: 0, dy: 0 }])
  })
})

describe('distributeOffsets', () => {
  it('is a no-op below three rects — there is no interior to distribute', () => {
    expect(distributeOffsets([box(0, 0), box(500, 0)], 'horizontal')).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ])
  })

  it('equalizes the GAPS between differently sized boxes', () => {
    // Widths 100 / 200 / 100 spanning 0..700 → 300 of slack over 2 gaps = 150 each.
    const rects = [box(0, 0, 100, 50), box(150, 0, 200, 50), box(600, 0, 100, 50)]
    const offsets = distributeOffsets(rects, 'horizontal')
    const placed = rects.map((r, i) => ({ ...r, x: r.x + offsets[i].dx }))

    expect(placed[0].x).toBe(0)
    expect(placed[2].x + placed[2].w).toBe(700)
    const gap1 = placed[1].x - (placed[0].x + placed[0].w)
    const gap2 = placed[2].x - (placed[1].x + placed[1].w)
    expect(gap1).toBeCloseTo(gap2, 6)
    expect(gap1).toBeCloseTo(150, 6)
  })

  it('keeps the outermost two fixed', () => {
    const rects = [box(0, 0, 50, 50), box(20, 0, 50, 50), box(400, 0, 50, 50)]
    const offsets = distributeOffsets(rects, 'horizontal')
    expect(offsets[0]).toEqual({ dx: 0, dy: 0 })
    expect(offsets[2]).toEqual({ dx: 0, dy: 0 })
  })

  it('distributes vertically on the other axis only', () => {
    const rects = [box(0, 0, 50, 100), box(0, 120, 50, 50), box(0, 500, 50, 100)]
    const offsets = distributeOffsets(rects, 'vertical')
    expect(offsets.every((o) => o.dx === 0)).toBe(true)

    const placed = rects.map((r, i) => ({ ...r, y: r.y + offsets[i].dy }))
    const gap1 = placed[1].y - (placed[0].y + placed[0].h)
    const gap2 = placed[2].y - (placed[1].y + placed[1].h)
    expect(gap1).toBeCloseTo(gap2, 6)
  })

  it('works regardless of the order rects are supplied in', () => {
    const rects = [box(600, 0, 100, 50), box(0, 0, 100, 50), box(150, 0, 200, 50)]
    const offsets = distributeOffsets(rects, 'horizontal')
    const placed = rects.map((r, i) => ({ ...r, x: r.x + offsets[i].dx }))
    const sorted = [...placed].sort((a, b) => a.x - b.x)
    const gap1 = sorted[1].x - (sorted[0].x + sorted[0].w)
    const gap2 = sorted[2].x - (sorted[1].x + sorted[1].w)
    expect(gap1).toBeCloseTo(gap2, 6)
  })
})
