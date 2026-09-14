import { describe, it, expect } from 'vitest'
import {
  boardRectOf,
  boundingBoxOf,
  createDoc,
  createFrameNode,
  dropTargetAt,
  findNode,
  findParent,
  groupNodes,
  hitPath,
  insertNode,
  pickForScope,
  setRect,
  setStyle,
  ungroupNode,
} from './doc'
import { createComponentFromFrame } from './variants'
import type { CanvasDoc, CanvasFrameNode } from './types'

// outer(10,10 200x200) > mid(20,20 100x100) > leaf(5,5 40x40)
function nested() {
  const outer = createFrameNode({ x: 10, y: 10, w: 200, h: 200 }, 'outer')
  const mid = createFrameNode({ x: 20, y: 20, w: 100, h: 100 }, 'mid')
  const leaf = createFrameNode({ x: 5, y: 5, w: 40, h: 40 }, 'leaf')
  let doc = createDoc('board')
  doc = insertNode(doc, outer, null)
  doc = insertNode(doc, mid, outer.id)
  doc = insertNode(doc, leaf, mid.id)
  return { doc, outer, mid, leaf }
}

describe('hitPath', () => {
  it('returns the containment chain outermost-first', () => {
    const { doc, outer, mid, leaf } = nested()
    // leaf occupies board 35,35 → 75,75
    expect(hitPath(doc, 40, 40).map((n) => n.id)).toEqual([outer.id, mid.id, leaf.id])
  })

  it('stops where containment stops', () => {
    const { doc, outer, mid } = nested()
    expect(hitPath(doc, 100, 100).map((n) => n.id)).toEqual([outer.id, mid.id])
    expect(hitPath(doc, 190, 190).map((n) => n.id)).toEqual([outer.id])
    expect(hitPath(doc, 900, 900)).toEqual([])
  })

  it('prefers the topmost sibling, since later siblings paint on top', () => {
    let doc = createDoc('board')
    const under = createFrameNode({ x: 0, y: 0, w: 100, h: 100 }, 'under')
    const over = createFrameNode({ x: 0, y: 0, w: 100, h: 100 }, 'over')
    doc = insertNode(doc, under, null)
    doc = insertNode(doc, over, null)
    expect(hitPath(doc, 50, 50).map((n) => n.name)).toEqual(['over'])
  })

  it('still finds a child dragged OUTSIDE its parent, which is still painted there', () => {
    const { doc, outer, mid, leaf } = nested()
    // leaf moved to 400,400 in mid's space — board 430,430, well clear of outer.
    const escaped = setRect(doc, leaf.id, { x: 400, y: 400 })
    expect(hitPath(escaped, 440, 440).map((n) => n.id)).toEqual([outer.id, mid.id, leaf.id])
  })

  it('does not find a child that a CLIPPING parent hides, matching what is painted', () => {
    const { doc, leaf, mid } = nested()
    const escaped = setRect(doc, leaf.id, { x: 400, y: 400 })
    const clipped = setStyle(escaped, mid.id, { clip: true })
    expect(hitPath(clipped, 440, 440)).toEqual([])
  })

  it('makes ignored subtrees transparent rather than merely unselectable', () => {
    const { doc, outer, mid, leaf } = nested()
    // Without this, a dragged node occludes whatever it is dragged over.
    expect(hitPath(doc, 40, 40, { ignore: new Set([leaf.id]) }).map((n) => n.id)).toEqual([
      outer.id,
      mid.id,
    ])
    expect(hitPath(doc, 40, 40, { ignore: new Set([outer.id]) })).toEqual([])
  })
})

