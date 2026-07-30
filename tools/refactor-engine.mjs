// Physically reorganizes src/02_components into a different architecture's
// folder layout (Atomic/MVVM/MVC/MVP) — moves files between folders and
// rewrites the relative import specifiers that break as a result. Never
// renames a file or touches any exported symbol inside it: "MVC" doesn't
// rename ButtonViewModel.tsx or its useButtonViewModel export, it just
// relocates the same file into a Controllers/ folder. Shared by
// vite.config.ts (web dev server) and electron/main.cjs (desktop) via
// tools/sleipnir-backend.mjs, same as tools/lsp-proxy.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { walk, toId, typeForId, ROOT, SRC } from './generate-graph.mjs'

export const ARCHITECTURES = ['atomic', 'mvvm', 'mvc', 'mvp']

// Role folder per architecture — empty object means "no folder prefix",
// i.e. Atomic's own tier-only layout. Roles 'other' (non-tiered assets:
// theme CSS/SVGs, DesignSystem tooling not under a tier) and 'prototype'
// are never moved, in any architecture including atomic.
const LAYOUT = {
  atomic: {},
  mvvm: { view: 'Views', viewModel: 'ViewModels', interface: 'Interfaces' },
  mvc: { view: 'Views', viewModel: 'Controllers', interface: 'Models' },
  mvp: { view: 'Views', viewModel: 'Presenters', interface: 'Models' },
}

const LIBRARY_TYPES = new Set(['atom', 'molecule', 'organism', 'template', 'page'])
const TIER_DIRS = new Set(['01_atoms', '02_molecules', '03_organisms', '04_templates', '05_pages'])

// Node-side re-authoring of the same classification the (now-deleted,
// browser-side) roleForNode.ts used — ViewModel$ suffix, i{folder} prefix
// match, tiered-type check. Accepted small duplication across the
// tools/(Node) vs src/(browser) boundary this codebase already keeps separate.
//
// Unlike the deleted display-only version, the tier check gates the
// filename-pattern checks rather than running after them: a misclassified
// "other" file only meant a wrong display bucket before, but now drives a
// real file move — e.g. DesignSystem/CodeEditorView.ViewModel.tsx isn't a
// tiered MVVM ViewModel just because its name ends in "ViewModel"; it must
// never move, so the tier check has to run first.
function roleForFile(absPath) {
  const id = toId(absPath) // extension-stripped, e.g. '02_components/01_atoms/Button/Button'
  if (id.startsWith('03_prototypes')) return 'prototype'
  const type = typeForId(id)
  if (!LIBRARY_TYPES.has(type)) return 'other'
  const segments = id.split('/')
  const base = segments[segments.length - 1]
  if (/ViewModel$/.test(base)) return 'viewModel'
  const folder = segments.length >= 2 ? segments[segments.length - 2] : base
  if (base === `i${folder}`) return 'interface'
  return 'view'
}

// ComponentName/TierDir/Filename sit at the same trailing three path
// segments regardless of which RoleFolder (if any) currently prefixes
// them — e.g. both `01_atoms/Button/Button.tsx` and
// `Views/01_atoms/Button/Button.tsx` end in TierDir/ComponentName/Filename.
// That's what makes recomputing "what would this look like under a
// DIFFERENT architecture" possible from any current state, including
// computing the Atomic layout back from a non-atomic one (previewRefactor
// isn't a no-op for 'atomic' — it's "the plan that undoes whatever's
// currently in place").
function targetPathFor(absPath, architecture) {
  const role = roleForFile(absPath)
  if (role !== 'view' && role !== 'viewModel' && role !== 'interface') return null
  const id = toId(absPath)
  const segments = id.split('/')
  if (segments.length < 2) return null
  const filename = path.basename(absPath)
  const roleFolder = LAYOUT[architecture][role]

  // Most components live in their own subfolder (TierDir/ComponentName/File)
  // — but a few (e.g. GlobeMap.tsx, not yet MVVM-split) sit flat directly
  // under their tier folder (TierDir/File), with no component subfolder to
  // preserve. Detect that by checking whether the immediate parent segment
  // IS itself a tier directory, rather than assuming a fixed depth.
  const parent = segments[segments.length - 2]
  const isFlat = TIER_DIRS.has(parent)
  if (isFlat) {
    const targetSegments = roleFolder ? ['02_components', roleFolder, parent, filename] : ['02_components', parent, filename]
    return path.join(SRC, ...targetSegments)
  }

  if (segments.length < 3) return null
  const componentName = parent
  const tierDir = segments[segments.length - 3]
  const targetSegments = roleFolder
    ? ['02_components', roleFolder, tierDir, componentName, filename]
    : ['02_components', tierDir, componentName, filename]
  return path.join(SRC, ...targetSegments)
}

