// Who owns a node's position, and where a drop lands in a flow.
//
// These are the rules that were missing entirely: every consumer assumed the
// model could place any node, which is false the moment a frame lays its
// children out.

import { describe, it, expect } from 'vitest'
import { createDoc, createFrameNode, createTextNode, insertNode, boardRectOf, hitPath, nodesInRect, reparentNode } from './doc'
import {
  flowOf,
  hasSizeOverride,
  inReorderBand,
  insertionAt,
  isAutoLayout,
  isLayoutPositioned,
  measuredIds,
  parentFlowOf,
  resolveDropTarget,
} from './layout'
import { isFrameNode, type CanvasDoc, type CanvasFrameNode, type CanvasRect, type NodeId } from './types'

/** A board with one stack frame holding two children, plus a loose sibling. */
function stackDoc(flow: 'vertical' | 'horizontal' = 'vertical') {
  let doc = createDoc('t')
  const stack = createFrameNode({ x: 100, y: 100, w: 400, h: 300 }, 'Stack')
  stack.style = { ...stack.style, flow }
  doc = insertNode(doc, stack, null)

  const a = createFrameNode({ x: 50, y: 50, w: 100, h: 50 }, 'A')
  const b = createFrameNode({ x: 200, y: 150, w: 140, h: 60 }, 'B')
  doc = insertNode(doc, a, stack.id)
  doc = insertNode(doc, b, stack.id)

  const loose = createFrameNode({ x: 700, y: 100, w: 80, h: 80 }, 'Loose')
  doc = insertNode(doc, loose, null)
  return { doc, stackId: stack.id, aId: a.id, bId: b.id, looseId: loose.id }
}

function frame(doc: CanvasDoc, id: NodeId): CanvasFrameNode {
  const found = doc.nodes.flatMap((n) => [n, ...(isFrameNode(n) ? n.children : [])]).find((n) => n.id === id)
  if (!found || !isFrameNode(found)) throw new Error(`no frame ${id}`)
  return found
}

describe('flow ownership', () => {
  it('treats an unset flow, and every non-frame, as freeform', () => {
    expect(flowOf(createFrameNode({ x: 0, y: 0, w: 1, h: 1 }))).toBe('freeform')
    expect(flowOf(createTextNode({ x: 0, y: 0, w: 1, h: 1 }))).toBe('freeform')
    expect(flowOf(null)).toBe('freeform')
  })

  it('marks a stack frame as owning its children, and root nodes as owning themselves', () => {
    const { doc, stackId, aId, looseId } = stackDoc()
    expect(isAutoLayout(frame(doc, stackId))).toBe(true)
    expect(parentFlowOf(doc, aId)).toBe('vertical')
    expect(isLayoutPositioned(doc, aId)).toBe(true)
    // A root node is always freeform: there is no parent to lay it out.
    expect(parentFlowOf(doc, looseId)).toBe('freeform')
    expect(isLayoutPositioned(doc, looseId)).toBe(false)
    expect(isLayoutPositioned(doc, stackId)).toBe(false)
  })

  it('measures the whole subtree under a stack, not just its direct children', () => {
    const { doc, stackId, aId, bId, looseId } = stackDoc()
    // A freeform frame INSIDE the stack still places its own children by their
    // rects — but against a box only the browser can locate.
    const grand = createFrameNode({ x: 5, y: 5, w: 20, h: 20 }, 'Grand')
    const nested = insertNode(doc, grand, aId)

    expect(measuredIds(nested)).toEqual([aId, grand.id, bId])
    // The stack itself is placed by its own rect, as is every root node.
    expect(measuredIds(nested)).not.toContain(stackId)
    expect(measuredIds(nested)).not.toContain(looseId)
  })

  it('measures nothing at all on a board with no auto-layout', () => {
    let doc = createDoc('t')
    const outer = createFrameNode({ x: 0, y: 0, w: 100, h: 100 })
    doc = insertNode(doc, outer, null)
    doc = insertNode(doc, createFrameNode({ x: 10, y: 10, w: 20, h: 20 }), outer.id)
    // The freeform path stays entirely DOM-free, which is what keeps it exact.
    expect(measuredIds(doc)).toEqual([])
  })

  it('measures a node whose own style decides its size, even at the board root', () => {
    let doc = createDoc('t')
    // positionCss drops the rect's width the moment style.w is set, so 'fill',
    // 'hug' and the min/max clamps leave rect.w describing a box that is not on
    // screen — as unmeasurable from the model as a child of a stack.
    const filled = createFrameNode({ x: 0, y: 0, w: 100, h: 100 }, 'Fill')
    filled.style = { ...filled.style, w: 'fill' }
    const clamped = createFrameNode({ x: 0, y: 200, w: 100, h: 100 }, 'Clamped')
    clamped.style = { ...clamped.style, minW: 300 }
    const plain = createFrameNode({ x: 0, y: 400, w: 100, h: 100 }, 'Plain')
    doc = insertNode(doc, filled, null)
    doc = insertNode(doc, clamped, null)
    doc = insertNode(doc, plain, null)

    expect(hasSizeOverride(filled)).toBe(true)
    expect(hasSizeOverride(clamped)).toBe(true)
    expect(hasSizeOverride(plain)).toBe(false)
    expect(measuredIds(doc)).toEqual([filled.id, clamped.id])
  })

  it('does not spread a size override to descendants, whose rects still hold', () => {
    let doc = createDoc('t')
    const sized = createFrameNode({ x: 0, y: 0, w: 100, h: 100 }, 'Sized')
    sized.style = { ...sized.style, w: 'hug' }
    doc = insertNode(doc, sized, null)
    const child = createFrameNode({ x: 10, y: 10, w: 20, h: 20 }, 'Child')
    doc = insertNode(doc, child, sized.id)

    // Only the box changed, not the origin — the child still sits at its own
    // rect relative to a top-left that has not moved.
    expect(measuredIds(doc)).toEqual([sized.id])
    const measured = new Map([[sized.id, { x: 0, y: 0, w: 260, h: 100 }]])
    expect(boardRectOf(doc, child.id, measured)).toEqual({ x: 10, y: 10, w: 20, h: 20 })
  })
})

