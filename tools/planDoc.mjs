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
// callers hand in the data (and, for detection, small read callbacks). The one
// thing it reads from outside is the language table (LANGUAGES, extensionMap),
// imported here and inlined into the vendored CLI by tools/syncPlanDoc.mjs.
import { LANGUAGES, extensionMap } from './agentSkills/vendor/languages.mjs'

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

// A plan's activity log: what its agents reported, step by step.
export function planActivityPath(planId) {
  return `.planning/${planSegmentOf(planId)}/activity.json`
}

// --- step status -----------------------------------------------------------
// The one status a step carries: the three states AI agents already keep their
// own todo lists in (Claude Code, Codex, Gemini), plus testing — the work is
// written and its tests are running. Stored per node id in
// .planning/stages.json. src/00_planning/graph/stepStatus.ts is the renderer's
// copy of this map; a test holds the two together.
export const STEP_STATUSES = ['pending', 'in_progress', 'testing', 'completed']
// What a person calls them (Sleipnir's labels, and plan.md's).
export const STEP_STATUS_LABELS = { pending: 'Proposed', in_progress: 'In progress', testing: 'Testing', completed: 'Done' }

// Every value older boards hold — the four sprint stages, the two retired before
// them, and a step's approval statuses — read as its nearest survivor.
export const LEGACY_STEP_STATUS = {
  proposed: 'pending',
  todo: 'pending',
  draft: 'pending',
  'in-progress': 'in_progress',
  'in-review': 'in_progress',
  test: 'testing',
  tests: 'testing',
  blocked: 'in_progress',
  approved: 'in_progress',
  done: 'completed',
}

// A stored or reported value as a status, or undefined for anything unknown.
// Forgiving about how an agent spells it: "In progress", "in-progress", "done".
export function toStepStatus(value) {
  if (typeof value !== 'string') return undefined
  if (STEP_STATUSES.includes(value)) return value
  const spelled = value.trim().toLowerCase()
  const underscored = spelled.replace(/[\s-]+/g, '_')
  if (STEP_STATUSES.includes(underscored)) return underscored
  return LEGACY_STEP_STATUS[spelled]
}

// An agent reporting progress on a step: sets its status in `stages` and logs
// the report in the plan's activity `events` (both mutated in place). The note
// is one line of what it did; `agent` names who reported it.
export function applyStepStatus({ nodes, stages, events, stepId, status, note, agent, at }) {
  const step = nodes.find((n) => n.id === stepId)
  if (!step) throw new Error(`No step with id "${stepId}"`)
  if (step.type !== 'plan-step') throw new Error(`"${stepId}" is not a plan step`)
  const next = toStepStatus(status)
  if (!next) throw new Error(`Unknown status "${status}" — expected one of ${STEP_STATUSES.join(', ')}`)
  stages[stepId] = next
  const line = typeof note === 'string' ? note.trim().replace(/\s+/g, ' ') : ''
  const who = typeof agent === 'string' ? agent.trim() : ''
  const event = { at, stepId, status: next, ...(line ? { note: line } : {}), ...(who ? { agent: who } : {}) }
  events.push(event)
  return { step, status: next, event }
}

// --- what a step changed ---------------------------------------------------
// Every file a step created, changed or deleted, whoever made the change: when
// a step goes in progress the workspace is snapshotted (each file's size and
// modification time), and when it completes it is snapshotted again and the
// two compared. So an agent that never says which files it touched is still
// accounted for, and so is the in-app agent, a terminal agent or a human.
//
// Skipped: dependencies and build output, git's own folder, Claude Code's
// worktrees (whole checkouts), .planning (the plan's own bookkeeping), and
// whatever git ignores (`ignored`: root-relative paths, folders and files).
export const SNAPSHOT_SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'target', 'venv', '.venv', '__pycache__', 'coverage', 'out', '.planning']
export const SNAPSHOT_SKIP_PATHS = ['.claude/worktrees']
// Past this many files a snapshot gives up rather than stall the step.
export const MAX_SNAPSHOT_FILES = 20000
// A step's change list keeps this many files; the rest are counted.
export const MAX_RECORDED_CHANGES = 500