function toForwardSlash(p) {
  return p.replace(/\\/g, '/')
}

function toRel(absPath) {
  return toForwardSlash(path.relative(ROOT, absPath))
}

// Resolves a relative specifier the same way generate-graph.mjs's
// resolveImport does, but also reports WHICH candidate matched — needed to
// reshape the rewritten specifier back into the same style (a bare
// directory import resolving via an index.ts barrel must stay a bare
// directory import after the move, not grow an explicit "/index.ts" the
// original never had).
function resolveImportShape(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), spec)
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return { resolved: base, shape: 'exact' }
  if (fs.existsSync(`${base}.ts`)) return { resolved: `${base}.ts`, shape: 'bare' }
  if (fs.existsSync(`${base}.tsx`)) return { resolved: `${base}.tsx`, shape: 'bare' }
  if (fs.existsSync(path.join(base, 'index.ts'))) return { resolved: path.join(base, 'index.ts'), shape: 'index' }
  if (fs.existsSync(path.join(base, 'index.tsx'))) return { resolved: path.join(base, 'index.tsx'), shape: 'index' }
  return null
}

// Reconstructs a new import specifier preserving the original's shape:
// 'bare' (extensionless, e.g. './iButton') stays extensionless; 'index'
// (bare directory resolving via an index.ts/tsx barrel) stays a bare
// directory, never growing an explicit "/index"; 'exact' (specifier already
// spelled out the real file, extension included) keeps the full path as
// computed. `newRelPath` is the forward-slash relative path from the
// importing file's NEW directory to the target's NEW absolute file, WITH
// its real extension.
export function reshapeSpecifier(shape, newRelPath) {
  let shaped = newRelPath
  if (shape === 'index') {
    const noExt = shaped.replace(/\.(ts|tsx)$/, '')
    shaped = noExt === 'index' ? '.' : noExt.replace(/\/index$/, '')
  } else if (shape === 'bare') {
    shaped = shaped.replace(/\.(ts|tsx)$/, '')
  }
  if (!shaped.startsWith('.')) shaped = `./${shaped}`
  return shaped
}

