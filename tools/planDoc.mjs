// Pure planning logic shared by the backend (tools/sleipnir-backend.mjs) and the
// vendored project CLI (tools/agentSkills/vendor/plan.mjs):
//
//   - step ordering + 'sequence' edges (auto-chained, or inserted with --after)
//   - planned-file placeholder nodes and the import links between them
//   - rendering .planning/<plan>/plan.md, preserving what a human wrote in it
//   - detecting a project's language(s) before an agent plans against it
//
// The vendored CLI is copied into projects on its own and may only use node:
// builtins, so it cannot import this file. Instead it carries a BYTE-IDENTICAL
// copy of everything between the BEGIN/END PLANDOC markers below, and
// src/00_planning/api/vendoredPlanCli.test.ts fails if the two ever differ.
// Keep this region free of imports and of anything that touches the filesystem:
// callers hand in the data (and, for detection, small read callbacks).

// --- BEGIN PLANDOC ---

export function slugify(label) {
  return String(label ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// A plan id is already "plan/..."; strip the prefix so ids and folders built
// from it don't double up into "plan/plan/...".
export function planSegmentOf(planId) {
  return planId.startsWith('plan/') ? planId.slice('plan/'.length) : planId
}

export function planDocPath(planId) {
  return `.planning/${planSegmentOf(planId)}/plan.md`
}

// Plain-data mirrors of src/00_planning/graph/architectures.ts (ROLE_OPTIONS'
// linksTo) and naming.ts (ROLE_SUFFIX). A test asserts they stay equal.
export const PLANNED_ROLES = ['node', 'view', 'view-model', 'interface', 'controller', 'presenter']
export const ROLE_LINKS = {
  node: [],
  view: ['view-model', 'controller', 'presenter'],
  'view-model': ['interface'],
  interface: [],
  controller: [],
  presenter: [],
}
export const ROLE_SUFFIX = {
  node: '',
  view: 'View',
  'view-model': 'ViewModel',
  interface: 'Interface',
  controller: 'Controller',
  presenter: 'Presenter',
}

// First match wins, same as naming.ts's languageForExt (so .js -> javascript).
export const PLANNED_LANGUAGES = ['react', 'typescript', 'javascript', 'jquery', 'python', 'rust', 'go', 'html', 'css']
const EXT_LANGUAGE = { tsx: 'react', ts: 'typescript', js: 'javascript', py: 'python', rs: 'rust', go: 'go', html: 'html', css: 'css' }

// "src/cart/cartView.tsx:view[:react]" -> { path, role, language? }.
// Role defaults to 'node'; language to the extension's, then `defaultLanguage`.
export function parseFileSpec(spec, defaultLanguage) {
  const [rawPath, role = 'node', language] = String(spec ?? '').split(':')
  const filePath = (rawPath ?? '').trim()
  if (!filePath) throw new Error(`A planned file needs a path: "${spec}"`)
  if (!PLANNED_ROLES.includes(role)) {
    throw new Error(`Unknown role "${role}" in "${spec}" — expected one of ${PLANNED_ROLES.join(', ')}`)
  }
  const ext = (filePath.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  const resolvedLanguage = language || EXT_LANGUAGE[ext] || defaultLanguage || undefined
  if (resolvedLanguage && !PLANNED_LANGUAGES.includes(resolvedLanguage)) {
    throw new Error(`Unknown language "${resolvedLanguage}" in "${spec}" — expected one of ${PLANNED_LANGUAGES.join(', ')}`)
  }
  return { path: filePath, role, ...(resolvedLanguage ? { language: resolvedLanguage } : {}) }
}

// Stored (root-relative, forward-slash) paths only.
export function isPlanningPath(storedPath) {
  return storedPath === '.planning' || storedPath.startsWith('.planning/')
}

// "src/cart/cartViewModel.tsx" as a view-model -> "src/cart/cart": the shared
// feature name its sibling role files are paired on.
function featureKey(filePath, role) {
  const slash = filePath.lastIndexOf('/')
  const dir = slash >= 0 ? filePath.slice(0, slash) : ''
  let name = filePath.slice(slash + 1).replace(/\.[^.]+$/, '')
  const suffix = ROLE_SUFFIX[role] ?? ''
  if (suffix && name.length > suffix.length && name.toLowerCase().endsWith(suffix.toLowerCase())) {
    name = name.slice(0, -suffix.length)
  }
  return `${dir}/${name}`.toLowerCase()
}

// A plan's steps in reading order: explicit `order` first, then (for steps
// written before ordering existed) the order they were created in.
export function planSteps(nodes, planId) {
  return nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.type === 'plan-step' && n.planId === planId)
    .sort((a, b) => (a.n.order ?? Infinity) - (b.n.order ?? Infinity) || a.i - b.i)
    .map(({ n }) => n)
}

function pushEdge(edges, source, target, kind) {
  if (source === target) return
  if (edges.some((e) => e.source === source && e.target === target && e.kind === kind)) return
  edges.push({ source, target, kind })
}

// Adds a freshly built step node to notes `data` (mutated in place):
//   - order + sequence edge: after the plan's last step by default; after
//     `after` when it names a step (later steps shift down one and the edge
//     that left `after` now leaves the new step); unlinked when 'none'
//   - one 'planned-file' node per declared file (already validated, stored
//     paths), a 'plan-step' edge step -> file, and 'borrows' edges between
//     planned files of the same feature per ROLE_LINKS (a View imports its
//     ViewModel), including files planned by earlier steps of the plan
//   - `editsPaths` for existing files the step will change
export function addPlanStep(data, { planId, node, after, files = [], edits = [] }) {
  const steps = planSteps(data.nodes, planId)
  // Steps written before ordering existed get numbers first, after any ordered
  // ones, in the order they were created — so a new step never jumps ahead of them.
  let next = steps.reduce((max, s) => Math.max(max, s.order ?? 0), 0)
  for (const s of steps) if (s.order === undefined) s.order = ++next
  if (after && after !== 'none') {
    const anchor = steps.find((s) => s.id === after)
    if (!anchor) throw new Error(`"${after}" is not a step of plan "${planId}"`)
    const at = anchor.order + 1
    for (const s of steps) if (s.order >= at) s.order += 1
    node.order = at
    const outgoing = data.edges.find((e) => e.kind === 'sequence' && e.source === after)
    if (outgoing) outgoing.source = node.id
    pushEdge(data.edges, after, node.id, 'sequence')
  } else {
    node.order = next + 1
    const previous = steps[steps.length - 1]
    if (after !== 'none' && previous) pushEdge(data.edges, previous.id, node.id, 'sequence')
  }
  if (edits.length) node.editsPaths = [...new Set(edits)]

  const segment = planSegmentOf(planId)
  const planned = files.map((f) => {
    const id = `planned/${segment}/${f.path}`
    if (data.nodes.some((n) => n.id === id) || files.filter((g) => g.path === f.path).length > 1) {
      throw new Error(`${f.path} is already planned in this plan`)
    }
    return {
      id,
      label: f.path.slice(f.path.lastIndexOf('/') + 1),
      kind: 'proposed',
      map: 'claude',
      type: 'planned-file',
      planned: true,
      planId,
      stepId: node.id,
      filePath: f.path,
      role: f.role,
      ...(f.language ? { language: f.language } : {}),
    }
  })

  data.nodes.push(node, ...planned)
  for (const p of planned) pushEdge(data.edges, node.id, p.id, 'plan-step')

  const pool = data.nodes.filter((n) => n.type === 'planned-file' && n.planId === planId)
  for (const p of planned) {
    for (const other of pool) {
      if (other.id === p.id || featureKey(other.filePath, other.role) !== featureKey(p.filePath, p.role)) continue
      if (ROLE_LINKS[p.role]?.includes(other.role)) pushEdge(data.edges, p.id, other.id, 'borrows')
      if (ROLE_LINKS[other.role]?.includes(p.role)) pushEdge(data.edges, other.id, p.id, 'borrows')
    }
  }
  return { node, planned }
}

// plan.md is regenerated from notes.json on every step write, but it is also
// a document people read and annotate. Each step's managed part (heading,
// description, files, edits) is rewritten; whatever sits between that step's
// "/step-meta" and "/step" markers — and the intro under the title — is kept.
export function renderPlanDoc({ plan, steps, plannedFiles, existing }) {
  let intro = '\n'
  const bodies = new Map()
  if (existing) {
    const introMatch = existing.match(/<!-- \/plan-meta -->\n([\s\S]*?)<!-- steps -->/)
    if (introMatch) intro = introMatch[1]
    for (const m of existing.matchAll(/<!-- \/step-meta:(\S+) -->\n([\s\S]*?)<!-- \/step:\1 -->/g)) {
      bodies.set(m[1], m[2])
    }
  }

  let out =
    '<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step\'s /step-meta and /step markers; everything else is regenerated. -->\n' +
    `# ${plan.label}\n` +
    '<!-- /plan-meta -->\n' +
    intro +
    '<!-- steps -->\n'

  steps.forEach((step, i) => {
    const files = plannedFiles.filter((f) => f.stepId === step.id)
    let meta = step.description ? `${step.description}\n` : ''
    if (files.length) {
      meta += '\n**Files**\n'
      for (const f of files) meta += `- \`${f.filePath}\` — ${f.role}${f.language ? ` (${f.language})` : ''}\n`
    }
    if (step.editsPaths?.length) {
      meta += '\n**Edits**\n'
      for (const p of step.editsPaths) meta += `- \`${p}\`\n`
    }
    out +=
      `\n## ${i + 1}. ${step.label}\n` +
      `<!-- step:${step.id} -->\n` +
      meta +
      `<!-- /step-meta:${step.id} -->\n` +
      (bodies.get(step.id) ?? '\n') +
      `<!-- /step:${step.id} -->\n`
  })
  return out
}

// What an agent should build in: manifests at the root and one folder down
// (monorepos). `listDir(rel)` -> [{ name, dir }], `readText(rel)` -> string|null.
const DETECT_SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', 'out', 'release', 'vendor', 'coverage'])
const LANGUAGE_PRIORITY = ['react', 'typescript', 'rust', 'go', 'python', 'javascript', 'jquery']

export function detectProject(listDir, readText) {
  const detected = []
  const unsupported = []

  const scan = (dir) => {
    const entries = listDir(dir)
    const names = new Set(entries.filter((e) => !e.dir).map((e) => e.name))
    const at = (name) => (dir ? `${dir}/${name}` : name)

    if (names.has('package.json')) {
      let deps = {}
      try {
        const pkg = JSON.parse(readText(at('package.json')) ?? '{}')
        deps = { ...pkg.dependencies, ...pkg.devDependencies }
      } catch {
        // Unparseable manifest: still a JS project, just no dependency hints.
      }
      const language = deps.react
        ? 'react'
        : deps.jquery
          ? 'jquery'
          : names.has('tsconfig.json') || deps.typescript
            ? 'typescript'
            : 'javascript'
      detected.push({ file: at('package.json'), language })
    } else if (names.has('tsconfig.json')) {
      detected.push({ file: at('tsconfig.json'), language: 'typescript' })
    }
    if (names.has('Cargo.toml')) detected.push({ file: at('Cargo.toml'), language: 'rust' })
    if (names.has('go.mod')) detected.push({ file: at('go.mod'), language: 'go' })
    const pythonManifest = ['pyproject.toml', 'requirements.txt', 'setup.py'].find((n) => names.has(n))
    if (pythonManifest) detected.push({ file: at(pythonManifest), language: 'python' })

    if (names.has('CMakeLists.txt')) {
      unsupported.push({ file: at('CMakeLists.txt'), language: 'cpp' })
    } else if (names.has('Makefile') || names.has('meson.build')) {
      const hasCpp = [...names].some((n) => /\.(cpp|cc|cxx|hpp)$/.test(n))
      const hasC = [...names].some((n) => /\.[ch]$/.test(n))
      if (hasCpp || hasC) {
        unsupported.push({ file: at(names.has('Makefile') ? 'Makefile' : 'meson.build'), language: hasCpp ? 'cpp' : 'c' })
      }
    }
    return entries
  }

  const rootEntries = scan('')
  for (const e of rootEntries) {
    if (e.dir && !e.name.startsWith('.') && !DETECT_SKIP_DIRS.has(e.name)) scan(e.name)
  }

  const rootLevel = detected.filter((d) => !d.file.includes('/'))
  const candidates = rootLevel.length ? rootLevel : detected
  const primary = LANGUAGE_PRIORITY.find((l) => candidates.some((d) => d.language === l)) ?? null
  const hasSrc = rootEntries.some((e) => e.dir && e.name === 'src')
  return {
    primary,
    languages: [...new Set(detected.map((d) => d.language))],
    detected,
    unsupported,
    conventions: hasSrc ? { srcDir: 'src' } : {},
  }
}

// --- END PLANDOC ---