// `listDir(rel)` -> [{ name, dir }], `statFile(rel)` -> [size, mtimeMs] | null.
// Returns { [path]: [size, mtimeMs] }, or null past MAX_SNAPSHOT_FILES.
export function snapshotTree(listDir, statFile, ignored = new Set()) {
  const files = {}
  let count = 0
  const walk = (rel) => {
    const entries = [...listDir(rel)].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name
      if (ignored.has(path)) continue
      if (e.dir) {
        if (SNAPSHOT_SKIP_DIRS.includes(e.name) || SNAPSHOT_SKIP_PATHS.includes(path)) continue
        if (walk(path) === false) return false
        continue
      }
      const stat = statFile(path)
      if (!stat) continue
      if (++count > MAX_SNAPSHOT_FILES) return false
      files[path] = stat
    }
    return true
  }
  return walk('') === false ? null : files
}

// What changed between two snapshots, by path: added, modified (size or time
// differ) or deleted. Capped at MAX_RECORDED_CHANGES; `more` counts the rest.
export function diffSnapshots(before, after) {
  const changes = []
  for (const [path, stat] of Object.entries(after)) {
    const was = before[path]
    if (!was) changes.push({ path, change: 'added' })
    else if (was[0] !== stat[0] || was[1] !== stat[1]) changes.push({ path, change: 'modified' })
  }
  for (const path of Object.keys(before)) if (!after[path]) changes.push({ path, change: 'deleted' })
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { changes: changes.slice(0, MAX_RECORDED_CHANGES), more: Math.max(0, changes.length - MAX_RECORDED_CHANGES) }
}

// The status move a report makes, and what it means for the step's snapshot:
// starting work takes one (unless the step already has one), finishing compares
// against it, and putting the step back to pending drops it.
export function snapshotActionFor(previous, next) {
  // Testing is still the same run of work: it keeps the snapshot it started with.
  if (next === 'in_progress' || next === 'testing') return previous === 'in_progress' || previous === 'testing' ? 'keep' : 'take'
  if (next === 'completed') return 'compare'
  return 'drop'
}

// Puts what a step changed on the report that completed it.
export function attachChanges(event, baseline, current) {
  if (!baseline) return event
  event.since = baseline.at
  if (!baseline.files || !current) {
    event.changesUnknown = true
    return event
  }
  const { changes, more } = diffSnapshots(baseline.files, current)
  event.changes = changes
  if (more) event.moreChanges = more
  return event
}

