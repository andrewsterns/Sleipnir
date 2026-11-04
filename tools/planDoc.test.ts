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
  toStepStatus,
  applyStepStatus,
  latestStepNotes,
  addStepComment,
  snapshotTree,
  diffSnapshots,
  snapshotActionFor,
  attachChanges,
  MAX_SNAPSHOT_FILES,
} from './planDoc.mjs'
import { ROLE_OPTIONS, LANGUAGES } from '../src/planning/graph/architectures'
import { ROLE_SUFFIX as TS_ROLE_SUFFIX } from '../src/planning/graph/naming'

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
    expect(() => parseFileSpec('src/a.cob:node:cobol')).toThrow(/Unknown language/)
    // C, C++, Java, Kotlin, Swift and C# are planning languages now.
    expect(parseFileSpec('src/sensor.h:interface')).toMatchObject({ language: 'c' })
    expect(parseFileSpec('src/main/java/App.java:view')).toMatchObject({ language: 'java' })
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

  it('detects C and C++ from their build files, but not a bare Makefile', () => {
    expect(fake({ 'CMakeLists.txt': '', 'main.cpp': '' })).toMatchObject({ primary: 'cpp', detected: [{ file: 'CMakeLists.txt', language: 'cpp' }], unsupported: [] })
    expect(fake({ Makefile: '', 'main.c': '' }).detected).toEqual([{ file: 'Makefile', language: 'c' }])
    expect(fake({ Makefile: '' }).detected).toEqual([])
  })

  it('tells C from C++ by sources and CMake project languages', () => {
    expect(fake({ 'CMakeLists.txt': 'project(sensors LANGUAGES C)', 'src/main.c': '' }).detected).toEqual([{ file: 'CMakeLists.txt', language: 'c' }])
    expect(fake({ 'CMakeLists.txt': '', 'src/engine.cpp': '' }).detected).toEqual([{ file: 'CMakeLists.txt', language: 'cpp' }])
    expect(fake({ 'meson.build': '', 'src/main.c': '' }).detected).toEqual([{ file: 'meson.build', language: 'c' }])
  })

  it('detects Java, Kotlin, Swift and C# from their build files', () => {
    expect(fake({ 'pom.xml': '', 'src/main/java/App.java': '' })).toMatchObject({
      primary: 'java',
      detected: [{ file: 'pom.xml', language: 'java' }],
      conventions: { srcDir: 'src', sourceDirs: { java: 'src/main/java' } },
    })
    expect(fake({ 'build.gradle.kts': '', 'src/main/kotlin/App.kt': '' }).detected).toEqual([{ file: 'build.gradle.kts', language: 'kotlin' }])
    // A Kotlin build script alone doesn't make a Java project Kotlin.
    expect(fake({ 'build.gradle.kts': '', 'src/main/java/App.java': '' }).detected).toEqual([{ file: 'build.gradle.kts', language: 'java' }])
    expect(fake({ 'Package.swift': '', 'Sources/App/main.swift': '' })).toMatchObject({ detected: [{ file: 'Package.swift', language: 'swift' }], conventions: { sourceDirs: { swift: 'Sources' } } })
    expect(fake({ 'Shop.csproj': '' }).detected).toEqual([{ file: 'Shop.csproj', language: 'csharp' }])
  })

  it('reports an include folder for C-family layouts', () => {
    expect(fake({ 'CMakeLists.txt': '', 'include/sensor.h': '', 'src/sensor.c': '' }).conventions).toEqual({ srcDir: 'src', includeDir: 'include' })
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

describe('step status', () => {
  it('takes the status however an agent spells it', () => {
    for (const v of ['in_progress', 'In progress', 'in-progress', ' IN PROGRESS ']) expect(toStepStatus(v)).toBe('in_progress')
    expect(toStepStatus('Completed')).toBe('completed')
    expect(toStepStatus('done')).toBe('completed')
    expect(toStepStatus('Done')).toBe('completed')
    expect(toStepStatus('later')).toBeUndefined()
  })

  it('records a report: the status, and the note on one line', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('Build cart') })
    const stages: Record<string, string> = {}
    const events: Array<Record<string, unknown>> = []
    const id = step('Build cart').id
    applyStepStatus({ nodes: data.nodes, stages, events, stepId: id, status: 'completed', note: ' Built it\n  with tests ', agent: 'codex', at: 5 })
    expect(stages).toEqual({ [id]: 'completed' })
    expect(events).toEqual([{ at: 5, stepId: id, status: 'completed', note: 'Built it with tests', agent: 'codex' }])
    expect(latestStepNotes(events)).toEqual({ [id]: 'Built it with tests' })
  })

  it('reports only on plan steps', () => {
    const nodes = [{ id: 'note/a', type: 'note' }]
    expect(() => applyStepStatus({ nodes, stages: {}, events: [], stepId: 'note/a', status: 'completed', at: 1 })).toThrow('not a plan step')
  })

  it('shows every step with its status in plan.md, pending by default', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('Build cart') })
    addPlanStep(data, { planId: PLAN, node: step('Test it') })
    const text = renderPlanDoc({
      plan: { id: PLAN, label: 'Cart' },
      steps: planSteps(data.nodes, PLAN),
      plannedFiles: [],
      existing: null,
      statuses: { [step('Build cart').id]: 'completed' },
      events: [{ at: 1, stepId: step('Build cart').id, status: 'completed', note: 'Shipped', agent: 'claude' }],
    })
    expect(text).toContain(`<!-- step:${step('Build cart').id} -->\n**Status:** Done — Shipped\n`)
    expect(text).toContain(`<!-- step:${step('Test it').id} -->\n**Status:** Proposed\n`)
  })
})

