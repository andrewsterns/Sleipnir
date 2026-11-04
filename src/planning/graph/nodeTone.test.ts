import { describe, it, expect } from 'vitest'
import { edgeTone, isUncommitted, nodeTone, stepFileSets, toneOfStage, type ToneContext } from './nodeTone'
import type { GraphNode } from './types'

// The journey a plan's nodes take: proposed (blue, dashed) → in progress (blue)
// → done (white) → committed (faint) — status for the work, git for the end.
const file = (path: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id: `arch:${path}`,
  label: path,
  kind: 'built',
  map: 'plan/x',
  type: 'workspace-file',
  filePath: path,
  ...extra,
})
const step = (id: string): GraphNode => ({ id, label: id, kind: 'proposed', map: 'claude', type: 'plan-step' })
const ctx = (over: Partial<ToneContext> = {}): ToneContext => ({ stages: {}, dirty: new Set(), ...over })

describe('nodeTone', () => {
  it('walks a step from proposed to committed', () => {
    const s = step('s1')
    const files = new Map([['s1', ['src/a.ts']]])
    expect(nodeTone(s, ctx())).toBe('proposed')
    expect(nodeTone(s, ctx({ stages: { s1: 'in_progress' } }))).toBe('in_progress')
    expect(nodeTone(s, ctx({ stages: { s1: 'completed' }, stepFiles: files, dirty: new Set(['src/a.ts']) }))).toBe('done')
    expect(nodeTone(s, ctx({ stages: { s1: 'completed' }, stepFiles: files }))).toBe('committed')
  })

  it('keeps a finished step done when nothing says what it touched', () => {
    expect(nodeTone(step('s1'), ctx({ stages: { s1: 'completed' } }))).toBe('done')
  })

  it('lets git decide for files: clean is committed, whatever the status says', () => {
    expect(nodeTone(file('src/a.ts'), ctx({ stages: { 'file:src/a.ts': 'completed' } }))).toBe('committed')
    expect(nodeTone(file('src/a.ts'), ctx({ dirty: new Set(['src/a.ts']) }))).toBe('in_progress')
    expect(nodeTone(file('src/a.ts'), ctx({ dirty: new Set(['src/a.ts']), stages: { 'file:src/a.ts': 'completed' } }))).toBe('done')
  })

  it('reads an uncommitted file as done when only finished steps touch it', () => {
    const steps = [step('done'), step('working')]
    const files = new Map([['done', ['src/a.ts', 'src/b.ts']], ['working', ['src/b.ts']]])
    const sets = stepFileSets(steps, (s) => files.get(s.id) ?? [], { done: 'completed', working: 'in_progress' })
    const dirty = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])
    expect(nodeTone(file('src/a.ts'), ctx({ dirty, ...sets }))).toBe('done')
    expect(nodeTone(file('src/b.ts'), ctx({ dirty, ...sets }))).toBe('in_progress')
    expect(nodeTone(file('src/c.ts'), ctx({ dirty, ...sets }))).toBe('in_progress')
  })

  it('counts a file inside a new folder git lists once', () => {
    expect(nodeTone(file('src/new/a.ts'), ctx({ dirty: new Set(['src/new']) }))).toBe('in_progress')
    expect(isUncommitted(new Set(['src/new']), 'src/newer/a.ts')).toBe(false)
  })

  it('draws a planned file that is not on disk yet as proposed', () => {
    const planned = file('src/b.ts', { id: 'planned/x/src/b.ts', type: 'planned-file', planned: true })
    expect(nodeTone(planned, ctx({ exists: () => false }))).toBe('proposed')
    expect(nodeTone(planned, ctx({ exists: () => true }))).toBe('committed')
  })

  it('goes by status alone without git', () => {
    expect(nodeTone(file('src/a.ts'), ctx({ dirty: null }))).toBe('committed')
    expect(nodeTone(file('src/a.ts'), ctx({ dirty: null, stages: { 'file:src/a.ts': 'in_progress' } }))).toBe('in_progress')
    expect(toneOfStage('pending')).toBe('proposed')
  })
})

describe('edgeTone', () => {
  it('takes the more active end', () => {
    expect(edgeTone('committed', 'proposed')).toBe('proposed')
    expect(edgeTone('done', 'in_progress')).toBe('in_progress')
    expect(edgeTone('done', 'committed')).toBe('done')
  })
})

describe('testing', () => {
  it('draws a step being tested, and its files, in the testing tone, above everything', () => {
    const s = step('s1')
    expect(nodeTone(s, ctx({ stages: { s1: 'testing' } }))).toBe('testing')
    const sets = stepFileSets([s], () => ['src/a.ts'], { s1: 'testing' })
    expect(nodeTone(file('src/a.ts'), ctx({ dirty: new Set(['src/a.ts']), ...sets }))).toBe('testing')
    expect(edgeTone('testing', 'proposed')).toBe('testing')
  })
})
