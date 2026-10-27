import { describe, it, expect } from 'vitest'
import { createDoc, createFrameNode, createTextNode, createVectorNode, hitTest } from './doc'
import { reflowPaths } from './pathFlow'
import { copyId, patternCount, syncPattern } from './pathPattern'
import type { AlongPath, CanvasDoc, CanvasFrameNode, CanvasNode } from './types'

const line = (w = 200) =>
  createVectorNode({ x: 0, y: 50, w, h: 0 }, 'path', {
    points: [{ x: 0, y: 0 }, { x: w, y: 0 }],
    closed: false,
    viewBox: { w, h: 0 },
  })

function tile(): CanvasFrameNode {
  const f = createFrameNode({ x: 0, y: 0, w: 20, h: 10 }, 'Tile')
  return { ...f, children: [createTextNode({ x: 2, y: 2, w: 10, h: 6 }, 'A')] }
}

function pattern(alongPath: AlongPath, children: CanvasNode[] = [line(), tile()], gap?: number): CanvasFrameNode {
  const frame = createFrameNode({ x: 0, y: 0, w: 300, h: 300 }, 'Pattern')
  return { ...frame, style: { ...frame.style, alongPath, gap }, children }
}

const flow = (frame: CanvasFrameNode): CanvasDoc => reflowPaths({ ...createDoc('b'), nodes: [frame] })
const kids = (doc: CanvasDoc) => (doc.nodes[0] as CanvasFrameNode).children

describe('syncPattern', () => {
  it('repeats the first layer N times, copies right behind it, with derived ids', () => {
    const frame = pattern({ repeat: 4 })
    const tpl = frame.children[1]
    const out = syncPattern(frame).children
    expect(out.map((c) => c.id)).toEqual([frame.children[0].id, tpl.id, copyId(tpl.id, 1), copyId(tpl.id, 2), copyId(tpl.id, 3)])
    expect(out.slice(2).every((c) => c.repeatOf === tpl.id)).toBe(true)
    // Descendants get derived ids too, so nothing collides.
    expect((out[2] as CanvasFrameNode).children[0].id).toBe(copyId((tpl as CanvasFrameNode).children[0].id, 1))
  })

  it('returns the same frame when the copies are already right', () => {
    const once = syncPattern(pattern({ repeat: 3 }))
    expect(syncPattern(once)).toBe(once)
  })

  it('rebuilds every copy when the template changes, and trims when the count drops', () => {
    const once = syncPattern(pattern({ repeat: 3 }))
    const renamed = { ...once, children: once.children.map((c, i) => (i === 1 ? { ...c, name: 'Star' } : c)) }
    const out = syncPattern(renamed)
    expect(out.children.slice(2).map((c) => c.name)).toEqual(['Star', 'Star'])
    const fewer = syncPattern({ ...out, style: { ...out.style, alongPath: { repeat: 2 } } })
    expect(fewer.children).toHaveLength(3)
  })

  it('drops the copies when the pattern is switched off', () => {
    const once = syncPattern(pattern({ repeat: 3 }))
    expect(syncPattern({ ...once, style: { ...once.style, alongPath: {} } }).children).toHaveLength(2)
  })
})

describe('patternCount', () => {
  it('fits as many as the path holds for fill', () => {
    // 200px line, 20px tiles 5px apart: 20·n + 5·(n−1) ≤ 200 → n = 8.
    const frame = pattern({ repeat: 'fill', spacing: 'gap' }, undefined, 5)
    expect(patternCount(frame, frame.children[1])).toBe(8)
  })
})

describe('a pattern on the board', () => {
  it('spaces the template and its copies along the path', () => {
    const doc = flow(pattern({ repeat: 3 }))
    const centers = kids(doc).slice(1).map((c) => c.rect.x + c.rect.w / 2)
    expect(centers).toEqual([0, 100, 200])
  })

  it('lets a click select a copy itself — a piece, not its insides', () => {
    const doc = flow(pattern({ repeat: 3 }))
    const last = kids(doc)[3]
    // The last copy is centered at x=200 on the line at y=50; its text child isn't reachable.
    expect(hitTest(doc, 200, 50, { tolerance: 0 })?.id).toBe(last.id)
  })
})

