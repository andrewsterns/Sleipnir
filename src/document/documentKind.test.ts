import { describe, it, expect } from 'vitest'
import type { CanvasDoc, CanvasNode } from './types'
import { createDoc } from './doc'
import { documentKindOf, untitledName, withKind } from './documentKind'
import { parseDoc, serializeDoc } from '../canvas/io/store'

const frame = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [], ...extra }) as CanvasNode
const legacy = (nodes: CanvasNode[], extra: Partial<CanvasDoc> = {}): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0, ...extra })

describe('two kinds of document', () => {
  it('reads a board saved before kinds as a Sketch, unless it holds anything 3D', () => {
    expect(documentKindOf(legacy([frame('button')]))).toBe('sketch')
    expect(documentKindOf(legacy([frame('floor', { sketch: { plane: { kind: 'default', plane: 'top' } } })]))).toBe('environment')
    expect(documentKindOf(legacy([frame('tilted', { space: { position: [0, 0, 0], rotation: [0, 30, 0] } })]))).toBe('environment')
    expect(documentKindOf(legacy([frame('a')], { objects: [{ id: 'o', name: 'Box', features: [] }] }))).toBe('environment')
  })

  it('keeps what a document says, whatever it holds', () => {
    const sketch = legacy([frame('floor', { sketch: { plane: { kind: 'default', plane: 'top' } } })], { kind: 'sketch' })
    expect(documentKindOf(sketch)).toBe('sketch')
    expect(withKind(sketch)).toBe(sketch)
  })

  it('writes the kind down as a board is read, and keeps it across a save', () => {
    const read = parseDoc(JSON.stringify(legacy([frame('a')], { objects: [{ id: 'o', name: 'Box', features: [] }] })))!
    expect(read.kind).toBe('environment')
    expect(parseDoc(serializeDoc(read))!.kind).toBe('environment')
    expect(parseDoc(JSON.stringify(legacy([frame('a')])))!.kind).toBe('sketch')
  })

  it('makes a new document a Sketch unless asked for an Environment', () => {
    expect(createDoc('New').kind).toBe('sketch')
    expect(createDoc('Room', 'environment').kind).toBe('environment')
  })
})

describe('a new document’s name', () => {
  it('says its kind, and numbers past names already taken', () => {
    expect(untitledName('sketch', [])).toBe('Untitled sketch')
    expect(untitledName('environment', ['Untitled sketch'])).toBe('Untitled environment')
    expect(untitledName('sketch', ['Untitled sketch', 'Untitled sketch 2'])).toBe('Untitled sketch 3')
  })
})
