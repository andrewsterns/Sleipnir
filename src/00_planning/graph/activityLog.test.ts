import { describe, it, expect } from 'vitest'
import { changedPathsByStep, duration, reportAge, stepActivity } from './activityLog'
import type { PlanActivityEvent } from './types'

// A step's story from its plan's activity log: who worked it, when it started
// and finished, and every file it changed.
const S = 'plan/p/s'
const report = (at: number, status: PlanActivityEvent['status'], extra: Partial<PlanActivityEvent> = {}): PlanActivityEvent => ({
  at,
  stepId: S,
  status,
  ...extra,
})

describe('stepActivity', () => {
  it('times a run from its start to its completion', () => {
    const a = stepActivity(
      [report(1000, 'in_progress', { agent: 'claude' }), report(61_000, 'completed', { agent: 'claude', since: 1000, note: 'Done' })],
      S,
    )
    expect(a).toMatchObject({ startedAt: 1000, finishedAt: 61_000, agent: 'claude' })
    expect(a.reports).toHaveLength(2)
  })

  it('starts over when the step is put back to pending, or reopened', () => {
    expect(stepActivity([report(1, 'in_progress'), report(2, 'pending')], S)).toMatchObject({ startedAt: undefined, finishedAt: undefined })
    const reopened = stepActivity([report(1, 'in_progress'), report(2, 'completed'), report(5, 'in_progress')], S)
    expect(reopened).toMatchObject({ startedAt: 5, finishedAt: undefined })
  })

  it('keeps every file changed over every run, created files staying created', () => {
    const a = stepActivity(
      [
        report(1, 'completed', { changes: [{ path: 'src/b.ts', change: 'added' }, { path: 'src/a.ts', change: 'modified' }] }),
        report(2, 'completed', { changes: [{ path: 'src/b.ts', change: 'modified' }, { path: 'src/old.ts', change: 'deleted' }], moreChanges: 3 }),
      ],
      S,
    )
    expect(a.changes).toEqual([
      { path: 'src/a.ts', change: 'modified' },
      { path: 'src/b.ts', change: 'added' },
      { path: 'src/old.ts', change: 'deleted' },
    ])
    expect(a.moreChanges).toBe(3)
  })

  it('ignores other steps', () => {
    expect(stepActivity([{ at: 1, stepId: 'other', status: 'completed' }], S).reports).toEqual([])
  })
})

describe('changedPathsByStep', () => {
  it('maps each step to the changed files that still exist', () => {
    const map = changedPathsByStep([
      report(1, 'completed', { changes: [{ path: 'src/a.ts', change: 'modified' }, { path: 'src/gone.ts', change: 'deleted' }] }),
      { at: 2, stepId: 'plan/p/t', status: 'in_progress' },
    ])
    expect([...map]).toEqual([[S, ['src/a.ts']]])
  })
})

describe('time labels', () => {
  it('says how long ago, and how long it took', () => {
    expect(reportAge(1000, 2000)).toBe('just now')
    expect(reportAge(0, 5 * 60_000)).toBe('5m ago')
    expect(duration(40_000)).toBe('40s')
    expect(duration(65 * 60_000)).toBe('1h 5m')
  })
})
