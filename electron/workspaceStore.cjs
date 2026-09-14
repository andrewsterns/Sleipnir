// Local storage for the currently-active project and a recent-projects list,
// so relaunching the app reopens the same project and File > Open Recent has
// something to show. Same unencrypted hand-rolled JSON pattern as
// modelStore.cjs (a folder path isn't a secret).
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

const MAX_RECENT = 10

function storePath() {
  return path.join(app.getPath('userData'), 'workspace.json')
}

const EMPTY = { activeProjectPath: null, recentProjects: [], legacySeeded: false }

// Normalizes both the current `{activeProjectPath, recentProjects}` shape
// and the pre-project-system `{lastWorkspacePath}` scalar it replaces — an
// existing install's last-open folder becomes its initial activeProjectPath
// rather than being silently dropped.
function readStore() {
  const p = storePath()
  if (!fs.existsSync(p)) return { ...EMPTY }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    const legacySeeded = data.legacySeeded === true
    if (Array.isArray(data.recentProjects)) {
      return { activeProjectPath: data.activeProjectPath ?? null, recentProjects: data.recentProjects, legacySeeded }
    }
    if (typeof data.lastWorkspacePath === 'string') {
      return { activeProjectPath: data.lastWorkspacePath, recentProjects: [], legacySeeded }
    }
    return { ...EMPTY, legacySeeded }
  } catch {
    return { ...EMPTY }
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2))
}

function getRecentProjects() {
  return readStore().recentProjects
}

function getActiveProjectPath() {
  return readStore().activeProjectPath
}

// Marks `absolutePath` as the active project and moves it to the front of
// the recent list (upsert — an existing entry is replaced, not duplicated).
function touchProject(absolutePath, name) {
  const data = readStore()
  const recentProjects = data.recentProjects.filter((p) => p.path !== absolutePath)
  recentProjects.unshift({ path: absolutePath, name, lastOpened: new Date().toISOString() })
  writeStore({ ...data, activeProjectPath: absolutePath, recentProjects: recentProjects.slice(0, MAX_RECENT) })
}

// Updates a recent entry's cached display name in place — unlike
// touchProject, doesn't reorder the list or bump lastOpened (a rename isn't
// a "the project was just opened" event).
function renameRecentProject(absolutePath, name) {
  const data = readStore()
  const recentProjects = data.recentProjects.map((p) => (p.path === absolutePath ? { ...p, name } : p))
  writeStore({ ...data, recentProjects })
}

// File > New Window — no project is open, but the recent list is untouched.
function clearActiveProject() {
  const data = readStore()
  writeStore({ ...data, activeProjectPath: null })
}

// File > Open Recent > Clear Recent Projects — empties the list without
// closing whatever is currently open (the active project stays active and
// re-enters the list the next time it's opened). Also marks the legacy seed
// as done, so main.cjs's first-launch migration (which fires on an empty
// recent list) doesn't resurrect an entry the human just deleted.
function clearRecentProjects() {
  const data = readStore()
  writeStore({ ...data, recentProjects: [], legacySeeded: true })
}

// True once main.cjs's one-time legacy-planning migration has seeded its
// recent entry — see markLegacySeeded and clearRecentProjects.
function isLegacySeeded() {
  return readStore().legacySeeded
}

function markLegacySeeded() {
  const data = readStore()
  writeStore({ ...data, legacySeeded: true })
}

module.exports = {
  getRecentProjects,
  getActiveProjectPath,
  touchProject,
  renameRecentProject,
  clearActiveProject,
  clearRecentProjects,
  isLegacySeeded,
  markLegacySeeded,
}
