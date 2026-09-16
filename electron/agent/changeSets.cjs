// Change sets — what generate_code produces. One set per tool call: the full
// new content of every file the model wants to write, the content each file
// had when the set was made, a unified diff between the two, and (once
// applied) a snapshot of what was on disk at apply time so Undo can put it
// back.
//
// This replaces the old "generate_code never writes to disk" rule with a
// narrower one: a write only happens when the permission mode allows it (or a
// human hits Apply), and every write is undoable from the chat.
//
// Disk access goes through an injected `io` ({ read, write, remove }), so the
// logic here is testable without a workspace or Electron (see
// changeSets.test.ts); backendIO() is the real one.
const crypto = require('node:crypto')
const { createTwoFilesPatch, diffLines } = require('diff')
const { withRoot } = require('./backend.cjs')

// Diffs past this size are trimmed before they're sent to the renderer —
// the file itself is still written whole.
const MAX_DIFF_CHARS = 60_000

// id -> set. Sets live in memory only: an undo history, not a record.
const sets = new Map()

function normalizePath(p) {
  return String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
}

function countLines(before, after) {
  let additions = 0
  let deletions = 0
  for (const part of diffLines(before ?? '', after ?? '')) {
    if (part.added) additions += part.count ?? 0
    else if (part.removed) deletions += part.count ?? 0
  }
  return { additions, deletions }
}

function buildDiff(path, before, after) {
  const patch = createTwoFilesPatch(
    before === null ? '/dev/null' : `a/${path}`,
    `b/${path}`,
    before ?? '',
    after,
    '',
    '',
    { context: 3 },
  )
  return patch.length > MAX_DIFF_CHARS ? `${patch.slice(0, MAX_DIFF_CHARS)}\n… diff truncated …` : patch
}

function backendIO(root) {
  return {
    read: (p) =>
      withRoot(root, (b) => {
        try {
          return b.readWorkspaceFile(p).content
        } catch (err) {
          if (err && err.code === 'ENOENT') return null
          throw err
        }
      }),
    write: (p, content) => withRoot(root, (b) => b.writeWorkspaceFile(p, content)),
    remove: (p) => withRoot(root, (b) => b.deleteWorkspacePath(p)),
  }
}

function stateOf(set) {
  if (set.discarded) return 'discarded'
  if (set.files.some((f) => f.applied)) return 'applied'
  if (set.reverted) return 'reverted'
  return 'pending'
}

// What the renderer and the model see — never the raw before/after strings.
function view(set) {
  return {
    id: set.id,
    state: stateOf(set),
    files: set.files.map((f) => ({
      path: f.path,
      status: f.status,
      diff: f.diff,
      additions: f.additions,
      deletions: f.deletions,
      applied: f.applied,
    })),
  }
}

async function create({ root, wcId, sessionId, files }, io = backendIO(root)) {
  // Last entry wins when the model lists one path twice.
  const byPath = new Map()
  for (const file of Array.isArray(files) ? files : []) {
    const p = normalizePath(file?.path)
    if (!p) continue
    byPath.set(p, typeof file.content === 'string' ? file.content : String(file.content ?? ''))
  }
  if (!byPath.size) throw new Error('generate_code needs at least one { path, content } entry.')

  const entries = []
  for (const [p, after] of byPath) {
    const before = await io.read(p)
    entries.push({
      path: p,
      before,
      after,
      status: before === null ? 'added' : before === after ? 'unchanged' : 'modified',
      diff: buildDiff(p, before, after),
      ...countLines(before, after),
      applied: false,
      snapshot: undefined,
    })
  }

  const set = { id: crypto.randomUUID(), root, wcId, sessionId, files: entries, discarded: false, reverted: false }
  sets.set(set.id, set)
  return view(set)
}

function get(id) {
  const set = sets.get(id)
  return set ? view(set) : null
}

// Writes the chosen files (all when `paths` is omitted). The snapshot is read
// at apply time, not reused from creation, so Undo restores what was really
// on disk the moment before this write.
async function apply(id, paths, io) {
  const set = sets.get(id)
  if (!set) throw new Error('That change set no longer exists.')
  const disk = io ?? backendIO(set.root)
  const wanted = Array.isArray(paths) && paths.length ? new Set(paths.map(normalizePath)) : null
  const applied = []
  const failed = []
  for (const file of set.files) {
    if (file.applied || (wanted && !wanted.has(file.path))) continue
    try {
      file.snapshot = await disk.read(file.path)
      if (file.snapshot !== file.after) await disk.write(file.path, file.after)
      file.applied = true
      applied.push(file.path)
    } catch (err) {
      failed.push({ path: file.path, error: err instanceof Error ? err.message : String(err) })
    }
  }
  set.discarded = false
  set.reverted = false
  return { applied, failed, changeSet: view(set) }
}

// Reverts every applied file. A file that changed again since it was applied
// (a human edit, a later change set) is left alone and reported, rather than
// silently clobbering newer work.
async function undo(id, io) {
  const set = sets.get(id)
  if (!set) throw new Error('That change set no longer exists.')
  const disk = io ?? backendIO(set.root)
  const reverted = []
  const conflicts = []
  for (const file of set.files) {
    if (!file.applied) continue
    try {
      const current = await disk.read(file.path)
      if (current !== file.after) {
        conflicts.push({ path: file.path, error: 'Changed again since it was applied — left as is.' })
        continue
      }
      if (file.snapshot === null) await disk.remove(file.path)
      else if (file.snapshot !== current) await disk.write(file.path, file.snapshot)
      file.applied = false
      reverted.push(file.path)
    } catch (err) {
      conflicts.push({ path: file.path, error: err instanceof Error ? err.message : String(err) })
    }
  }
  if (reverted.length && !set.files.some((f) => f.applied)) set.reverted = true
  return { reverted, conflicts, changeSet: view(set) }
}

function discard(id) {
  const set = sets.get(id)
  if (!set) return null
  if (!set.files.some((f) => f.applied)) set.discarded = true
  return view(set)
}

function belongsTo(id, wcId) {
  return sets.get(id)?.wcId === wcId
}

function killForWindow(wcId) {
  for (const [id, set] of sets) {
    if (set.wcId === wcId) sets.delete(id)
  }
}

function killAll() {
  sets.clear()
}

module.exports = { create, get, apply, undo, discard, belongsTo, killForWindow, killAll, normalizePath }
