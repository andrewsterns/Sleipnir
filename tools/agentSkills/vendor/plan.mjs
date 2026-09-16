#!/usr/bin/env node
// Sleipnir Planning CLI — standalone, vendored copy.
//
// This file is COPIED into each project as `.sleipnir/plan.mjs` by Sleipnir's
// scaffolder (tools/agentSkills/scaffold.mjs) and is meant to be committed. That
// is the whole point of it: a teammate who has never installed Sleipnir can
// clone the repo and still author plans into `.planning/` correctly, with
// nothing but Node. It therefore has no imports outside `node:` builtins, no
// package.json, no install step, and no absolute paths anywhere.
//
// It deliberately re-implements — rather than imports — the small slice of
// tools/sleipnir-backend.mjs that writes `.planning/plans.json`,
// `.planning/notes.json` and each plan's `plan.md`, because importing the
// backend would drag in workspace scanning, graph generation and git. Two
// guards stop drift (src/00_planning/api/vendoredPlanCli.test.ts):
//   - the PLANDOC region below is a byte-identical copy of tools/planDoc.mjs
//     (re-sync with `node tools/syncPlanDoc.mjs`)
//   - this file and the real backend are run against the same inputs and must
//     write the same JSON and the same plan.md

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PLANNING_DIR = '.planning'

// --- paths -----------------------------------------------------------------

// Mirrors the backend's resolveSafe: the one place containment is enforced.
function resolveSafe(base, ...segments) {
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root')
  }
  return resolved
}

// Mirrors the backend's toStoredPath. Anything we *store* becomes root-relative
// with forward slashes: notes.json is committed, so an absolute path in it would
// mean nothing on the next machine to clone the repo.
function toStoredPath(base, candidate) {
  return path.relative(base, path.resolve(base, candidate)).split(path.sep).join('/')
}

function planningFile(root, name) {
  return path.join(root, PLANNING_DIR, name)
}

// No README is written here, unlike the backend's ensurePlanningDir — the
// agent-facing documentation is emitted by the scaffolder, from one canonical
// source, so this file never carries a copy that could go stale.
function ensurePlanningDir(root) {
  fs.mkdirSync(path.join(root, PLANNING_DIR), { recursive: true })
}

// --- reads / writes --------------------------------------------------------

// Mirrors the backend's writeFileAtomic: temp file + rename, plain write if the
// rename is refused (Windows EPERM while a reader holds the target open).
function writeFileAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  try {
    fs.renameSync(tmp, p)
  } catch {
    fs.writeFileSync(p, text)
    fs.rmSync(tmp, { force: true })
  }
}

