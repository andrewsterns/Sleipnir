import { describe, it, expect } from 'vitest'
import { steeringFlags, stepMarks } from './steering'
import type { PlanActivityEvent, TrailEntry } from './types'

// Steering: a person's focus/avoid marks, and the moments the trail says are
// worth a look — no tokens spent on either.
const e = (at: number, kind: TrailEntry['kind'], paths?: string[], extra: Partial<TrailEntry> = {}): TrailEntry => ({ at, agent: 'claude', kind, ...(paths ? { paths } : {}), ...extra })
const mark = (at: number, steer: 'focus' | 'avoid' | 'clear', path: string): PlanActivityEvent => ({ at, stepId: 's', steer, path, agent: 'you' })

describe('stepMarks', () => {
  it('replays marks in order, a clear undoing one', () => {
    expect(stepMarks([mark(1, 'focus', 'a.ts'), mark(2, 'avoid', 'b.ts'), mark(3, 'clear', 'a.ts'), { at: 4, stepId: 'other', steer: 'focus', path: 'c.ts' }], 's')).toEqual({ focus: [], avoid: ['b.ts'] })
  })
})

describe('steeringFlags', () => {
  const base = { since: 0, stepFiles: ['src/a.ts'], marks: { focus: [], avoid: [] } }

  it('flags an edit to a file marked avoid first', () => {
    const flags = steeringFlags({ ...base, marks: { focus: [], avoid: ['src/b.ts'] }, entries: [e(1, 'edit', ['src/b.ts'])] })
    expect(flags.map((f) => f.kind)).toEqual(['avoided', 'off-step'])
  })

  it('flags the same file edited again and again while tests fail', () => {
    const entries = [e(1, 'edit', ['src/a.ts']), e(2, 'tested', undefined, { ok: false }), e(3, 'edit', ['src/a.ts']), e(4, 'edit', ['src/a.ts']), e(5, 'edit', ['src/a.ts'])]
    expect(steeringFlags({ ...base, entries })[0]).toMatchObject({ kind: 'looping', path: 'src/a.ts' })
    // Tests passing again ends the loop.
    expect(steeringFlags({ ...base, entries: [e(1, 'tested', undefined, { ok: false }), e(2, 'edit', ['src/a.ts']), e(3, 'tested', undefined, { ok: true }), e(4, 'edit', ['src/a.ts']), e(5, 'edit', ['src/a.ts'])] })).toEqual([])
  })

  it('flags work outside the step, but not its bookkeeping', () => {
    expect(steeringFlags({ ...base, entries: [e(1, 'edit', ['src/other.ts']), e(2, 'edit', ['AGENTS.md']), e(3, 'edit', ['.planning/notes.json'])] }).map((f) => f.path)).toEqual(['src/other.ts'])
  })

  it('flags a long stretch of reading with no edit, and ignores what came before the step', () => {
    const reads = Array.from({ length: 16 }, (_, i) => e(10 + i, 'read', [`f${i}.ts`]))
    expect(steeringFlags({ ...base, entries: reads })[0].kind).toBe('stalled')
    expect(steeringFlags({ ...base, since: 100, entries: [e(1, 'edit', ['src/b.ts']), ...reads] })).toEqual([])
  })
})
