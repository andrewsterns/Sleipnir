// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const changeSets = require('./changeSets.cjs')

// An in-memory stand-in for the workspace: path -> content.
function memoryIO(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  return {
    files,
    read: async (p: string) => (files.has(p) ? files.get(p)! : null),
    write: async (p: string, content: string) => void files.set(p, content),
    remove: async (p: string) => void files.delete(p),
  }
}

const base = { root: '/project', wcId: 1, sessionId: 's1' }

describe('change sets', () => {
  it('classifies files and builds a diff without touching disk', async () => {
    const io = memoryIO({ 'src/a.ts': 'one\ntwo\n' })
    const set = await changeSets.create(
      { ...base, files: [{ path: 'src/a.ts', content: 'one\nTWO\n' }, { path: './src/b.ts', content: 'new\n' }] },
      io,
    )
    expect(set.state).toBe('pending')
    const [a, b] = set.files
    expect(a).toMatchObject({ path: 'src/a.ts', status: 'modified', additions: 1, deletions: 1, applied: false })
    expect(a.diff).toContain('-two')
    expect(a.diff).toContain('+TWO')
    expect(b).toMatchObject({ path: 'src/b.ts', status: 'added' })
    expect(io.files.get('src/a.ts')).toBe('one\ntwo\n')
    expect(io.files.has('src/b.ts')).toBe(false)
  })

  it('normalizes backslashes and leading slashes, last duplicate wins', async () => {
    const io = memoryIO()
    const set = await changeSets.create(
      { ...base, files: [{ path: '\\src\\x.ts', content: 'first' }, { path: '/src/x.ts', content: 'second' }] },
      io,
    )
    expect(set.files).toHaveLength(1)
    expect(set.files[0].path).toBe('src/x.ts')
    await changeSets.apply(set.id, undefined, io)
    expect(io.files.get('src/x.ts')).toBe('second')
  })

  it('applies a subset, then undoes back to the exact prior state', async () => {
    const io = memoryIO({ 'a.ts': 'old' })
    const set = await changeSets.create({ ...base, files: [{ path: 'a.ts', content: 'new' }, { path: 'b.ts', content: 'b' }] }, io)

    const first = await changeSets.apply(set.id, ['a.ts'], io)
    expect(first.applied).toEqual(['a.ts'])
    expect(first.changeSet.state).toBe('applied')
    expect(io.files.get('a.ts')).toBe('new')
    expect(io.files.has('b.ts')).toBe(false)

    await changeSets.apply(set.id, ['b.ts'], io)
    expect(io.files.get('b.ts')).toBe('b')

    const undone = await changeSets.undo(set.id, io)
    expect(undone.reverted.sort()).toEqual(['a.ts', 'b.ts'])
    expect(undone.changeSet.state).toBe('reverted')
    expect(io.files.get('a.ts')).toBe('old')
    expect(io.files.has('b.ts')).toBe(false)
  })

  it('refuses to undo over a file that changed again after it was applied', async () => {
    const io = memoryIO({ 'a.ts': 'old' })
    const set = await changeSets.create({ ...base, files: [{ path: 'a.ts', content: 'new' }] }, io)
    await changeSets.apply(set.id, undefined, io)
    io.files.set('a.ts', 'human edit')

    const undone = await changeSets.undo(set.id, io)
    expect(undone.reverted).toEqual([])
    expect(undone.conflicts[0].path).toBe('a.ts')
    expect(io.files.get('a.ts')).toBe('human edit')
  })

  it('discards only while nothing is applied', async () => {
    const io = memoryIO()
    const set = await changeSets.create({ ...base, files: [{ path: 'a.ts', content: 'x' }] }, io)
    expect(changeSets.discard(set.id).state).toBe('discarded')
    await changeSets.apply(set.id, undefined, io)
    expect(changeSets.discard(set.id).state).toBe('applied')
  })

  it('scopes sets to their window and forgets them when it closes', async () => {
    const io = memoryIO()
    const set = await changeSets.create({ ...base, wcId: 7, files: [{ path: 'a.ts', content: 'x' }] }, io)
    expect(changeSets.belongsTo(set.id, 7)).toBe(true)
    expect(changeSets.belongsTo(set.id, 8)).toBe(false)
    changeSets.killForWindow(7)
    expect(changeSets.get(set.id)).toBeNull()
  })

  it('rejects an empty file list', async () => {
    await expect(changeSets.create({ ...base, files: [] }, memoryIO())).rejects.toThrow(/at least one/)
  })
})
