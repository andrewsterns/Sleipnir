// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import * as backend from '../../../tools/sleipnir-backend.mjs'
import * as vendor from '../../../tools/agentSkills/vendor/plan.mjs'
import { extractPlanDocRegion, SOURCE_PATH, VENDOR_PATH } from '../../../tools/syncPlanDoc.mjs'

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

  // --- ordered, architecture-aware steps ------------------------------------

  it('carries a byte-identical copy of tools/planDoc.mjs', () => {
    expect(
      extractPlanDocRegion(readFileSync(VENDOR_PATH, 'utf8')),
      'vendor/plan.mjs is out of date — run `node tools/syncPlanDoc.mjs`',
    ).toBe(extractPlanDocRegion(readFileSync(SOURCE_PATH, 'utf8')))
  })

  const readDoc = (root: string, planId: string) => {
    const p = join(root, '.planning', planId.replace(/^plan\//, ''), 'plan.md')
    return existsSync(p) ? readFileSync(p, 'utf8').replace(/-\d{13}/g, '-<TS>') : null
  }

  const writeBoth = (rel: string, content = '') => {
    for (const root of [backendRoot, vendorRoot]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true })
      writeFileSync(join(root, rel), content)
    }
  }

  it('writes identical order, sequence edges and plan.md for chained and inserted steps', () => {
    const { plan: bPlan } = backend.createPlan('Checkout', [], undefined, undefined, undefined, false, 4)
    const { node: b1 } = backend.createPlanNode(bPlan.id, 'Cart model', 'State', undefined)
    backend.addPlanNodes(bPlan.id, [b1.id])
    const { node: b3 } = backend.createPlanNode(bPlan.id, 'Payment', 'Pay', undefined)
    backend.addPlanNodes(bPlan.id, [b3.id])
    const { node: b2 } = backend.createPlanNode(bPlan.id, 'Cart view', 'UI', undefined, { after: b1.id })
    backend.addPlanNodes(bPlan.id, [b2.id])
    const { node: bSide } = backend.createPlanNode(bPlan.id, 'Analytics', 'Parallel', undefined, { after: 'none' })
    backend.addPlanNodes(bPlan.id, [bSide.id])

    const vPlan = vendor.createPlan(vendorRoot, 'Checkout', { expectedSteps: 4 })
    const v1 = vendor.createPlanNode(vendorRoot, vPlan.id, 'Cart model', 'State', undefined)
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, v1.id)
    const v3 = vendor.createPlanNode(vendorRoot, vPlan.id, 'Payment', 'Pay', undefined)
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, v3.id)
    const v2 = vendor.createPlanNode(vendorRoot, vPlan.id, 'Cart view', 'UI', undefined, { after: v1.id })
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, v2.id)
    const vSide = vendor.createPlanNode(vendorRoot, vPlan.id, 'Analytics', 'Parallel', undefined, { after: 'none' })
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, vSide.id)

    compare('plans.json')
    compare('notes.json')
    expect(readDoc(vendorRoot, vPlan.id)).toBe(readDoc(backendRoot, bPlan.id))

    const doc = readDoc(backendRoot, bPlan.id)!
    expect(doc.indexOf('## 2. Cart view')).toBeGreaterThan(doc.indexOf('## 1. Cart model'))
    expect(doc.indexOf('## 3. Payment')).toBeGreaterThan(doc.indexOf('## 2. Cart view'))
    expect((read(backendRoot, 'plans.json') as Array<{ docPath: string }>)[0].docPath).toMatch(/^\.planning\/checkout-<TS>\/plan\.md$/)
  })

  it('writes identical planned-file nodes, links and edits', () => {
    writeBoth('package.json', JSON.stringify({ dependencies: { react: '18' } }))
    writeBoth('src/App.tsx', 'export {}\n')
    const files = ['src/cart/cartView.tsx:view', 'src/cart/cartViewModel.tsx:view-model', 'src/cart/cartInterface.ts:interface']

    const { plan: bPlan } = backend.createPlan('Cart', [], undefined, undefined, undefined, false, 1)
    const { node: bStep } = backend.createPlanNode(bPlan.id, 'Build cart', 'Screen', undefined, {
      files, edits: ['src/App.tsx'], defaultLanguage: backend.detectProject().primary,
    })
    backend.addPlanNodes(bPlan.id, [bStep.id])

    const vPlan = vendor.createPlan(vendorRoot, 'Cart', { expectedSteps: 1 })
    const vStep = vendor.createPlanNode(vendorRoot, vPlan.id, 'Build cart', 'Screen', undefined, {
      files, edits: ['src/App.tsx'], defaultLanguage: vendor.detectProjectIn(vendorRoot).primary,
    })
    vendor.pullIntoNamedPlanIfExists(vendorRoot, vPlan.id, vStep.id)

    compare('plans.json')
    compare('notes.json')
    expect(readDoc(vendorRoot, vPlan.id)).toBe(readDoc(backendRoot, bPlan.id))

    const notes = read(backendRoot, 'notes.json') as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, string>> }
    expect(notes.nodes.filter((n) => n.type === 'planned-file').map((n) => [n.filePath, n.role, n.language])).toEqual([
      ['src/cart/cartView.tsx', 'view', 'react'],
      ['src/cart/cartViewModel.tsx', 'view-model', 'react'],
      ['src/cart/cartInterface.ts', 'interface', 'typescript'],
    ])
    expect(notes.edges.filter((e) => e.kind === 'borrows').map((e) => `${e.source} -> ${e.target}`)).toEqual([
      'planned/cart-<TS>/src/cart/cartView.tsx -> planned/cart-<TS>/src/cart/cartViewModel.tsx',
      'planned/cart-<TS>/src/cart/cartViewModel.tsx -> planned/cart-<TS>/src/cart/cartInterface.ts',
    ])
    // Placeholders only: nothing real was written.
    expect(existsSync(join(backendRoot, 'src', 'cart'))).toBe(false)
    expect(existsSync(join(vendorRoot, 'src', 'cart'))).toBe(false)
    // Planned files are on the plan's own tab.
    const plans = read(backendRoot, 'plans.json') as Array<{ nodeIds: string[] }>
    expect(plans[0].nodeIds).toHaveLength(4)
  })

  it('rejects the same bad planned files the same way', () => {
    writeBoth('src/existing.ts', '')
    const cases: Array<[Record<string, string[]>, RegExp]> = [
      [{ files: ['src/existing.ts:node'] }, /already exists/],
      [{ files: ['.planning/cart/cartView.tsx:view'] }, /never \.planning/],
      [{ files: ['../outside.ts:node'] }, /escapes allowed root/i],
      [{ edits: ['src/missing.ts'] }, /doesn't exist/],
    ]
    for (const [opts, message] of cases) {
      expect(() => backend.createPlanNode('p', 'Step', undefined, undefined, opts)).toThrow(message)
      expect(() => vendor.createPlanNode(vendorRoot, 'p', 'Step', undefined, undefined, opts)).toThrow(message)
    }
    // Nothing half-written.
    expect(read(backendRoot, 'notes.json')).toBeNull()
    expect(read(vendorRoot, 'notes.json')).toBeNull()
  })

  it('detects the same project the same way', () => {
    writeBoth('Cargo.toml', '')
    writeBoth('web/package.json', JSON.stringify({ devDependencies: { typescript: '5' } }))
    writeBoth('src/main.rs', '')
    expect(vendor.detectProjectIn(vendorRoot)).toEqual(backend.detectProject())
    expect(backend.detectProject()).toMatchObject({ primary: 'rust', languages: ['rust', 'typescript'], conventions: { srcDir: 'src' } })
  })
})