describe('what a step changed', () => {
  // A path -> [size, mtime] map standing in for a project folder.
  const tree = (files: Record<string, [number, number]>) => {
    const listDir = (rel: string) => {
      const prefix = rel ? `${rel}/` : ''
      const names = new Map<string, boolean>()
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue
        const [name, ...rest] = p.slice(prefix.length).split('/')
        names.set(name, rest.length > 0)
      }
      return [...names].map(([name, dir]) => ({ name, dir }))
    }
    return { listDir, statFile: (rel: string) => files[rel] ?? null }
  }

  it('snapshots every file but dependencies, git, the plan itself and what git ignores', () => {
    const { listDir, statFile } = tree({
      'src/a.ts': [10, 1],
      'node_modules/x/index.js': [1, 1],
      '.git/HEAD': [1, 1],
      '.planning/stages.json': [1, 1],
      '.claude/worktrees/w/src/a.ts': [1, 1],
      '.claude/commands/plan.md': [5, 1],
      'release/app.exe': [9, 1],
      '.env': [3, 1],
    })
    expect(snapshotTree(listDir, statFile, new Set(['release', '.env']))).toEqual({
      '.claude/commands/plan.md': [5, 1],
      'src/a.ts': [10, 1],
    })
  })

  it('gives up past the file limit rather than stall the step', () => {
    const files: Record<string, [number, number]> = {}
    for (let i = 0; i <= MAX_SNAPSHOT_FILES; i++) files[`f${i}`] = [1, 1]
    const { listDir, statFile } = tree(files)
    expect(snapshotTree(listDir, statFile)).toBeNull()
  })

  it('lists files added, modified and deleted, by path', () => {
    const before = { 'a.ts': [1, 1], 'b.ts': [2, 2], 'c.ts': [3, 3] } as Record<string, [number, number]>
    const after = { 'a.ts': [1, 1], 'b.ts': [2, 9], 'd.ts': [4, 4] } as Record<string, [number, number]>
    expect(diffSnapshots(before, after)).toEqual({
      changes: [
        { path: 'b.ts', change: 'modified' },
        { path: 'c.ts', change: 'deleted' },
        { path: 'd.ts', change: 'added' },
      ],
      more: 0,
    })
  })

  it('snapshots when work starts, compares when it ends, drops it when it goes back', () => {
    expect(snapshotActionFor(undefined, 'in_progress')).toBe('take')
    expect(snapshotActionFor('completed', 'in_progress')).toBe('take')
    expect(snapshotActionFor('in_progress', 'in_progress')).toBe('keep')
    expect(snapshotActionFor('in_progress', 'completed')).toBe('compare')
    expect(snapshotActionFor('in_progress', 'pending')).toBe('drop')
  })

  it('puts the changes on the completing report, or says they are unknown', () => {
    const event = attachChanges({ at: 9 }, { at: 1, files: { 'a.ts': [1, 1] } }, { 'a.ts': [2, 2] })
    expect(event).toEqual({ at: 9, since: 1, changes: [{ path: 'a.ts', change: 'modified' }] })
    expect(attachChanges({ at: 9 }, { at: 1, files: null }, {})).toEqual({ at: 9, since: 1, changesUnknown: true })
    expect(attachChanges({ at: 9 }, null, {})).toEqual({ at: 9 })
  })
})

describe('testing status', () => {
  it('is its own status, keeping the snapshot the step started with', () => {
    expect(toStepStatus('testing')).toBe('testing')
    expect(toStepStatus('Testing')).toBe('testing')
    expect(snapshotActionFor('in_progress', 'testing')).toBe('keep')
    expect(snapshotActionFor('testing', 'in_progress')).toBe('keep')
    expect(snapshotActionFor('testing', 'completed')).toBe('compare')
    expect(snapshotActionFor(undefined, 'testing')).toBe('take')
  })
})

describe('comments and who moved a step', () => {
  it('puts a person\u2019s comment and status change in plan.md, where agents read', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('Build cart') })
    const id = step('Build cart').id
    const events: Array<Record<string, unknown>> = [{ at: 1, stepId: id, status: 'in_progress', agent: 'you' }]
    addStepComment({ nodes: data.nodes, events, stepId: id, text: '  Keep the old cart route working ', agent: 'you', at: 2 })
    const text = renderPlanDoc({
      plan: { id: PLAN, label: 'Cart' },
      steps: planSteps(data.nodes, PLAN),
      plannedFiles: [],
      existing: null,
      statuses: { [id]: 'in_progress' },
      events,
    })
    expect(text).toContain('**Status:** In progress (set by you)')
    expect(text).toContain('**Comments**\n- you: Keep the old cart route working\n')
  })

  it('refuses an empty comment, or one on something that is not a step', () => {
    const data = empty()
    addPlanStep(data, { planId: PLAN, node: step('Build cart') })
    expect(() => addStepComment({ nodes: data.nodes, events: [], stepId: step('Build cart').id, text: '  ', at: 1 })).toThrow('needs some text')
    expect(() => addStepComment({ nodes: data.nodes, events: [], stepId: 'nope', text: 'hi', at: 1 })).toThrow('No step')
  })
})
