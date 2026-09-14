// Writes the per-agent scaffolding into a project: AGENTS.md, CLAUDE.md,
// GEMINI.md, the three slash-command files, and the vendored CLI. Rendered from
// tools/agentSkills/registry.mjs via ./emitters/, so the instructions exist in
// exactly one place.
//
// Two rules run the whole thing:
//
//   - Never clobber a file the human also owns. AGENTS.md/CLAUDE.md/GEMINI.md
//     are merged block-wise (see ./managedBlock.mjs); everything else is
//     Sleipnir's own and is overwritten when it differs.
//   - Never throw. This runs when a project is opened, so a read-only folder or
//     a name collision has to degrade to "scaffolded less" rather than "failed
//     to open the project". Callers get the problems back in `skipped`.
//
// Idempotence is by direct content comparison rather than a stored hash map: a
// steady-state open renders the same strings, finds them already on disk, and
// performs zero writes. That matters beyond speed — writes under .planning/ wake
// electron/planningWatcher.cjs and push a refresh at the renderer.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILLS, SCAFFOLD_VERSION, PLAN_CLI } from './registry.mjs'
import { emitAll } from './emitters/index.mjs'
import { mergeBlock } from './managedBlock.mjs'

// Read from Sleipnir's own install to be copied into the project. This is the
// one legitimate absolute path in the feature: it's used to *read* a file here,
// never written into anything the project commits.
const VENDOR_CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor', 'plan.mjs')

const STATE_FILE = '.sleipnir/scaffold.json'

// Every file the scaffolder is responsible for, with its desired content.
// Exported so electron/main.cjs's blank-window check and the git-exclude writer
// can both ask "what paths does Sleipnir own here?" without rendering twice.
export function scaffoldFiles() {
  const files = emitAll(SKILLS)
  files.push({ path: PLAN_CLI, content: readVendoredCli(), managed: false })
  return files
}

function readVendoredCli() {
  return fs.readFileSync(VENDOR_CLI, 'utf8')
}

export function scaffoldPaths() {
  return [...scaffoldFiles().map((f) => f.path), STATE_FILE]
}

// The subset Sleipnir owns outright — everything except the files it shares a
// managed block inside. This, and not scaffoldPaths(), is what local-only mode
// hides from git: AGENTS.md/CLAUDE.md/GEMINI.md may carry the human's own
// instructions, and whether *those* get committed is their call, not ours.
// Hiding a file someone wrote is worse than leaving it visible in git status.
export function ownedScaffoldPaths() {
  return [...scaffoldFiles().filter((f) => !f.managed).map((f) => f.path), STATE_FILE]
}

// What would change, without touching disk. Split out from the write so it can
// be tested directly and so a caller can ask "is this project up to date?".
export function planScaffold(root) {
  const writes = []
  const skipped = []

  for (const file of scaffoldFiles()) {
    const abs = path.join(root, file.path)
    let existing = null
    try {
      if (fs.existsSync(abs)) {
        if (fs.statSync(abs).isDirectory()) {
          skipped.push({ path: file.path, reason: 'a directory exists at this path' })
          continue
        }
        existing = fs.readFileSync(abs, 'utf8')
      }
    } catch (err) {
      skipped.push({ path: file.path, reason: messageOf(err) })
      continue
    }

    const next = file.managed
      ? mergeBlock(existing, SCAFFOLD_VERSION, file.content)
      : existing === file.content
        ? null
        : file.content

    if (next !== null) writes.push({ path: file.path, abs, content: next })
  }

  return { writes, skipped }
}

// The main entry point, called when a project is opened. `commit: false` keeps
// the scaffolding out of git via .git/info/exclude instead of .gitignore.
export function ensureAgentScaffolding(root, { commit = true } = {}) {
  if (!root) return { written: [], skipped: [], excluded: [] }

  const { writes, skipped } = planScaffold(root)
  const written = []

  for (const write of writes) {
    try {
      fs.mkdirSync(path.dirname(write.abs), { recursive: true })
      fs.writeFileSync(write.abs, write.content)
      written.push(write.path)
    } catch (err) {
      skipped.push({ path: write.path, reason: messageOf(err) })
    }
  }

  // Only touch the state file when something else actually changed, so an
  // unchanged project stays byte-for-byte untouched on open.
  if (written.length) writeState(root, skipped)

  // scaffold.json stays out of git even in share mode: it is a purely
  // informational record (when this machine last wrote the files, and what it
  // skipped), never an input to any decision, and it carries a timestamp. Commit
  // it and every teammate who opens the project rewrites it, for nothing but
  // diff noise.
  const excluded = excludeFromGit(root, commit ? [STATE_FILE] : ownedScaffoldPaths())
  return { written, skipped, excluded }
}

function writeState(root, skipped) {
  const abs = path.join(root, STATE_FILE)
  const state = {
    version: SCAFFOLD_VERSION,
    generatedAt: new Date().toISOString(),
    skills: SKILLS.map((s) => s.id),
    ...(skipped.length ? { skipped } : {}),
  }
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, `${JSON.stringify(state, null, 2)}\n`)
  } catch {
    // Losing the state file costs nothing — it's a record, not an input.
  }
}

export function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'))
  } catch {
    return null
  }
}

// --- keeping it out of git -------------------------------------------------

const EXCLUDE_BEGIN = '# BEGIN SLEIPNIR — generated agent scaffolding, kept local'
const EXCLUDE_END = '# END SLEIPNIR'

// .git/info/exclude, deliberately, not .gitignore: it is per-clone and is itself
// never committed, so "I want these files locally but don't want to push them"
// costs the repo nothing and shows up in nobody else's diff.
function excludeFromGit(root, relPaths) {
  const info = gitInfoDir(root)
  if (!info) return []

  const abs = path.join(info, 'exclude')
  let existing = ''
  try {
    if (fs.existsSync(abs)) existing = fs.readFileSync(abs, 'utf8')
  } catch {
    return []
  }

  const body = [EXCLUDE_BEGIN, ...relPaths.map((p) => `/${p}`), EXCLUDE_END].join('\n')
  const begin = existing.indexOf(EXCLUDE_BEGIN)
  const end = existing.indexOf(EXCLUDE_END)

  let next
  if (begin !== -1 && end > begin) {
    next = existing.slice(0, begin) + body + existing.slice(end + EXCLUDE_END.length)
  } else {
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
    next = `${existing}${separator}${body}\n`
  }

  if (next === existing) return relPaths
  try {
    fs.mkdirSync(info, { recursive: true })
    fs.writeFileSync(abs, next)
    return relPaths
  } catch {
    return []
  }
}

// Resolves .git/info, following the gitdir pointer when .git is a file rather
// than a directory (a worktree or submodule checkout).
function gitInfoDir(root) {
  const dotGit = path.join(root, '.git')
  try {
    if (!fs.existsSync(dotGit)) return null
    const stat = fs.statSync(dotGit)
    if (stat.isDirectory()) return path.join(dotGit, 'info')
    const pointer = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)
    if (!pointer) return null
    return path.join(path.resolve(root, pointer[1].trim()), 'info')
  } catch {
    return null
  }
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err)
}
