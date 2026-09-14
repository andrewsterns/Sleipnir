// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as backend from '../../../tools/sleipnir-backend.mjs'
import * as vendor from '../../../tools/agentSkills/vendor/plan.mjs'

// tools/agentSkills/vendor/plan.mjs is copied into every project as
// .sleipnir/plan.mjs and committed, so a teammate without Sleipnir can still
// author plans. It re-implements rather than imports the backend's planning
// writes (importing would drag in workspace scanning, graph generation and git
// for a script that edits two JSON files), which means the two can drift.
//
// This is the test that stops that: both write the same sequence of plans and
// steps into their own temp project, and the resulting .planning JSON must match
// exactly. Change a shape in sleipnir-backend.mjs and this fails.
describe('vendored plan CLI matches the backend', () => {
  let backendRoot: string
  let vendorRoot: string

  beforeEach(() => {
    backendRoot = mkdtempSync(join(tmpdir(), 'sleipnir-conform-backend-'))
    vendorRoot = mkdtempSync(join(tmpdir(), 'sleipnir-conform-vendor-'))
    backend.setWorkspaceRoot(backendRoot)
  })

  afterEach(() => {
    rmSync(backendRoot, { recursive: true, force: true })
    rmSync(vendorRoot, { recursive: true, force: true })
    backend.setWorkspaceRoot(null)
  })

  // Ids embed Date.now() and plans carry createdAt, so two runs can never be
  // byte-identical. Everything else must be.
  const normalize = (json: string) =>
    JSON.parse(json.replace(/-\d{13}/g, '-<TS>'), (key, value) =>
      key === 'createdAt' ? '<TS>' : value,
    )

  const read = (root: string, name: string) => {
    const p = join(root, '.planning', name)
    return existsSync(p) ? normalize(readFileSync(p, 'utf8')) : null
  }

  const compare = (name: string) => {
    expect(read(vendorRoot, name)).toEqual(read(backendRoot, name))
  }

  it('writes identical plans.json and notes.json for the same plan', () => {
    // --- backend, driven exactly as tools/sleipnir-plan.mjs drives it ---
    const { plan: bPlan } = backend.createPlan('Login page', [], undefined, undefined, undefined, false, 3)
    const { node: bRoot } = backend.createPlanNode(bPlan.id, 'Scaffold the form', 'Build the shell', undefined)
    backend.addPlanNodes(bPlan.id, [bRoot.id])
    const { node: bChild } = backend.createPlanNode(bPlan.id, 'Wire validation', 'Client-side rules', bRoot.id)
    backend.addPlanNodes(bPlan.id, [bChild.id])

    // --- vendored copy ---
    const vPlan = vendor.createPlan(vendorRoot, 'Login page', { temporary: false, expectedSteps: 3 })
    const vRoot = vendor.createPlanNode(vendorRoot, vPlan.id, 'Scaffold the form', 'Build the shell', undefined)
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, vRoot.id)
    const vChild = vendor.createPlanNode(vendorRoot, vPlan.id, 'Wire validation', 'Client-side rules', vRoot.id)
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, vChild.id)

    compare('plans.json')
    compare('notes.json')
  })

  it('writes identical data for a proposed file with borrows links', () => {
    const { plan: bPlan } = backend.createPlan('Add a hook', [], undefined, undefined, undefined, false, 2)
    const { node: bHook } = backend.proposeFileNode(
      bPlan.id, 'useThing hook', 'The hook', 'src/useThing.ts', 'export const useThing = () => {}\n', undefined, undefined,
    )
    backend.proposeFileNode(
      bPlan.id, 'Thing component', 'Uses the hook', 'src/Thing.tsx', 'import { useThing } from "./useThing"\n', bHook.id, [bHook.id],
    )

    const vPlan = vendor.createPlan(vendorRoot, 'Add a hook', { temporary: false, expectedSteps: 2 })
    const vHook = vendor.proposeFileNode(
      vendorRoot, vPlan.id, 'useThing hook', 'The hook', 'src/useThing.ts', 'export const useThing = () => {}\n', undefined, undefined,
    )
    vendor.proposeFileNode(
      vendorRoot, vPlan.id, 'Thing component', 'Uses the hook', 'src/Thing.tsx', 'import { useThing } from "./useThing"\n', vHook.id, [vHook.id],
    )

    compare('plans.json')
    compare('notes.json')
  })

  it('applies the same temporary flag and omits absent optional keys', () => {
    backend.createPlan('Scratch idea', [], undefined, undefined, undefined, true, undefined)
    vendor.createPlan(vendorRoot, 'Scratch idea', { temporary: true, expectedSteps: undefined })
    compare('plans.json')

    const plans = read(vendorRoot, 'plans.json') as Array<Record<string, unknown>>
    expect(plans[0].temporary).toBe(true)
    expect(plans[0]).not.toHaveProperty('expectedSteps')
  })

  it('derives the same slug and id shape from an awkward label', () => {
    const label = '  Fix THE  ///thing (again!) '
    const { plan: bPlan } = backend.createPlan(label, [], undefined, undefined, undefined, false, undefined)
    const vPlan = vendor.createPlan(vendorRoot, label, {})

    expect(vPlan.id.replace(/-\d{13}$/, '')).toBe(bPlan.id.replace(/-\d{13}$/, ''))
    expect(vPlan.id).toMatch(/^plan\/fix-the-thing-again-\d{13}$/)
    expect(vPlan.label).toBe(bPlan.label)
  })

  it('refuses an escaping path the same way the backend does', () => {
    expect(() =>
      vendor.proposeFileNode(vendorRoot, 'p', 'Step', undefined, '../outside.ts', '', undefined, undefined),
    ).toThrow(/escapes allowed root/i)
  })

  it('normalizes an absolute in-root path, as the backend now does', () => {
    vendor.proposeFileNode(
      vendorRoot, 'p', 'Step', undefined, join(vendorRoot, 'src', 'Abs.tsx'), '', undefined, undefined,
    )
    const notes = read(vendorRoot, 'notes.json') as { nodes: Array<{ proposedFile: { path: string } }> }
    expect(notes.nodes[0].proposedFile.path).toBe('src/Abs.tsx')
  })

  // The backend drops a README into .planning/ on first write. The vendored copy
  // deliberately does not: the agent-facing docs are emitted once, from the
  // registry, so this file can never carry a stale copy of them.
  it('writes no README of its own, where the backend does', () => {
    vendor.createPlan(vendorRoot, 'Anything', {})
    backend.createPlan('Anything', [], undefined, undefined, undefined, false, undefined)

    expect(existsSync(join(vendorRoot, '.planning', 'README.md'))).toBe(false)
    expect(existsSync(join(backendRoot, '.planning', 'README.md'))).toBe(true)
  })

  // The whole reason this feature exists: the README the backend drops used to
  // interpolate an absolute path to the local Sleipnir install, into a file that
  // is written once, never refreshed, and committed.
  it('leaves no machine-specific path in the README the backend writes', () => {
    backend.createPlan('Anything', [], undefined, undefined, undefined, false, undefined)
    const readme = readFileSync(join(backendRoot, '.planning', 'README.md'), 'utf8')

    expect(readme).toContain('node .sleipnir/plan.mjs')
    expect(readme).not.toMatch(/[A-Za-z]:[\\/]/)
    expect(readme).not.toContain(backendRoot)
    expect(readme).not.toContain('sleipnir-plan.mjs')
  })
})