// Same regex generate-graph.mjs's extractImportSpecifiers uses, but with
// the `d` flag so each match records the exact character offsets of the
// specifier text (capture group 1) — needed to rewrite precisely by offset
// rather than a blind string search-replace, which could double-replace or
// miss a specifier that appears verbatim elsewhere in the file (e.g. a
// second import of the same module).
function matchImports(content) {
  const importRe = /(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/gd
  const matches = []
  let m
  while ((m = importRe.exec(content))) {
    const [start, end] = m.indices[1]
    matches.push({ specifier: m[1], start, end })
  }
  return matches
}

// Rebuilds one file's content with any affected specifier replaced at its
// exact offset, walking matches in order (never re-searching by value) —
// `newAbsPath` is this file's OWN new location (identity if it isn't moving)
// since even a stationary file's imports of a moved target need recomputing,
// and a moved file's imports of stationary siblings (e.g. Frame) need
// recomputing too, since the mover's own directory changed. Only touches a
// specifier when the importer or the target actually moved — otherwise an
// already-working but non-canonical relative path (e.g. an extra `../x/../`
// hop) would get needlessly "normalized" even though nothing changed.
function rewriteFileImports(absPath, newAbsPath, movedByAbsPath) {
  const selfMoved = newAbsPath !== absPath
  const content = fs.readFileSync(absPath, 'utf8')
  const matches = matchImports(content)
  const changes = []
  let rebuilt = ''
  let cursor = 0
  for (const { specifier, start, end } of matches) {
    if (!specifier.startsWith('.')) continue // non-relative (npm/node) — never rewritten
    const resolution = resolveImportShape(absPath, specifier)
    if (!resolution) continue
    const { resolved, shape } = resolution
    const targetMoved = movedByAbsPath.has(resolved)
    if (!selfMoved && !targetMoved) continue
    const targetNewPath = movedByAbsPath.get(resolved) ?? resolved
    const fromDir = path.dirname(newAbsPath)
    const relPath = toForwardSlash(path.relative(fromDir, targetNewPath))
    const newSpecifier = reshapeSpecifier(shape, relPath)
    if (newSpecifier === specifier) continue
    rebuilt += content.slice(cursor, start) + newSpecifier
    cursor = end
    changes.push({ oldSpecifier: specifier, newSpecifier })
  }
  rebuilt += content.slice(cursor)
  return { content: rebuilt, changes }
}

// Re-scans the WHOLE src/ tree fresh in-process rather than trusting the
// possibly-stale generated/*.json — a refactor could run before a graph
// regen. Scanning beyond just 02_components (the only tree anything ever
// moves within) is required for correctness: App.tsx, PlanningView.tsx,
// ResearchView.tsx, AnalyticsView.tsx, and every file under 03_prototypes
// all genuinely import DSM components directly — their imports need the
// same rewrite pass even though none of those files ever relocate.
function scanFiles() {
  return walk(SRC)
}

// Single source of truth for "what would this architecture change" — used
// by both previewRefactor (read-only) and applyRefactor (executes this
// exact plan), so preview and apply can never drift out of sync.
function buildPlan(architecture) {
  if (!ARCHITECTURES.includes(architecture)) {
    throw new Error(`Unknown architecture "${architecture}" — expected one of ${ARCHITECTURES.join(', ')}`)
  }
  const files = scanFiles()
  const movedByAbsPath = new Map()
  for (const f of files) {
    const to = targetPathFor(f, architecture)
    if (to && to !== f) movedByAbsPath.set(f, to)
  }

  // Rewritten content is computed from each file's OLD location (so
  // resolveImport can use its real current directory) while targeting its
  // NEW location for the relative-path math — must happen before any
  // moves, since a moved file's own content needs to be read pre-move.
  const rewrittenByAbsPath = new Map()
  for (const f of files) {
    const newAbsPath = movedByAbsPath.get(f) ?? f
    const { content, changes } = rewriteFileImports(f, newAbsPath, movedByAbsPath)
    if (changes.length > 0) rewrittenByAbsPath.set(f, { content, changes })
  }

  return { movedByAbsPath, rewrittenByAbsPath }
}

function planToSummary({ movedByAbsPath, rewrittenByAbsPath }) {
  return {
    moves: [...movedByAbsPath].map(([from, to]) => ({ from: toRel(from), to: toRel(to) })),
    rewrites: [...rewrittenByAbsPath].map(([file, { changes }]) => ({ file: toRel(file), changes })),
    movedCount: movedByAbsPath.size,
    rewrittenFileCount: rewrittenByAbsPath.size,
  }
}

export function previewRefactor(architecture) {
  return planToSummary(buildPlan(architecture))
}

// Recursively removes now-empty directories left behind after moving every
// file out of them (fs.renameSync doesn't clean these up on its own). Purely
// cosmetic — git never tracked these anyway — but keeps the tree tidy across
// repeated architecture switches instead of accumulating empty folders.
function pruneEmptyDirs(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name))
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
}

function gitStatusPorcelain() {
  return new Promise((resolve, reject) => {
    execFile('git', ['status', '--porcelain'], { cwd: ROOT }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

export async function applyRefactor(architecture) {
  const status = await gitStatusPorcelain()
  if (status.trim().length > 0) {
    throw new Error('Working tree has uncommitted changes — commit or stash before applying a Refactor.')
  }

  const plan = buildPlan(architecture)
  const { movedByAbsPath, rewrittenByAbsPath } = plan

  // Write rewritten content first (still at each file's OLD path), then move
  // every changed file to its new location — a moved file that also needed
  // rewriting carries its updated content along with fs.renameSync.
  for (const [f, { content }] of rewrittenByAbsPath) {
    fs.writeFileSync(f, content, 'utf8')
  }
  for (const [from, to] of movedByAbsPath) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(from, to)
  }

  pruneEmptyDirs(path.join(SRC, '02_components'))
  writeArchitecture(architecture)

  return { plan: planToSummary(plan) }
}

const ARCHITECTURE_PATH = path.join(SRC, '00_planning', 'graph', 'architecture.json')

export function getCurrentArchitecture() {
  if (!fs.existsSync(ARCHITECTURE_PATH)) return { current: 'atomic' }
  try {
    return JSON.parse(fs.readFileSync(ARCHITECTURE_PATH, 'utf8'))
  } catch {
    return { current: 'atomic' }
  }
}

function writeArchitecture(current) {
  fs.mkdirSync(path.dirname(ARCHITECTURE_PATH), { recursive: true })
  fs.writeFileSync(ARCHITECTURE_PATH, JSON.stringify({ current }, null, 2))
}
