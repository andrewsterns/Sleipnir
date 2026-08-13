// Local git integration for Sleipnir's Source Control view — status, diff,
// stage/commit, branches, push/pull/fetch. Every operation shells out to the
// system `git` binary via execFile (same primitive tools/sleipnir-backend.mjs
// already uses for regenerateGraph/runScript) rather than pulling in a git
// library — this repo has no git npm dependency and doesn't need one for
// plain plumbing-command calls. Host-agnostic: works against whatever
// `origin` a project actually has (GitHub here), never a specific host's API.
import { execFile } from 'node:child_process'
import { getWorkspaceRoot } from './workspace-root.mjs'

const GIT_TIMEOUT_MS = 15_000

// Source Control visualizes/manages whichever project is currently open
// (see tools/workspace-root.mjs) rather than Sleipnir's own repo — unlike
// Planning/Research, it has no data of its own to bundle per-project; git
// itself already is that store, just pointed at a different working tree.
function git(args) {
  const cwd = getWorkspaceRoot()
  if (!cwd) throw new Error('No project is open')
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ stdout, stderr, exitCode: 0 })
        } else if (typeof err.code === 'number') {
          resolve({ stdout, stderr, exitCode: err.code })
        } else {
          resolve({ stdout, stderr: stderr || err.message, exitCode: null })
        }
      },
    )
  })
}

async function ensureRepo() {
  const { exitCode } = await git(['rev-parse', '--is-inside-work-tree'])
  if (exitCode !== 0) {
    throw new Error('Not a git repository (or git is not installed / not on PATH).')
  }
}

// Parses `git status --porcelain -b` — the v1 porcelain format, one line per
// changed file plus a leading `## branch...upstream [ahead N, behind M]`
// header. Simpler and stable enough for a status list; v2 porcelain's richer
// rename/submodule fields aren't needed for this view.
function parseStatus(raw) {
  const lines = raw.split('\n').filter((l) => l.length > 0)
  let branch = null
  let upstream = null
  let ahead = 0
  let behind = 0
  const files = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const header = line.slice(3)
      const bracket = header.match(/\[(.+)\]$/)
      if (bracket) {
        const aheadM = bracket[1].match(/ahead (\d+)/)
        const behindM = bracket[1].match(/behind (\d+)/)
        if (aheadM) ahead = Number(aheadM[1])
        if (behindM) behind = Number(behindM[1])
      }
      const headerNoBracket = header.replace(/\s*\[.+\]$/, '')
      const [branchPart, upstreamPart] = headerNoBracket.split('...')
      branch = branchPart === 'HEAD (no branch)' ? null : branchPart
      upstream = upstreamPart || null
      continue
    }
    const indexStatus = line[0]
    const worktreeStatus = line[1]
    const filePath = line.slice(3)
    files.push({
      path: filePath,
      indexStatus,
      worktreeStatus,
      staged: indexStatus !== ' ' && indexStatus !== '?',
      untracked: indexStatus === '?' && worktreeStatus === '?',
      conflicted: indexStatus === 'U' || worktreeStatus === 'U',
    })
  }

  return { branch, upstream, ahead, behind, files }
}

export async function getStatus() {
  await ensureRepo()
  const { stdout, exitCode, stderr } = await git(['status', '--porcelain', '-b'])
  if (exitCode !== 0) throw new Error(stderr || 'git status failed')
  return parseStatus(stdout)
}

export async function getDiff(filePath, staged = false) {
  await ensureRepo()
  const args = staged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath]
  const { stdout, exitCode, stderr } = await git(args)
  if (exitCode !== 0) throw new Error(stderr || 'git diff failed')
  return { diff: stdout }
}

export async function stageFiles(paths) {
  await ensureRepo()
  if (!paths?.length) throw new Error('No files given to stage.')
  const { exitCode, stderr } = await git(['add', '--', ...paths])
  if (exitCode !== 0) throw new Error(stderr || 'git add failed')
  return getStatus()
}

export async function unstageFiles(paths) {
  await ensureRepo()
  if (!paths?.length) throw new Error('No files given to unstage.')
  const { exitCode, stderr } = await git(['reset', '--', ...paths])
  if (exitCode !== 0) throw new Error(stderr || 'git reset failed')
  return getStatus()
}

