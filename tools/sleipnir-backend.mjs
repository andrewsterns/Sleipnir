// Shared backend logic for Sleipnir's local dev-only file API — scaffold
// components, browse/read/write files, manage the archive manifest, and
// re-run tools/generate-graph.mjs. Framework-agnostic plain Node so both the
// Vite dev middleware (vite.config.ts, web transport) and the Electron main
// process (electron/main.cjs, IPC transport) can import and call it
// directly, instead of duplicating this logic per transport.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { isSourceFile } from './source-extensions.mjs'
import { LANGUAGES, DEFAULT_LANGUAGE } from './languages.mjs'
import { listLibraries, getLibrary, addLibrary, removeLibraryEntry } from './library-registry.mjs'
import { listWidgets, addWidget } from './widget-registry.mjs'
import { readCatalog } from './widget-catalog.mjs'
import { getPreviewConfig as getPreviewConfigEntry, setPreviewConfig as setPreviewConfigEntry } from './preview-registry.mjs'
import { getWorkspaceRoot, setWorkspaceRoot } from './workspace-root.mjs'

export { previewRefactor, applyRefactor, getCurrentArchitecture } from './refactor-engine.mjs'
export {
  getStatus as getGitStatus,
  getDiff as getGitDiff,
  stageFiles,
  unstageFiles,
  commit as commitChanges,
  getBranches,
  getBranchTree,
  checkoutBranch,
  createBranch,
  push as gitPush,
  pull as gitPull,
  fetchRemote as gitFetch,
  getGitIdentity,
  setGitIdentity,
} from './git-control.mjs'

export const REPO_ROOT = process.cwd()
export const SRC_ROOT = path.resolve(REPO_ROOT, 'src')

const TIER_DIR = {
  atoms: '01_atoms',
  molecules: '02_molecules',
  organisms: '03_organisms',
  templates: '04_templates',
  pages: '05_pages',
}

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/
const SKIP_RE = /\.(stories|test|spec)\.tsx?$/

// Throws if the resolved path would escape `base` — the one place path
// containment is enforced for every operation below.
function resolveSafe(base, ...segments) {
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root')
  }
  return resolved
}

// Maps each MVVM template file to the "part" it represents — lets callers
// scaffold a subset of the triplet (e.g. View only) instead of always all
// three. Keep in sync with tools/templates/mvvm/*.template's filenames.
const PART_FOR_TEMPLATE = {
  '__name__.tsx.template': 'view',
  '__name__ViewModel.tsx.template': 'viewModel',
  'i__name__.tsx.template': 'interface',
}

// Resolves a library id to its registered root, falling back to today's
// defaults so every existing call site (none of which pass libraryId yet)
// keeps scaffolding into the same place it always has.
function libraryRoot(libraryId, kind) {
  if (libraryId) {
    const lib = getLibrary(libraryId)
    if (!lib) throw new Error(`Unknown library "${libraryId}"`)
    return lib.root
  }
  return kind === 'component' ? '02_components' : '03_prototypes'
}

