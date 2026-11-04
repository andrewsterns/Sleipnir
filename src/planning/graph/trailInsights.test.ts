import { describe, it, expect } from 'vitest'
import { trailInsights } from '../../../tools/agentSkills/vendor/trail.mjs'
import { effortView } from './trailInsights'
import { archId } from './architectureScope'
import type { GraphNode, TrailEntry } from './types'

// Where an agent's effort went — from the trail alone, so it costs no tokens.
const e = (at: number, kind: TrailEntry['kind'], paths?: string[], extra: Partial<TrailEntry> = {}): TrailEntry => ({ at, agent: 'claude', session: 's1', kind, ...(paths ? { paths } : {}), ...extra })

describe('trailInsights', () => {
  it('counts what a session did, and finds rereads and fix loops', () => {
    const entries = [
      e(0, 'read', ['a.ts']),
      e(1, 'read', ['a.ts']),
      e(2, 'read', ['a.ts']),
      e(3, 'edit', ['a.ts']),
      e(4, 'test'),
      e(5, 'tested', undefined, { ok: false }),
      e(6, 'edit', ['a.ts']),
      e(7, 'test'),
      e(8, 'tested', undefined, { ok: false }),
      e(9, 'edit', ['a.ts']),
    ]
    const { sessions, findings, effort } = trailInsights(entries)
    expect(sessions[0]).toMatchObject({ calls: 8, reads: 3, edits: 3, tests: 2, testFailures: 2, fixLoops: 2, readsBeforeFirstEdit: 3, rereads: [{ path: 'a.ts', count: 3 }] })
    expect(findings.map((f) => f.text)).toEqual(['2 rounds of edit → failing tests → edit', 'Read a.ts 3 times'])
    expect(effort).toEqual([{ path: 'a.ts', score: 9 }])
  })

  it('notices a long streak of searches', () => {
    const { findings } = trailInsights([1, 2, 3, 4, 5].map((at) => e(at, 'search', ['src'])))
    expect(findings[0].text).toBe('5 searches in a row before reading anything')
  })

  it('keeps sessions apart', () => {
    const { sessions } = trailInsights([e(0, 'read', ['a']), { ...e(1, 'read', ['b']), session: 's2' }])
    expect(sessions).toHaveLength(2)
  })
})

describe('effortView', () => {
  it('puts each file’s effort on its node, the busiest at full heat', () => {
    const nodes: GraphNode[] = ['a.ts', 'b.ts'].map((p) => ({ id: archId(p), label: p, kind: 'built', map: 'x', filePath: p, type: 'workspace-file' }))
    const { heat } = effortView([e(0, 'edit', ['a.ts']), e(1, 'edit', ['a.ts']), e(2, 'read', ['b.ts'])], nodes)
    expect(heat.get(archId('a.ts'))).toBe(1)
    expect(heat.get(archId('b.ts'))).toBeCloseTo(0.5)
  })
})
