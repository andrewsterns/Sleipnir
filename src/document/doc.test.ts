import { describe, it, expect } from 'vitest'
import {
  ancestorsOf,
  boardRectOf,
  createDoc,
  createFrameNode,
  createTextNode,
  deleteNode,
  findNode,
  findParent,
  hitTest,
  insertNode,
  isDescendant,
  moveNode,
  nodesInRect,
  reparentNode,
  setStyle,
  updateNode,
} from './doc'
import type { CanvasDoc, CanvasFrameNode } from './types'

// A 3-level board:  outer(10,10 200x200) > mid(20,20 100x100) > leaf(5,5 40x40)
// plus a sibling text node at the root.
function fixture() {
  const outer = createFrameNode({ x: 10, y: 10, w: 200, h: 200 }, 'outer')
  const mid = createFrameNode({ x: 20, y: 20, w: 100, h: 100 }, 'mid')
  const leaf = createFrameNode({ x: 5, y: 5, w: 40, h: 40 }, 'leaf')
  const text = createTextNode({ x: 400, y: 400, w: 80, h: 20 }, 'hello')

  let doc = createDoc('board')
  doc = insertNode(doc, outer, null)
  doc = insertNode(doc, mid, outer.id)
  doc = insertNode(doc, leaf, mid.id)
  doc = insertNode(doc, text, null)
  return { doc, outer, mid, leaf, text }
}