export function scaffoldComponent(name, tier, language = DEFAULT_LANGUAGE, parts = ['view', 'viewModel', 'interface'], libraryId) {
  if (!NAME_RE.test(name)) {
    throw new Error('Name must be PascalCase (letters and digits only, starting with a capital)')
  }
  const lang = LANGUAGES[language]
  if (!lang) {
    throw new Error(`Unknown language "${language}" — expected one of ${Object.keys(LANGUAGES).join(', ')}`)
  }

  if (lang.mvvm) {
    // TypeScript: View/ViewModel/interface triplet (or a chosen subset of it)
    // under the usual atoms/molecules/organisms tiering.
    if (!parts.length) {
      throw new Error('Select at least one file to create (View, ViewModel, or Interface)')
    }
    const tierDir = TIER_DIR[tier]
    if (!tierDir) {
      throw new Error(`Unknown tier "${tier}" — expected one of ${Object.keys(TIER_DIR).join(', ')}`)
    }

    const targetDir = resolveSafe(SRC_ROOT, libraryRoot(libraryId, 'component'), tierDir, name)
    if (fs.existsSync(targetDir)) {
      throw new Error(`${path.relative(REPO_ROOT, targetDir)} already exists`)
    }

    const templatesDir = path.join(REPO_ROOT, 'tools/templates', lang.templateDir)
    fs.mkdirSync(targetDir, { recursive: true })

    const files = fs.readdirSync(templatesDir)
      .filter((file) => parts.includes(PART_FOR_TEMPLATE[file]))
      .map((file) => {
        const content = fs.readFileSync(path.join(templatesDir, file), 'utf8').replace(/{{name}}/g, name)
        const fileName = file.replace(/__name__/g, name).replace('.template', '')
        const outPath = path.join(targetDir, fileName)
        fs.writeFileSync(outPath, content)
        return path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')
      })

    return { path: path.relative(REPO_ROOT, targetDir).replace(/\\/g, '/'), files }
  }

  // Other languages don't fit the atoms/molecules/organisms tiering (that's
  // this app's TSX design-system taxonomy) — scaffold a single file into a
  // prototype library instead, alongside this project's other free-form
  // experiments.
  const templatesDir = path.join(REPO_ROOT, 'tools/templates', lang.templateDir)
  const templateFile = fs.readdirSync(templatesDir)[0]
  const content = fs.readFileSync(path.join(templatesDir, templateFile), 'utf8').replace(/{{name}}/g, name)
  const fileName = `${name}.${lang.ext}`
  const outPath = resolveSafe(SRC_ROOT, libraryRoot(libraryId, 'prototype'), fileName)
  if (fs.existsSync(outPath)) {
    throw new Error(`${path.relative(REPO_ROOT, outPath)} already exists`)
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, content)
  const relOut = path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')
  return { path: relOut, files: [relOut] }
}

// Creates a brand-new blank library — just a registry entry + an empty root
// folder. No pre-populated tier/role folders: those get created on demand
// the first time scaffoldComponent (or Refactor) actually writes into this
// library, same as any other mkdir-recursive write in this file.
export function createLibrary({ id, kind, label, architecture, language }) {
  const root = kind === 'component' ? `02_components_${id}` : `03_prototypes_${id}`
  const entry = addLibrary({ id, kind, label, root, architecture, language })
  fs.mkdirSync(resolveSafe(SRC_ROOT, root), { recursive: true })
  return { library: entry }
}

export function getLibraries(kind) {
  return { libraries: listLibraries(kind) }
}

// The one library seeded at repo creation — generate-graph.mjs's dsm map and
// DesignLibraryView's hardcoded default-file fallback assume it exists, so
// it can't be removed or deleted, only ever created alongside.
const PROTECTED_LIBRARY_IDS = new Set(['dsm'])

function assertRemovable(id) {
  if (PROTECTED_LIBRARY_IDS.has(id)) {
    throw new Error(`"${id}" is a default library and can't be removed`)
  }
  if (!getLibrary(id)) {
    throw new Error(`No library with id "${id}"`)
  }
}

// Unregisters only — the library's tab disappears from Planning, but its
// folder and files are left untouched on disk, so re-registering the same
// root later (a new "+ New Library" with a matching id) picks them back up.
export function removeLibrary(id) {
  assertRemovable(id)
  removeLibraryEntry(id)
  return {}
}

// Unregisters AND deletes the library's entire folder — irreversible. The
// renderer is expected to gate this behind an explicit, deliberate
// confirmation (type-the-name), same spirit as GitHub's repo-delete flow;
// this function itself performs no confirmation of its own.
export function deleteLibrary(id) {
  assertRemovable(id)
  const { root } = getLibrary(id)
  removeLibraryEntry(id)
  fs.rmSync(resolveSafe(SRC_ROOT, root), { recursive: true, force: true })
  return {}
}

export function getWidgets() {
  return { widgets: listWidgets() }
}

export function getWidgetCatalog() {
  return { catalog: readCatalog() }
}

// Unlike createLibrary, never mkdirs — every widget kind shipped so far
// (folder widgets pointed at an existing directory like src/utils) needs no
// new folder on disk. A future widget kind that does would add that here.
export function installWidget(input) {
  const entry = addWidget(input)
  return { widget: entry }
}

function buildTree(absDir, srcRelDir) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => e.isFile() && isSourceFile(e.name) && !SKIP_RE.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const dirNodes = dirs.map((d) => {
    const childSrcRel = `${srcRelDir}/${d.name}`
    const abs = path.join(absDir, d.name)
    return {
      name: d.name,
      path: childSrcRel,
      type: 'dir',
      createdAt: fs.statSync(abs).birthtimeMs,
      children: buildTree(abs, childSrcRel),
    }
  })

  const fileNodes = files.map((f) => ({
    name: f.name,
    path: `${srcRelDir}/${f.name}`,
    type: 'file',
    createdAt: fs.statSync(path.join(absDir, f.name)).birthtimeMs,
  }))

  return [...dirNodes, ...fileNodes]
}

