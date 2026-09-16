// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  slugify,
  planDocPath,
  parseFileSpec,
  isPlanningPath,
  addPlanStep,
  planSteps,
  renderPlanDoc,
  detectProject,
  ROLE_LINKS,
  ROLE_SUFFIX,
  PLANNED_ROLES,
  PLANNED_LANGUAGES,
} from './planDoc.mjs'
import { ROLE_OPTIONS, LANGUAGES } from '../src/00_planning/graph/architectures'
import { ROLE_SUFFIX as TS_ROLE_SUFFIX } from '../src/00_planning/graph/naming'

type Node = { id: string; label?: string; order?: number; type?: string; description?: string; [key: string]: unknown }
type Edge = { source: string; target: string; kind: string }
type Data = { nodes: Node[]; edges: Edge[] }

const PLAN = 'plan/cart-1700000000000'
const empty = (): Data => ({ nodes: [], edges: [] })
const step = (label: string): Node => ({
  id: `plan/cart-1700000000000/${slugify(label)}`,
  label,
  kind: 'proposed',
  map: 'claude',
  type: 'plan-step',
  status: 'draft',
  planId: PLAN,
})
const short = (id: string) => id.slice(id.lastIndexOf('/') + 1)
const edgesOf = (data: Data, kind: string) =>
  data.edges.filter((e) => e.kind === kind).map((e) => `${short(e.source)}->${short(e.target)}`)

describe('planDoc mirrors the TS source of truth', () => {
  it('ROLE_LINKS matches architectures.ts ROLE_OPTIONS', () => {
    expect(ROLE_LINKS).toEqual(Object.fromEntries(ROLE_OPTIONS.map((r) => [r.id, r.linksTo])))
    expect(PLANNED_ROLES).toEqual(ROLE_OPTIONS.map((r) => r.id))
  })

  it('ROLE_SUFFIX matches naming.ts', () => {
    expect(ROLE_SUFFIX).toEqual(TS_ROLE_SUFFIX)
  })

  it('knows every language architectures.ts does', () => {
    expect([...PLANNED_LANGUAGES].sort()).toEqual(LANGUAGES.map((l) => l.id).sort())
  })
})

describe('paths and specs', () => {
  it('builds the plan doc path from the plan id', () => {
    expect(planDocPath(PLAN)).toBe('.planning/cart-1700000000000/plan.md')
  })

  it('parses path:role:language, defaulting role and inferring language', () => {
    expect(parseFileSpec('src/cart/cartView.tsx:view')).toEqual({ path: 'src/cart/cartView.tsx', role: 'view', language: 'react' })
    expect(parseFileSpec('src/lib.rs')).toEqual({ path: 'src/lib.rs', role: 'node', language: 'rust' })
    expect(parseFileSpec('src/a.js:controller:jquery')).toEqual({ path: 'src/a.js', role: 'controller', language: 'jquery' })
    expect(parseFileSpec('src/noext:node', 'go')).toEqual({ path: 'src/noext', role: 'node', language: 'go' })
  })

  it('rejects unknown roles, unknown languages and empty paths', () => {
    expect(() => parseFileSpec('src/a.tsx:widget')).toThrow(/Unknown role/)
    expect(() => parseFileSpec('src/a.cpp:node:cpp')).toThrow(/Unknown language/)
    expect(() => parseFileSpec(':view')).toThrow(/needs a path/)
  })

  it('recognizes .planning paths', () => {
    expect(isPlanningPath('.planning')).toBe(true)
    expect(isPlanningPath('.planning/x/a.tsx')).toBe(true)
    expect(isPlanningPath('.planningish/a.tsx')).toBe(false)
  })
})

