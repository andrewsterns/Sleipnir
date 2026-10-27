// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPlan,
  ensureAgentScaffolding,
  getAgentScaffoldingState,
  setAgentScaffolding,
  setWorkspaceRoot,
} from '../../../tools/sleipnir-backend.mjs'
import { PLAN_CLI } from '../../../tools/agentSkills/registry.mjs'

// Opening a folder is not consent to write into it: the agent files arrive
// with the first real use of Planning, or an explicit choice in Settings.
describe('agent scaffolding opt-in', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-optin-'))
    setWorkspaceRoot(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  const has = (rel: string) => existsSync(join(root, rel))

  it('writes nothing into a project that is merely opened', () => {
    expect(ensureAgentScaffolding(root).written).toEqual([])
    expect(has('AGENTS.md')).toBe(false)
    expect(has(PLAN_CLI)).toBe(false)
    expect(getAgentScaffoldingState(root)?.active).toBe(false)
  })

  it('scaffolds on the first Planning write, and keeps it up to date from then on', () => {
    createPlan('First plan')
    expect(has('AGENTS.md')).toBe(true)
    expect(has(PLAN_CLI)).toBe(true)
    expect(getAgentScaffoldingState(root)?.active).toBe(true)

    rmSync(join(root, PLAN_CLI))
    expect(ensureAgentScaffolding(root).written).toEqual([PLAN_CLI])
  })

  it('writes nothing, even on Planning use, once turned off', () => {
    setAgentScaffolding(root, { enabled: false })
    createPlan('First plan')
    expect(has('AGENTS.md')).toBe(false)
    expect(ensureAgentScaffolding(root).written).toEqual([])
    expect(getAgentScaffoldingState(root)?.active).toBe(false)
  })

  it('treats choosing share or local in Settings as opting in', () => {
    const result = setAgentScaffolding(root, { commit: false })
    expect(result.agentScaffolding.enabled).toBe(true)
    expect(has('AGENTS.md')).toBe(true)
  })
})