export function listDir(relPath) {
  const dirPath = resolveSafe(SRC_ROOT, relPath || '02_components')
  return { tree: buildTree(dirPath, relPath || '02_components') }
}

export function readFile(relPath) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  return { content: fs.readFileSync(filePath, 'utf8') }
}

// Repo-root-scoped counterparts to listDir/readFile, for widgets whose
// content lives outside src/ (e.g. Docker's docker/ folder + docker-
// compose.yml). Read-only by design — no writeRepoFile/createRepoFile: every
// widget using these today (see widgets.json's WidgetEntry.rootScope) is
// `readOnly: true`, and each widget's `root` is a specific small folder it
// declares itself (never user-supplied), so this doesn't open browsing of
// arbitrary repo paths like node_modules — resolveSafe still enforces the
// same "can't escape the given base" containment, just against REPO_ROOT
// instead of SRC_ROOT.
// `relPath` is optional — some widgets are a purely curated set of repo-root
// files with no single backing folder (e.g. Nx's nx.json + project.json +
// nx-integration.md), not a real directory to recurse into. Falsy relPath
// skips buildTree entirely rather than resolving to REPO_ROOT itself, which
// would otherwise walk the whole repo (node_modules, .git, dist, ...).
export function listRepoDir(relPath, extraFiles = []) {
  const tree = relPath ? buildTree(resolveSafe(REPO_ROOT, relPath), relPath) : []
  const extraNodes = extraFiles.map((f) => {
    const abs = resolveSafe(REPO_ROOT, f)
    return { name: path.basename(f), path: f, type: 'file', createdAt: fs.statSync(abs).birthtimeMs }
  })
  return { tree: [...tree, ...extraNodes] }
}

export function readRepoFile(relPath) {
  const filePath = resolveSafe(REPO_ROOT, relPath)
  return { content: fs.readFileSync(filePath, 'utf8') }
}

// Repo-root-scoped counterpart to writeFile — the File menu's Open
// File/Save needs to persist files anywhere in the repo (package.json,
// README.md, ...), not just under src/. Same "must already exist" guard.
export function writeRepoFile(relPath, content) {
  const filePath = resolveSafe(REPO_ROOT, relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  fs.writeFileSync(filePath, content)
}

// Unlike createFile, this overwrites an existing file — the code editor's
// save action. Refuses to create a brand-new file (use createFile for that)
// so a typo'd path can't silently scaffold an unintended file.
export function writeFile(relPath, content) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  fs.writeFileSync(filePath, content)
}

// ─── Workspace (Open Folder as a project — general IDE editing) ────────────
// A *second*, independent, user-chosen root (tools/workspace-root.mjs) for
// editing an arbitrary project on disk — deliberately separate from
// REPO_ROOT/SRC_ROOT above, which stay permanently pinned to Sleipnir's own
// repo for the Planning graph/Component-library/Prototype-library/Refactor
// pipeline (see ROADMAP.md's Phase 0 for why that pipeline can't just be
// repointed: it depends on combine.ts's build-time import.meta.glob, which
// can only ever see files inside Sleipnir's own src/ tree).

function requireWorkspaceRoot() {
  const root = getWorkspaceRoot()
  if (!root) throw new Error('No workspace is open')
  return root
}

