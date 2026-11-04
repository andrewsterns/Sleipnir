import { describe, it, expect } from 'vitest'
import { currentActivity, FADE_MS, nodeForPath, trailMarks, trailPath, trailView } from './agentTrail'
import { archId, folderId } from './architectureScope'
import type { GraphNode, TrailEntry } from './types'

// The trail on the graph: glows that fade, a test lighting what was changed,
// and the line of the agent's last stops.
const e = (at: number, kind: TrailEntry['kind'], paths: string[] = [], agent = 'claude'): TrailEntry => ({ at, agent, kind, paths })

describe('trailMarks', () => {
  it('glows where the agent reads, pulses where it edits, and fades', () => {
    const marks = trailMarks([e(0, 'read', ['a.ts']), e(1000, 'edit', ['b.ts'])], 2000)
    expect(marks.get('a.ts')).toEqual({ kind: 'read', strength: 1 - 2000 / FADE_MS.read })
    expect(marks.get('b.ts')?.kind).toBe('edit')
    expect(trailMarks([e(0, 'read', ['a.ts']), e(1, 'idle')], FADE_MS.read + 1).size).toBe(0)
  })

  it('lets an edit outshine a read of the same file', () => {
    expect(trailMarks([e(0, 'edit', ['a.ts']), e(100, 'read', ['a.ts'])], 200).get('a.ts')?.kind).toBe('edit')
  })

  it('lights what the agent changed when it runs the tests', () => {
    const marks = trailMarks([e(0, 'edit', ['a.ts']), e(10, 'edit', ['x.ts'], 'other'), e(500, 'test')], 600)
    expect(marks.get('a.ts')?.kind).toBe('test')
    expect(marks.get('x.ts')?.kind).toBe('edit')
  })
})

describe('where the agent is now', () => {
  it('marks its latest move current, and nothing once it stops', () => {
    const marks = trailMarks([e(0, 'read', ['a.ts']), e(100, 'edit', ['b.ts'])], 200)
    expect(marks.get('b.ts')?.current).toBe(true)
    expect(marks.get('a.ts')?.current).toBeFalsy()
    expect(trailMarks([e(0, 'read', ['a.ts']), e(10, 'idle')], 20).get('a.ts')?.current).toBeFalsy()
  })

  it('during a test, is on what the test covers', () => {
    expect(trailMarks([e(0, 'edit', ['a.ts']), e(10, 'test')], 20).get('a.ts')).toMatchObject({ kind: 'test', current: true })
  })
})

describe('trailPath', () => {
  it('follows the last stops in order, each once', () => {
    expect(trailPath([e(0, 'read', ['a']), e(1, 'read', ['b']), e(2, 'edit', ['a']), e(3, 'read', ['c'])], 10)).toEqual(['b', 'a', 'c'])
  })
})

describe('trailView', () => {
  it('lands a file on its own node, or on the folder it is collapsed into', () => {
    const nodes: GraphNode[] = [
      { id: archId('src/a.ts'), label: 'a.ts', kind: 'built', map: 'p', filePath: 'src/a.ts', type: 'workspace-file' },
      { id: folderId('lib/deep'), label: 'lib/deep/ (3)', kind: 'built', map: 'p', type: 'folder' },
    ]
    const view = trailView([e(0, 'read', ['src/a.ts']), e(1, 'edit', ['lib/deep/x.ts'])], nodes, 10)
    expect([...view.marks.keys()]).toEqual([archId('src/a.ts'), folderId('lib/deep')])
    expect(view.path).toEqual([archId('src/a.ts'), folderId('lib/deep')])
    expect(nodeForPath(nodes)('nowhere/z.ts')).toBeNull()
  })
})

describe('currentActivity', () => {
  it('is the latest line while it is recent, and nothing once the agent stops', () => {
    expect(currentActivity([e(0, 'read', ['a'])], 1000)?.kind).toBe('read')
    expect(currentActivity([e(0, 'read', ['a']), e(5, 'idle')], 10)).toBeNull()
    expect(currentActivity([e(0, 'read', ['a'])], 60_000)).toBeNull()
  })
})

describe('the box holds', () => {
  it('stays on the last move until the agent moves on or stops', () => {
    expect(trailMarks([e(0, 'read', ['a.ts'])], 60_000).get('a.ts')?.current).toBe(true)
    expect(trailMarks([e(0, 'read', ['a.ts']), e(10, 'idle')], 60_000).get('a.ts')).toBeUndefined()
  })
})