describe('pickForScope', () => {
  // A top-level frame is an artboard, and an artboard's contents are directly
  // clickable — otherwise every element inside a frame would need a double-click
  // before it could be touched, and every drag would move the frame instead.
  it('reaches into a top-level frame with no scope, as Figma does', () => {
    const { doc, mid } = nested()
    const path = hitPath(doc, 40, 40)
    expect(pickForScope(path, null)?.id).toBe(mid.id)
  })

  it('still selects the outermost node when nothing is nested under the cursor', () => {
    const { doc, outer } = nested()
    // 190,190 is inside `outer` but outside `mid` — the frame's own background,
    // which is how an artboard is grabbed without its label.
    expect(pickForScope(hitPath(doc, 190, 190), null)?.id).toBe(outer.id)
  })

  it('selects the direct child of whatever you have drilled into', () => {
    const { doc, outer, mid, leaf } = nested()
    const path = hitPath(doc, 40, 40)
    expect(pickForScope(path, outer.id)?.id).toBe(mid.id)
    expect(pickForScope(path, mid.id)?.id).toBe(leaf.id)
  })

  it('stays put at the deepest node rather than returning nothing', () => {
    const { doc, leaf } = nested()
    const path = hitPath(doc, 40, 40)
    expect(pickForScope(path, leaf.id)?.id).toBe(leaf.id)
  })

  it('pops back out when you click outside the scope you drilled into', () => {
    const { doc, outer, mid } = nested()
    const path = hitPath(doc, 190, 190) // outside mid
    expect(pickForScope(path, 'some-other-frame')?.id).toBe(outer.id)
    // Back to the default depth, not all the way to the outermost container.
    expect(pickForScope(hitPath(doc, 40, 40), 'some-other-frame')?.id).toBe(mid.id)
  })

  it('returns null on empty board space', () => {
    expect(pickForScope([], null)).toBeNull()
  })
})

describe('dropTargetAt', () => {
  it('finds the deepest frame under the point', () => {
    const { doc, leaf } = nested()
    // Every node here is a frame, so the innermost one wins.
    expect(dropTargetAt(doc, 40, 40, new Set())?.id).toBe(leaf.id)
  })

  it('never offers the dragged node itself, walking outward instead', () => {
    const { doc, outer, mid, leaf } = nested()
    expect(dropTargetAt(doc, 40, 40, new Set([leaf.id]))?.id).toBe(mid.id)
    expect(dropTargetAt(doc, 40, 40, new Set([leaf.id, mid.id]))?.id).toBe(outer.id)
  })

  it('never offers a descendant of the dragged node — that would detach the subtree', () => {
    const { doc, outer } = nested()
    // Dragging `outer` over its own descendants must find no target inside it.
    expect(dropTargetAt(doc, 40, 40, new Set([outer.id]))).toBeNull()
  })

  it('returns null over empty board space, meaning the root', () => {
    const { doc } = nested()
    expect(dropTargetAt(doc, 900, 900, new Set())).toBeNull()
  })

  it('sees THROUGH the dragged node to the frame underneath it', () => {
    // The regression that made nesting-by-drag mostly not work: once the doc had
    // caught up with the drag, the dragged frame sat under the cursor and
    // occluded its own target, so the drop resolved to the root instead.
    let doc = createDoc('board')
    const target = createFrameNode({ x: 0, y: 0, w: 300, h: 300 }, 'target')
    const dragged = createFrameNode({ x: 50, y: 50, w: 100, h: 100 }, 'dragged')
    doc = insertNode(doc, target, null)
    doc = insertNode(doc, dragged, null) // painted ON TOP of target

    expect(dropTargetAt(doc, 100, 100, new Set([dragged.id]))?.id).toBe(target.id)
  })

  it('never offers an ancestor the path merely passes through', () => {
    const { doc, leaf } = nested()
    // leaf dragged clear of mid: the path still runs through mid and outer, but
    // the cursor is nowhere near either box, so neither may be offered — the
    // root is the honest answer, and it is what un-nests the leaf.
    const escaped = setRect(doc, leaf.id, { x: 400, y: 400 })
    expect(dropTargetAt(escaped, 440, 440, new Set())?.id).toBe(leaf.id)
    expect(dropTargetAt(escaped, 440, 440, new Set([leaf.id]))).toBeNull()
  })

  it('does not offer an instance, which has no children to receive anything', () => {
    const { doc, outer } = nested()
    const promoted = createComponentFromFrame(doc, outer)
    expect(dropTargetAt(promoted.doc, 40, 40, new Set())).toBeNull()
  })
})

describe('boundingBoxOf', () => {
  it('spans every node in board space', () => {
    const { doc, outer, leaf } = nested()
    expect(boundingBoxOf(doc, [outer.id, leaf.id])).toEqual({ x: 10, y: 10, w: 200, h: 200 })
  })

  it('returns null when nothing resolves', () => {
    const { doc } = nested()
    expect(boundingBoxOf(doc, ['nope'])).toBeNull()
  })
})

