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
import { getPreviewConfig as getPreviewConfigEntry, setPreviewConfig as setPreviewConfigEntry } from './preview-registry.mjs'
import { getWorkspaceRoot, setWorkspaceRoot } from './workspace-root.mjs'
// Re-exported for electron/main.cjs's multi-window support: it holds a
// per-window root and sets this shared one to the *calling* window's root
// immediately before each (synchronous) backend call — see main.cjs's `ws`.
export { setWorkspaceRoot }

export {
  getStatus as getGitStatus,
  getDiff as getGitDiff,
  stageFiles,
  unstageFiles,
  discardFiles,
  commit as commitChanges,
  getBranches,
  getBranchTree,
  checkoutBranch,
  createBranch,
  renameBranch,
  push as gitPush,
  pull as gitPull,
  fetchRemote as gitFetch,
  getGitIdentity,
  setGitIdentity,
} from './git-control.mjs'

export const REPO_ROOT = process.cwd()
export const SRC_ROOT = path.resolve(REPO_ROOT, 'src')

// Where a project's own Planning board (Notes graph / Saved Plans / Archive /
// its custom display name) lives, relative to whichever folder is open as
// the Workspace — see the "Planning data" section below. Deliberately
// separate from REPO_ROOT/SRC_ROOT, which stay pinned to Sleipnir's own repo
// for the component-library/graph-scanning pipeline (see that section's own
// comment for why).
const PLANNING_DIR = '.planning'

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

// A project's display name defaults to its folder's basename, but can be
// overridden by File > Rename Project (see renameProject below), which
// writes into the same .planning/ folder the project's own Planning board
// lives in — so the label travels with the project, not with this machine's
// userData (electron/workspaceStore.cjs only caches it for the Open Recent
// list).
function readProjectName(root) {
  const metaPath = path.join(root, PLANNING_DIR, 'project.json')
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      if (typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim()
    } catch {
      // Malformed project.json — fall back to the folder name below.
    }
  }
  return path.basename(root)
}

export function renameProject(projectRoot, name) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new Error('Name is required')
  const metaPath = path.join(projectRoot, PLANNING_DIR, 'project.json')
  fs.mkdirSync(path.dirname(metaPath), { recursive: true })
  fs.writeFileSync(metaPath, JSON.stringify({ name: trimmed }, null, 2))
  return { name: trimmed }
}