describe('immutability', () => {
  it('never mutates the input doc — the undo stack holds these references', () => {
    const { doc, leaf } = fixture()
    const snapshot = JSON.stringify(doc)

    moveNode(doc, leaf.id, 50, 50)
    deleteNode(doc, leaf.id)
    setStyle(doc, leaf.id, { opacity: 0.5 })
    reparentNode(doc, leaf.id, null)

    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('returns a new doc object on every structural edit', () => {
    const { doc, leaf } = fixture()
    const next = moveNode(doc, leaf.id, 1, 0)
    expect(next).not.toBe(doc)
    expect(next.updatedAt).toBeGreaterThanOrEqual(doc.updatedAt)
  })

  it('returns the SAME doc when the target does not exist, so no-ops do not dirty the board', () => {
    const { doc } = fixture()
    expect(moveNode(doc, 'nope', 5, 5)).toBe(doc)
    expect(deleteNode(doc, 'nope')).toBe(doc)
    expect(updateNode(doc, 'nope', { name: 'x' })).toBe(doc)
  })
})

describe('traversal', () => {
  it('finds nodes and parents at any depth', () => {
    const { doc, outer, mid, leaf } = fixture()
    expect(findNode(doc, leaf.id)?.name).toBe('leaf')
    expect(findParent(doc, leaf.id)?.id).toBe(mid.id)
    expect(findParent(doc, outer.id)).toBeNull()
  })

  it('lists ancestors outermost-first', () => {
    const { doc, outer, mid, leaf } = fixture()
    expect(ancestorsOf(doc, leaf.id).map((n) => n.id)).toEqual([outer.id, mid.id])
  })

  it('accumulates board position through ancestors', () => {
    const { doc, leaf } = fixture()
    // 10+20+5, 10+20+5
    expect(boardRectOf(doc, leaf.id)).toEqual({ x: 35, y: 35, w: 40, h: 40 })
  })
})

describe('insertNode', () => {
  it('refuses to nest into a non-frame, since only frames hold children', () => {
    const { doc, text } = fixture()
    const child = createFrameNode({ x: 0, y: 0, w: 10, h: 10 })
    expect(insertNode(doc, child, text.id)).toBe(doc)
  })

  it('honors an explicit index', () => {
    const { doc, outer } = fixture()
    const first = createFrameNode({ x: 0, y: 0, w: 10, h: 10 }, 'first')
    const next = insertNode(doc, first, outer.id, 0)
    const parent = findNode(next, outer.id) as CanvasFrameNode
    expect(parent.children[0].name).toBe('first')
  })
})

describe('deleteNode', () => {
  it('removes the whole subtree', () => {
    const { doc, outer, mid, leaf } = fixture()
    const next = deleteNode(doc, outer.id)
    expect(findNode(next, outer.id)).toBeNull()
    expect(findNode(next, mid.id)).toBeNull()
    expect(findNode(next, leaf.id)).toBeNull()
  })

  it('leaves siblings alone', () => {
    const { doc, outer, text } = fixture()
    const next = deleteNode(doc, outer.id)
    expect(findNode(next, text.id)).not.toBeNull()
  })
})

describe('updateNode', () => {
  it('cannot replace children — that is structural and must go through insert/delete/reparent', () => {
    const { doc, mid, leaf } = fixture()
    const next = updateNode<CanvasFrameNode>(doc, mid.id, { children: [] } as Partial<CanvasFrameNode>)
    expect(findNode(next, leaf.id)).not.toBeNull()
  })

  it('merges style rather than replacing it', () => {
    const { doc, outer } = fixture()
    const next = setStyle(doc, outer.id, { opacity: 0.5 })
    const node = findNode(next, outer.id)!
    expect(node.style.opacity).toBe(0.5)
    expect(node.style.flow).toBe('freeform') // the default survived
  })
})

describe('reparentNode', () => {
  it('rejects reparenting a node into itself', () => {
    const { doc, mid } = fixture()
    expect(reparentNode(doc, mid.id, mid.id)).toBe(doc)
  })

  it('rejects reparenting a node into its own descendant, which would detach the subtree', () => {
    const { doc, outer, leaf } = fixture()
    expect(isDescendant(doc, outer.id, leaf.id)).toBe(true)
    expect(reparentNode(doc, outer.id, leaf.id)).toBe(doc)
  })

  it('converts coordinate spaces so the node does not visually jump', () => {
    const { doc, leaf } = fixture()
    const before = boardRectOf(doc, leaf.id)
    const next = reparentNode(doc, leaf.id, null)
    expect(boardRectOf(next, leaf.id)).toEqual(before)
    // Now a root node, so its local rect IS its board rect.
    expect(findNode(next, leaf.id)!.rect).toEqual({ x: 35, y: 35, w: 40, h: 40 })
  })

  it('keeps the node exactly once in the tree', () => {
    const { doc, leaf, outer } = fixture()
    const next = reparentNode(doc, leaf.id, outer.id)
    let count = 0
    const step = (nodes: typeof next.nodes) => {
      for (const n of nodes) {
        if (n.id === leaf.id) count += 1
        if (n.kind === 'frame') step(n.children)
      }
    }
    step(next.nodes)
    expect(count).toBe(1)
    expect(findParent(next, leaf.id)?.id).toBe(outer.id)
  })
})

describe('hitTest', () => {
  it('picks the deepest node under the point', () => {
    const { doc, leaf } = fixture()
    // leaf occupies board 35,35 → 75,75
    expect(hitTest(doc, 40, 40)?.id).toBe(leaf.id)
  })

  it('falls back to the ancestor outside the child', () => {
    const { doc, mid, outer } = fixture()
    expect(hitTest(doc, 100, 100)?.id).toBe(mid.id) // mid is board 30,30 → 130,130
    expect(hitTest(doc, 190, 190)?.id).toBe(outer.id)
  })

  it('returns null on empty board space', () => {
    const { doc } = fixture()
    expect(hitTest(doc, 900, 900)).toBeNull()
  })

  it('skips hidden nodes and never selects a locked one', () => {
    const { doc, leaf, mid } = fixture()
    const hiddenLeaf = updateNode(doc, leaf.id, { hidden: true })
    expect(hitTest(hiddenLeaf, 40, 40)?.id).toBe(mid.id)

    const lockedLeaf = updateNode(doc, leaf.id, { locked: true })
    expect(hitTest(lockedLeaf, 40, 40)?.id).toBe(mid.id)
  })
})

describe('nodesInRect', () => {
  it('returns an enclosing ancestor without also returning its descendants', () => {
    const { doc, outer, text } = fixture()
    const found = nodesInRect(doc, { x: 0, y: 0, w: 1000, h: 1000 })
    expect(found.map((n) => n.id).sort()).toEqual([outer.id, text.id].sort())
  })

  it('descends into a partially covered frame to find fully covered children', () => {
    const { doc, mid, leaf } = fixture()
    // Covers mid (30,30→130,130) fully but clips outer (10,10→210,210).
    const found = nodesInRect(doc, { x: 25, y: 25, w: 120, h: 120 })
    expect(found.map((n) => n.id)).toEqual([mid.id])

    // Covers only the leaf (35,35→75,75).
    const deeper = nodesInRect(doc, { x: 30, y: 30, w: 60, h: 60 })
    expect(deeper.map((n) => n.id)).toEqual([leaf.id])
  })
})

describe('createDoc', () => {
  it('produces a versioned, empty, JSON-round-trippable board', () => {
    const doc = createDoc('My Board')
    expect(doc.name).toBe('My Board')
    expect(doc.nodes).toEqual([])
    expect(doc.components).toEqual([])
    expect(doc.version).toBe(1)
    const round: CanvasDoc = JSON.parse(JSON.stringify(doc))
    expect(round).toEqual(doc)
  })

  it('gives every created node a unique id', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 200; i += 1) ids.add(createFrameNode({ x: 0, y: 0, w: 1, h: 1 }).id)
    expect(ids.size).toBe(200)
  })
})