describe('measured rects override the model', () => {
  it('returns the DOM box for a laid-out child instead of its stale rect', () => {
    const { doc, aId } = stackDoc()
    // The model would say 150,150 — flex actually put it at the stack's origin.
    expect(boardRectOf(doc, aId)).toMatchObject({ x: 150, y: 150 })
    const measured = new Map([[aId, { x: 100, y: 100, w: 100, h: 50 }]])
    expect(boardRectOf(doc, aId, measured)).toEqual({ x: 100, y: 100, w: 100, h: 50 })
  })

  it('offsets a freeform grandchild from its measured ancestor, not from the model chain', () => {
    const { doc, aId } = stackDoc()
    const grand = createFrameNode({ x: 5, y: 5, w: 20, h: 20 })
    const nested = insertNode(doc, grand, aId)
    // Only A is measured; the grandchild is placed by its own rect against it.
    const measured = new Map([[aId, { x: 100, y: 100, w: 100, h: 50 }]])
    expect(boardRectOf(nested, grand.id, measured)).toEqual({ x: 105, y: 105, w: 20, h: 20 })
  })

  it('hit-tests the box that is on screen, so a laid-out child is clickable', () => {
    const { doc, stackId, aId } = stackDoc()
    const measured = new Map([[aId, { x: 100, y: 100, w: 100, h: 50 }]])

    // Without the override the point lands on the stack alone — the reported
    // "selecting a child does nothing" symptom.
    expect(hitPath(doc, 110, 110).map((n) => n.id)).toEqual([stackId])
    expect(hitPath(doc, 110, 110, { measured }).map((n) => n.id)).toEqual([stackId, aId])
  })

  it('marquee-selects on the measured box too', () => {
    const { doc, aId } = stackDoc()
    const measured = new Map([[aId, { x: 100, y: 100, w: 100, h: 50 }]])
    const marquee: CanvasRect = { x: 90, y: 90, w: 130, h: 80 }
    expect(nodesInRect(doc, marquee, measured).map((n) => n.id)).toContain(aId)
  })

  it('un-nests a laid-out child to where it actually sat, not where the model guessed', () => {
    const { doc, aId } = stackDoc()
    const measured = new Map([[aId, { x: 100, y: 100, w: 100, h: 50 }]])
    const next = reparentNode(doc, aId, null, undefined, measured)
    const lifted = next.nodes.find((n) => n.id === aId)!
    // Board position preserved: dropping it out must not teleport it.
    expect(lifted.rect).toMatchObject({ x: 100, y: 100 })
  })
})

