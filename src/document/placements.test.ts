import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from './types'
import { layersOf, linkOfLayer, linkedDocIds, linkedLayerId, placedSketch, refreshLinks, unlinkSketch } from './placements'

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
const frame = (id: string, r = rect(0, 0, 100, 50), children: CanvasNode[] = [], extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: r, style: {}, children, ...extra }) as CanvasNode
const vector = (id: string, r = rect(10, 10, 20, 20)): CanvasNode => ({ id, name: id, kind: 'vector', rect: r, style: {}, shape: 'rectangle' }) as CanvasNode
const doc = (id: string, nodes: CanvasNode[], extra: Partial<CanvasDoc> = {}): CanvasDoc => ({ version: 1, id, name: id, nodes, components: [], createdAt: 0, updatedAt: 0, ...extra })

const sketch = doc('checkout', [frame('card', rect(40, 30, 200, 120), [vector('button')])], { kind: 'sketch' })

describe('placing a sketch, linked', () => {
  it('copies the sketch into one layer, with its own ids and the link', () => {
    const placed = placedSketch(sketch, { doc: 'checkout' }, 'p1')!
    expect(placed.id).toBe('p1')
    expect(placed.name).toBe('checkout')
    expect(placed.rect).toEqual(rect(0, 0, 200, 120))
    expect(placed.sketch?.link).toEqual({ doc: 'checkout' })
    expect(layersOf(placed).map((n) => n.id)).toEqual(['p1', linkedLayerId('p1', 'button')])
  })

  it('puts a sketch of several layers in one frame the size of them all', () => {
    const two = doc('two', [frame('a', rect(10, 10, 50, 50)), frame('b', rect(100, 40, 50, 50))])
    const placed = placedSketch(two, { doc: 'two' }, 'p')!
    expect(placed.rect).toEqual(rect(0, 0, 140, 80))
    expect(layersOf(placed).slice(1).map((n) => n.rect)).toEqual([rect(0, 0, 50, 50), rect(90, 30, 50, 50)])
  })

  it('places one frame of a sketch when the link names it', () => {
    const two = doc('two', [frame('a', rect(10, 10, 50, 50)), frame('b', rect(100, 40, 60, 30))])
    expect(placedSketch(two, { doc: 'two', frame: 'b' }, 'p')!.rect).toEqual(rect(0, 0, 60, 30))
    expect(placedSketch(two, { doc: 'two', frame: 'gone' }, 'p')).toBeNull()
  })
})

describe('edits in the sketch flow through', () => {
  const placed = { ...placedSketch(sketch, { doc: 'checkout' }, 'p1')!, rect: rect(300, 200, 200, 120), hidden: true }
  const env = doc('room', [placed], { kind: 'environment' })

  it('rewrites the copy from the sketch, keeping what is the environment’s', () => {
    const edited = doc('checkout', [frame('card', rect(40, 30, 260, 120), [vector('button', rect(5, 5, 40, 40))])])
    const { doc: next, missing } = refreshLinks(env, () => edited)
    const node = next.nodes[0]
    expect(missing).toEqual([])
    expect(node.id).toBe('p1')
    expect(node.rect).toEqual(rect(300, 200, 260, 120))
    expect(node.hidden).toBe(true)
    expect(node.sketch).toBe(placed.sketch)
    expect(layersOf(node)[1]).toMatchObject({ id: linkedLayerId('p1', 'button'), rect: rect(5, 5, 40, 40) })
  })

  it('hands back the same doc when the sketch is unchanged, so opening stays clean', () => {
    expect(refreshLinks(env, () => sketch).doc).toBe(env)
  })

  it('keeps the last copy of a sketch that is gone, and says so', () => {
    const { doc: next, missing } = refreshLinks(env, () => null)
    expect(next).toBe(env)
    expect(missing).toEqual(['p1'])
  })

  it('lists what an environment links to, and finds the placement from a layer inside it', () => {
    expect(linkedDocIds(env)).toEqual(['checkout'])
    expect(linkOfLayer(env, linkedLayerId('p1', 'button'))?.node.id).toBe('p1')
    expect(linkOfLayer(env, 'elsewhere')).toBeNull()
  })

  it('unlinks into a local sketch that no longer follows', () => {
    const local = unlinkSketch(env, 'p1')
    expect(local.nodes[0].sketch).toEqual({ plane: { kind: 'default', plane: 'front' } })
    expect(linkedDocIds(local)).toEqual([])
    expect(refreshLinks(local, () => doc('checkout', [])).doc).toBe(local)
  })
})