export function openWorkspace(absolutePath) {
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Not a folder: ${absolutePath}`)
  }
  const resolved = fs.realpathSync(absolutePath)
  setWorkspaceRoot(resolved)
  return { root: resolved, name: path.basename(resolved) }
}

export function getWorkspaceInfo() {
  const root = getWorkspaceRoot()
  return { root, name: root ? path.basename(root) : null }
}

// An arbitrary opened project needs its own tree walk, not buildTree above —
// that one has no directory skip-list because neither of its callers ever
// needed one (SRC_ROOT has no node_modules; every scope:'repo' widget passes
// a specific small curated folder, never a whole external project root). A
// real project root recursed unconditionally would walk into node_modules/
// .git/dist/etc. and hang or ship a giant tree over IPC.
const WORKSPACE_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'target',
  'venv', '.venv', '__pycache__', 'coverage', 'out',
])

function buildWorkspaceTree(absDir, relDir) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const dirs = entries
    .filter((e) => e.isDirectory() && !WORKSPACE_SKIP_DIRS.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => e.isFile())
    .sort((a, b) => a.name.localeCompare(b.name))

  // relDir is '' at the root call (listWorkspaceDir('')/listRepoTree()) —
  // `${relDir}/${name}` there would produce a leading-slash path (e.g.
  // "/newfile.txt"), which resolveSafe's path.relative-based containment
  // check then rejects as escaping the root on Windows. Every nested level
  // already has a non-empty relDir, so this only ever matters at the root.
  const join = (name) => (relDir ? `${relDir}/${name}` : name)

  const dirNodes = dirs.map((d) => {
    const childRel = join(d.name)
    const abs = path.join(absDir, d.name)
    return {
      name: d.name,
      path: childRel,
      type: 'dir',
      createdAt: fs.statSync(abs).birthtimeMs,
      children: buildWorkspaceTree(abs, childRel),
    }
  })

  const fileNodes = files.map((f) => ({
    name: f.name,
    path: join(f.name),
    type: 'file',
    createdAt: fs.statSync(path.join(absDir, f.name)).birthtimeMs,
  }))

  return [...dirNodes, ...fileNodes]
}

export function listWorkspaceDir(relPath) {
  const root = requireWorkspaceRoot()
  const dirPath = relPath ? resolveSafe(root, relPath) : root
  return { tree: buildWorkspaceTree(dirPath, relPath || '') }
}

export function readWorkspaceFile(relPath) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  return { content: fs.readFileSync(filePath, 'utf8') }
}

export function writeWorkspaceFile(relPath, content) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  fs.writeFileSync(filePath, content)
}

export function createWorkspaceFile(relPath, content) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  if (fs.existsSync(filePath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content ?? '')
}

export function createWorkspaceDir(relPath) {
  const dirPath = resolveSafe(requireWorkspaceRoot(), relPath)
  if (fs.existsSync(dirPath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(dirPath, { recursive: true })
}

// Project-wide search (ROADMAP.md's Phase 1) — plain fs recursion, no
// external grep/ripgrep dependency (this is a single-local-user dev tool,
// same footing as everything else in this file). Shared by both the repo
// and workspace roots via searchDir below; REPO_ROOT needs WORKSPACE_SKIP_DIRS
// applied too (it contains node_modules/.git same as any real project would),
// which is why this walker is independent of buildTree (no skip-list at all —
// its two existing callers never needed one) and buildWorkspaceTree (already
// has the skip-list, but returns a full nested tree, not a flat file walk).
const SEARCH_RESULT_LIMIT = 500
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

function* walkFiles(absDir, relDir) {
  let entries
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (WORKSPACE_SKIP_DIRS.has(e.name)) continue
      yield* walkFiles(path.join(absDir, e.name), relDir ? `${relDir}/${e.name}` : e.name)
    } else if (e.isFile()) {
      yield { abs: path.join(absDir, e.name), rel: relDir ? `${relDir}/${e.name}` : e.name }
    }
  }
}

// Cheap binary sniff (a NUL byte in the first 8KB — same heuristic git/grep
// use) so a binary file that happens to contain the query's raw bytes
// doesn't show up as a nonsensical text match.
function looksBinary(buffer) {
  const len = Math.min(buffer.length, 8192)
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}

function searchDir(absRoot, query, opts = {}) {
  const limit = opts.limit ?? SEARCH_RESULT_LIMIT
  const needle = query.toLowerCase()
  const matches = []
  let truncated = false
  if (!needle) return { matches, truncated }

  outer: for (const { abs, rel } of walkFiles(absRoot, '')) {
    let stat
    try {
      stat = fs.statSync(abs)
    } catch {
      continue
    }
    if (stat.size > MAX_SEARCH_FILE_BYTES) continue
    let buffer
    try {
      buffer = fs.readFileSync(abs)
    } catch {
      continue
    }
    if (looksBinary(buffer)) continue
    const lines = buffer.toString('utf8').split(/\r\n|\r|\n/)
    for (let i = 0; i < lines.length; i++) {
      const column = lines[i].toLowerCase().indexOf(needle)
      if (column === -1) continue
      matches.push({ path: rel, line: i + 1, column: column + 1, lineText: lines[i] })
      if (matches.length >= limit) {
        truncated = true
        break outer
      }
    }
  }

  return { matches, truncated }
}

export function searchRepo(query, opts) {
  return searchDir(REPO_ROOT, query, opts)
}

export function searchWorkspace(query, opts) {
  return searchDir(requireWorkspaceRoot(), query, opts)
}

// Quick-open's (ROADMAP.md's Phase 1) flat file list for Sleipnir's own
// repo. listRepoDir('') deliberately returns an empty tree for a falsy path
// (see its own comment — recursing REPO_ROOT unconditionally would walk into
// node_modules/.git/dist), so this reuses buildWorkspaceTree (which already
// has the right skip-list) rooted at REPO_ROOT instead.
export function listRepoTree() {
  return { tree: buildWorkspaceTree(REPO_ROOT, '') }
}

const ARCHIVE_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/archive.json')

function readArchive() {
  if (!fs.existsSync(ARCHIVE_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'))
  } catch {
    return []
  }
}

function writeArchive(entries) {
  fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true })
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(entries, null, 2))
}

export function createFile(relPath, content) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (fs.existsSync(filePath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content ?? '')
}

export function createDir(relPath) {
  const dirPath = resolveSafe(SRC_ROOT, relPath)
  if (fs.existsSync(dirPath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(dirPath, { recursive: true })
}

// Copies an arbitrary file or folder from *anywhere on disk* (sourceAbsolutePath
// deliberately isn't resolveSafe-checked — it's expected to be outside the
// repo, that's the point of Import) into a repo-relative destination
// directory, at its own basename. destRepoRelativeDir IS resolveSafe-checked
// (against REPO_ROOT, not SRC_ROOT — callers pass e.g. "src/02_components"
// or "src/03_prototypes", same repo-root-relative convention FolderBrowserView's
// scope:'repo' already uses) so the copy itself can never land outside the repo.
export function importPath(sourceAbsolutePath, destRepoRelativeDir) {
  if (!fs.existsSync(sourceAbsolutePath)) {
    throw new Error(`Source path does not exist: ${sourceAbsolutePath}`)
  }
  const destDir = resolveSafe(REPO_ROOT, destRepoRelativeDir)
  fs.mkdirSync(destDir, { recursive: true })
  const baseName = path.basename(sourceAbsolutePath)
  const destPath = path.join(destDir, baseName)
  if (fs.existsSync(destPath)) {
    throw new Error(`"${baseName}" already exists in ${destRepoRelativeDir}`)
  }
  fs.cpSync(sourceAbsolutePath, destPath, { recursive: true })
  return { path: path.relative(REPO_ROOT, destPath).replace(/\\/g, '/') }
}

// npm's own priority order for "the" dev command isn't standardized across
// the ecosystem — this is a best-effort heuristic, not a guarantee. Checked
// in this order since "dev" is by far the most common convention for a Vite/
// CRA/Next-style project; "start" and "serve" are the next most common
// fallbacks. Anything else needs manual configuration (see setPreviewConfig).
const SCRIPT_PRIORITY = ['dev', 'start', 'serve']

// Pure filesystem reads, no process spawning — dual-transport-safe (unlike
// electron/preview.cjs's actual spawn logic, which is Electron-only since a
// plain browser tab can't own OS processes). Returns null when nothing's
// auto-detectable; the caller falls back to a manual config prompt.
export function detectPreviewConfig(folderRepoRelativePath) {
  const dir = resolveSafe(REPO_ROOT, folderRepoRelativePath)
  // Import can bring in a single file, not just a folder (e.g. importing one
  // component into Components) — nothing to detect there, and readdirSync
  // below would throw (ENOTDIR) if we didn't bail out first.
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { config: null }
  }
  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const script = SCRIPT_PRIORITY.find((name) => pkg.scripts?.[name])
      if (script) {
        return { config: { command: 'npm', args: ['run', script] } }
      }
    } catch {
      // Malformed package.json — fall through to the other checks rather
      // than throwing; the manual-config path still works.
    }
  }
  const htmlFiles = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
  if (htmlFiles.length === 1) {
    // Sentinel electron/preview.cjs recognizes as "serve this folder
    // statically" rather than a real command to spawn.
    return { config: { command: '__static__', args: [] } }
  }
  return { config: null }
}

export function getPreviewConfig(folderRepoRelativePath) {
  return { config: getPreviewConfigEntry(folderRepoRelativePath) }
}

export function setPreviewConfig(folderRepoRelativePath, config) {
  // Validates the path stays within the repo, even though only the
  // relative string is ever stored in the manifest.
  resolveSafe(REPO_ROOT, folderRepoRelativePath)
  return { config: setPreviewConfigEntry(folderRepoRelativePath, config) }
}

export function getArchivedPaths() {
  return { entries: readArchive() }
}

export function setArchived(relPath, archived, label) {
  // Also validates relPath stays within SRC_ROOT, even though we only ever
  // store the relative string in the manifest.
  resolveSafe(SRC_ROOT, relPath)
  const entries = readArchive().filter((e) => e.path !== relPath)
  if (archived) {
    entries.push({ path: relPath, label: label ?? relPath, archivedAt: Date.now() })
  }
  writeArchive(entries)
  return { entries }
}

const NOTES_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/notes.json')
const FIXED_MAP_IDS = new Set(['welcome', 'research', 'validation', 'todo', 'claude', 'open'])

// A note's `map` can be any registered library id (dsm, prototypes, or any
// user-created one) plus the 4 fixed non-library maps — not a hardcoded set,
// since new libraries are added to the registry at runtime, not at build time.
function isValidMapId(map) {
  return FIXED_MAP_IDS.has(map) || listLibraries().some((lib) => lib.id === map)
}

// Was a flat GraphNode[] array; now { nodes, edges } so plan-step nodes can
// carry a `plan-step` edge back to their parent plan node. `readNotesFile`
// transparently upgrades the old flat-array shape on read (still written on
// disk as the old shape until the next write), so an existing notes.json
// from before this change keeps working with no manual migration step.
function readNotesFile() {
  if (!fs.existsSync(NOTES_PATH)) return { nodes: [], edges: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'))
    if (Array.isArray(parsed)) return { nodes: parsed, edges: [] }
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function writeNotesFile(data) {
  fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true })
  fs.writeFileSync(NOTES_PATH, JSON.stringify(data, null, 2))
}

export function getNotes() {
  return readNotesFile()
}

// User-created graph nodes with no backing file — plain ideas/tasks tracked
// directly from Planning's "+" flow, distinct from scaffoldComponent's
// atoms/molecules/organisms tiering. Always `kind: 'proposed'` (dashed in
// the graph), matching the same "not yet built" visual language as the
// hand-authored PROPOSED nodes.
export function addNote(map, label, description) {
  if (!isValidMapId(map)) {
    throw new Error(`Unknown map "${map}"`)
  }
  if (!label || !label.trim()) {
    throw new Error('Name is required')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const node = {
    id: `note/${map}/${slug || 'note'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map,
    type: 'note',
    description: description?.trim() || undefined,
  }
  const data = readNotesFile()
  data.nodes.push(node)
  writeNotesFile(data)
  return { node }
}

