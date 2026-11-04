// @vitest-environment node
// Statuses from the trail: Sleipnir sets a step's status from what agents do —
// edits, test runs, moving on — so they needn't spend turns reporting it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attachChanges, inferStepStatuses } from './planDoc.mjs'
import { testOutcome } from './agentSkills/vendor/trail.mjs'
import * as backend from './sleipnir-backend.mjs'

type Entry = { at: number; agent?: string; kind: string; paths?: string[]; ok?: boolean }
const steps = [{ id: 's1' }, { id: 's2' }]
const files: Record<string, string[]> = { s1: ['src/a.ts', 'src/shared.ts'], s2: ['src/b.ts', 'src/shared.ts'] }
const infer = (entries: Entry[], stages: Record<string, string> = {}, reportedAt: Record<string, number> = {}) =>
  inferStepStatuses({ entries, steps, filesOf: (s: { id: string }) => files[s.id], stages, reportedAt }).map(({ stepId, status, touched }: { stepId: string; status: string; touched?: string[] }) => [stepId, status, ...(touched ? [touched] : [])])
const e = (at: number, kind: string, paths?: string[], extra: Partial<Entry> = {}): Entry => ({ at, agent: 'claude', kind, ...(paths ? { paths } : {}), ...extra })

describe('inferStepStatuses', () => {
  it('walks a step from its first edit to done', () => {
    expect(infer([e(1, 'read', ['src/a.ts']), e(2, 'edit', ['src/a.ts']), e(3, 'test'), e(4, 'tested', undefined, { ok: true }), e(5, 'idle')])).toEqual([
      ['s1', 'in_progress', ['src/a.ts']],
      ['s1', 'testing'],
      ['s1', 'completed'],
    ])
  })

  it('goes back to in progress when tests fail, and finishes a passed step when the agent moves on', () => {
    expect(infer([e(1, 'edit', ['src/a.ts']), e(2, 'test'), e(3, 'tested', undefined, { ok: false }), e(4, 'test'), e(5, 'tested', undefined, { ok: true }), e(6, 'edit', ['src/b.ts'])])).toEqual([
      ['s1', 'in_progress', ['src/a.ts']],
      ['s1', 'testing'],
      ['s1', 'in_progress'],
      ['s1', 'testing'],
      ['s1', 'completed'],
      ['s2', 'in_progress', ['src/b.ts']],
    ])
  })

  it('leaves a shared file alone unless exactly one of its steps is in progress', () => {
    expect(infer([e(1, 'edit', ['src/shared.ts'])])).toEqual([])
    expect(infer([e(1, 'edit', ['src/shared.ts'])], { s2: 'in_progress' })).toEqual([])
    expect(infer([e(1, 'edit', ['src/b.ts']), e(2, 'edit', ['src/shared.ts'])])).toEqual([['s2', 'in_progress', ['src/b.ts']]])
  })

  it('never overrides a report an agent or a person made at or after the line, nor reopens a finished step', () => {
    expect(infer([e(5, 'edit', ['src/a.ts'])], {}, { s1: 9 })).toEqual([])
    expect(infer([e(5, 'edit', ['src/a.ts'])], { s1: 'completed' })).toEqual([])
  })

  it("doesn't finish a step whose tests never ran or never said they passed", () => {
    expect(infer([e(1, 'edit', ['src/a.ts']), e(2, 'idle')])).toEqual([['s1', 'in_progress', ['src/a.ts']]])
    expect(infer([e(1, 'edit', ['src/a.ts']), e(2, 'test'), e(3, 'tested'), e(4, 'idle')])).toEqual([['s1', 'in_progress', ['src/a.ts']], ['s1', 'testing']])
  })
})

describe('the first edit, seen after it happened', () => {
  it('counts as one of the step’s changes even though the snapshot already has it', () => {
    const event = attachChanges({ at: 9 }, { at: 1, files: { 'src/a.ts': [2, 2] }, touched: ['src/a.ts'] }, { 'src/a.ts': [2, 2] })
    expect(event.changes).toEqual([{ path: 'src/a.ts', change: 'modified' }])
  })
})

describe('testOutcome', () => {
  it('reads pass and fail from the common runners, and stays out of it otherwise', () => {
    expect(testOutcome(' Test Files  3 passed (3)\n      Tests  41 passed (41)')).toBe(true)
    expect(testOutcome('      Tests  1 failed | 40 passed (41)')).toBe(false)
    expect(testOutcome('test result: ok. 12 passed; 0 failed')).toBe(true)
    expect(testOutcome('--- FAIL: TestCart (0.00s)\nFAIL')).toBe(false)
    expect(testOutcome('# pass 2\n# fail 0')).toBe(true)
    expect(testOutcome('lint: 0 errors')).toBeUndefined()
  })
})

describe('applyTrailStatuses (backend)', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-trailstatus-'))
    mkdirSync(join(root, '.planning'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'a.ts'), 'export {}\n')
    backend.setWorkspaceRoot(root)
  })
  afterEach(() => {
    rmSync(backend.stepSnapshotDir(root), { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
    backend.setWorkspaceRoot(null)
  })

  it('applies what new trail lines say, as reports by auto, once', () => {
    const { plan } = backend.createPlan('Auto', [], undefined, undefined, undefined, false, 1)
    const { node: step } = backend.createPlanNode(plan.id, 'Edit a', 'Change a', undefined, { edits: ['src/a.ts'] })
    backend.addPlanNodes(plan.id, [step.id])
    const now = Date.now()
    const line = (x: Entry) => JSON.stringify(x)
    writeFileSync(join(root, '.planning', 'trail.jsonl'), [e(now, 'edit', ['src/a.ts']), e(now + 1, 'test')].map(line).join('\n') + '\n')
    expect(backend.applyTrailStatuses().applied.map((m: { status: string }) => m.status)).toEqual(['in_progress', 'testing'])
    expect(backend.getNodeStages().stages[step.id]).toBe('testing')
    expect(backend.getPlanActivity(plan.id).events.map((x: { agent: string }) => x.agent)).toEqual(['auto', 'auto'])
    // Nothing new: nothing applied again.
    expect(backend.applyTrailStatuses().applied).toEqual([])
  })
})
