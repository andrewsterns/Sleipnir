// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setWorkspaceRoot,
  getNodeStages,
  setNodeStage,
  setNodeStatus,
  approvePlanNodes,
} from '../../../tools/sleipnir-backend.mjs'
import { LEGACY_STEP_STATUS, STEP_STATUSES, toStepStatus } from './stepStatus'
import * as planDoc from '../../../tools/planDoc.mjs'
import { NODE_STAGES } from './stages'

// One status, the agent's: pending, in progress, completed — and every board
// written before it reads as one of the three.
describe('toStepStatus', () => {
  it('keeps the three statuses as they are', () => {
    for (const s of STEP_STATUSES) expect(toStepStatus(s)).toBe(s)
  })

  it('reads every older value as its nearest survivor', () => {
    expect(toStepStatus('proposed')).toBe('pending')
    expect(toStepStatus('draft')).toBe('pending')
    expect(toStepStatus('in-progress')).toBe('in_progress')
    expect(toStepStatus('in-review')).toBe('in_progress')
    expect(toStepStatus('approved')).toBe('in_progress')
    expect(toStepStatus('done')).toBe('completed')
  })

  it('knows nothing else', () => {
    expect(toStepStatus('shipped')).toBeUndefined()
    expect(toStepStatus(undefined)).toBeUndefined()
    expect(toStepStatus(3)).toBeUndefined()
  })

  it('is the same map the backend and the vendored CLI use', () => {
    expect(LEGACY_STEP_STATUS).toEqual(planDoc.LEGACY_STEP_STATUS)
    expect([...STEP_STATUSES]).toEqual(planDoc.STEP_STATUSES)
  })

  it('draws exactly the statuses there are', () => {
    expect(NODE_STAGES.map((s) => s.id)).toEqual([...STEP_STATUSES])
  })
})

describe('stages.json migration (backend)', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-status-'))
    mkdirSync(join(root, '.planning'), { recursive: true })
    setWorkspaceRoot(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  const writeStages = (stages: Record<string, unknown>) =>
    writeFileSync(join(root, '.planning', 'stages.json'), JSON.stringify(stages))
  const readStagesFile = () => JSON.parse(readFileSync(join(root, '.planning', 'stages.json'), 'utf8'))

  it('migrates on read exactly as the renderer does', () => {
    const legacy = Object.fromEntries(Object.keys(LEGACY_STEP_STATUS).map((v) => [`note/${v}`, v]))
    writeStages(legacy)
    const { stages } = getNodeStages()
    for (const [id, value] of Object.entries(legacy)) expect(stages[id]).toBe(toStepStatus(value))
  })

  it('drops values nothing recognizes', () => {
    writeStages({ 'note/a': 'shipped', 'note/b': 'pending' })
    expect(getNodeStages().stages).toEqual({ 'note/b': 'pending' })
  })

  it('persists the migration with the next write, and is idempotent', () => {
    writeStages({ 'note/a': 'in-review', 'note/b': 'proposed' })
    setNodeStage('note/c', 'completed')
    const once = readStagesFile()
    expect(once).toEqual({ 'note/a': 'in_progress', 'note/b': 'pending', 'note/c': 'completed' })
    setNodeStage('note/c', 'completed')
    expect(readStagesFile()).toEqual(once)
  })

  it('accepts an older value from an older caller, and rejects the unknown', () => {
    setNodeStage('note/a', 'in-progress')
    expect(getNodeStages().stages['note/a']).toBe('in_progress')
    expect(() => setNodeStage('note/a', 'shipped')).toThrow(/pending, in_progress, testing, completed/)
  })
})

describe('approval moves the status (backend)', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-approve-'))
    mkdirSync(join(root, '.planning'), { recursive: true })
    setWorkspaceRoot(root)
    const step = (id: string) => ({ id, label: id, kind: 'proposed', map: 'claude', type: 'plan-step', status: 'draft', planId: 'plan/p' })
    writeFileSync(
      join(root, '.planning', 'notes.json'),
      JSON.stringify({ nodes: [step('plan/p/a'), step('plan/p/b'), step('plan/p/c')], edges: [] }),
    )
    writeFileSync(join(root, '.planning', 'plans.json'), JSON.stringify([{ id: 'plan/p', label: 'P', nodeIds: ['plan/p/a', 'plan/p/b', 'plan/p/c'], createdAt: 1 }]))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  it('starts a pending step when it is approved', () => {
    setNodeStatus('plan/p/a', 'approved')
    expect(getNodeStages().stages['plan/p/a']).toBe('in_progress')
  })

  it('completes a step when its file is saved', () => {
    setNodeStatus('plan/p/a', 'done')
    expect(getNodeStages().stages['plan/p/a']).toBe('completed')
  })

  it('does not reopen a step the agent already finished', () => {
    setNodeStage('plan/p/a', 'completed')
    setNodeStatus('plan/p/a', 'approved')
    expect(getNodeStages().stages['plan/p/a']).toBe('completed')
  })

  it('leaves a step an agent already completed out of Approve All', () => {
    setNodeStage('plan/p/b', 'completed')
    expect(approvePlanNodes('plan/p').approvedIds).toEqual(['plan/p/a', 'plan/p/c'])
    expect(getNodeStages().stages['plan/p/b']).toBe('completed')
  })

  it('starts every step Approve All approves', () => {
    expect(approvePlanNodes('plan/p').approvedIds).toHaveLength(3)
    expect(getNodeStages().stages).toEqual({ 'plan/p/a': 'in_progress', 'plan/p/b': 'in_progress', 'plan/p/c': 'in_progress' })
  })
})
