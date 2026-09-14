import { describe, it, expect } from 'vitest'
import { mergeCss, positionCss, toCss } from './toCss'
import type { CanvasStyle } from './types'

describe('toCss strokes', () => {
  const stroked = (position?: 'inside' | 'center' | 'outside'): CanvasStyle => ({
    stroke: { color: 'border-1', width: 1, position },
  })

  // The load-bearing one. `border` would move the containing block for
  // absolutely positioned children to the padding box, drawing every freeform
  // child one unit down-and-right of its own rect while the selection ring, snap
  // guides and drop highlights kept using the model rect — so the board would
  // disagree with its own IR, and with the code it emits.
  it('never emits a border, because a stroke must not be layout', () => {
    for (const position of [undefined, 'inside', 'center', 'outside'] as const) {
      expect(toCss(stroked(position)).border).toBeUndefined()
    }
  })

  it('places the outline band by stroke position, Figma-style', () => {
    expect(toCss(stroked('inside')).outlineOffset).toBe('-1px')
    expect(toCss(stroked('center')).outlineOffset).toBe('-0.5px')
    expect(toCss(stroked('outside')).outlineOffset).toBe(0)
    // 'inside' is the default, so an unspecified position sits wholly inside.
    expect(toCss(stroked()).outlineOffset).toBe('-1px')
    expect(toCss(stroked()).outline).toBe('1px solid var(--border-1)')
  })

  it('emits nothing for a zero-width stroke', () => {
    expect(toCss({ stroke: { color: 'border-1', width: 0 } }).outline).toBeUndefined()
  })
})

describe('board/IR agreement', () => {
  // A nested freeform child lands at exactly its own rect, with nothing the
  // parent's paint can add to it — the property boardRectOf() assumes when it
  // accumulates rects through ancestors.
  it('positions a freeform child at its rect regardless of the parent stroke', () => {
    const child = mergeCss(
      toCss({ stroke: { color: 'border-1', width: 4 } }),
      positionCss({ x: 20, y: 20, w: 60, h: 40 }, 'freeform', {}),
    )
    expect(child).toMatchObject({ position: 'absolute', left: 20, top: 20, width: 60, height: 40 })
    expect(child.border).toBeUndefined()
    expect(child.padding).toBeUndefined()
  })

  it('drops a child rect entirely under an auto-layout parent, as Figma does', () => {
    const child = positionCss({ x: 20, y: 20, w: 60, h: 40 }, 'vertical', {})
    expect(child.left).toBeUndefined()
    expect(child.top).toBeUndefined()
    expect(child.position).toBeUndefined()
  })

  // The other half of the same promise, and the one that was missing. W and H
  // are the box you see — padding eats into them rather than growing them, the
  // way Figma means it. CSS's content-box default made a padded frame render
  // 2×padding LARGER than its own rect in each dimension, so the selection ring
  // (drawn from the model) sat inset from the frame it named. Verified against a
  // real browser: 17px of padding put the box 34px adrift on both axes.
  it('sizes every frame by its border box, so padding never grows it', () => {
    expect(toCss({}).boxSizing).toBe('border-box')
    expect(toCss({ padding: 17 }).boxSizing).toBe('border-box')

    const padded = mergeCss(
      toCss({ padding: 17, flow: 'grid' }),
      positionCss({ x: 313.5, y: 149.5, w: 246.5, h: 227.5 }, 'freeform', { padding: 17, flow: 'grid' }),
    )
    // The rendered box is the rect, padding and all.
    expect(padded).toMatchObject({ boxSizing: 'border-box', width: 246.5, height: 227.5, padding: '17px' })
  })
})