describe('addPlanStep ordering', () => {
  it('chains steps in creation order', () => {
    const data = empty()
    for (const label of ['One', 'Two', 'Three']) addPlanStep(data, { planId: PLAN, node: step(label) })
    expect(planSteps(data.nodes, PLAN).map((s) => [s.label, s.order])).toEqual([['One', 1], ['Two', 2], ['Three', 3]])
    expect(edgesOf(data, 'sequence')).toEqual(['one->two', 'two->three'])
  })

  it("leaves a step unlinked with after: 'none'", () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('One') })
    addPlanStep(data, { planId: PLAN, node: step('Side quest'), after: 'none' })
    expect(edgesOf(data, 'sequence')).toEqual([])
    expect(data.nodes[1].order).toBe(2)
  })

  it('inserts after a named step, renumbering later steps and re-pointing the chain', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('One') })
    addPlanStep(data, { planId: PLAN, node: step('Three') })
    addPlanStep(data, { planId: PLAN, node: step('Two'), after: step('One').id })
    expect(planSteps(data.nodes, PLAN).map((s) => [s.label, s.order])).toEqual([['One', 1], ['Two', 2], ['Three', 3]])
    expect(edgesOf(data, 'sequence').sort()).toEqual(['one->two', 'two->three'])
  })

  it('rejects an after id that is not a step of the plan', () => {
    expect(() => addPlanStep(empty(), { planId: PLAN, node: step('One'), after: 'plan/other/x' })).toThrow(/not a step/)
  })

  it('keeps steps written before ordering existed in creation order', () => {
    const data = empty()
    data.nodes.push(step('Legacy A'), step('Legacy B'))
    addPlanStep(data, { planId: PLAN, node: step('New') })
    expect(planSteps(data.nodes, PLAN).map((s) => [s.label, s.order])).toEqual([['Legacy A', 1], ['Legacy B', 2], ['New', 3]])
    expect(edgesOf(data, 'sequence')).toEqual(['legacy-b->new'])
  })
})

describe('addPlanStep planned files', () => {
  const files = [
    { path: 'src/cart/cartView.tsx', role: 'view', language: 'react' },
    { path: 'src/cart/cartViewModel.tsx', role: 'view-model', language: 'react' },
  ]

  it('creates placeholder nodes linked to their step, with role-implied imports', () => {
    const data = empty()
    const { planned } = addPlanStep(data, { planId: PLAN, node: step('Build cart'), files })
    expect(planned.map((p: Node) => p.id)).toEqual([
      'planned/cart-1700000000000/src/cart/cartView.tsx',
      'planned/cart-1700000000000/src/cart/cartViewModel.tsx',
    ])
    expect(planned[0]).toMatchObject({ type: 'planned-file', planned: true, stepId: step('Build cart').id, filePath: 'src/cart/cartView.tsx', role: 'view' })
    expect(edgesOf(data, 'plan-step')).toEqual(['build-cart->cartView.tsx', 'build-cart->cartViewModel.tsx'])
    expect(edgesOf(data, 'borrows')).toEqual(['cartView.tsx->cartViewModel.tsx'])
  })

  it('links to sibling files planned by an earlier step', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('Model'), files: [{ path: 'src/cart/cartInterface.ts', role: 'interface', language: 'typescript' }] })
    addPlanStep(data, { planId: PLAN, node: step('View model'), files: [files[1]] })
    expect(edgesOf(data, 'borrows')).toEqual(['cartViewModel.tsx->cartInterface.ts'])
  })

  it('does not link files of different features', () => {
    const data = empty()
    addPlanStep(data, {
      planId: PLAN,
      node: step('Mixed'),
      files: [files[0], { path: 'src/checkout/checkoutViewModel.tsx', role: 'view-model', language: 'react' }],
    })
    expect(edgesOf(data, 'borrows')).toEqual([])
  })

  it('refuses to plan the same file twice', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('One'), files: [files[0]] })
    expect(() => addPlanStep(data, { planId: PLAN, node: step('Two'), files: [files[0]] })).toThrow(/already planned/)
    expect(() => addPlanStep(empty(), { planId: PLAN, node: step('Dup'), files: [files[0], files[0]] })).toThrow(/already planned/)
  })

  it('records edits on the step, deduplicated', () => {
    const data = empty()
    const { node } = addPlanStep(data, { planId: PLAN, node: step('Wire'), edits: ['src/App.tsx', 'src/App.tsx'] })
    expect(node.editsPaths).toEqual(['src/App.tsx'])
  })
})