const PLANS_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/plans.json')

// A "saved plan" is a named, persisted list of existing graph node ids (plus
// their already-computed neighbors — see src/00_planning/graph/resolvePlan.ts,
// which does that expansion client-side) — NOT a library (no folder on disk)
// and NOT a `createPlanNode` AI draft (no `map`/`status`, doesn't live in
// notes.json). It only ever *references* real nodes, never owns/duplicates
// their data, so deleting one can't affect the files it points at.
function readPlansFile() {
  if (!fs.existsSync(PLANS_PATH)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(PLANS_PATH, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlansFile(data) {
  fs.mkdirSync(path.dirname(PLANS_PATH), { recursive: true })
  fs.writeFileSync(PLANS_PATH, JSON.stringify(data, null, 2))
}

export function getPlans() {
  return { plans: readPlansFile() }
}

export function createPlan(label, nodeIds) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    throw new Error('At least one node id is required')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const plan = {
    id: `plan/${slug || 'plan'}-${Date.now()}`,
    label: label.trim(),
    nodeIds,
    createdAt: Date.now(),
  }
  const plans = readPlansFile()
  plans.push(plan)
  writePlansFile(plans)
  return { plan }
}

export function deletePlan(id) {
  const plans = readPlansFile().filter((p) => p.id !== id)
  writePlansFile(plans)
}

// Created by the AI chat's create_plan_node tool (see electron/chat.cjs) —
// always lands in the `claude` map ("Claude's drafting area"), starts life
// as `status: 'draft'` awaiting human approval in Planning. `planId` groups
// every step of one plan together; when `parentId` is given (the plan's own
// parent node, created first with no parentId), a `plan-step` edge links
// them so the graph can render the grouping.
//
// Not atomic with the edge write below — two sequential writeNotesFile
// calls. Fine for a single local desktop user; would need real locking
// under concurrent writers.
export function createPlanNode(planId, label, description, parentId) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const node = {
    id: `plan/${planId}/${slug || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
  }
  const data = readNotesFile()
  data.nodes.push(node)
  if (parentId) {
    data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  }
  writeNotesFile(data)
  return { node }
}

// Created by the File menu's Open File… flow (see src/App.tsx) for files
// opened from outside any registered library — the caller has already
// checked the graph client-side (where getGraphForMap actually lives, via
// Vite's import.meta.glob — not reachable from this plain-Node module) and
// only calls this for files with no existing node anywhere. Dedupes by
// filePath within the `open` map itself so re-invoking this for the same
// file (e.g. a stale client-side check) never creates a second node.
export function openFileNode(repoRelativePath, label) {
  const data = readNotesFile()
  const existing = data.nodes.find((n) => n.map === 'open' && n.filePath === repoRelativePath)
  if (existing) return { node: existing }
  const node = {
    id: `open/${repoRelativePath}`,
    label: label?.trim() || path.basename(repoRelativePath),
    kind: 'built',
    map: 'open',
    type: 'opened-file',
    filePath: repoRelativePath,
  }
  data.nodes.push(node)
  writeNotesFile(data)
  return { node }
}

const NODE_STATUSES = new Set(['draft', 'approved', 'done'])

export function setNodeStatus(id, status) {
  if (!NODE_STATUSES.has(status)) {
    throw new Error(`Unknown status "${status}" — expected one of ${[...NODE_STATUSES].join(', ')}`)
  }
  const data = readNotesFile()
  const node = data.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`No note node with id "${id}"`)
  if (!node.status) throw new Error(`Node "${id}" is not a plan node (no status field)`)
  node.status = status
  writeNotesFile(data)
  return { node }
}

export function regenerateGraph() {
  return new Promise((resolve, reject) => {
    execFile('node', ['tools/generate-graph.mjs'], { cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve({ stdout })
    })
  })
}

const RUN_TIMEOUT_MS = 15_000

// Resolves once the process ends, one way or another — never rejects.
// `exitCode` is only ever `number | null` (matches RunResult): non-null for
// a process that actually ran and exited, null when it never got that far
// (command not found, or killed for running past RUN_TIMEOUT_MS).
function runCommand(command, args, options) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, ...options },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ stdout, stderr, exitCode: 0 })
        } else if (typeof err.code === 'number') {
          resolve({ stdout, stderr, exitCode: err.code })
        } else {
          const reason = err.killed
            ? `Timed out after ${RUN_TIMEOUT_MS}ms and was killed`
            : err.message
          resolve({ stdout, stderr: stderr || reason, exitCode: null })
        }
      },
    )
  })
}

// One local-trusted process/toolchain per language, matching the single
// standalone-file scaffolds in tools/templates/{python,rust,go} — these are
// never the MVVM TypeScript components (those need a React runtime, not a
// standalone interpreter). Keep in sync with the RUNNABLE set that
// CodeEditorView reads to decide whether to show its Run button.
const RUNNERS = {
  py: (absPath) => runCommand('python', [absPath]),
  go: (absPath) => runCommand('go', ['run', absPath]),
  rs: async (absPath) => {
    const outPath = path.join(os.tmpdir(), `sleipnir-run-${Date.now()}${process.platform === 'win32' ? '.exe' : ''}`)
    const build = await runCommand('rustc', [absPath, '-o', outPath])
    if (build.exitCode !== 0) return build
    try {
      return await runCommand(outPath, [])
    } finally {
      fs.rm(outPath, { force: true }, () => {})
    }
  },
}

export function runScript(relPath) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  const ext = path.extname(filePath).slice(1)
  const runner = RUNNERS[ext]
  if (!runner) {
    throw new Error(`No runner configured for ".${ext}" files`)
  }
  return runner(filePath)
}
