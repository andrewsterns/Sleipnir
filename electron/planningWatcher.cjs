// Watches a window's open project's `.planning/` folder (plans.json,
// notes.json, stages.json, archive.json — see tools/sleipnir-backend.mjs)
// and its Canvas board store (`.components/.boards/`), and pushes a
// 'planning:changed' event to that window's renderer whenever something on
// disk changes, REGARDLESS of what wrote it. Without this, the Planning graph
// only ever updates when Sleipnir's own UI/AI chat calls an IPC method that
// pushes its own event — an external process (a `claude` CLI session,
// sleipnir-plan.mjs, hand-editing, git pull) writing directly to those files
// had no way to signal the renderer. One watcher set per window (multi-window
// support — see main.cjs's windowRoots), re-armed every time that window's
// open project changes.
//
// The board store is watched for the same reason. Boards are rewritten from
// outside the open Canvas more often than it looks: the Workspace tree's move
// and delete reconcilers (01_canvas/model/store.ts's reconcileMove /
// reconcileDelete) save every board that pointed at the moved file, and so do
// git checkouts and edits in VS Code. Unwatched, the open board never heard
// about any of it, and its next autosave wrote the stale copy back over the
// fix — undoing promote-by-move without a trace.
const fs = require('node:fs')
const path = require('node:path')

const PLANNING_DIR = '.planning'
// Renamed from `.canvas` (see src/01_canvas/model/store.ts's migrateCanvasFolder).
const CANVAS_DIR = '.components'
const DEBOUNCE_MS = 200
const STAGES_FILE = `${PLANNING_DIR}/stages.json`
// The only part of .canvas the renderer cares about. Component files beside it
// are written by the Canvas itself, and nothing reloads from them.
const BOARDS_PREFIX = `${CANVAS_DIR}/.boards/`
// Legacy board location, still reported while store.ts's migrateLegacyBoards
// moves old boards out of it.
const LEGACY_BOARDS_PREFIX = `${PLANNING_DIR}/canvas/`

// wcId -> { root, sender, watchers: { planning, canvas, root }, timer, changedFiles }
const entries = new Map()

// Debounced flush carries which files changed within the window (as
// root-relative, forward-slash paths), so the renderer can tell a
// stages.json-only batch (a sprint-stage tag toggle — already reflected live
// via the stagesStore overlay, see stagesStore.ts and GraphCanvas's `stages`
// prop) apart from a real plans.json/notes.json edit that actually needs the
// graph refetched. Rebuilding the graph on every stage toggle was reheating
// GraphCanvas's force layout and visibly flinging nodes around — stage edits
// don't change graph topology, so they should never trigger that path.
//
// `canvasOnly` is the same idea for the other direction: a Canvas board
// autosaves every ~400ms while you drag a frame, and without this flag every
// one of those writes would read as a planning edit and refetch the graph
// mid-drag. Planning ignores canvasOnly batches; Canvas ignores stagesOnly ones.
function isCanvasFile(relPath) {
  return relPath.startsWith(BOARDS_PREFIX) || relPath.startsWith(LEGACY_BOARDS_PREFIX)
}

function scheduleNotify(entry, relPath) {
  if (relPath) entry.changedFiles.add(relPath)
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    const files = [...entry.changedFiles]
    entry.changedFiles = new Set()
    const stagesOnly = files.length > 0 && files.every((f) => f === STAGES_FILE)
    const canvasOnly = files.length > 0 && files.every(isCanvasFile)
    if (!entry.sender.isDestroyed()) entry.sender.send('planning:changed', { stagesOnly, canvasOnly })
  }, DEBOUNCE_MS)
}

// fs.watch reports nested entries with platform-native separators
// ('canvas\foo.json' on Windows), relative to the watched directory.
function toRelPath(dir, filename) {
  return filename ? `${dir}/${String(filename).replace(/\\/g, '/')}` : dir
}

// Recursive, so nested entries (`.planning/<plan>/plan.md`,
// `.canvas/.boards/<id>.json`) are seen — without it those writes report
// either nothing or a bare directory event.
//
// If the folder itself goes away (deleted, or renamed — `.canvas` becoming
// `.components`), its watcher is dead from then on; it's dropped and the root
// watched again, so the folder is picked back up when it reappears instead of
// the project silently going deaf to board changes until it's reopened.
function watchDir(entry, key, dir, accept) {
  const abs = path.join(entry.root, dir)
  if (!fs.existsSync(abs)) return null
  const lost = () => {
    if (entries.get(entry.wcId) !== entry || fs.existsSync(abs)) return
    entry.watchers[key]?.close()
    entry.watchers[key] = null
    startWatching(entry)
  }
  try {
    const watcher = fs.watch(abs, { recursive: true }, (_eventType, filename) => {
      const relPath = toRelPath(dir, filename)
      if (accept(relPath)) scheduleNotify(entry, relPath)
      if (!filename) lost()
    })
    watcher.on('error', lost)
    return watcher
  } catch {
    return null
  }
}

const WATCHED = [
  { key: 'planning', dir: PLANNING_DIR, accept: () => true },
  { key: 'canvas', dir: CANVAS_DIR, accept: isCanvasFile },
]

// Either folder may not exist yet (a project that has never had a plan, or
// never had a board). For as long as one is missing, the project root is
// watched NON-recursively — cheap: it reports only its immediate children —
// purely to notice it being created, then the folder itself is watched.
// Every other root event is ignored.
function startWatching(entry) {
  for (const { key, dir, accept } of WATCHED) {
    if (!entry.watchers[key]) entry.watchers[key] = watchDir(entry, key, dir, accept)
  }
  const missing = WATCHED.some(({ key }) => !entry.watchers[key])
  if (!missing) {
    entry.watchers.root?.close()
    entry.watchers.root = null
    return
  }
  if (entry.watchers.root) return
  try {
    entry.watchers.root = fs.watch(entry.root, (_eventType, filename) => {
      // A watched folder that vanished (its watcher can't say so on every
      // platform) is dropped here, when the root reports its name.
      for (const { key, dir } of WATCHED) {
        if (filename === dir && entry.watchers[key] && !fs.existsSync(path.join(entry.root, dir))) {
          entry.watchers[key].close()
          entry.watchers[key] = null
        }
      }
      const created = WATCHED.find(({ key, dir }) => filename === dir && !entry.watchers[key])
      if (!created || !fs.existsSync(path.join(entry.root, created.dir))) return
      startWatching(entry)
      // The folder's first file may have landed before its watcher did.
      // Flagged as a board change for .canvas, so Planning doesn't refetch.
      scheduleNotify(entry, created.key === 'canvas' ? BOARDS_PREFIX : created.dir)
    })
  } catch {
    // e.g. the project root itself is gone — nothing to watch
  }
}

function watch(wcId, root, sender) {
  killForWindow(wcId)
  if (!root) return
  const entry = { wcId, root, sender, watchers: { planning: null, canvas: null, root: null }, timer: null, changedFiles: new Set() }
  entries.set(wcId, entry)
  startWatching(entry)
}

function killForWindow(wcId) {
  const entry = entries.get(wcId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  for (const watcher of Object.values(entry.watchers)) watcher?.close()
  entries.delete(wcId)
}

function killAll() {
  for (const wcId of [...entries.keys()]) killForWindow(wcId)
}

module.exports = { watch, killForWindow, killAll, isCanvasFile, toRelPath }