describe('renderPlanDoc', () => {
  const build = () => {
    const data = empty()
    addPlanStep(data, {
      planId: PLAN,
      node: { ...step('Build cart'), description: 'The cart screen.' },
      files: [{ path: 'src/cart/cartView.tsx', role: 'view', language: 'react' }],
      edits: ['src/App.tsx'],
    })
    addPlanStep(data, { planId: PLAN, node: step('Test it') })
    return data
  }
  const render = (data: Data, existing: string | null) =>
    renderPlanDoc({
      plan: { id: PLAN, label: 'Cart' },
      steps: planSteps(data.nodes, PLAN),
      plannedFiles: data.nodes.filter((n) => n.type === 'planned-file'),
      existing,
    })

  it('renders numbered sections with files and edits', () => {
    const text = render(build(), null)
    expect(text).toContain('# Cart\n')
    expect(text).toContain('## 1. Build cart\n')
    expect(text).toContain('## 2. Test it\n')
    expect(text).toContain('- `src/cart/cartView.tsx` — view (react)')
    expect(text).toContain('**Edits**\n- `src/App.tsx`')
  })

  it('is stable when re-rendered over its own output', () => {
    const data = build()
    const first = render(data, null)
    expect(render(data, first)).toBe(first)
  })

  it('keeps what a human wrote while regenerating the managed parts', () => {
    const data = build()
    const id = step('Build cart').id
    const annotated = render(data, null)
      .replace('<!-- /plan-meta -->\n\n', '<!-- /plan-meta -->\nWhy we are doing this.\n\n')
      .replace(`<!-- /step-meta:${id} -->\n\n`, `<!-- /step-meta:${id} -->\nRemember the empty state.\n`)
    data.nodes[0].description = 'The cart screen, updated.'
    const next = render(data, annotated)
    expect(next).toContain('Why we are doing this.')
    expect(next).toContain('Remember the empty state.')
    expect(next).toContain('The cart screen, updated.')
    expect(next).not.toContain('The cart screen.\n')
  })

  it('moves a step body with its step when the order changes', () => {
    const data = build()
    const id = step('Test it').id
    const annotated = render(data, null).replace(`<!-- /step-meta:${id} -->\n\n`, `<!-- /step-meta:${id} -->\nUse vitest.\n`)
    addPlanStep(data, { planId: PLAN, node: step('First of all'), after: step('Build cart').id })
    const next = render(data, annotated)
    expect(next.indexOf('## 3. Test it')).toBeGreaterThan(next.indexOf('## 2. First of all'))
    expect(next.slice(next.indexOf('## 3. Test it'))).toContain('Use vitest.')
  })
})

describe('detectProject', () => {
  // A path -> content map standing in for a project folder.
  const fake = (files: Record<string, string>) => {
    const listDir = (rel: string) => {
      const prefix = rel ? `${rel}/` : ''
      const seen = new Map<string, boolean>()
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue
        const [head, ...rest] = p.slice(prefix.length).split('/')
        seen.set(head, (seen.get(head) ?? false) || rest.length > 0)
      }
      return [...seen].map(([name, dir]) => ({ name, dir }))
    }
    const readText = (rel: string) => files[rel] ?? null
    return detectProject(listDir, readText)
  }

  it('detects react over typescript from package.json', () => {
    const r = fake({ 'package.json': JSON.stringify({ dependencies: { react: '^18' } }), 'tsconfig.json': '{}', 'src/main.tsx': '' })
    expect(r.primary).toBe('react')
    expect(r.conventions).toEqual({ srcDir: 'src' })
  })

  it('detects typescript, jquery and plain javascript', () => {
    expect(fake({ 'package.json': '{}', 'tsconfig.json': '{}' }).primary).toBe('typescript')
    expect(fake({ 'tsconfig.json': '{}' }).primary).toBe('typescript')
    expect(fake({ 'package.json': JSON.stringify({ dependencies: { jquery: '3' } }) }).primary).toBe('jquery')
    expect(fake({ 'package.json': 'not json' }).primary).toBe('javascript')
  })

  it('detects rust, go and python manifests', () => {
    expect(fake({ 'Cargo.toml': '' }).primary).toBe('rust')
    expect(fake({ 'go.mod': '' }).primary).toBe('go')
    expect(fake({ 'pyproject.toml': '' }).primary).toBe('python')
    expect(fake({ 'requirements.txt': '' }).primary).toBe('python')
  })

  it('reports C and C++ as unsupported rather than guessing', () => {
    expect(fake({ 'CMakeLists.txt': '', 'main.cpp': '' })).toMatchObject({ primary: null, unsupported: [{ file: 'CMakeLists.txt', language: 'cpp' }] })
    expect(fake({ Makefile: '', 'main.c': '' }).unsupported).toEqual([{ file: 'Makefile', language: 'c' }])
    expect(fake({ Makefile: '' }).unsupported).toEqual([])
  })

  it('looks one folder down for monorepos, preferring root-level manifests', () => {
    const mono = fake({ 'web/package.json': '{}', 'crates/Cargo.toml': '' })
    expect(mono.languages.sort()).toEqual(['javascript', 'rust'])
    // Only one level down — deeper manifests are out of scope.
    expect(fake({ 'packages/web/package.json': '{}' }).detected).toEqual([])
    expect(fake({ 'apps/package.json': JSON.stringify({ dependencies: { react: '1' } }) }).primary).toBe('react')
    expect(fake({ 'go.mod': '', 'web/package.json': JSON.stringify({ dependencies: { react: '1' } }) }).primary).toBe('go')
  })

  it('skips dependency and build folders', () => {
    expect(fake({ 'node_modules/package.json': '{}', 'target/Cargo.toml': '' }).detected).toEqual([])
  })
})