describe('insertionAt', () => {
  const rects = new Map<NodeId, CanvasRect>()
  const rectOf = (id: NodeId) => rects.get(id) ?? null

  it('flips at each neighbour’s midpoint, not its edge', () => {
    const { doc, stackId, aId, bId } = stackDoc('vertical')
    rects.clear()
    rects.set(aId, { x: 100, y: 100, w: 100, h: 50 }) // mid y = 125
    rects.set(bId, { x: 100, y: 150, w: 140, h: 60 }) // mid y = 180
    const parentRect = { x: 100, y: 100, w: 400, h: 300 }

    expect(insertionAt(frame(doc, stackId), parentRect, 150, 110, rectOf).index).toBe(0)
    expect(insertionAt(frame(doc, stackId), parentRect, 150, 140, rectOf).index).toBe(1)
    expect(insertionAt(frame(doc, stackId), parentRect, 150, 200, rectOf).index).toBe(2)
  })

  it('compares on the x axis for a horizontal stack', () => {
    const { doc, stackId, aId, bId } = stackDoc('horizontal')
    rects.clear()
    rects.set(aId, { x: 100, y: 100, w: 100, h: 50 }) // mid x = 150
    rects.set(bId, { x: 200, y: 100, w: 140, h: 60 }) // mid x = 270
    const parentRect = { x: 100, y: 100, w: 400, h: 300 }

    expect(insertionAt(frame(doc, stackId), parentRect, 120, 120, rectOf).index).toBe(0)
    expect(insertionAt(frame(doc, stackId), parentRect, 300, 120, rectOf).index).toBe(2)
  })

  it('ignores the nodes being dragged, so a node never inserts relative to itself', () => {
    const { doc, stackId, aId, bId } = stackDoc('vertical')
    rects.clear()
    rects.set(aId, { x: 100, y: 100, w: 100, h: 50 })
    rects.set(bId, { x: 100, y: 150, w: 140, h: 60 })
    const parentRect = { x: 100, y: 100, w: 400, h: 300 }

    // Dragging A past B: only B is a candidate, so the far end is index 1.
    const past = insertionAt(frame(doc, stackId), parentRect, 150, 200, rectOf, new Set([aId]))
    expect(past.index).toBe(1)
  })

  it('draws the bar across the flow, at the boundary the drop would use', () => {
    const { doc, stackId, aId, bId } = stackDoc('vertical')
    rects.clear()
    rects.set(aId, { x: 100, y: 100, w: 100, h: 50 })
    rects.set(bId, { x: 100, y: 150, w: 140, h: 60 })
    const parentRect = { x: 100, y: 100, w: 400, h: 300 }

    const between = insertionAt(frame(doc, stackId), parentRect, 150, 140, rectOf)
    // A horizontal bar sitting on B's leading edge, spanning the parent.
    expect(between.indicator.y).toBeCloseTo(149, 5)
    expect(between.indicator.h).toBe(2)
    expect(between.indicator.w).toBe(400)
  })

  it('offers index 0 with a bar at the start edge when the parent is empty', () => {
    let doc = createDoc('t')
    const empty = createFrameNode({ x: 0, y: 0, w: 200, h: 100 })
    empty.style = { ...empty.style, flow: 'vertical' }
    doc = insertNode(doc, empty, null)
    const result = insertionAt(frame(doc, empty.id), { x: 0, y: 0, w: 200, h: 100 }, 50, 50, () => null)
    expect(result.index).toBe(0)
    expect(result.indicator).toMatchObject({ x: 0, y: 0, w: 200 })
  })
})

describe('reorder versus nest', () => {
  it('reorders near a sibling’s ends and nests through its middle', () => {
    const rect: CanvasRect = { x: 100, y: 150, w: 140, h: 60 }
    // Leading and trailing quarters (y < 165, y > 195) reorder.
    expect(inReorderBand(rect, 150, 155, 'vertical')).toBe(true)
    expect(inReorderBand(rect, 150, 205, 'vertical')).toBe(true)
    expect(inReorderBand(rect, 150, 180, 'vertical')).toBe(false)
    // The bands are on the flow axis only.
    expect(inReorderBand(rect, 105, 180, 'vertical')).toBe(false)
    expect(inReorderBand(rect, 105, 180, 'horizontal')).toBe(true)
  })

  it('redirects a near-edge sibling drop to the shared stack, keeping the middle a nest', () => {
    const { doc, stackId, aId, bId } = stackDoc('vertical')
    const measured = new Map<NodeId, CanvasRect>([
      [aId, { x: 100, y: 100, w: 100, h: 50 }],
      [bId, { x: 100, y: 150, w: 140, h: 60 }],
    ])
    const rectOf = (id: NodeId) => boardRectOf(doc, id, measured)
    const b = frame(doc, bId)

    // Dragging A over B's trailing edge means "after B", not "inside B".
    expect(resolveDropTarget(doc, b, 150, 205, rectOf, new Set([aId]))?.id).toBe(stackId)
    // Squarely inside B still nests, so nesting is not lost.
    expect(resolveDropTarget(doc, b, 150, 180, rectOf, new Set([aId]))?.id).toBe(bId)
  })

  it('leaves every non-sibling drop exactly as it was', () => {
    const { doc, stackId, aId, looseId } = stackDoc('vertical')
    const rectOf = (id: NodeId) => boardRectOf(doc, id)
    // Dragging the loose root node — its parent is the board, never a stack.
    expect(resolveDropTarget(doc, frame(doc, stackId), 150, 105, rectOf, new Set([looseId]))?.id).toBe(stackId)
    // The stack itself is the target, not a sibling of the dragged node.
    expect(resolveDropTarget(doc, frame(doc, stackId), 150, 105, rectOf, new Set([aId]))?.id).toBe(stackId)
  })
})