export function openWorkspace(absolutePath) {
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Not a folder: ${absolutePath}`)
  }
  const resolved = fs.realpathSync(absolutePath)
  setWorkspaceRoot(resolved)
  return { root: resolved, name: readProjectName(resolved) }
}

// File > New Window — closes the current project (Workspace file browsing
// and the Planning board both go blank) without opening a different one.
export function closeWorkspace() {
  setWorkspaceRoot(null)
}

export function getWorkspaceInfo() {
  const root = getWorkspaceRoot()
  return { root, name: root ? readProjectName(root) : null }
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

// Upsert, unlike writeFile/writeRepoFile's "must already exist" guard — an
// AI-generated file staged via generate_code (see App.tsx's onCodeGenerated)
// has no pre-scaffold step creating it first, so the first save of a
// brand-new file has to just work.
export function writeWorkspaceFile(relPath, content) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
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

// Resolves + existence-checks a workspace-relative path without touching it.
// Shared by deleteWorkspacePath below (the web transport's fs.rmSync
// fallback) and the Electron IPC handler (electron/main.cjs), which needs
// the absolute path to hand to shell.trashItem instead of calling
// deleteWorkspacePath itself — moving something to the OS Recycle Bin is an
// Electron-only API, not something this framework-agnostic module can do.
export function resolveWorkspacePath(relPath) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  return filePath
}

// Permanent delete (recursive for dirs) — used directly by the web dev-
// server transport, which has no OS trash to move things to. The Electron
// transport moves to the Recycle Bin instead (see resolveWorkspacePath's
// comment above).
export function deleteWorkspacePath(relPath) {
  fs.rmSync(resolveWorkspacePath(relPath), { recursive: true, force: true })
}

// Rename or move a workspace path. `fromRel` must exist; `toRel` must not
// (both callers — in-place rename and cut→paste move — treat an existing
// destination as a conflict to reject rather than silently overwrite). Both
// ends go through resolveSafe so neither can escape the workspace root; the
// destination can't use resolveWorkspacePath since it doesn't exist yet.
export function renameWorkspacePath(fromRel, toRel) {
  const from = resolveWorkspacePath(fromRel)
  const to = resolveSafe(requireWorkspaceRoot(), toRel)
  if (fs.existsSync(to)) {
    throw new Error(`${toRel} already exists`)
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
}

// Copy a workspace path (recursive for dirs), for copy→paste. `toRel` is the
// caller's already-de-conflicted target (see the renderer's paste flow); if it
// somehow still exists we refuse rather than merge/overwrite.
export function copyWorkspacePath(fromRel, toRel) {
  const from = resolveWorkspacePath(fromRel)
  const to = resolveSafe(requireWorkspaceRoot(), toRel)
  if (fs.existsSync(to)) {
    throw new Error(`${toRel} already exists`)
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
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

// ─── Planning data (Notes graph / Saved Plans / Archive) ───────────────────
// One board per open project — stored as real files under the currently open
// Workspace root's own `.planning/` folder (portable, git-committable,
// travels with the project). Deliberately independent of REPO_ROOT/SRC_ROOT:
// Sleipnir's own generated component-library/graph-scanning system
// (generate-graph.mjs, combine.ts's build-time import.meta.glob) stays
// pinned to Sleipnir's own repo regardless of which project is open — see
// ROADMAP.md's Phase 4 for why generalizing *that* system is a separate,
// deliberately deferred, much larger rewrite. `null` (no project open) reads
// as empty and refuses writes, same as requireWorkspaceRoot's other callers.
function planningFilePath(fileName) {
  const root = getWorkspaceRoot()
  return root ? path.join(root, PLANNING_DIR, fileName) : null
}

// One-time migration for installs that predate per-project Planning data —
// copies the old REPO_ROOT-fixed notes/plans/archive.json into `projectRoot`'s
// own .planning/ folder, so opening Sleipnir's own repo as a project (which
// electron/main.cjs seeds as the first recent project on first launch under
// this system) shows exactly what Planning showed before this change, with
// nothing lost. Additive only — never touches or deletes the legacy files.
const LEGACY_PLANNING_FILES = {
  'notes.json': path.join(REPO_ROOT, 'src/00_planning/graph/notes.json'),
  'plans.json': path.join(REPO_ROOT, 'src/00_planning/graph/plans.json'),
  'archive.json': path.join(REPO_ROOT, 'src/00_planning/graph/archive.json'),
}

export function migrateLegacyPlanningData(projectRoot) {
  const targetDir = path.join(projectRoot, PLANNING_DIR)
  for (const [fileName, legacyPath] of Object.entries(LEGACY_PLANNING_FILES)) {
    const targetPath = path.join(targetDir, fileName)
    if (fs.existsSync(legacyPath) && !fs.existsSync(targetPath)) {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.copyFileSync(legacyPath, targetPath)
    }
  }
}

function readArchive() {
  const p = planningFilePath('archive.json')
  if (!p || !fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

function writeArchive(entries) {
  const p = planningFilePath('archive.json')
  if (!p) throw new Error('No project is open')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(entries, null, 2))
}

// Per-node sprint "stage" overlay — a plain { [nodeId]: stage } map, kept in
// its own file rather than on the node records so it can tag *any* node
// (including build-generated ones that don't live in notes.json). Missing file
// = no tags yet. See graph/stages.ts for the valid values / how each renders.
function readStages() {
  const p = planningFilePath('stages.json')
  if (!p || !fs.existsSync(p)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStages(stages) {
  const p = planningFilePath('stages.json')
  if (!p) throw new Error('No project is open')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(stages, null, 2))
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

const FIXED_MAP_IDS = new Set(['welcome', 'research', 'validation', 'todo', 'claude'])

function isValidMapId(map) {
  return FIXED_MAP_IDS.has(map)
}

// Was a flat GraphNode[] array; now { nodes, edges } so plan-step nodes can
// carry a `plan-step` edge back to their parent plan node. `readNotesFile`
// transparently upgrades the old flat-array shape on read (still written on
// disk as the old shape until the next write), so an existing notes.json
// from before this change keeps working with no manual migration step.
function readNotesFile() {
  const p = planningFilePath('notes.json')
  if (!p || !fs.existsSync(p)) return { nodes: [], edges: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (Array.isArray(parsed)) return { nodes: parsed, edges: [] }
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function writeNotesFile(data) {
  const p = planningFilePath('notes.json')
  if (!p) throw new Error('No project is open')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
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

// "Scaffold Files…" — the richer, second creation flow alongside addNote
// above: writes N real files into the open Workspace plus N graph nodes in
// one atomic call, rather than N separate createWorkspaceFile/addNote round
// trips (which would be non-atomic and leave orphaned files on a mid-loop
// failure). The renderer owns all business logic (which roles, which
// template content, which pairs get an auto-link) — this stays a dumb bulk
// writer, same "content is always caller-supplied" convention as
// createWorkspaceFile.
//
// entries: [{ label, role, language, description?, filePath, content }]
// links: [{ from: <index into entries>, to: <index into entries> }] —
// architecture-implied pairs (e.g. a View linking to its ViewModel),
// computed client-side from architectures.ts's `linksTo` against whichever
// roles were checked.
export function scaffoldNodes(map, entries, links) {
  if (!isValidMapId(map)) {
    throw new Error(`Unknown map "${map}"`)
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('entries must be a non-empty array')
  }
  const root = requireWorkspaceRoot()

  // Pre-check every path before writing anything, so a single collision
  // fails the whole batch instead of leaving a partial scaffold on disk.
  const resolvedPaths = entries.map((e) => resolveSafe(root, e.filePath))
  resolvedPaths.forEach((filePath, i) => {
    if (fs.existsSync(filePath)) {
      throw new Error(`${entries[i].filePath} already exists`)
    }
  })
  resolvedPaths.forEach((filePath, i) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, entries[i].content ?? '')
  })

  const now = Date.now()
  const nodes = entries.map((e, i) => {
    const slug = e.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return {
      id: `note/${map}/${slug || 'node'}-${now}-${i}`,
      label: e.label.trim(),
      kind: 'proposed',
      map,
      type: 'scaffold',
      role: e.role,
      language: e.language,
      architecture: e.architecture,
      filePath: e.filePath,
      description: e.description?.trim() || undefined,
    }
  })
  const edges = (links ?? [])
    .filter((l) => nodes[l.from] && nodes[l.to])
    .map((l) => ({ source: nodes[l.from].id, target: nodes[l.to].id, kind: 'borrows' }))

  const data = readNotesFile()
  data.nodes.push(...nodes)
  data.edges.push(...edges)
  writeNotesFile(data)
  return { nodes, edges }
}

// A "saved plan" is a named, persisted list of existing graph node ids (plus
// their already-computed neighbors — see src/00_planning/graph/resolvePlan.ts,
// which does that expansion client-side) — NOT a library (no folder on disk)
// and NOT a `createPlanNode` AI draft (no `map`/`status`, doesn't live in
// notes.json). It only ever *references* real nodes, never owns/duplicates
// their data, so deleting one can't affect the files it points at.
function readPlansFile() {
  const p = planningFilePath('plans.json')
  if (!p || !fs.existsSync(p)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlansFile(data) {
  const p = planningFilePath('plans.json')
  if (!p) throw new Error('No project is open')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

export function getPlans() {
  return { plans: readPlansFile() }
}

export function createPlan(label, nodeIds = [], assetPaths, assetEdges) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  if (!Array.isArray(nodeIds)) {
    throw new Error('nodeIds must be an array')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const plan = {
    id: `plan/${slug || 'plan'}-${Date.now()}`,
    label: label.trim(),
    nodeIds,
    ...(Array.isArray(assetPaths) && assetPaths.length ? { assetPaths } : {}),
    ...(Array.isArray(assetEdges) && assetEdges.length ? { assetEdges } : {}),
    createdAt: Date.now(),
  }
  const plans = readPlansFile()
  plans.push(plan)
  writePlansFile(plans)
  return { plan }
}

// Merges workspace-relative paths into a plan's `generatedFiles` — called
// once per "Generate Code" run that happened while this plan's tab was
// active (see PlanningView.tsx's generateCode/App.tsx's onCodeGenerated).
// Lets a later deletePlan(id, {deleteFiles:true}) know what to clean up.
export function appendPlanGeneratedFiles(id, paths) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (!plan) throw new Error(`No plan with id "${id}"`)
  const existing = new Set(plan.generatedFiles ?? [])
  for (const p of paths) existing.add(p)
  plan.generatedFiles = [...existing]
  writePlansFile(plans)
  return { plan }
}

// opts.deleteFiles also removes every workspace-relative path recorded in
// the plan's generatedFiles (see appendPlanGeneratedFiles) — resolved
// against the open Workspace root, same fs.rmSync pattern deleteLibrary used
// to use for a library's whole folder, just per-file here.
export function deletePlan(id, opts = {}) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (opts.deleteFiles && plan?.generatedFiles?.length) {
    const root = requireWorkspaceRoot()
    for (const relPath of plan.generatedFiles) {
      const filePath = resolveSafe(root, relPath)
      fs.rmSync(filePath, { force: true })
    }
  }
  writePlansFile(plans.filter((p) => p.id !== id))
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

// Full-replace of one node's outgoing 'borrows' edges — used both by the
// node-card link editor (PlanningView, an explicit user edit) and by
// CodeEditorView's save-hook (re-parsing a saved file's real imports and
// reconciling the graph to match, see WorkspaceView's onImportsChanged).
// A full replace rather than individual add/remove calls is the simplest
// correct approach for the parse direction, since re-scanning a file's
// imports always yields its complete current set, not a delta.
export function setNodeBorrows(nodeId, targetIds) {
  if (!Array.isArray(targetIds)) {
    throw new Error('targetIds must be an array')
  }
  const data = readNotesFile()
  data.edges = data.edges.filter((e) => !(e.source === nodeId && e.kind === 'borrows'))
  for (const targetId of targetIds) {
    if (targetId !== nodeId) data.edges.push({ source: nodeId, target: targetId, kind: 'borrows' })
  }
  writeNotesFile(data)
  return { edges: data.edges.filter((e) => e.source === nodeId) }
}

// Permanently removes one notes.json node plus every edge touching it (as
// source or target). Notes, scaffolded nodes, and plan-step nodes all live
// in notes.json, so this one function is the hard-delete counterpart for all
// three — unlike setArchived, which is a *restorable* soft-hide for the
// build-generated src nodes that combine.ts owns (those aren't in notes.json
// and can't be deleted here; they'd just regenerate from source).
//
// Deliberately does NOT touch any real Workspace file a scaffolded node
// points at — deleting that file is the caller's separate, explicit choice
// via deleteWorkspacePath (see PlanningView's DeleteNodeModal), same
// node-only-vs-node-plus-files split deletePlan offers.
// Edit a notes.json node's label (and optionally description) in place — the
// rename counterpart to addNote. Only nodes that actually live in notes.json
// (notes, scaffolded, plan-steps) can be renamed here; build-generated src
// nodes aren't stored here (they regenerate from source), so this throws for
// an unknown id and callers gate "Rename" to notes-backed nodes.
export function updateNote(id, patch) {
  const data = readNotesFile()
  const node = data.nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`No note node with id "${id}"`)
  }
  if (patch && patch.label !== undefined) {
    const label = String(patch.label).trim()
    if (!label) throw new Error('Name is required')
    node.label = label
  }
  if (patch && patch.description !== undefined) {
    node.description = String(patch.description).trim() || undefined
  }
  writeNotesFile(data)
  return { node }
}

export function deleteNote(id) {
  const data = readNotesFile()
  if (!data.nodes.some((n) => n.id === id)) {
    throw new Error(`No note node with id "${id}"`)
  }
  data.nodes = data.nodes.filter((n) => n.id !== id)
  data.edges = data.edges.filter((e) => e.source !== id && e.target !== id)
  writeNotesFile(data)
  // A stage tag on a now-deleted node would just be dead weight in the overlay.
  const stages = readStages()
  if (id in stages) {
    delete stages[id]
    writeStages(stages)
  }
}

const NODE_STAGES = new Set(['proposed', 'todo', 'in-progress', 'in-review', 'blocked', 'completed'])

export function getNodeStages() {
  return { stages: readStages() }
}

// Tags one node (any node, by id) with a sprint stage, or clears it when
// `stage` is null/undefined/empty. Not scoped to notes.json — the overlay is
// keyed by bare node id so build-generated nodes can be tagged too.
export function setNodeStage(id, stage) {
  if (!id) throw new Error('id is required')
  const stages = readStages()
  if (!stage) {
    delete stages[id]
  } else {
    if (!NODE_STAGES.has(stage)) {
      throw new Error(`Unknown stage "${stage}" — expected one of ${[...NODE_STAGES].join(', ')}`)
    }
    stages[id] = stage
  }
  writeStages(stages)
  return { stages }
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