// Discard working-tree changes for the given paths — the Source Control
// "Discard changes" action. Classifies each path against a fresh status:
// modified/deleted tracked files are reverted to HEAD (index + worktree),
// while untracked files and staged-but-new files are unstaged and removed
// from the working tree (they have no HEAD version to restore). Destructive,
// so the renderer confirms first (see SourceControlView).
export async function discardFiles(paths) {
  await ensureRepo()
  if (!paths?.length) throw new Error('No files given to discard.')
  const status = await getStatus()
  const byPath = new Map(status.files.map((f) => [f.path, f]))
  const remove = []
  const restore = []
  for (const p of paths) {
    const f = byPath.get(p)
    if (f && (f.untracked || (f.staged && f.indexStatus === 'A'))) remove.push(p)
    else restore.push(p)
  }
  if (restore.length) {
    const { exitCode, stderr } = await git(['checkout', 'HEAD', '--', ...restore])
    if (exitCode !== 0) throw new Error(stderr || 'git checkout failed')
  }
  if (remove.length) {
    // Unstage first so a staged-new file becomes untracked, then clean removes it.
    await git(['reset', '--', ...remove])
    const { exitCode, stderr } = await git(['clean', '-fd', '--', ...remove])
    if (exitCode !== 0) throw new Error(stderr || 'git clean failed')
  }
  return getStatus()
}

export async function commit(message) {
  await ensureRepo()
  if (!message || !message.trim()) throw new Error('Commit message cannot be empty.')
  const status = await getStatus()
  if (!status.files.some((f) => f.staged)) {
    throw new Error('Nothing staged — stage at least one file before committing.')
  }
  const { exitCode, stderr, stdout } = await git(['commit', '-m', message])
  if (exitCode !== 0) throw new Error(stderr || stdout || 'git commit failed')
  return getStatus()
}

export async function getBranches() {
  await ensureRepo()
  const { stdout, exitCode, stderr } = await git([
    'branch', '--format=%(refname:short)%09%(HEAD)',
  ])
  if (exitCode !== 0) throw new Error(stderr || 'git branch failed')
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, head] = line.split('\t')
      return { name, current: head === '*' }
    })
}

const FIELD_SEP = '\x1f' // unit separator — won't collide with real commit text

async function commitLog(ref, maxCount) {
  const { stdout, exitCode } = await git([
    'log', ref, `--max-count=${maxCount}`,
    `--pretty=format:%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ad`,
    '--date=short',
  ])
  if (exitCode !== 0 || !stdout.trim()) return []
  return stdout.trim().split('\n').map((line) => {
    const [hash, shortHash, subject, author, date] = line.split(FIELD_SEP)
    return { hash, shortHash, subject, author, date }
  })
}

const MAX_COMMITS_PER_BRANCH = 8
const MAX_COMMITS_TOTAL = 30
// The commit-graph view walks the real DAG (all branches + remotes at once),
// so it gets a far larger budget than getBranchTree's per-branch divergence
// summary. Still capped so a huge repo can't blow the execFile buffer/timeout.
const MAX_GRAPH_COMMITS = 200

// Parses git's `%D` ref-decoration field ("HEAD -> main, origin/main, tag: v1")
// into a clean label list, pulling out whether HEAD points here.
function parseDecorations(deco) {
  if (!deco || !deco.trim()) return { refs: [], isHead: false }
  let isHead = false
  const refs = []
  for (const raw of deco.split(',')) {
    const part = raw.trim()
    if (!part) continue
    if (part === 'HEAD') { isHead = true; continue }
    if (part.startsWith('HEAD -> ')) { isHead = true; refs.push(part.slice('HEAD -> '.length)); continue }
    refs.push(part) // keeps 'origin/main', 'tag: v1.0', plain branch names as-is
  }
  return { refs, isHead }
}