// The latest note reported for each step, from a plan's activity events.
export function latestStepNotes(events) {
  const notes = {}
  for (const e of events ?? []) if (e?.stepId && e.note) notes[e.stepId] = e.note
  return notes
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

// The languages Planning can scaffold, from the language table. Extensions map
// to the first of them that lists it, same as naming.ts's languageForExt (so
// .js -> javascript, .mjs -> javascript, .tsx -> react).
const PLANNABLE = LANGUAGES.filter((l) => l.planning)
export const PLANNED_LANGUAGES = PLANNABLE.map((l) => l.id)
const EXT_LANGUAGE = extensionMap(PLANNABLE)

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

// plan.md is regenerated from notes.json on every step write, and on every
// status change, but it is also a document people read and annotate. Each
// step's managed part (heading, status, description, files, edits) is
// rewritten; whatever sits between that step's "/step-meta" and "/step" markers
// — and the intro under the title — is kept. `statuses` is stages.json and
// `notes` each step's latest reported note (see latestStepNotes).
export function renderPlanDoc({ plan, steps, plannedFiles, existing, statuses = {}, notes = {} }) {
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
    const status = STEP_STATUS_LABELS[toStepStatus(statuses[step.id]) ?? 'pending']
    let meta = `**Status:** ${status}${notes[step.id] ? ` — ${notes[step.id]}` : ''}\n\n`
    if (step.description) meta += `${step.description}\n`
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
// Which manifests mean which language comes from the language table; whether
// a found language lands in `languages` or `unsupported` is whether Planning
// can scaffold it yet (its table entry's `planning`).
const DETECT_SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', 'out', 'release', 'vendor', 'coverage', 'bin', 'obj'])
const LANGUAGE_PRIORITY = ['react', 'typescript', 'rust', 'go', 'python', 'cpp', 'c', 'java', 'kotlin', 'swift', 'csharp', 'javascript', 'jquery']
// Languages a manifest of their own identifies. The JavaScript family (one
// package.json, flavor by dependency), C and C++ (one build file, language by
// sources) and Java and Kotlin (one build file, language by layout) share
// theirs, so they are told apart below instead.
const OWN_MANIFEST = ['rust', 'go', 'python', 'swift', 'csharp']
const C_BUILD_FILES = ['CMakeLists.txt', 'Makefile', 'meson.build']
const JVM_BUILD_FILES = ['build.gradle.kts', 'build.gradle', 'pom.xml']
// Where a language keeps its sources when it follows the usual layout.
const SOURCE_LAYOUTS = { java: 'src/main/java', kotlin: 'src/main/kotlin', swift: 'Sources' }

export function detectProject(listDir, readText) {
  const detected = []
  const unsupported = []
  const plannable = new Set(LANGUAGES.filter((l) => l.planning).map((l) => l.id))
  const report = (file, language) => (plannable.has(language) ? detected : unsupported).push({ file, language })
  const list = (rel) => {
    try {
      return listDir(rel) ?? []
    } catch {
      return []
    }
  }
  const dirExists = (rel) => {
    const parts = rel.split('/')
    const name = parts.pop()
    return list(parts.join('/')).some((e) => e.dir && e.name === name)
  }

  const scan = (dir) => {
    const entries = list(dir)
    const names = new Set(entries.filter((e) => !e.dir).map((e) => e.name))
    const at = (name) => (dir ? `${dir}/${name}` : name)
    // "*.csproj" matches by suffix; anything else by name.
    const findManifest = (manifests) =>
      manifests.map((m) => (m.startsWith('*') ? [...names].find((n) => n.endsWith(m.slice(1))) : names.has(m) ? m : null)).find(Boolean)
    // This folder's files and its src/'s — where a build file's sources sit.
    const nearbyFiles = () => [...names, ...(entries.some((e) => e.dir && e.name === 'src') ? list(at('src')).filter((e) => !e.dir).map((e) => e.name) : [])]

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
      report(at('package.json'), language)
    } else if (names.has('tsconfig.json')) {
      report(at('tsconfig.json'), 'typescript')
    }

    for (const id of OWN_MANIFEST) {
      const manifest = findManifest(LANGUAGES.find((l) => l.id === id)?.manifests ?? [])
      if (manifest) report(at(manifest), id)
    }

    // C or C++: CMake builds C++ unless only C sources (or a C-only project()
    // line) say otherwise; a Makefile or meson.build counts only with C or C++
    // sources beside it, since every kind of project uses those.
    const cBuild = C_BUILD_FILES.find((m) => names.has(m))
    if (cBuild) {
      const files = nearbyFiles()
      const cmake = cBuild === 'CMakeLists.txt' ? (readText(at(cBuild)) ?? '') : ''
      const cpp = files.some((n) => /\.(cpp|cc|cxx|hpp|hh|hxx)$/.test(n)) || /\bproject\s*\([^)]*\bCXX\b/i.test(cmake)
      const c = files.some((n) => /\.[ch]$/.test(n)) || /\bproject\s*\([^)]*\bLANGUAGES\s+C\s*\)/i.test(cmake)
      const language = cpp ? 'cpp' : c ? 'c' : cBuild === 'CMakeLists.txt' ? 'cpp' : null
      if (language) report(at(cBuild), language)
    }

    // Java or Kotlin: one Gradle or Maven build; Kotlin when its sources are.
    const jvmBuild = JVM_BUILD_FILES.find((m) => names.has(m))
    if (jvmBuild) {
      const kotlinSources = nearbyFiles().some((n) => /\.kts?$/.test(n) && !/^(build|settings)\.gradle\.kts$/.test(n))
      report(at(jvmBuild), dirExists(at('src/main/kotlin')) || kotlinSources ? 'kotlin' : 'java')
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
  const conventions = {}
  if (rootEntries.some((e) => e.dir && e.name === 'src')) conventions.srcDir = 'src'
  if (rootEntries.some((e) => e.dir && e.name === 'include')) conventions.includeDir = 'include'
  const seen = new Set([...detected, ...unsupported].map((d) => d.language))
  for (const [language, dir] of Object.entries(SOURCE_LAYOUTS)) {
    if (seen.has(language) && dirExists(dir)) conventions.sourceDirs = { ...conventions.sourceDirs, [language]: dir }
  }
  return {
    primary,
    languages: [...new Set(detected.map((d) => d.language))],
    detected,
    unsupported,
    conventions,
  }
}

// --- END PLANDOC ---
