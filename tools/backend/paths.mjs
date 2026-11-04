// The roots and path rules every part of the backend shares: Sleipnir's own
// repo root, the open Workspace root, path containment, project.json, and the
// one directory-skip rule every workspace walker uses.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { getWorkspaceRoot } from '../workspace-root.mjs'

export const REPO_ROOT = process.cwd()
export const SRC_ROOT = path.resolve(REPO_ROOT, 'src')

// REPO_ROOT itself is never realpath'd (just process.cwd() above), while
// openWorkspace's `root` always is (fs.realpathSync, see below) — comparing
// the raw REPO_ROOT against a realpath'd root risks a symlink/junction or
// drive-letter-casing mismatch on Windows making path.relative wrongly treat
// REPO_ROOT as "outside itself". Resolved once; REPO_ROOT can't change at
// runtime.
const REPO_ROOT_REAL = (() => {
  try { return fs.realpathSync(REPO_ROOT) } catch { return REPO_ROOT }
})()

// Maps the open Workspace root onto Sleipnir's own REPO_ROOT, when possible —
// read by getWorkspaceInfo below and consumed by CodeEditorView.ViewModel's
// repoRelativePathForScope to gate LSP for scope:'workspace': tsserver's
// project root is hardcoded to REPO_ROOT (tools/lsp-proxy.mjs's getTsServer),
// so it has no knowledge of a genuinely unrelated external project. Returns
// null when `root` is outside REPO_ROOT (or unset); '' when the Workspace
// root IS REPO_ROOT itself (the default state seeded on first launch, e.g.
// developing Sleipnir with Sleipnir); otherwise the forward-slashed relative
// path prefix.
export function computeRepoRelativeRoot(root) {
  if (!root) return null
  const relative = path.relative(REPO_ROOT_REAL, root)
  if (relative === '') return ''
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return relative.split(path.sep).join('/')
}

// Where a project's own Planning board (Notes graph / Saved Plans / Archive /
// its custom display name) lives, relative to whichever folder is open as
// the Workspace — see the "Planning data" section below. Deliberately
// separate from REPO_ROOT/SRC_ROOT, which stay pinned to Sleipnir's own repo
// for the component-library/graph-scanning pipeline (see that section's own
// comment for why).
export const PLANNING_DIR = '.planning'

export const SKIP_RE = /\.(stories|test|spec)\.tsx?$/

// Throws if the resolved path would escape `base` — the one place path
// containment is enforced for every operation below.
export function resolveSafe(base, ...segments) {
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root')
  }
  return resolved
}

// The canonical on-disk form for any workspace path we *store* (as opposed to
// resolve and use immediately): root-relative, forward slashes, no './'.
// Callers hand us all three of 'src/a.tsx', '.\\src\\a.tsx' and an absolute
// path inside the root — resolveSafe happily accepts every one, and
// path.resolve returns an absolute second argument unchanged, so without this
// an absolute --file-path used to land verbatim in .planning/notes.json and
// travel to every other machine that clones the repo.
export function toStoredPath(base, candidate) {
  return path.relative(base, path.resolve(base, candidate)).split(path.sep).join('/')
}