// A simple branch list + divergence view (not a full multi-lane DAG): the
// "primary" branch (main/master, or whatever's checked out if neither
// exists) gets its own recent history; every other branch shows the commits
// unique to it since its merge-base with the primary, plus that fork point.
export async function getBranchTree() {
  await ensureRepo()
  const branches = await getBranches()
  if (branches.length === 0) return { primary: null, branches: [] }

  const names = branches.map((b) => b.name)
  const primary = names.includes('main')
    ? 'main'
    : names.includes('master')
      ? 'master'
      : (branches.find((b) => b.current)?.name ?? names[0])

  let totalUsed = 0
  const result = []
  for (const b of branches) {
    if (totalUsed >= MAX_COMMITS_TOTAL) {
      result.push({ name: b.name, current: b.current, isPrimary: b.name === primary, commits: [], truncated: true })
      continue
    }
    const remaining = Math.min(MAX_COMMITS_PER_BRANCH, MAX_COMMITS_TOTAL - totalUsed)

    if (b.name === primary) {
      const commits = await commitLog(primary, remaining)
      totalUsed += commits.length
      result.push({ name: b.name, current: b.current, isPrimary: true, commits })
      continue
    }

    const { stdout: mbOut, exitCode: mbExit } = await git(['merge-base', b.name, primary])
    const mergeBase = mbExit === 0 ? mbOut.trim() : null
    let forkPoint = null
    let commits
    if (mergeBase) {
      forkPoint = (await commitLog(mergeBase, 1))[0] ?? null
      commits = await commitLog(`${mergeBase}..${b.name}`, remaining)
    } else {
      commits = await commitLog(b.name, remaining)
    }
    totalUsed += commits.length
    result.push({
      name: b.name,
      current: b.current,
      isPrimary: false,
      forkedFrom: mergeBase ? primary : null,
      forkPoint,
      commits,
    })
  }

  return { primary, branches: result }
}

// The real commit DAG behind the graph view: every commit across all local
// branches + remote-tracking branches, each with its parent hashes (so the
// renderer can lay out lanes/merges), ref decorations, and push/fetch state.
// "Pushed" = reachable from a remote-tracking ref; "local" = reachable from a
// local branch. A commit that's remote-only (local === false) was fetched but
// not yet merged into any local branch; one that's local-only (pushed ===
// false) hasn't been pushed. Unlike getBranchTree this is the actual topology,
// not a per-branch divergence summary.
export async function getCommitGraph() {
  await ensureRepo()

  // Hash-only reachability sets — cheap even on large histories. `--remotes`
  // yields every commit on any origin/* tracking branch (empty when there's no
  // remote); `--branches` every commit on any local branch.
  const revListSet = async (scope) => {
    const { stdout, exitCode } = await git(['rev-list', scope])
    if (exitCode !== 0 || !stdout.trim()) return new Set()
    return new Set(stdout.trim().split('\n'))
  }
  const [remoteSet, localSet] = await Promise.all([revListSet('--remotes'), revListSet('--branches')])

  const { stdout, exitCode, stderr } = await git([
    'log', '--branches', '--remotes', '--date-order',
    `--max-count=${MAX_GRAPH_COMMITS + 1}`,
    `--pretty=format:%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ad${FIELD_SEP}%P${FIELD_SEP}%D`,
    '--date=short',
  ])
  if (exitCode !== 0) throw new Error(stderr || 'git log failed')

  const rows = stdout.trim() ? stdout.trim().split('\n') : []
  const truncated = rows.length > MAX_GRAPH_COMMITS
  const commits = rows.slice(0, MAX_GRAPH_COMMITS).map((line) => {
    const [hash, shortHash, subject, author, date, parentsStr, decoStr] = line.split(FIELD_SEP)
    const parents = parentsStr && parentsStr.trim() ? parentsStr.trim().split(' ') : []
    const { refs, isHead } = parseDecorations(decoStr)
    return {
      hash, shortHash, subject, author, date, parents, refs, isHead,
      pushed: remoteSet.has(hash),
      local: localSet.has(hash),
    }
  })

  const branches = await getBranches()
  const head = branches.find((b) => b.current)?.name ?? null

  return { commits, head, truncated }
}

// Per-commit changed-file lists, keyed by full hash — the join key for the
// constellation view (a plan node's workspace-relative filePath ↔ the commits
// that touched it). One `--name-only` log walk over the same commit set as
// getCommitGraph, parsed into { hash: [paths] }. Merge commits show no files
// here (git doesn't diff merges without -m), which is fine — provenance
// attributes to the real change commits, not the merges.
export async function getCommitFileMap() {
  await ensureRepo()
  const { stdout, exitCode, stderr } = await git([
    'log', '--branches', '--remotes', '--date-order',
    `--max-count=${MAX_GRAPH_COMMITS}`,
    '--name-only',
    `--pretty=format:${FIELD_SEP}%H`,
    '--date=short',
  ])
  if (exitCode !== 0) throw new Error(stderr || 'git log failed')

  const files = {}
  let current = null
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (line.startsWith(FIELD_SEP)) {
      current = line.slice(FIELD_SEP.length)
      files[current] = []
    } else if (line && current) {
      files[current].push(line)
    }
  }
  return { files }
}