describe('free pieces', () => {
  it('keeps a reordered run in its new order through every sync', () => {
    const once = syncPattern(pattern({ repeat: 3 }))
    const [guide, tpl, c1, c2] = once.children
    const shuffled = { ...once, children: [guide, c2, tpl, c1] }
    expect(syncPattern(shuffled).children.map((c) => c.id)).toEqual([guide.id, c2.id, tpl.id, c1.id])
  })

  it('keeps each piece’s own turn when the template changes', () => {
    const once = syncPattern(pattern({ repeat: 3 }))
    const turned = { ...once, children: once.children.map((c, i) => (i === 2 ? { ...c, pathTurn: 45 } : c)) }
    const renamed = { ...turned, children: turned.children.map((c, i) => (i === 1 ? { ...c, name: 'Star' } : c)) }
    const out = syncPattern(renamed).children
    expect(out[2].name).toBe('Star')
    expect(out[2].pathTurn).toBe(45)
  })

  it('turns a piece by its pathTurn on top of the path', () => {
    const once = syncPattern(pattern({ repeat: 2, orient: true }))
    const turned = { ...once, children: once.children.map((c, i) => (i === 2 ? { ...c, pathTurn: 30 } : c)) }
    const doc = flow(turned)
    expect(kids(doc)[1].style.rotate).toBeUndefined() // the line heads at 0°
    expect(kids(doc)[2].style.rotate).toBe(30)
  })

  it('grows new pieces past the highest number in use, so a deleted one doesn’t come back', () => {
    const once = syncPattern(pattern({ repeat: 4 }))
    const tplId = once.children[1].id
    const without2 = { ...once, style: { ...once.style, alongPath: { repeat: 3 } }, children: once.children.filter((c) => c.id !== copyId(tplId, 2)) }
    expect(syncPattern(without2)).toBe(without2)
    const more = syncPattern({ ...without2, style: { ...without2.style, alongPath: { repeat: 4 } } })
    expect(more.children.map((c) => c.id).slice(2)).toEqual([copyId(tplId, 1), copyId(tplId, 3), copyId(tplId, 4)])
  })
})

describe('editing pieces', () => {
  it('sends edits on a copy to its template, and deleting a copy shortens the run', async () => {
    const { deletePiece, editTargetOf } = await import('../CanvasView.ViewModel')
    const doc = flow(pattern({ repeat: 4 }))
    const [, tpl, c1, c2] = kids(doc)
    expect(editTargetOf(doc, c1.id)).toBe(tpl.id)
    expect(editTargetOf(doc, tpl.id)).toBe(tpl.id)
    const after = reflowPaths(deletePiece(doc, c2.id))
    const frame = after.nodes[0] as CanvasFrameNode
    expect(frame.style.alongPath?.repeat).toBe(3)
    expect(frame.children.map((c) => c.id)).not.toContain(c2.id)
    expect(frame.children).toHaveLength(4)
  })
})

describe('Pattern along path', () => {
  it('picks the pen path as the guide, wraps both, and repeats the other along it', async () => {
    const { makePathPattern, pathAndPiece } = await import('./pathPattern')
    const { insertNode } = await import('./doc')
    const dot = createFrameNode({ x: 0, y: 0, w: 10, h: 10 }, 'Dot')
    const curve = line()
    let doc = { ...createDoc('b') }
    doc = insertNode(insertNode(doc, dot, null), curve, null)
    expect(pathAndPiece([dot, curve])).toEqual({ path: curve, piece: dot })
    const { doc: next, frameId } = makePathPattern(doc, [dot.id, curve.id])
    const flowed = reflowPaths(next)
    const frame = flowed.nodes.find((n) => n.id === frameId) as CanvasFrameNode
    expect(frame.style.alongPath).toMatchObject({ repeat: 8, orient: true })
    expect(frame.children[0].id).toBe(curve.id) // the guide sits first
    expect(frame.children).toHaveLength(9) // the path + 8 pieces
  })

  it('refuses two layers where neither could be a path', async () => {
    const { pathAndPiece } = await import('./pathPattern')
    expect(pathAndPiece([createFrameNode({ x: 0, y: 0, w: 1, h: 1 }), createFrameNode({ x: 0, y: 0, w: 1, h: 1 })])).toBeNull()
  })
})

describe('patterns become code', () => {
  it('as a React component: the piece once, mapped over its positions', async () => {
    const { createComponentFromFrame } = await import('./variants')
    const { emitComponentFile } = await import('../emit/react')
    const doc = flow(pattern({ repeat: 5, orient: true }))
    const promoted = createComponentFromFrame(doc, doc.nodes[0] as CanvasFrameNode, { name: 'Dots' })
    const file = emitComponentFile(promoted.component, { filePath: '.components/dots/dots.tsx', components: promoted.doc.components }, 'h')
    expect(file.content).toContain('export const Dots')
    expect(file.content).toContain('].map(([x, y, r], i) => (')
  })

  it('as an SVG component: the piece drawn once and reused', async () => {
    const { createComponentFromFrame } = await import('./variants')
    const { emitRegionBody } = await import('../emit/react')
    const dot = createVectorNode({ x: 0, y: 0, w: 10, h: 10 }, 'ellipse')
    const doc = flow(pattern({ repeat: 4 }, [line(), dot]))
    const promoted = createComponentFromFrame(doc, doc.nodes[0] as CanvasFrameNode, { name: 'Dots', format: 'svg' })
    const body = emitRegionBody(promoted.component, { filePath: '.components/dots/dots.tsx', components: promoted.doc.components })
    expect(body.match(/<ellipse/g)).toHaveLength(1)
    expect(body.match(/<use /g)).toHaveLength(3)
  })
})