export function requireWorkspaceRoot() {
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
// Every read of project.json goes through here so the file can grow fields
// (agentScaffolding, see ensureAgentScaffolding) without each caller needing
// to know the whole shape. Tolerant by design: missing or malformed reads as
// {}, the same fallback readProjectName has always had.
export function readProjectMeta(root) {
  const metaPath = path.join(root, PLANNING_DIR, 'project.json')
  if (!fs.existsSync(metaPath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Read-merge-write, never a whole-file replace. project.json now holds both
// the display name and the per-project agent-scaffolding config, so the
// rename path rewriting it wholesale would silently drop the latter.
export function writeProjectMeta(root, patch) {
  const metaPath = path.join(root, PLANNING_DIR, 'project.json')
  const merged = { ...readProjectMeta(root), ...patch }
  fs.mkdirSync(path.dirname(metaPath), { recursive: true })
  fs.writeFileSync(metaPath, JSON.stringify(merged, null, 2))
  return merged
}

export function readProjectName(root) {
  const meta = readProjectMeta(root)
  if (typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim()
  return path.basename(root)
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

// What git ignores, so a walk skips it the way VS Code's search and ripgrep do.
//
// A fixed name list can't know a project's own output and caches: this repo's
// `release/` (installers, 138 MB) and `.claude/worktrees/` (whole checkouts of
// the repo) were walked on every tree refresh and every search — the worktrees
// turning each search hit, and each basename the Problems dock tries to
// relocate, into several. `git ls-files --others --ignored --directory` lists
// exactly the ignored, untracked folders (collapsed, never their contents), so
// it stays cheap even beside a large node_modules. Folders holding tracked
// files are never listed, so nothing committed is ever hidden.
//
// Cached briefly per root: the tree refreshes in bursts. Outside a repo, or
// with no git on PATH, the set is empty and the fixed list alone applies.
const IGNORED_DIRS_TTL_MS = 5_000
const ignoredDirsCache = new Map() // absRoot -> { at, dirs: Set<relPath> }
// Sleipnir's own folders stay visible even in a project that ignores them —
// a gitignored .components must still show its staged components.
const NEVER_SKIPPED_ROOTS = new Set([PLANNING_DIR, '.components', '.canvas', '.research'])

function gitIgnoredDirs(absRoot) {
  const cached = ignoredDirsCache.get(absRoot)
  if (cached && Date.now() - cached.at < IGNORED_DIRS_TTL_MS) return cached.dirs
  let dirs = new Set()
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
      cwd: absRoot,
      timeout: 3_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).toString('utf8')
    dirs = new Set(out.split('\0').filter((p) => p.endsWith('/')).map((p) => p.slice(0, -1)))
  } catch {
    // Not a repo, no git, or too slow — fall back to the fixed list.
  }
  ignoredDirsCache.set(absRoot, { at: Date.now(), dirs })
  return dirs
}

// Known-huge nested folders that a name list can't express: Claude Code's
// worktrees are full checkouts of the repo, and live inside a `.claude/` that
// the tree deliberately keeps showing (below).
const NESTED_SKIP_DIRS = new Set(['.claude/worktrees'])

// The one skip rule every workspace walker shares: the fixed list, the nested
// list, plus whatever git ignores under `absRoot` (relPaths are root-relative).
//
// `forTree` keeps ignored DOT-folders visible. Search should skip everything
// git ignores, exactly as VS Code's does; the tree is where you go to look at
// `.claude/`, `.vscode/` or `.idea/`, and those are usually ignored whole
// (git then reports the folder rather than its contents). Ignored output —
// `release/`, `.nx/cache/`, `tmp/` — is not dot-named, and is what this hides.
export function skipDirFor(absRoot, { forTree = false } = {}) {
  const ignored = gitIgnoredDirs(absRoot)
  return (name, relPath) => {
    if (WORKSPACE_SKIP_DIRS.has(name) || NESTED_SKIP_DIRS.has(relPath)) return true
    if (NEVER_SKIPPED_ROOTS.has(relPath.split('/')[0])) return false
    if (forTree && name.startsWith('.')) return false
    return ignored.has(relPath)
  }
}

// Project-wide search (ROADMAP.md's Phase 1) — plain fs recursion, no
// external grep/ripgrep dependency (this is a single-local-user dev tool,
// same footing as everything else in this file). Shared by both the repo
// and workspace roots via searchDir below; REPO_ROOT needs WORKSPACE_SKIP_DIRS
// applied too (it contains node_modules/.git same as any real project would),
// which is why this walker is independent of buildTree (no skip-list at all —
// its two existing callers never needed one) and buildWorkspaceTree (already
// has the skip-list, but returns a full nested tree, not a flat file walk).
export const SEARCH_RESULT_LIMIT = 500
export const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

export function* walkFiles(absDir, relDir, skipDir = skipDirFor(absDir)) {
  let entries
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const childRel = relDir ? `${relDir}/${e.name}` : e.name
      if (skipDir(e.name, childRel)) continue
      yield* walkFiles(path.join(absDir, e.name), childRel, skipDir)
    } else if (e.isFile()) {
      yield { abs: path.join(absDir, e.name), rel: relDir ? `${relDir}/${e.name}` : e.name }
    }
  }
}