export async function checkoutBranch(name) {
  await ensureRepo()
  const status = await getStatus()
  if (status.files.length > 0) {
    throw new Error('Working tree has uncommitted changes — commit or stash before switching branches.')
  }
  const { exitCode, stderr } = await git(['checkout', name])
  if (exitCode !== 0) throw new Error(stderr || `Failed to switch to "${name}"`)
  return getStatus()
}

export async function createBranch(name) {
  await ensureRepo()
  const { exitCode, stderr } = await git(['checkout', '-b', name])
  if (exitCode !== 0) throw new Error(stderr || `Failed to create branch "${name}"`)
  return getStatus()
}

// `git branch -m <old> <new>` works whether or not `oldName` is the
// currently checked-out branch — no special-casing needed either way.
export async function renameBranch(oldName, newName) {
  await ensureRepo()
  if (!newName || !newName.trim()) throw new Error('New branch name is required')
  const { exitCode, stderr } = await git(['branch', '-m', oldName, newName.trim()])
  if (exitCode !== 0) throw new Error(stderr || `Failed to rename branch "${oldName}" to "${newName}"`)
  return getStatus()
}

// `push()` auto-adds `--set-upstream origin <branch>` on a branch's first
// push instead of surfacing git's normal "no upstream" failure to the user.
export async function push() {
  await ensureRepo()
  const status = await getStatus()
  if (!status.branch) throw new Error('Not on a branch (detached HEAD) — nothing to push.')
  let result = await git(['push'])
  if (result.exitCode !== 0 && /no upstream branch/i.test(result.stderr)) {
    result = await git(['push', '--set-upstream', 'origin', status.branch])
  }
  if (result.exitCode !== 0) {
    return { ok: false, message: result.stderr || 'git push failed' }
  }
  return { ok: true, message: result.stderr || 'Pushed.' }
}

export async function pull() {
  await ensureRepo()
  const result = await git(['pull'])
  if (result.exitCode !== 0) {
    const status = await getStatus()
    const conflictedFiles = status.files.filter((f) => f.conflicted).map((f) => f.path)
    if (conflictedFiles.length > 0) {
      return {
        ok: false,
        conflicted: true,
        conflictedFiles,
        message: 'Pull hit a merge conflict — resolve it in the Terminal panel, then commit.',
      }
    }
    return { ok: false, message: result.stderr || 'git pull failed' }
  }
  return { ok: true, message: result.stdout.trim() || 'Already up to date.' }
}

// Named `fetchRemote`, not `fetch`, so it doesn't shadow the global fetch API.
export async function fetchRemote() {
  await ensureRepo()
  const result = await git(['fetch'])
  if (result.exitCode !== 0) return { ok: false, message: result.stderr || 'git fetch failed' }
  const status = await getStatus()
  return { ok: true, message: result.stderr.trim() || 'Fetched.', ahead: status.ahead, behind: status.behind }
}

// `git config user.name`/`user.email` with no --local/--global already
// resolve to whatever's effective (local override, else global) — good
// enough for display. Writes always go to --local, though: silently
// mutating the user's global identity from a per-repo settings panel would
// be surprising, and --local is what every other write in this module
// scopes to (this repo) by just not passing a scope flag to begin with.
export async function getGitIdentity() {
  await ensureRepo()
  const [name, email] = await Promise.all([git(['config', 'user.name']), git(['config', 'user.email'])])
  return {
    name: name.exitCode === 0 ? name.stdout.trim() : '',
    email: email.exitCode === 0 ? email.stdout.trim() : '',
  }
}

export async function setGitIdentity(name, email) {
  await ensureRepo()
  if (name) {
    const { exitCode, stderr } = await git(['config', '--local', 'user.name', name])
    if (exitCode !== 0) throw new Error(stderr || 'Failed to set git user.name')
  }
  if (email) {
    const { exitCode, stderr } = await git(['config', '--local', 'user.email', email])
    if (exitCode !== 0) throw new Error(stderr || 'Failed to set git user.email')
  }
  return getGitIdentity()
}
