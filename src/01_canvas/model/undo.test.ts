import { describe, it, expect } from 'vitest'
import { canRedo, canUndo, commit, initHistory, MAX_HISTORY, redo, reset, undo } from './undo'
import { createDoc, createFrameNode, insertNode } from './doc'
import type { CanvasDoc } from './types'

function withFrames(count: number): CanvasDoc {
  let doc = createDoc('board')
  for (let i = 0; i < count; i += 1) {
    doc = insertNode(doc, createFrameNode({ x: i, y: i, w: 10, h: 10 }, `f${i}`), null)
  }
  return doc
}

describe('undo/redo', () => {
  it('round-trips a sequence of edits', () => {
    const a = withFrames(0)
    const b = withFrames(1)
    const c = withFrames(2)

    let h = initHistory(a)
    h = commit(h, b)
    h = commit(h, c)

    expect(h.present).toBe(c)
    h = undo(h)
    expect(h.present).toBe(b)
    h = undo(h)
    expect(h.present).toBe(a)
    h = redo(h)
    expect(h.present).toBe(b)
    h = redo(h)
    expect(h.present).toBe(c)
  })

  it('is a no-op at either end', () => {
    const h = initHistory(withFrames(0))
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('clears the redo stack once a new edit lands, so history never forks', () => {
    let h = initHistory(withFrames(0))
    h = commit(h, withFrames(1))
    h = undo(h)
    expect(canRedo(h)).toBe(true)

    h = commit(h, withFrames(2))
    expect(canRedo(h)).toBe(false)
    expect(h.future).toEqual([])
  })

  it('ignores a commit of the identical doc reference, so no-op edits do not fill history', () => {
    const doc = withFrames(1)
    const h = initHistory(doc)
    expect(commit(h, doc)).toBe(h)
  })
})

describe('coalescing', () => {
  it('merges continuous gesture frames into one undo step', () => {
    let h = initHistory(withFrames(0))
    h = commit(h, withFrames(1)) // drag start — a real step
    const stepsAfterStart = h.past.length

    for (let i = 2; i < 20; i += 1) h = commit(h, withFrames(i), true) // drag moves
    expect(h.past.length).toBe(stepsAfterStart)

    // One undo returns to before the whole gesture.
    h = undo(h)
    expect(h.present.nodes.length).toBe(0)
  })

  it('does not coalesce when there is no prior step to merge into', () => {
    let h = initHistory(withFrames(0))
    h = commit(h, withFrames(1), true)
    expect(canUndo(h)).toBe(true)
  })
})

describe('bounding', () => {
  it('caps history length while keeping the most recent states', () => {
    let h = initHistory(withFrames(0))
    for (let i = 1; i <= MAX_HISTORY + 40; i += 1) h = commit(h, withFrames(i))

    expect(h.past.length).toBe(MAX_HISTORY)
    h = undo(h)
    expect(h.present.nodes.length).toBe(MAX_HISTORY + 39)
  })
})

describe('reset', () => {
  it('drops history, since undoing past an external change would clobber it', () => {
    let h = initHistory(withFrames(0))
    h = commit(h, withFrames(1))
    expect(canUndo(h)).toBe(true)

    const external = withFrames(5)
    h = reset(external)
    expect(h.present).toBe(external)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})
