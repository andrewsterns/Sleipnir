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
