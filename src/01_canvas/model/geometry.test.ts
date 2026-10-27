import { describe, it, expect } from 'vitest'
import { normalizeRect, resizeRect } from '../CanvasView.ViewModel'
import type { CanvasRect } from './types'

describe('normalizeRect', () => {
  it('produces a positive rect no matter which way the drag went', () => {
    const expected = { x: 10, y: 20, w: 90, h: 80 }
    expect(normalizeRect({ x: 10, y: 20 }, { x: 100, y: 100 })).toEqual(expected)
    expect(normalizeRect({ x: 100, y: 100 }, { x: 10, y: 20 })).toEqual(expected)
    expect(normalizeRect({ x: 100, y: 20 }, { x: 10, y: 100 })).toEqual(expected)
    expect(normalizeRect({ x: 10, y: 100 }, { x: 100, y: 20 })).toEqual(expected)
  })

  it('collapses a zero-distance drag to an empty rect', () => {
    expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, w: 0, h: 0 })
  })
})

describe('resizeRect', () => {
  const start: CanvasRect = { x: 100, y: 100, w: 200, h: 100 }

  it('grows from the south-east handle without moving the origin', () => {
    expect(resizeRect(start, 'se', 50, 25)).toEqual({ x: 100, y: 100, w: 250, h: 125 })
  })

  it('grows from the north-west handle by moving the origin', () => {
    expect(resizeRect(start, 'nw', -50, -25)).toEqual({ x: 50, y: 75, w: 250, h: 125 })
  })

  it('constrains edge handles to a single axis', () => {
    expect(resizeRect(start, 'e', 40, 999)).toEqual({ x: 100, y: 100, w: 240, h: 100 })
    expect(resizeRect(start, 's', 999, 40)).toEqual({ x: 100, y: 100, w: 200, h: 140 })
    expect(resizeRect(start, 'n', 999, 20)).toEqual({ x: 100, y: 120, w: 200, h: 80 })
    expect(resizeRect(start, 'w', 20, 999)).toEqual({ x: 120, y: 100, w: 180, h: 100 })
  })

  it('stops at 1px instead of inverting when a handle is dragged past the far edge', () => {
    const over = resizeRect(start, 'e', -9999)
    expect(over.w).toBe(1)
    expect(over.x).toBe(100)

    const overWest = resizeRect(start, 'w', 9999, 0)
    expect(overWest.w).toBe(1)
    // The origin stops flush against the right edge rather than running past it.
    expect(overWest.x).toBe(299)

    const overNorth = resizeRect(start, 'n', 0, 9999)
    expect(overNorth.h).toBe(1)
    expect(overNorth.y).toBe(199)
  })

  it('never mutates the starting rect', () => {
    const snapshot = { ...start }
    resizeRect(start, 'nw', -10, -10)
    expect(start).toEqual(snapshot)
  })
})

describe('resizeRect with modifiers', () => {
  const start = { x: 100, y: 100, w: 200, h: 100 }

  it('keeps proportions from a corner, scaling by the axis that moved further (Shift)', () => {
    expect(resizeRect(start, 'se', 100, 10, { proportional: true })).toEqual({ x: 100, y: 100, w: 300, h: 150 })
    expect(resizeRect(start, 'nw', -100, 0, { proportional: true })).toEqual({ x: 0, y: 50, w: 300, h: 150 })
  })

  it('keeps proportions from an edge, growing the other axis about its middle', () => {
    expect(resizeRect(start, 'e', 200, 0, { proportional: true })).toEqual({ x: 100, y: 50, w: 400, h: 200 })
  })

  it('resizes about the center (Alt), moving the opposite side too', () => {
    expect(resizeRect(start, 'e', 20, 0, { fromCenter: true })).toEqual({ x: 80, y: 100, w: 240, h: 100 })
    expect(resizeRect(start, 'se', 20, 10, { fromCenter: true, proportional: true })).toEqual({ x: 80, y: 90, w: 240, h: 120 })
  })
})

describe('drawRect', () => {
  it('draws from the press point as the center with Alt', async () => {
    const { drawRect } = await import('../CanvasView.ViewModel')
    expect(drawRect({ x: 100, y: 100 }, { x: 150, y: 120 }, false, true)).toEqual({ x: 50, y: 80, w: 100, h: 40 })
    expect(drawRect({ x: 100, y: 100 }, { x: 150, y: 120 }, true, true)).toEqual({ x: 50, y: 50, w: 100, h: 100 })
  })
})

describe('resizeRotatedRect', () => {
  it('keeps the opposite corner still on screen while a turned box grows', async () => {
    const { resizeRotatedRect } = await import('../CanvasView.ViewModel')
    const { nodeMatrix, apply } = await import('./rotation')
    const start = { x: 0, y: 0, w: 100, h: 50 }
    // Turned 90°: dragging its SE handle 20px down the screen pulls along the box's own +x.
    const next = resizeRotatedRect(start, 'se', 0, 20, 90, 90)
    expect(next.w).toBeCloseTo(120)
    expect(next.h).toBeCloseTo(50)
    const nwBefore = apply(nodeMatrix(start, 90), { x: 0, y: 0 })
    const nwAfter = apply(nodeMatrix(next, 90), { x: 0, y: 0 })
    expect(nwAfter.x).toBeCloseTo(nwBefore.x)
    expect(nwAfter.y).toBeCloseTo(nwBefore.y)
  })
})
