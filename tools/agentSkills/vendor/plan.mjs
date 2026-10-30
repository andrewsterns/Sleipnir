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
// `.planning/notes.json`, `.planning/stages.json` and each plan's `plan.md` and
// `activity.json`, because importing the
// backend would drag in workspace scanning, graph generation and git. Two
// guards stop drift (src/00_planning/api/vendoredPlanCli.test.ts):
//   - the PLANDOC region below is a byte-identical copy of tools/planDoc.mjs
//     (re-sync with `node tools/syncPlanDoc.mjs`)
//   - this file and the real backend are run against the same inputs and must
//     write the same JSON and the same plan.md

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
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

// The status overlay: { [nodeId]: 'pending' | 'in_progress' | 'completed' }.
// Older values migrate on read, as the backend does.
function readStages(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(planningFile(root, 'stages.json'), 'utf8'))
    const stages = {}
    if (parsed && typeof parsed === 'object') {
      for (const [id, value] of Object.entries(parsed)) {
        const status = toStepStatus(value)
        if (status) stages[id] = status
      }
    }
    return stages
  } catch {
    return {}
  }
}

function writeStages(root, stages) {
  ensurePlanningDir(root)
  fs.writeFileSync(planningFile(root, 'stages.json'), JSON.stringify(stages, null, 2))
}

function readActivity(root, planId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveSafe(root, planActivityPath(planId)), 'utf8'))
    return { events: Array.isArray(parsed?.events) ? parsed.events : [] }
  } catch {
    return { events: [] }
  }
}

function writeActivity(root, planId, activity) {
  writeFileAtomic(resolveSafe(root, planActivityPath(planId)), `${JSON.stringify(activity, null, 2)}\n`)
}

function writePlans(root, data) {
  ensurePlanningDir(root)
  writeFileAtomic(planningFile(root, 'plans.json'), JSON.stringify(data, null, 2))
}

// --- the language table (copy of agentSkills/vendor/languages.mjs — do not edit here)