describe('groupNodes', () => {
  function threeSiblings(): { doc: CanvasDoc; ids: string[] } {
    let doc = createDoc('board')
    const ids: string[] = []
    for (const [x, y] of [
      [0, 0],
      [200, 0],
      [100, 150],
    ]) {
      const frame = createFrameNode({ x, y, w: 100, h: 50 }, `f${x}`)
      doc = insertNode(doc, frame, null)
      ids.push(frame.id)
    }
    return { doc, ids }
  }

  it('wraps siblings in a frame sized to their bounding box', () => {
    const { doc, ids } = threeSiblings()
    const { doc: next, groupId } = groupNodes(doc, ids)
    const group = findNode(next, groupId!) as CanvasFrameNode

    expect(group.kind).toBe('frame')
    expect(group.rect).toEqual({ x: 0, y: 0, w: 300, h: 200 })
    expect(group.children).toHaveLength(3)
    expect(next.nodes).toHaveLength(1)
  })

  it('does not visually move anything — board positions are preserved', () => {
    const { doc, ids } = threeSiblings()
    const before = ids.map((id) => boardRectOf(doc, id))
    const { doc: next } = groupNodes(doc, ids)
    const after = ids.map((id) => boardRectOf(next, id))
    expect(after).toEqual(before)
  })

  it('is a plain container with no fill or stroke, so wrapping changes no visuals', () => {
    const { doc, ids } = threeSiblings()
    const { doc: next, groupId } = groupNodes(doc, ids)
    const group = findNode(next, groupId!)!
    expect(group.style.fills).toBeUndefined()
    expect(group.style.stroke).toBeUndefined()
    expect(group.style.flow).toBe('freeform')
  })

  it('groups inside the shared parent rather than hoisting to the root', () => {
    const { doc, outer, mid } = nested()
    const sibling = createFrameNode({ x: 130, y: 20, w: 40, h: 40 }, 'sib')
    const withSibling = insertNode(doc, sibling, outer.id)

    const { doc: next, groupId } = groupNodes(withSibling, [mid.id, sibling.id])
    expect(findParent(next, groupId!)?.id).toBe(outer.id)
  })

  it('ignores members that do not share a parent', () => {
    const { doc, outer, leaf } = nested()
    const { doc: next, groupId } = groupNodes(doc, [outer.id, leaf.id])
    // `outer` is first, so the group forms at the root and `leaf` is excluded.
    const group = findNode(next, groupId!) as CanvasFrameNode
    expect(group.children.map((c) => c.id)).toEqual([outer.id])
  })

  it('is a no-op for an empty or unresolvable selection', () => {
    const { doc } = nested()
    expect(groupNodes(doc, []).groupId).toBeNull()
    expect(groupNodes(doc, ['nope']).groupId).toBeNull()
  })

  it('does not mutate the input doc', () => {
    const { doc, ids } = threeSiblings()
    const snapshot = JSON.stringify(doc)
    groupNodes(doc, ids)
    expect(JSON.stringify(doc)).toBe(snapshot)
  })
})

describe('ungroupNode', () => {
  it('lifts children into the parent without moving them', () => {
    let doc = createDoc('board')
    const ids: string[] = []
    for (const [x, y] of [
      [0, 0],
      [200, 0],
    ]) {
      const frame = createFrameNode({ x, y, w: 100, h: 50 }, `f${x}`)
      doc = insertNode(doc, frame, null)
      ids.push(frame.id)
    }
    const grouped = groupNodes(doc, ids)
    const before = ids.map((id) => boardRectOf(grouped.doc, id))

    const { doc: next, childIds } = ungroupNode(grouped.doc, grouped.groupId!)
    expect(findNode(next, grouped.groupId!)).toBeNull()
    expect(childIds).toHaveLength(2)
    expect(ids.map((id) => boardRectOf(next, id))).toEqual(before)
    expect(next.nodes).toHaveLength(2)
  })

  it('round-trips: group then ungroup restores the original positions', () => {
    const { doc, outer } = nested()
    const sibling = createFrameNode({ x: 130, y: 20, w: 40, h: 40 }, 'sib')
    const start = insertNode(doc, sibling, outer.id)
    const ids = [(findNode(start, outer.id) as CanvasFrameNode).children[0].id, sibling.id]

    const before = ids.map((id) => boardRectOf(start, id))
    const grouped = groupNodes(start, ids)
    const restored = ungroupNode(grouped.doc, grouped.groupId!)
    expect(ids.map((id) => boardRectOf(restored.doc, id))).toEqual(before)
  })

  it('is a no-op on a leaf or an empty frame', () => {
    const { doc, leaf } = nested()
    expect(ungroupNode(doc, leaf.id).doc).toBe(doc)
    expect(ungroupNode(doc, 'nope').doc).toBe(doc)
  })
})