function readNotes(root) {
  const p = planningFile(root, 'notes.json')
  if (!fs.existsSync(p)) return { nodes: [], edges: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    // Legacy flat-array shape, upgraded on read exactly as the backend does.
    if (Array.isArray(parsed)) return { nodes: parsed, edges: [] }
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function writeNotes(root, data) {
  ensurePlanningDir(root)
  writeFileAtomic(planningFile(root, 'notes.json'), JSON.stringify(data, null, 2))
}

function readPlans(root) {
  const p = planningFile(root, 'plans.json')
  if (!fs.existsSync(p)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlans(root, data) {
  ensurePlanningDir(root)
  writeFileAtomic(planningFile(root, 'plans.json'), JSON.stringify(data, null, 2))
}

// --- shared pure logic (copy of tools/planDoc.mjs — do not edit here) ------

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

// --- filesystem half (mirrors tools/sleipnir-backend.mjs) -------------------

function normalizePlannedFiles(root, files, defaultLanguage) {
  return (files ?? []).map((f) => {
    const spec = typeof f === 'string' ? f : `${f?.path ?? ''}:${f?.role || 'node'}${f?.language ? `:${f.language}` : ''}`
    const parsed = parseFileSpec(spec, defaultLanguage)
    const absPath = resolveSafe(root, parsed.path)
    const stored = toStoredPath(root, parsed.path)
    if (isPlanningPath(stored)) {
      throw new Error(`${stored}: planned files get their real project path, never .planning/`)
    }
    if (fs.existsSync(absPath)) {
      throw new Error(`${stored} already exists — list it under edits instead of planning it as a new file`)
    }
    return { ...parsed, path: stored }
  })
}

function normalizeEdits(root, edits) {
  return (edits ?? []).map((p) => {
    const absPath = resolveSafe(root, p)
    const stored = toStoredPath(root, p)
    if (!fs.existsSync(absPath)) {
      throw new Error(`${stored} doesn't exist — plan it as a new file instead of an edit`)
    }
    return stored
  })
}

function syncPlanAfterStep(root, planId, data, newIds) {
  const plans = readPlans(root)
  const plan = plans.find((p) => p.id === planId)
  if (!plan) return
  const ids = new Set(plan.nodeIds ?? [])
  for (const id of newIds) ids.add(id)
  plan.nodeIds = [...ids]
  plan.docPath = planDocPath(planId)
  writePlans(root, plans)

  const docAbs = resolveSafe(root, plan.docPath)
  const existing = fs.existsSync(docAbs) ? fs.readFileSync(docAbs, 'utf8') : null
  const text = renderPlanDoc({
    plan,
    steps: planSteps(data.nodes, planId),
    plannedFiles: data.nodes.filter((n) => n.type === 'planned-file' && n.planId === planId),
    existing,
  })
  if (text !== existing) writeFileAtomic(docAbs, text)
}

// --- core ------------------------------------------------------------------

export function createPlan(root, label, { temporary, expectedSteps } = {}) {
  if (!label || !label.trim()) throw new Error('Label is required')
  const slug = slugify(label)
  const plan = {
    id: `plan/${slug || 'plan'}-${Date.now()}`,
    label: label.trim(),
    nodeIds: [],
    ...(temporary ? { temporary: true } : {}),
    ...(Number.isInteger(expectedSteps) && expectedSteps > 0 ? { expectedSteps } : {}),
    createdAt: Date.now(),
  }
  const plans = readPlans(root)
  plans.push(plan)
  writePlans(root, plans)
  return plan
}

export function createPlanNode(root, planId, label, description, parentId, opts = {}) {
  if (!label || !label.trim()) throw new Error('Label is required')
  const files = normalizePlannedFiles(root, opts.files, opts.defaultLanguage)
  const edits = normalizeEdits(root, opts.edits)
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slugify(label) || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
  }
  const data = readNotes(root)
  const { planned } = addPlanStep(data, { planId, node, after: opts.after, files, edits })
  if (parentId) data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  writeNotes(root, data)
  syncPlanAfterStep(root, planId, data, [node.id, ...planned.map((p) => p.id)])
  return node
}

export function proposeFileNode(root, planId, label, description, filePath, content, parentId, linkTargetIds) {
  if (!label || !label.trim()) throw new Error('Label is required')
  if (!filePath || !filePath.trim()) throw new Error('filePath is required')
  const absPath = resolveSafe(root, filePath)
  const storedPath = toStoredPath(root, filePath)
  if (fs.existsSync(absPath)) {
    throw new Error(`${storedPath} already exists — propose a different path, or edit the real file directly instead of proposing it`)
  }
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slugify(label) || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
    proposedFile: { path: storedPath, content: content ?? '' },
  }
  const data = readNotes(root)
  addPlanStep(data, { planId, node })
  if (parentId) data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  writeNotes(root, data)
  syncPlanAfterStep(root, planId, data, [node.id])
  if (Array.isArray(linkTargetIds) && linkTargetIds.length) {
    setNodeBorrows(root, node.id, linkTargetIds)
  }
  return node
}

// A full replace of this node's 'borrows' edges, matching the backend:
// re-scanning a file's imports always yields its complete current set.
export function setNodeBorrows(root, nodeId, targetIds) {
  const data = readNotes(root)
  data.edges = data.edges.filter((e) => !(e.source === nodeId && e.kind === 'borrows'))
  for (const targetId of targetIds) {
    if (targetId !== nodeId) data.edges.push({ source: nodeId, target: targetId, kind: 'borrows' })
  }
  writeNotes(root, data)
}

// A step always carries `map: 'claude'` so it lands in the shared review tab. If
// planId is also a real saved plan, add the id to that plan's nodeIds so the step
// shows on its own named tab too.
export function pullIntoNamedPlanIfExists(root, planId, nodeId) {
  const plans = readPlans(root)
  const plan = plans.find((p) => p.id === planId)
  if (!plan) return
  const existing = new Set(plan.nodeIds ?? [])
  existing.add(String(nodeId))
  plan.nodeIds = [...existing]
  writePlans(root, plans)
}

export function detectProjectIn(root) {
  return detectProject(
    (rel) => {
      try {
        return fs.readdirSync(resolveSafe(root, rel), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return []
      }
    },
    (rel) => {
      try {
        return fs.readFileSync(resolveSafe(root, rel), 'utf8')
      } catch {
        return null
      }
    },
  )
}

// --- CLI -------------------------------------------------------------------

const HELP = `Sleipnir Planning CLI (vendored — needs only Node)

  node .sleipnir/plan.mjs detect-project --root <path>
  node .sleipnir/plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
  node .sleipnir/plan.mjs create-node --root <path> --plan-id <id> --label "Step" \\
      --description "..." [--after <stepId|none>] [--parent-id <nodeId>] \\
      [--file <path>:<role>[:<language>]]... [--edits <path1,path2>]
  node .sleipnir/plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \\
      --description "..." --file-path <workspace-relative-path> \\
      --content-file <path|-> [--parent-id <nodeId>] [--links <nodeId1,nodeId2>]

detect-project prints the project's languages and layout. Run it first and plan
files that match it.

create-plan prints the new plan — pass its id as --plan-id to create-node for
every step. --total-steps N (optional) gives Sleipnir a real N-of-M progress bar.

create-node steps chain in the order you create them. --after <stepId> inserts a
step after that one instead; --after none leaves it unlinked (parallel work).
--file declares a NEW file the step will create, at its real project path (never
.planning/). Repeat it per file. Roles: node, view, view-model, interface,
controller, presenter. Language defaults to the file extension, then the
detected primary language. Files are placeholders only — nothing is written to
disk until a human approves the step in Sleipnir. Sibling role files of one
feature (cartView.tsx + cartViewModel.tsx) are linked automatically.
--edits lists EXISTING files the step will change.

Each plan also gets .planning/<plan>/plan.md, regenerated as steps are written.
Notes written under the title, or between a step's /step-meta and /step
markers, are kept.

propose-file (legacy) stages one NEW file with full content on a step. Prefer
create-node --file.

See AGENTS.md at the project root for the data shapes and the full workflow.
`

// Repeated flags (--file a --file b) collect into an array.
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith('--')) {
      const key = tok.slice(2)
      const next = argv[i + 1]
      let value = true
      if (next !== undefined && !next.startsWith('--')) {
        value = next
        i++
      }
      if (key in args) args[key] = [].concat(args[key], value)
      else args[key] = value
    } else {
      args._.push(tok)
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function requireOpt(args, name) {
  const v = args[name]
  if (!v || v === true || Array.isArray(v)) fail(`--${name} is required (once)`)
  return v
}

function parseIntOpt(args, name) {
  const v = args[name]
  if (v === undefined || v === true) return undefined
  const n = Number.parseInt(v, 10)
  if (!Number.isInteger(n) || n <= 0) fail(`--${name} must be a positive integer, got "${v}"`)
  return n
}

function listOpt(args, name) {
  return [].concat(args[name] ?? []).filter((v) => typeof v === 'string')
}

function resolveRoot(args) {
  const root = path.resolve(args.root ?? process.cwd())
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`Not a folder: ${root}`)
  return fs.realpathSync(root)
}

function readContentFile(pathOrDash) {
  try {
    return pathOrDash === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(pathOrDash), 'utf8')
  } catch (err) {
    return fail(`Couldn't read --content-file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    process.exit(command ? 0 : 1)
  }

  const root = resolveRoot(args)
  const out = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

  try {
    if (command === 'detect-project') {
      out(detectProjectIn(root))
      return
    }

    if (command === 'create-plan') {
      out(createPlan(root, requireOpt(args, 'label'), {
        temporary: !!args.temporary,
        expectedSteps: parseIntOpt(args, 'total-steps'),
      }))
      return
    }

    if (command === 'create-node') {
      const planId = requireOpt(args, 'plan-id')
      const files = listOpt(args, 'file')
      const node = createPlanNode(
        root,
        planId,
        requireOpt(args, 'label'),
        typeof args.description === 'string' ? args.description : undefined,
        typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined,
        {
          after: typeof args.after === 'string' ? args.after : undefined,
          files,
          edits: listOpt(args, 'edits').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean),
          defaultLanguage: files.length ? detectProjectIn(root).primary ?? undefined : undefined,
        },
      )
      pullIntoNamedPlanIfExists(root, planId, node.id)
      out(node)
      return
    }

    if (command === 'propose-file') {
      const planId = requireOpt(args, 'plan-id')
      const label = requireOpt(args, 'label')
      const filePath = requireOpt(args, 'file-path')
      const content = readContentFile(requireOpt(args, 'content-file'))
      const node = proposeFileNode(
        root,
        planId,
        label,
        typeof args.description === 'string' ? args.description : undefined,
        filePath,
        content,
        typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined,
        typeof args.links === 'string' ? args.links.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      )
      pullIntoNamedPlanIfExists(root, planId, node.id)
      out(node)
      return
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  fail(`Unknown command "${command}". Run with --help for usage.`)
}

// Only run the CLI when executed directly, so the conformance test can import
// the functions above without the process exiting under it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
