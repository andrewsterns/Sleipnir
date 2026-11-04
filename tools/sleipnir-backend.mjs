// Shared backend logic for Sleipnir's local dev-only file API — scaffold
// components, browse/read/write files, manage the archive manifest, and
// re-run tools/generate-graph.mjs. Framework-agnostic plain Node so both the
// Vite dev middleware (vite.config.ts, web transport) and the Electron main
// process (electron/main.cjs, IPC transport) can import and call it
// directly, instead of duplicating this logic per transport.
// The bulk of it lives in tools/backend/, one module per concern, re-exported
// here so every caller keeps importing this one file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { isSourceFile } from './source-extensions.mjs'
import { getPreviewConfig as getPreviewConfigEntry, setPreviewConfig as setPreviewConfigEntry } from './preview-registry.mjs'
import { getWorkspaceRoot, setWorkspaceRoot } from './workspace-root.mjs'
import { analyzeArchitecture } from './architecture-health.mjs'
import {
  MAX_SEARCH_FILE_BYTES,
  REPO_ROOT,
  SEARCH_RESULT_LIMIT,
  SKIP_RE,
  SRC_ROOT,
  computeRepoRelativeRoot,
  readProjectName,
  requireWorkspaceRoot,
  resolveSafe,
  skipDirFor,
  walkFiles,
  writeProjectMeta,
} from './backend/paths.mjs'
export {
  REPO_ROOT,
  SRC_ROOT,
} from './backend/paths.mjs'
export {
  getAgentScaffolding,
  setAgentScaffolding,
  ensureAgentScaffolding,
  getAgentScaffoldingState,
  migrateLegacyPlanningData,
} from './backend/agentScaffolding.mjs'
export {
  getArchivedPaths,
  setArchived,
  getNotes,
  addNote,
  scaffoldNodes,
  getPlans,
  createPlan,
  appendPlanGeneratedFiles,
  addPlanNodes,
  addPlanAssets,
  renamePlan,
  deletePlan,
} from './backend/planningStore.mjs'
export {
  getPlanActivity,
  setStepStatus,
  settleCommittedStages,
  stepSnapshotDir,
  getAgentTrail,
  getSkills,
  getSkillText,
  saveSkillText,
  createSkill,
  applyTrailStatuses,
  describePlan,
  commentOnStep,
  steerStep,
  setDefaultNodeStages,
} from './backend/stepReports.mjs'
export {
  detectProject,
  createPlanNode,
  updatePlannedFilePath,
  proposeFileNode,
  setNodeStatus,
  approvePlanNodes,
  setNodeBorrows,
  updateNote,
  deleteNote,
  checkPlanningPaths,
  relinkPlanningPath,
  removePlanningRef,
  getNodeStages,
  setNodeStage,
} from './backend/planSteps.mjs'
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
  getCommitGraph,
  getCommitFileMap,
  checkoutBranch,
  createBranch,
  renameBranch,
  push as gitPush,
  pull as gitPull,
  fetchRemote as gitFetch,
  clone as gitClone,
  initRepo as gitInit,
  addRemote as gitAddRemote,
  getGitIdentity,
  setGitIdentity,
  stashPush as gitStashPush,
  stashList as gitStashList,
  stashApply as gitStashApply,
  stashPop as gitStashPop,
  stashDrop as gitStashDrop,
} from './git-control.mjs'

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

export function renameProject(projectRoot, name) {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new Error('Name is required')
  writeProjectMeta(projectRoot, { name: trimmed })
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
  return { root, name: root ? readProjectName(root) : null, repoRelativeRoot: computeRepoRelativeRoot(root) }
}

function buildWorkspaceTree(absDir, relDir, skipDir = skipDirFor(absDir, { forTree: true })) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const join = (name) => (relDir ? `${relDir}/${name}` : name)
  const dirs = entries
    .filter((e) => e.isDirectory() && !skipDir(e.name, join(e.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => e.isFile())
    .sort((a, b) => a.name.localeCompare(b.name))

  // relDir is '' at the root call (listWorkspaceDir('')/listRepoTree()) —
  // `${relDir}/${name}` there would produce a leading-slash path (e.g.
  // "/newfile.txt"), which resolveSafe's path.relative-based containment
  // check then rejects as escaping the root on Windows. Every nested level
  // already has a non-empty relDir, so this only ever matters at the root.
  const dirNodes = dirs.map((d) => {
    const childRel = join(d.name)
    const abs = path.join(absDir, d.name)
    return {
      name: d.name,
      path: childRel,
      type: 'dir',
      createdAt: fs.statSync(abs).birthtimeMs,
      children: buildWorkspaceTree(abs, childRel, skipDir),
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
  // Unlike the project root itself (always present), a bundled subfolder like
  // the Docs pane's `.research/` (see src/canvas/panels/DocsPane.tsx) may not exist yet on a
  // project that's never used that feature — not an error, just an empty
  // browser until something's created into it (createWorkspaceFile/
  // createWorkspaceDir below both mkdirSync it into existence on demand).
  // Same "missing == empty, not thrown" convention as readNotesFile/
  // readPlansFile above.
  if (!fs.existsSync(dirPath)) return { tree: [] }
  return { tree: buildWorkspaceTree(dirPath, relPath || '', skipDirFor(root, { forTree: true })) }
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

// Binary files for the Canvas's image fills. Text reads (readWorkspaceFile)
// decode as UTF-8, which mangles an image; these move raw bytes as base64 so
// the same JSON/IPC transports carry them.
const MAX_BINARY_BYTES = 25 * 1024 * 1024
const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
}

// A workspace image as a data URL. Images only — this is not a general
// binary read — and size-capped, since the result crosses IPC in one piece.
export function readWorkspaceImageDataUrl(relPath) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  const mime = IMAGE_MIME[path.extname(filePath).slice(1).toLowerCase()]
  if (!mime) throw new Error(`${relPath} is not an image`)
  const { size } = fs.statSync(filePath)
  if (size > MAX_BINARY_BYTES) throw new Error(`${relPath} is larger than 25 MB`)
  return { dataUrl: `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}` }
}

// Creates a binary file from base64. Refuses an existing path, like
// createWorkspaceFile — callers de-conflict the name first.
export function createWorkspaceBinaryFile(relPath, base64) {
  const filePath = resolveSafe(requireWorkspaceRoot(), relPath)
  if (fs.existsSync(filePath)) throw new Error(`${relPath} already exists`)
  const bytes = Buffer.from(String(base64 ?? ''), 'base64')
  if (bytes.length > MAX_BINARY_BYTES) throw new Error('File is larger than 25 MB')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, bytes)
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

// The Health view's numbers — fan-in/out, cycles, layer violations, dead
// files, hotspots — for the open Workspace. The root is read synchronously,
// before the worker starts, so main.cjs's `ws` per-window root-set still
// lands on the right project.
export function analyzeWorkspace(opts) {
  return analyzeArchitecture(requireWorkspaceRoot(), opts)
}

// Quick-open's (ROADMAP.md's Phase 1) flat file list for Sleipnir's own
// repo. listRepoDir('') deliberately returns an empty tree for a falsy path
// (see its own comment — recursing REPO_ROOT unconditionally would walk into
// node_modules/.git/dist), so this reuses buildWorkspaceTree (which already
// has the right skip-list) rooted at REPO_ROOT instead.
export function listRepoTree() {
  return { tree: buildWorkspaceTree(REPO_ROOT, '') }
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
