// Watches a window's open project's `.planning/` folder (plans.json,
// notes.json, stages.json, archive.json — see tools/sleipnir-backend.mjs)
// and pushes a 'planning:changed' event to that window's renderer whenever
// something on disk changes, REGARDLESS of what wrote it. Without this, the
// Planning graph only ever updates when Sleipnir's own UI/AI chat calls an
// IPC method that pushes its own event — an external process (a `claude` CLI
// session, sleipnir-plan.mjs, hand-editing, git pull) writing directly to
// those files had no way to signal the renderer. One watcher per window
// (multi-window support — see main.cjs's windowRoots), re-armed every time
// that window's open project changes.
const fs = require('node:fs')
const path = require('node:path')

const PLANNING_DIR = '.planning'
const DEBOUNCE_MS = 200
const STAGES_FILE = 'stages.json'
// Canvas boards live one level deeper, in .planning/canvas/. fs.watch reports
// nested paths with a separator, so a canvas write arrives as
// 'canvas\foo.json' / 'canvas/foo.json' rather than a bare filename.
const CANVAS_SUBDIR = 'canvas'

// wcId -> { root, sender, watcher, timer, changedFiles }
const entries = new Map()

// Debounced flush carries which filenames changed within the window, so the
// renderer can tell a stages.json-only batch (a sprint-stage tag toggle —
// already reflected live via the stagesStore overlay, see stagesStore.ts and
// GraphCanvas's `stages` prop) apart from a real plans.json/notes.json edit
// that actually needs the graph refetched. Rebuilding the graph on every
// stage toggle was reheating GraphCanvas's force layout and visibly flinging
// nodes around — stage edits don't change graph topology, so they should
// never trigger that path.
//
// `canvasOnly` is the same idea for the other direction: a Canvas board
// autosaves every ~400ms while you drag a frame, and without this flag every
// one of those writes would read as a planning edit and refetch the graph
// mid-drag. Planning ignores canvasOnly batches; Canvas ignores stagesOnly ones.
function isCanvasFile(filename) {
  // fs.watch gives platform-native separators for nested entries.
  return filename.startsWith(`${CANVAS_SUBDIR}/`) || filename.startsWith(`${CANVAS_SUBDIR}\\`)
}

function scheduleNotify(entry, filename) {
  if (filename) entry.changedFiles.add(filename)
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    const changed = entry.changedFiles
    entry.changedFiles = new Set()
    const files = [...changed]
    const stagesOnly = files.length > 0 && files.every((f) => f === STAGES_FILE)
    const canvasOnly = files.length > 0 && files.every(isCanvasFile)
    if (!entry.sender.isDestroyed()) entry.sender.send('planning:changed', { stagesOnly, canvasOnly })
  }, DEBOUNCE_MS)
}

// `.planning/` may not exist yet (a project that's never had a plan/node
// created in it, by Sleipnir or otherwise) — falls back to watching the
// project root non-recursively (cheap: still only reports its *immediate*
// children, not a full recursive walk) purely to notice `.planning` itself
// being created, then upgrades to watching it directly. Every other event in
// the fallback mode is ignored.
function startWatching(entry) {
  const planningDir = path.join(entry.root, PLANNING_DIR)
  const watchingPlanningDir = fs.existsSync(planningDir)
  const target = watchingPlanningDir ? planningDir : entry.root

  let watcher
  try {
    // Recursive once we're on .planning itself, so Canvas boards under
    // .planning/canvas/ are seen — without it those writes report either
    // nothing or a bare 'canvas' directory event, and the renderer could not
    // tell a board autosave apart from a real graph edit. Still non-recursive
    // in the fallback mode below, where a full walk of an arbitrary project
    // root would be expensive and every event is ignored anyway.
    const options = watchingPlanningDir ? { recursive: true } : undefined
    watcher = fs.watch(target, options, (_eventType, filename) => {
      if (!watchingPlanningDir) {
        if (filename !== PLANNING_DIR || !fs.existsSync(planningDir)) return
        entry.watcher?.close()
        startWatching(entry) // upgrade to watching .planning itself
        return
      }
      scheduleNotify(entry, filename)
    })
  } catch {
    return // e.g. the project root itself is gone — nothing to watch
  }
  entry.watcher = watcher
}

function watch(wcId, root, sender) {
  killForWindow(wcId)
  if (!root) return
  const entry = { root, sender, watcher: null, timer: null, changedFiles: new Set() }
  entries.set(wcId, entry)
  startWatching(entry)
}

function killForWindow(wcId) {
  const entry = entries.get(wcId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  entry.watcher?.close()
  entries.delete(wcId)
}

function killAll() {
  for (const wcId of [...entries.keys()]) killForWindow(wcId)
}

module.exports = { watch, killForWindow, killAll }
