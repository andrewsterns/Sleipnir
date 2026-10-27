import { describe, it, expect } from 'vitest'
import { canvasDocPath, hashContent, parseDoc, serializeDoc, CANVAS_DIR } from './store'
import { createDoc, createFrameNode, insertNode } from './doc'

describe('canvasDocPath', () => {
  it('lands boards inside .planning so they travel with the project and are already watched', () => {
    expect(CANVAS_DIR).toBe('.components/.boards')
    expect(canvasDocPath('canvas-abc')).toBe('.components/.boards/canvas-abc.json')
  })
})

describe('serialize/parse round-trip', () => {
  it('preserves a populated doc exactly', () => {
    let doc = createDoc('Board')
    const outer = createFrameNode({ x: 10, y: 20, w: 300, h: 200 }, 'outer')
    doc = insertNode(doc, outer, null)
    doc = insertNode(doc, createFrameNode({ x: 5, y: 5, w: 50, h: 50 }, 'inner'), outer.id)
    doc = { ...doc, camera: { x: -100, y: 40, k: 1.75 } }

    const parsed = parseDoc(serializeDoc(doc))
    expect(parsed).toEqual(doc)
  })

  // The one field the list of defaults below once forgot: losing it undid
  // "New folder" in the components panel on every reload.
  it('keeps component folders that hold nothing yet', () => {
    const doc = { ...createDoc('Board'), componentFolders: ['buttons', 'forms/inputs'] }
    expect(parseDoc(serializeDoc(doc))?.componentFolders).toEqual(['buttons', 'forms/inputs'])
  })
})

describe('parseDoc', () => {
  it('returns null on malformed JSON so one corrupt board cannot break the board list', () => {
    expect(parseDoc('{ not json')).toBeNull()
    expect(parseDoc('')).toBeNull()
    expect(parseDoc('null')).toBeNull()
    expect(parseDoc('"a string"')).toBeNull()
  })

  it('rejects an object that is not a board', () => {
    expect(parseDoc('{"hello":"world"}')).toBeNull()
    expect(parseDoc('{"id":"x"}')).toBeNull() // no nodes array
  })

  it('fills in defaults for fields a hand-written or older board may omit', () => {
    const parsed = parseDoc('{"id":"canvas-1","nodes":[]}')
    expect(parsed).not.toBeNull()
    expect(parsed!.name).toBe('Untitled')
    expect(parsed!.components).toEqual([])
    expect(parsed!.version).toBe(1)
    expect(typeof parsed!.createdAt).toBe('number')
  })
})

describe('hashContent', () => {
  it('is stable for identical content and differs for changed content', () => {
    const a = serializeDoc(createDoc('A'))
    expect(hashContent(a)).toBe(hashContent(a))
    expect(hashContent(a)).not.toBe(hashContent(`${a} `))
  })

  it('distinguishes single-character edits, so the self-echo guard is not fooled', () => {
    expect(hashContent('{"x":1}')).not.toBe(hashContent('{"x":2}'))
  })
})

describe('the .canvas → .components rename', () => {
  it('rewrites a board’s old folder paths as it loads, and leaves current boards alone', async () => {
    const { parseDoc, renameLegacyPaths } = await import('./store')
    const old = JSON.stringify({
      id: 'b',
      nodes: [{ id: 'n', style: { fills: [{ type: 'image', src: '.canvas/assets/hero.png' }] } }],
      components: [{ id: 'c', componentRoot: '.canvas', filePath: '.canvas/card/card.tsx' }],
    })
    const doc = parseDoc(old)!
    expect(doc.components[0]).toMatchObject({ componentRoot: '.components', filePath: '.components/card/card.tsx' })
    expect(JSON.stringify(doc.nodes)).toContain('.components/assets/hero.png')
    const current = '{"id":"b","nodes":[],"note":"src/.canvas-like/not-a-root"}'
    expect(renameLegacyPaths(current)).toBe(current)
  })
})