// --- BEGIN LANGUAGES ---
// One entry per language, in priority order: when two list the same extension
// the first wins (.js → javascript, not jquery).
//   extensions  first one is what scaffolds write
//   comment     line prefix and/or block delimiters
//   naming      file-name convention for scaffolded files
//   manifests   files whose presence means "a project in this language"
//   planning    null until Planning has scaffold templates for it
//   imports     the import syntax the analyzer and adapters parse, null if none
//   editor      grammar key for the code editor, null for plain text
//   server      language server for the Workspace editor
//   commands    build / run / test argv when the language has a standard one
//   gitignore   build output and caches a new repo should ignore
export const LANGUAGES = [
  {
    id: 'react',
    label: 'React (TSX)',
    extensions: ['tsx', 'jsx'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: true },
    imports: 'js',
    editor: 'tsx',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: ['tsconfig.json'],
    planning: { architectural: true },
    imports: 'js',
    editor: 'typescript',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/', '*.tsbuildinfo'],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: ['package.json'],
    planning: { architectural: true },
    imports: 'js',
    editor: 'javascript',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    // A flavor of JavaScript (scaffold content differs), not its own syntax.
    id: 'jquery',
    label: 'jQuery',
    extensions: ['js'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: true },
    imports: 'js',
    editor: 'javascript',
    server: null,
    commands: {},
    gitignore: ['node_modules/'],
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['py', 'pyi'],
    comment: { line: '#' },
    naming: 'snake',
    manifests: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
    planning: { architectural: true },
    imports: 'python',
    editor: 'python',
    server: { command: 'pyright-langserver', args: ['--stdio'], install: 'npm install -g pyright' },
    commands: { test: ['pytest'] },
    gitignore: ['__pycache__/', '*.pyc', '.venv/', 'venv/', '.pytest_cache/'],
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['rs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['Cargo.toml'],
    planning: { architectural: true },
    imports: 'rust',
    editor: 'rust',
    server: { command: 'rust-analyzer', args: [], install: 'rustup component add rust-analyzer' },
    commands: { build: ['cargo', 'build'], run: ['cargo', 'run'], test: ['cargo', 'test'] },
    gitignore: ['target/'],
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['go'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['go.mod'],
    planning: { architectural: true },
    imports: 'go',
    editor: 'go',
    server: { command: 'gopls', args: [], install: 'go install golang.org/x/tools/gopls@latest' },
    commands: { build: ['go', 'build', './...'], run: ['go', 'run', '.'], test: ['go', 'test', './...'] },
    gitignore: ['bin/'],
  },
  {
    id: 'html',
    label: 'HTML',
    extensions: ['html', 'htm'],
    comment: { block: ['<!--', '-->'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: false },
    imports: 'html',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: [],
  },
  {
    id: 'css',
    label: 'CSS',
    extensions: ['css'],
    comment: { block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: false },
    imports: 'css',
    editor: 'css',
    server: null,
    commands: {},
    gitignore: [],
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['c', 'h'],
    headerExtensions: ['h'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    planning: { architectural: true },
    imports: 'c',
    editor: 'cpp',
    server: { command: 'clangd', args: [], install: 'Install clangd from LLVM: https://clangd.llvm.org/installation' },
    commands: { build: ['cmake', '--build', 'build'], test: ['ctest', '--test-dir', 'build'] },
    gitignore: ['build/', '*.o', '*.a', '*.so', '*.dylib', '*.exe'],
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    headerExtensions: ['hpp', 'hh', 'hxx', 'h'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    planning: { architectural: true },
    imports: 'c',
    editor: 'cpp',
    server: { command: 'clangd', args: [], install: 'Install clangd from LLVM: https://clangd.llvm.org/installation' },
    commands: { build: ['cmake', '--build', 'build'], test: ['ctest', '--test-dir', 'build'] },
    gitignore: ['build/', '*.o', '*.a', '*.so', '*.dylib', '*.exe'],
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['java'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    planning: { architectural: true },
    imports: 'jvm',
    editor: 'java',
    server: { command: 'jdtls', args: [], install: 'Install Eclipse JDT Language Server: https://github.com/eclipse-jdtls/eclipse.jdt.ls' },
    commands: { test: ['gradle', 'test'] },
    gitignore: ['target/', 'build/', '*.class', '.gradle/'],
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['kt', 'kts'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['build.gradle.kts', 'build.gradle', 'pom.xml'],
    planning: { architectural: true },
    imports: 'jvm',
    editor: 'kotlin',
    server: { command: 'kotlin-language-server', args: [], install: 'Install kotlin-language-server: https://github.com/fwcd/kotlin-language-server' },
    commands: { test: ['gradle', 'test'] },
    gitignore: ['build/', '*.class', '.gradle/'],
  },
  {
    id: 'swift',
    label: 'Swift',
    extensions: ['swift'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['Package.swift'],
    planning: { architectural: true },
    imports: 'swift',
    editor: 'swift',
    server: { command: 'sourcekit-lsp', args: [], install: 'sourcekit-lsp ships with the Swift toolchain: https://www.swift.org/install' },
    commands: { build: ['swift', 'build'], run: ['swift', 'run'], test: ['swift', 'test'] },
    gitignore: ['.build/', '.swiftpm/'],
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['cs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['*.csproj', '*.sln'],
    planning: { architectural: true },
    imports: 'csharp',
    editor: 'csharp',
    server: { command: 'csharp-ls', args: [], install: 'dotnet tool install --global csharp-ls' },
    commands: { build: ['dotnet', 'build'], run: ['dotnet', 'run'], test: ['dotnet', 'test'] },
    gitignore: ['bin/', 'obj/'],
  },
  {
    // Not scaffolded by Planning (planning: null) — known to everything else.
    // Single-file components: script imports in JS syntax, markup in HTML.
    id: 'vue',
    label: 'Vue',
    extensions: ['vue'],
    comment: { block: ['<!--', '-->'] },
    naming: 'pascal',
    manifests: [],
    planning: null,
    imports: 'js',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    id: 'svelte',
    label: 'Svelte',
    extensions: ['svelte'],
    comment: { block: ['<!--', '-->'] },
    naming: 'pascal',
    manifests: [],
    planning: null,
    imports: 'js',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: ['node_modules/', '.svelte-kit/'],
  },
]

// The UI frameworks a canvas component can be emitted into — a target is a
// language AND a framework, since a box needs something to render into.
//   preview  'exact' when the framework uses CSS (the board renders CSS), else
//            'approximate' (a second layout lowering; see the plan)
//   status   'available' once its emitter exists
export const UI_FRAMEWORKS = [
  { id: 'react', label: 'React', language: 'react', ext: 'tsx', preview: 'exact', status: 'available' },
  { id: 'html', label: 'HTML + CSS', language: 'html', ext: 'html', preview: 'exact', status: 'planned' },
  { id: 'vue', label: 'Vue', language: 'vue', ext: 'vue', preview: 'exact', status: 'planned' },
  { id: 'svelte', label: 'Svelte', language: 'svelte', ext: 'svelte', preview: 'exact', status: 'planned' },
  { id: 'leptos', label: 'Leptos (Rust)', language: 'rust', ext: 'rs', preview: 'exact', status: 'planned' },
  { id: 'dioxus', label: 'Dioxus (Rust)', language: 'rust', ext: 'rs', preview: 'exact', status: 'planned' },
  { id: 'templ', label: 'templ (Go)', language: 'go', ext: 'templ', preview: 'exact', status: 'planned' },
  { id: 'lvgl', label: 'LVGL (C)', language: 'c', ext: 'c', preview: 'approximate', status: 'planned' },
  { id: 'swiftui', label: 'SwiftUI', language: 'swift', ext: 'swift', preview: 'approximate', status: 'planned' },
]

export function languageById(id) {
  return LANGUAGES.find((l) => l.id === id)
}

/** The language a path's extension belongs to (first entry wins), or null. */
export function languageForPath(filePath) {
  const ext = (String(filePath).match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  return ext ? (LANGUAGES.find((l) => l.extensions.includes(ext)) ?? null) : null
}

/** extension → language id, first entry winning — the shape lookups want. */
export function extensionMap(languages = LANGUAGES) {
  const map = {}
  for (const l of languages) for (const ext of l.extensions) if (!(ext in map)) map[ext] = l.id
  return map
}
// --- END LANGUAGES ---

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
  writePlanDoc(root, plan, data, readStages(root))
}

function writePlanDoc(root, plan, data, stages) {
  const docAbs = resolveSafe(root, plan.docPath)
  const existing = fs.existsSync(docAbs) ? fs.readFileSync(docAbs, 'utf8') : null
  const text = renderPlanDoc({
    plan,
    steps: planSteps(data.nodes, plan.id),
    plannedFiles: data.nodes.filter((n) => n.type === 'planned-file' && n.planId === plan.id),
    existing,
    statuses: stages,
    notes: latestStepNotes(readActivity(root, plan.id).events),
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

// An agent reporting progress on a step, as the backend's setStepStatus: the
// status lands in stages.json, the report (and its note) in the plan's
// activity.json, and plan.md is regenerated to show it.
export function setStepStatus(root, stepId, status, { note, agent, at = Date.now() } = {}) {
  const data = readNotes(root)
  const stages = readStages(root)
  const previous = stages[stepId]
  const planId = data.nodes.find((n) => n.id === stepId)?.planId
  const activity = planId ? readActivity(root, planId) : { events: [] }
  const result = applyStepStatus({ nodes: data.nodes, stages, events: activity.events, stepId, status, note, agent, at })
  // What the step changed: snapshot the workspace when it starts, compare when
  // it completes (see snapshotTree in the PLANDOC region).
  const action = snapshotActionFor(previous, result.status)
  if (action === 'take') writeBaseline(root, stepId, { at, files: snapshotWorkspace(root) })
  if (action === 'compare') {
    attachChanges(result.event, readBaseline(root, stepId), snapshotWorkspace(root))
    // The files the step changed are done with it (as the backend does).
    for (const change of result.event.changes ?? []) {
      if (change.change === 'deleted') continue
      stages[`file:${change.path}`] = 'completed'
      for (const n of data.nodes) if (n.filePath === change.path && n.type !== 'plan-step') stages[n.id] = 'completed'
    }
  }
  if (action === 'compare' || action === 'drop') dropBaseline(root, stepId)
  writeStages(root, stages)
  if (planId) {
    writeActivity(root, planId, activity)
    const plan = readPlans(root).find((p) => p.id === planId)
    if (plan?.docPath) writePlanDoc(root, plan, data, stages)
  }
  return result
}

// Every workspace file's size and modification time, skipping what git ignores.
function snapshotWorkspace(root) {
  return snapshotTree(
    (rel) => {
      try {
        return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return []
      }
    },
    (rel) => {
      try {
        const stat = fs.statSync(path.join(root, rel))
        return [stat.size, Math.round(stat.mtimeMs)]
      } catch {
        return null
      }
    },
    gitIgnoredPaths(root),
  )
}

function gitIgnoredPaths(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
      cwd: root,
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).toString('utf8')
    return new Set(out.split('\0').filter(Boolean).map((p) => p.replace(/\/$/, '')))
  } catch {
    return new Set()
  }
}

// Snapshots live in the OS temp folder, keyed by project and step, exactly where
// the backend keeps them — so Sleipnir and this CLI can each start or finish a step.
function baselineFile(root, stepId) {
  let real = root
  try {
    real = fs.realpathSync.native(root)
  } catch {
    // keep the path as given
  }
  if (process.platform === 'win32') real = real.toLowerCase()
  const hash = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)
  return path.join(os.tmpdir(), 'sleipnir-baselines', hash(real), `${hash(stepId)}.json`)
}

function readBaseline(root, stepId) {
  try {
    return JSON.parse(fs.readFileSync(baselineFile(root, stepId), 'utf8'))
  } catch {
    return null
  }
}

function writeBaseline(root, stepId, baseline) {
  try {
    writeFileAtomic(baselineFile(root, stepId), JSON.stringify(baseline))
  } catch {
    // No snapshot only means the step's changes go unlisted.
  }
}

function dropBaseline(root, stepId) {
  fs.rmSync(baselineFile(root, stepId), { force: true })
}

// Every plan (or one) with its steps in order, each with its status, the latest
// note reported on it and how many files it changed (every path its completions
// recorded) — what an agent reads to pick up where it left off.
export function listSteps(root, planId) {
  const data = readNotes(root)
  const stages = readStages(root)
  const plans = readPlans(root).filter((p) => !planId || p.id === planId)
  if (planId && plans.length === 0) throw new Error(`No plan with id "${planId}"`)
  return plans.map((plan) => {
    const { events } = readActivity(root, plan.id)
    const notes = latestStepNotes(events)
    const changed = new Map()
    for (const e of events) {
      if (!e.changes) continue
      const paths = changed.get(e.stepId) ?? new Set()
      for (const c of e.changes) paths.add(c.path)
      changed.set(e.stepId, paths)
    }
    return {
      id: plan.id,
      label: plan.label,
      steps: planSteps(data.nodes, plan.id).map((step) => ({
        id: step.id,
        order: step.order,
        label: step.label,
        status: stages[step.id] ?? 'pending',
        ...(notes[step.id] ? { note: notes[step.id] } : {}),
        ...(changed.has(step.id) ? { changed: changed.get(step.id).size } : {}),
      })),
    }
  })
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
  node .sleipnir/plan.mjs set-status --root <path> --step <stepId> \\
      --status <pending|in_progress|testing|completed> [--note "what you did"] [--agent <name>]
  node .sleipnir/plan.mjs list-steps --root <path> [--plan-id <id>]
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

set-status reports your progress on a step, so the plan shows what you are
actually doing: in_progress when you start it (one step at a time), testing while
its tests run, completed the moment it is done, with --note saying in one line what you did. Sleipnir's graph
shows it live, and records which files changed between the two. list-steps
prints each plan's steps with their ids and statuses.

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

    if (command === 'set-status') {
      const result = setStepStatus(root, requireOpt(args, 'step'), requireOpt(args, 'status'), {
        note: typeof args.note === 'string' ? args.note : undefined,
        agent: typeof args.agent === 'string' ? args.agent : undefined,
      })
      out({
        id: result.step.id,
        label: result.step.label,
        status: result.status,
        ...(result.event.note ? { note: result.event.note } : {}),
        ...(result.event.changes ? { changed: result.event.changes.length + (result.event.moreChanges ?? 0) } : {}),
      })
      return
    }

    if (command === 'list-steps') {
      out(listSteps(root, typeof args['plan-id'] === 'string' ? args['plan-id'] : undefined))
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
