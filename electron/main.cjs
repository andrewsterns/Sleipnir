// Electron main process. CommonJS on purpose (`.cjs`) so it runs the same
// way regardless of package.json's "type": "module" — avoids ESM/CJS
// friction in the one place that matters for packaging. The actual
// filesystem logic is never duplicated here: it's dynamically imported from
// tools/sleipnir-backend.mjs (ESM), the same module the Vite dev server's
// HTTP middleware (vite.config.ts) calls for the web transport.
const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const terminal = require('./terminal.cjs')
const chat = require('./chat.cjs')
const preview = require('./preview.cjs')
const commandRunner = require('./commandRunner.cjs')
const validation = require('./validation.cjs')
const apiKeyStore = require('./apiKeyStore.cjs')
const modelStore = require('./modelStore.cjs')
const agentSettingsStore = require('./agent/agentSettingsStore.cjs')
const workspaceStore = require('./workspaceStore.cjs')
const planningWatcher = require('./planningWatcher.cjs')
const { initUpdater } = require('./updater.cjs')

// Two Sleipnir processes sharing one userData dir (e.g. the app launched
// twice, or a leftover dev instance still running when a packaged build
// starts) race each other for the same GPU/disk cache and can corrupt or
// lock it out from under one another — observed firsthand as "Access is
// denied" GPU cache errors when a second instance came up. Bail out of the
// loser immediately (top-level `return` is valid here only because this
// file is genuinely CommonJS, per the file-level note above) and just focus
// the window that's already open instead of standing up a second one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
  return
}
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// Last-resort main-process error handlers. Without these, a stray throw or
// rejected promise surfaces Electron's raw "A JavaScript error occurred in
// the main process" dialog (or takes the app down silently) — and we'd have
// zero visibility into what broke for a user. Kept non-fatal on purpose: in
// this app these are almost always window/lifecycle races (e.g. touching a
// just-destroyed webContents), not corrupted state, and a desktop IDE should
// stay up rather than hard-crash. Written to userData/logs/main.log so a user
// can actually send a crash report.
function logMainError(kind, err) {
  const line = `[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : String(err)}\n`
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'main.log'), line)
  } catch {
    // Logging must never itself throw — swallow and fall through to console.
  }
  console.error(line)
}
process.on('uncaughtException', (err) => logMainError('uncaughtException', err))
process.on('unhandledRejection', (reason) => logMainError('unhandledRejection', reason))

const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:5183'

let backend

// Per-window open project — the core of multi-window support. Each window
// edits its own project independently: every workspace/planning/git IPC call
// resolves against the *calling* window's root (see the `ws` wrapper in
// registerIpcHandlers), not one app-wide global. `windowRoots` maps a
// window's webContents id -> its absolute project root (absent/undefined =
// blank, no project). The backend still tracks one root at a time
// (workspace-root.mjs), so `ws` sets it to the caller's root right before
// each synchronous backend call.
const windowRoots = new Map()

// wcId -> resolve fn, for the save-on-close round-trip (see createWindow's
// 'close' handler / handleCloseAttempt below). Keyed by window so responses
// from one window's renderer can't be consumed by another window's pending
// close, since ipcMain.handle callbacks are registered once globally.
const pendingBeforeClose = new Map()
const pendingSaveBeforeClose = new Map()

// A per-WINDOW "scratch" project, used whenever a window has no real folder
// open — so plans/notes/files can be created immediately (nothing errors with
// "No project is open") and relocated to a real folder later via
// saveScratchToFolder. Its .planning holds an 'Untitled' project.json so
// getWorkspaceInfo reads back a friendly name rather than the userData basename.
//
// Deliberately per-window and disposable, not one stable shared folder. A
// single app-wide scratch dir made "blank window" a lie in two ways: two blank
// windows open at once silently shared one notes.json (each one's Planning
// board stomping the other's, contradicting the per-window isolation
// windowRoots exists to provide), and — since the dir was only ever cleared by
// saveScratchToFolder — a blank window opened weeks later still showed
// whatever was built in the last unsaved session. Each window now gets its own
// directory, discarded when that window closes (see discardScratch), so blank
// means blank.
const scratchRoots = new Map() // wcId -> absolute scratch dir

function scratchParentDir() {
  return path.join(app.getPath('userData'), 'ScratchProjects')
}

function getScratchRoot(wcId) {
  let root = scratchRoots.get(wcId)
  if (!root) {
    root = path.join(scratchParentDir(), `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`)
    scratchRoots.set(wcId, root)
  }
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true })
  const meta = path.join(root, '.planning', 'project.json')
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ name: 'Untitled' }, null, 2))
  return root
}

// Drops a window's scratch dir and forgets it. Called once the window is gone
// (its close prompt already gave the human the chance to save the contents),
// so nothing survives into the next window or the next launch.
function discardScratch(wcId) {
  const root = scratchRoots.get(wcId)
  scratchRoots.delete(wcId)
  if (!root) return
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // Locked by an editor/AV or already gone — the startup sweep gets it later.
  }
}

// Crash leftovers: a hard kill skips every 'closed' handler, so scratch dirs
// can outlive their window. Swept once at launch, before any window exists.
// Unconditional rather than age-based because the single-instance lock at the
// top of this file guarantees no other Sleipnir is running to own them — every
// dir found here is by definition abandoned.
function sweepOrphanScratchDirs() {
  const parent = scratchParentDir()
  if (!fs.existsSync(parent)) return
  for (const entry of fs.readdirSync(parent)) {
    try {
      fs.rmSync(path.join(parent, entry), { recursive: true, force: true })
    } catch {
      // Locked (an editor still holding a file) — harmless, nothing reads it.
    }
  }
}

// The seeded skeleton every scratch dir has from birth (see getScratchRoot and
// the backend's ensurePlanningDir, which drops a README into any .planning/ it
// touches). Present in an untouched scratch, so neither counts as content the
// human would want to be asked about on close.
const SEEDED_PLANNING_FILES = new Set(['project.json', 'README.md'])

// The same idea one level up: entries every project gets at its root from
// birth, written by the backend's ensureAgentScaffolding rather than by the
// human. Without this, a single generated AGENTS.md makes every untouched
// scratch window report "has content" and prompt to save on close.
// Keep in sync with the emitted paths in tools/agentSkills/scaffold.mjs.
const SEEDED_ROOT_ENTRIES = new Set([
  '.planning',
  '.sleipnir',
  '.claude',
  '.codex',
  '.gemini',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
])

// True when a planning JSON file holds nothing the human actually created —
// the empty shapes readNotesFile/readPlansFile write out. Anything that fails
// to parse counts as content: better a needless prompt than a silent delete.
function isEmptyPlanningFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (Array.isArray(parsed)) return parsed.length === 0
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed).every((v) => (Array.isArray(v) ? v.length === 0 : !v))
    }
    return false
  } catch {
    return false
  }
}

// Whether a scratch project holds anything worth offering to save: any file
// the human created at its root (scaffolded nodes land in a folder there — see
// AddNodeModal.ViewModel's effectiveFolder), any canvas board, or any
// non-empty planning data.
function scratchHasContent(root) {
  if (!root || !fs.existsSync(root)) return false
  if (fs.readdirSync(root).some((entry) => !SEEDED_ROOT_ENTRIES.has(entry))) return true

  const planningDir = path.join(root, '.planning')
  if (!fs.existsSync(planningDir)) return false
  for (const entry of fs.readdirSync(planningDir, { withFileTypes: true })) {
    if (SEEDED_PLANNING_FILES.has(entry.name)) continue
    const abs = path.join(planningDir, entry.name)
    if (entry.isDirectory()) {
      if (fs.readdirSync(abs).length > 0) return true
      continue
    }
    if (!isEmptyPlanningFile(abs)) return true
  }
  return false
}

// Copies a scratch project's entire contents into `dest` (force-overwriting
// same-named entries if the chosen folder isn't empty). Shared by the File ▸
// Save Project to Folder… handler and the save-on-close prompt.
function copyScratchInto(scratch, dest) {
  for (const entry of fs.readdirSync(scratch)) {
    fs.cpSync(path.join(scratch, entry), path.join(dest, entry), { recursive: true, force: true })
  }
  // If the scratch name was never customized (still the default 'Untitled'),
  // drop the copied name so the saved project's name derives from the folder
  // the user chose instead of reading back as "Untitled". Only the `name` key
  // goes — project.json also carries the project's agentScaffolding config
  // (see the backend's writeProjectMeta), which must survive the save.
  const destMeta = path.join(dest, '.planning', 'project.json')
  try {
    const meta = JSON.parse(fs.readFileSync(destMeta, 'utf8'))
    if (meta && meta.name === 'Untitled') {
      const { name, ...rest } = meta
      if (Object.keys(rest).length) fs.writeFileSync(destMeta, JSON.stringify(rest, null, 2))
      else fs.rmSync(destMeta, { force: true })
    }
  } catch {
    // No/invalid project.json — nothing to normalize.
  }
}

function rootForSender(sender) {
  // Fall back to this window's scratch project so the backend always has a root
  // to write into — a window with no chosen project is "unsaved", not unusable.
  return windowRoots.get(sender.id) || getScratchRoot(sender.id)
}

// Every place a window's open project changes goes through here instead of
// windowRoots.set directly, so the planning file watcher (see
// planningWatcher.cjs) always stays in sync with whichever project a window
// currently has open, without each call site having to remember it.
function setWindowRoot(sender, root) {
  windowRoots.set(sender.id, root)
  planningWatcher.watch(sender.id, root, sender)
  ensureAgentScaffoldingSoon(root)
}

// Drops/refreshes the generated agent files (AGENTS.md, CLAUDE.md, the /plan
// slash commands, the vendored CLI — see tools/agentSkills/scaffold.mjs) for
// whichever project a window just opened. setWindowRoot is the one chokepoint
// every open path funnels through: the four IPC handlers below, and createWindow
// for the boot restore.
//
// Deferred on purpose. createWindow runs before the first window paints, and the
// scaffolder is a handful of synchronous file writes — worth nothing to the user
// if it delays the app appearing. A steady-state open writes nothing anyway,
// since the scaffolder compares rendered content against disk first.
//
// Scratch windows (root === null) are skipped: their folder lives under
// userData, where no terminal agent is ever going to be run.
function ensureAgentScaffoldingSoon(root) {
  if (!root) return
  setImmediate(() => {
    getBackend()
      .then((b) => b.ensureAgentScaffolding(root))
      .catch((err) => logMainError('agent-scaffolding', err))
  })
}

// True when the window has no *chosen* project — i.e. it's operating on the
// scratch project. Drives the renderer's "unsaved" label + Save action.
function isScratchWindow(sender) {
  return !windowRoots.get(sender.id)
}

function setWindowTitle(win, projectName) {
  if (win && !win.isDestroyed()) {
    win.setTitle(projectName ? `Sleipnir — ${projectName}` : 'Sleipnir')
  }
}

// Re-title every window currently showing `root` — Rename Project can affect
// more than the window that triggered it if several have the same project open.
function retitleWindowsForRoot(root, projectName) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (windowRoots.get(win.webContents.id) === root) setWindowTitle(win, projectName)
  }
}

async function getBackend() {
  if (!backend) {
    // Dynamic import() needs a file:// URL for absolute paths on Windows —
    // a raw drive-letter path (C:\...) is rejected by the ESM loader.
    const backendPath = path.join(__dirname, '..', 'tools', 'sleipnir-backend.mjs')
    backend = await import(pathToFileURL(backendPath).href)
  }
  return backend
}

async function startLspProxy() {
  const lspProxyPath = path.join(__dirname, '..', 'tools', 'lsp-proxy.mjs')
  const { startLspProxy: start } = await import(pathToFileURL(lspProxyPath).href)
  start(7081)
}

// Kills the proxy's tsserver child(ren) on quit — only meaningful when THIS
// process actually started the proxy (see the `!isDev` guards below and at
// startLspProxy's own call site: in dev, the Vite dev server owns the proxy
// instead, and killing it from here would be a no-op on a different process's
// module state anyway).
async function stopLspProxy() {
  const lspProxyPath = path.join(__dirname, '..', 'tools', 'lsp-proxy.mjs')
  const { stopLspProxy: stop } = await import(pathToFileURL(lspProxyPath).href)
  stop()
}

// Every handler mirrors src/00_planning/api/PlatformAPI.ts exactly — the
// renderer (electronApi.ts) never needs to know these are IPC calls instead
// of fetch() calls.
function registerIpcHandlers() {
  ipcMain.handle('sleipnir:regenerateGraph', async () => {
    const b = await getBackend()
    return b.regenerateGraph()
  })
  ipcMain.handle('sleipnir:readFile', async (_e, filePath) => {
    const b = await getBackend()
    return b.readFile(filePath)
  })
  ipcMain.handle('sleipnir:writeFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.writeFile(filePath, content)
  })
  ipcMain.handle('sleipnir:listDir', async (_e, dirPath) => {
    const b = await getBackend()
    return b.listDir(dirPath)
  })
  ipcMain.handle('sleipnir:listRepoDir', async (_e, dirPath, extraFiles) => {
    const b = await getBackend()
    return b.listRepoDir(dirPath, extraFiles)
  })
  ipcMain.handle('sleipnir:readRepoFile', async (_e, filePath) => {
    const b = await getBackend()
    return b.readRepoFile(filePath)
  })
  ipcMain.handle('sleipnir:writeRepoFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.writeRepoFile(filePath, content)
  })
  ipcMain.handle('sleipnir:createFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.createFile(filePath, content)
  })
  ipcMain.handle('sleipnir:createDir', async (_e, dirPath) => {
    const b = await getBackend()
    b.createDir(dirPath)
  })
  // Every handler below resolves against the CALLING window's project (see
  // windowRoots / the multi-window note above). `ws` awaits the backend, sets
  // the shared root to the caller's, then runs the body — the root-set and the
  // (synchronous) backend call run with no await between them, so two windows'
  // concurrent calls can never land on the wrong root. The SRC_ROOT/REPO_ROOT
  // handlers above (readFile/listDir/…) stay pinned to Sleipnir's own repo and
  // deliberately do NOT go through this.
  const ws = (channel, fn) =>
    ipcMain.handle(channel, async (event, ...args) => {
      const b = await getBackend()
      b.setWorkspaceRoot(rootForSender(event.sender))
      return fn(b, event, ...args)
    })

  ws('sleipnir:getWorkspaceInfo', (b, e) => ({ ...b.getWorkspaceInfo(), isScratch: isScratchWindow(e.sender) }))
  ws('sleipnir:listWorkspaceDir', (b, _e, dirPath) => b.listWorkspaceDir(dirPath))
  ws('sleipnir:readWorkspaceFile', (b, _e, filePath) => b.readWorkspaceFile(filePath))
  ws('sleipnir:writeWorkspaceFile', (b, _e, filePath, content) => { b.writeWorkspaceFile(filePath, content) })
  ws('sleipnir:createWorkspaceFile', (b, _e, filePath, content) => { b.createWorkspaceFile(filePath, content) })
  ws('sleipnir:createWorkspaceDir', (b, _e, dirPath) => { b.createWorkspaceDir(dirPath) })
  // Moves to the OS Recycle Bin rather than the backend's own permanent
  // deleteWorkspacePath (fs.rmSync) — shell.trashItem is Electron-only.
  // resolveWorkspacePath reads the (now caller-scoped) root synchronously,
  // before the await, so the trash target is correct for this window.
  ws('sleipnir:deleteWorkspacePath', async (b, _e, filePath) => {
    const absPath = b.resolveWorkspacePath(filePath)
    await shell.trashItem(absPath)
  })
  ws('sleipnir:renameWorkspacePath', (b, _e, fromPath, toPath) => { b.renameWorkspacePath(fromPath, toPath) })
  ws('sleipnir:copyWorkspacePath', (b, _e, fromPath, toPath) => { b.copyWorkspacePath(fromPath, toPath) })
  ws('sleipnir:searchWorkspace', (b, _e, query, opts) => b.searchWorkspace(query, opts))
  ws('sleipnir:detectPreviewConfig', (b, _e, folderPath) => b.detectPreviewConfig(folderPath))
  ws('sleipnir:getPreviewConfig', (b, _e, folderPath) => b.getPreviewConfig(folderPath))
  ws('sleipnir:setPreviewConfig', (b, _e, folderPath, config) => b.setPreviewConfig(folderPath, config))
  ws('sleipnir:getArchivedPaths', (b) => b.getArchivedPaths())
  ws('sleipnir:setArchived', (b, _e, filePath, archived, label) => b.setArchived(filePath, archived, label))
  ws('sleipnir:getNotes', (b) => b.getNotes())
  ws('sleipnir:addNote', (b, _e, map, label, description) => b.addNote(map, label, description))
  ws('sleipnir:scaffoldNodes', (b, _e, map, entries, links) => b.scaffoldNodes(map, entries, links))
  ws('sleipnir:createPlanNode', (b, _e, planId, label, description, parentId) => b.createPlanNode(planId, label, description, parentId))
  ws('sleipnir:proposeFileNode', (b, _e, planId, label, description, filePath, content, parentId, linkTargetIds) =>
    b.proposeFileNode(planId, label, description, filePath, content, parentId, linkTargetIds))
  ws('sleipnir:setNodeStatus', (b, _e, id, status) => b.setNodeStatus(id, status))
  ws('sleipnir:setNodeBorrows', (b, _e, nodeId, targetIds) => b.setNodeBorrows(nodeId, targetIds))
  ws('sleipnir:updatePlannedFilePath', (b, _e, nodeId, plannedPath) => b.updatePlannedFilePath(nodeId, plannedPath))
  ws('sleipnir:updateNote', (b, _e, id, patch) => b.updateNote(id, patch))
  ws('sleipnir:deleteNote', (b, _e, id) => b.deleteNote(id))
  ws('sleipnir:getNodeStages', (b) => b.getNodeStages())
  ws('sleipnir:setNodeStage', (b, _e, id, stage) => b.setNodeStage(id, stage))
  ws('sleipnir:setDefaultNodeStages', (b, _e, ids, stage) => b.setDefaultNodeStages(ids, stage))
  ws('sleipnir:getPlans', (b) => b.getPlans())
  ws('sleipnir:createPlan', (b, _e, label, nodeIds, assetPaths, assetEdges, assetFolders) => b.createPlan(label, nodeIds, assetPaths, assetEdges, assetFolders))
  ws('sleipnir:appendPlanGeneratedFiles', (b, _e, id, paths) => b.appendPlanGeneratedFiles(id, paths))
  ws('sleipnir:addPlanNodes', (b, _e, id, nodeIds) => b.addPlanNodes(id, nodeIds))
  ws('sleipnir:approvePlanNodes', (b, _e, planId) => b.approvePlanNodes(planId))
  ws('sleipnir:addPlanAssets', (b, _e, id, paths, folders) => b.addPlanAssets(id, paths, folders))
  ws('sleipnir:renamePlan', (b, _e, id, label) => b.renamePlan(id, label))
  ws('sleipnir:checkPlanningPaths', (b) => b.checkPlanningPaths())
  ws('sleipnir:relinkPlanningPath', (b, _e, from, to) => b.relinkPlanningPath(from, to))
  ws('sleipnir:removePlanningRef', (b, _e, filePath) => b.removePlanningRef(filePath))
  ws('sleipnir:deletePlan', (b, _e, id, opts) => b.deletePlan(id, opts))
  ws('sleipnir:runScript', (b, _e, filePath) => b.runScript(filePath))

  ws('sleipnir:getGitStatus', (b) => b.getGitStatus())
  ws('sleipnir:getGitDiff', (b, _e, filePath, staged) => b.getGitDiff(filePath, staged))
  ws('sleipnir:stageFiles', (b, _e, paths) => b.stageFiles(paths))
  ws('sleipnir:unstageFiles', (b, _e, paths) => b.unstageFiles(paths))
  ws('sleipnir:discardFiles', (b, _e, paths) => b.discardFiles(paths))
  ws('sleipnir:commitChanges', (b, _e, message) => b.commitChanges(message))
  ws('sleipnir:getBranches', (b) => b.getBranches())
  ws('sleipnir:getBranchTree', (b) => b.getBranchTree())
  ws('sleipnir:getCommitGraph', (b) => b.getCommitGraph())
  ws('sleipnir:getCommitFileMap', (b) => b.getCommitFileMap())
  ws('sleipnir:checkoutBranch', (b, _e, name) => b.checkoutBranch(name))
  ws('sleipnir:createBranch', (b, _e, name) => b.createBranch(name))
  ws('sleipnir:renameBranch', (b, _e, oldName, newName) => b.renameBranch(oldName, newName))
  ws('sleipnir:gitPush', (b) => b.gitPush())
  ws('sleipnir:gitPull', (b) => b.gitPull())
  ws('sleipnir:gitFetch', (b) => b.gitFetch())
  ws('sleipnir:gitStashPush', (b, _e, message) => b.gitStashPush(message))
  ws('sleipnir:gitStashList', (b) => b.gitStashList())
  ws('sleipnir:gitStashApply', (b, _e, ref) => b.gitStashApply(ref))
  ws('sleipnir:gitStashPop', (b, _e, ref) => b.gitStashPop(ref))
  ws('sleipnir:gitStashDrop', (b, _e, ref) => b.gitStashDrop(ref))
  ws('sleipnir:gitInit', (b) => b.gitInit())
  ws('sleipnir:gitAddRemote', (b, _e, url, name) => b.gitAddRemote(url, name))
  ws('sleipnir:getGitIdentity', (b) => b.getGitIdentity())
  ws('sleipnir:setGitIdentity', (b, _e, name, email) => b.setGitIdentity(name, email))

  // Generated agent scaffolding (AGENTS.md, CLAUDE.md, the /plan slash commands,
  // the vendored CLI). Project-scoped: the toggle lives in this project's own
  // .planning/project.json, so it travels with the project rather than the
  // machine — same reasoning as the git identity pair above.
  ws('sleipnir:getAgentScaffolding', (b) => b.getAgentScaffoldingState())
  ws('sleipnir:setAgentScaffolding', (b, _e, patch) => b.setAgentScaffolding(null, patch))

  // Terminal — a streaming/event-based channel, not request/response like
  // everything above. `spawn` returns a session id; data/exit flow back as
  // push events on 'terminal:data'/'terminal:exit' tagged with that id.
  ipcMain.handle('terminal:spawn', (event, cols, rows) => {
    // Open the shell in the calling window's project (falling back to the
    // app's own cwd when that window has none) — part of per-window isolation.
    const { id, term } = terminal.spawnSession(cols, rows, rootForSender(event.sender) || process.cwd(), event.sender.id)
    const sender = event.sender
    term.onData((data) => {
      if (!sender.isDestroyed()) sender.send('terminal:data', id, data)
    })
    term.onExit(({ exitCode }) => {
      if (!sender.isDestroyed()) sender.send('terminal:exit', id, exitCode)
    })
    return { id }
  })
  ipcMain.on('terminal:write', (_e, id, data) => terminal.write(id, data))
  ipcMain.on('terminal:resize', (_e, id, cols, rows) => terminal.resize(id, cols, rows))
  ipcMain.on('terminal:kill', (_e, id) => terminal.kill(id))

  // AI chat — same streaming/event-based shape as terminal above. Unlike
  // spawn/write/resize (fire-and-forget once the session exists), each chat
  // message is its own request/response-shaped `invoke` call whose actual
  // result streams back as 'chat:token'/'chat:planNodeCreated'/'chat:done'
  // push events tagged with the session id, since a single Anthropic
  // streaming call has a clear start and end (unlike a long-lived shell).
  ipcMain.handle('chat:sendMessage', (event, sessionId, history, message, options) =>
    chat.sendMessage(event.sender, sessionId, history, message, rootForSender(event.sender), options),
  )
  ipcMain.on('chat:cancel', (_e, sessionId) => chat.cancel(sessionId))
  // Answers a tool call waiting on approval (see agent/permissions.cjs) —
  // scoped to the calling window, so one window can't approve another's.
  ipcMain.on('chat:toolDecision', (event, callId, decision, paths) =>
    chat.resolveToolDecision(event.sender.id, callId, decision, paths),
  )
  ipcMain.handle('chat:applyChangeSet', (event, id, paths) => chat.applyChangeSet(event.sender.id, id, paths))
  ipcMain.handle('chat:undoChangeSet', (event, id) => chat.undoChangeSet(event.sender.id, id))

  // Validation — runs the open Workspace's own `vitest run --reporter=json`
  // via commandRunner (see validation.cjs). Same fire-and-forget + push-events
  // shape as preview:start/preview:stop above.
  ipcMain.on('validation:run', (event, sessionId) => {
    validation.run(event.sender, sessionId, rootForSender(event.sender))
  })
  ipcMain.on('validation:stop', (_e, sessionId) => validation.stop(sessionId))

  // Save-on-close round trip (see handleCloseAttempt below) — the renderer
  // answers a pushed 'app:beforeClose'/'app:saveBeforeClose' event via these
  // invoke() calls, resolved against THIS window's own pending map entry
  // (event.sender.id), so concurrent close attempts in different windows
  // can't cross-resolve each other's promise.
  ipcMain.handle('app:beforeCloseResponse', (event, hasUnsavedChanges) => {
    pendingBeforeClose.get(event.sender.id)?.(hasUnsavedChanges)
    pendingBeforeClose.delete(event.sender.id)
  })
  ipcMain.handle('app:saveBeforeCloseDone', (event) => {
    pendingSaveBeforeClose.get(event.sender.id)?.()
    pendingSaveBeforeClose.delete(event.sender.id)
  })

  // Prototype live preview — same streaming/event-based shape as terminal
  // above. `start` is fire-and-forget (like terminal:write, not
  // terminal:spawn): the session id is the folder's own repo-relative path,
  // already known to the caller, so there's no handshake needed to obtain
  // one. Status (installing/starting/ready/error) flows back as
  // 'preview:status' push events tagged with that same id.
  ipcMain.on('preview:start', (event, folderPath, config) => preview.start(event.sender, folderPath, config))
  ipcMain.on('preview:stop', (_e, folderPath) => preview.stop(folderPath))

  // BYOK settings — request/response. Keys are stored encrypted-at-rest
  // (see apiKeyStore.cjs) and never sent back to the renderer once saved.
  ipcMain.handle('settings:getKeyStatus', (_e, provider) => apiKeyStore.getKeyStatus(provider))
  ipcMain.handle('settings:setKey', (_e, provider, key) => {
    apiKeyStore.setKey(provider, key)
    return apiKeyStore.getKeyStatus(provider)
  })
  ipcMain.handle('settings:clearKey', (_e, provider) => {
    apiKeyStore.clearKey(provider)
    return apiKeyStore.getKeyStatus(provider)
  })

  // Chat model preference — plain (unencrypted) local storage, see modelStore.cjs.
  ipcMain.handle('settings:getModel', () => ({ model: modelStore.getModel(), options: modelStore.AVAILABLE_MODELS }))
  ipcMain.handle('settings:setModel', (_e, model) => modelStore.setModel(model))

  // Agent preferences — default permission mode and tool-step cap.
  ipcMain.handle('settings:getAgentSettings', () => agentSettingsStore.getSettings())
  ipcMain.handle('settings:setAgentSettings', (_e, patch) => agentSettingsStore.setSettings(patch))

  // Workspace's whole point is opening any project on disk — no
  // defaultPath/containment check. Persists the choice so relaunching
  // reopens it.
  ipcMain.handle('sleipnir:openWorkspace', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const b = await getBackend()
    try {
      const info = b.openWorkspace(result.filePaths[0])
      // Bind the project to THIS window only — other windows keep theirs.
      setWindowRoot(event.sender, info.root)
      workspaceStore.touchProject(info.root, info.name)
      setWindowTitle(win, info.name)
      return info
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Relocates the scratch project (everything under it — .planning plus any
  // files created while unsaved) into a real folder the user picks, then
  // repoints THIS window to that folder and resets scratch for the next unsaved
  // session. This is the "save into some dir later" half of the scratch flow.
  ipcMain.handle('sleipnir:saveScratchToFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const dest = result.filePaths[0]
    const b = await getBackend()
    try {
      copyScratchInto(getScratchRoot(event.sender.id), dest)
      // This window has a real project now, so its scratch dir has no further
      // purpose — drop it rather than leave a stale copy behind. The next
      // window with no project gets a fresh one of its own.
      discardScratch(event.sender.id)
      const info = b.openWorkspace(dest)
      setWindowRoot(event.sender, info.root)
      workspaceStore.touchProject(info.root, info.name)
      setWindowTitle(win, info.name)
      return { ...info, isScratch: false }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('sleipnir:getRecentProjects', () => ({ projects: workspaceStore.getRecentProjects() }))

  // File > Open Recent > Clear Recent Projects — forgets the list only. The
  // caller's project (and every other window's) stays open and untouched;
  // each one re-enters the list next time it's opened. Returns the (now
  // empty) list so the renderer can reuse its getRecentProjects handling.
  ipcMain.handle('sleipnir:clearRecentProjects', () => {
    workspaceStore.clearRecentProjects()
    return { projects: workspaceStore.getRecentProjects() }
  })

  // Reopens a project from File > Open Recent into the CALLING window (its
  // Workspace tabs remount, its Planning board reloads from that project's own
  // .planning/ folder), skipping the folder-picker since the path is known.
  ipcMain.handle('sleipnir:openRecentProject', async (event, projectPath) => {
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      return { error: `Folder no longer exists: ${projectPath}` }
    }
    const b = await getBackend()
    try {
      const info = b.openWorkspace(projectPath)
      setWindowRoot(event.sender, info.root)
      workspaceStore.touchProject(info.root, info.name)
      setWindowTitle(BrowserWindow.fromWebContents(event.sender), info.name)
      return info
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Clone `url` into a folder the user picks, then open the result as this
  // window's project — same "repoint the window" flow as openWorkspace, just
  // preceded by a git clone. Returns WorkspaceInfo (or { error }).
  ipcMain.handle('sleipnir:cloneRepo', async (event, url) => {
    if (!url || !String(url).trim()) return { error: 'Enter a repository URL to clone.' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = await dialog.showOpenDialog(win, {
      title: 'Choose a folder to clone into',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    const parent = picked.filePaths[0]
    // Repo name from the URL (…/Sleipnir.git → Sleipnir, git@host:u/r.git → r),
    // de-conflicted so a clone never lands on top of an existing folder.
    const base = String(url).trim().replace(/\.git$/i, '').replace(/[/\\]+$/, '').split(/[/:]/).pop() || 'repo'
    const name = base.replace(/[^A-Za-z0-9._-]/g, '') || 'repo'
    let dest = path.join(parent, name)
    for (let i = 1; fs.existsSync(dest); i++) dest = path.join(parent, `${name}-${i}`)
    const b = await getBackend()
    try {
      const cloned = await b.gitClone(url, dest)
      if (!cloned.ok) return { error: cloned.message }
      const info = b.openWorkspace(dest)
      setWindowRoot(event.sender, info.root)
      workspaceStore.touchProject(info.root, info.name)
      setWindowTitle(win, info.name)
      return info
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  // File > New Window — opens a brand-new, blank OS window (its own project,
  // starting empty). The window that triggered this keeps its project fully
  // intact; nothing here touches the caller or the persisted active project.
  ipcMain.handle('sleipnir:newWindow', async () => {
    createWindow(null, null)
    return { ok: true }
  })

  ipcMain.handle('sleipnir:renameProject', async (_e, projectPath, name) => {
    const b = await getBackend()
    const result = b.renameProject(projectPath, name)
    workspaceStore.renameRecentProject(projectPath, result.name)
    // Re-title every window that has this project open, not just one.
    retitleWindowsForRoot(projectPath, result.name)
    return result
  })

  // Recolor this window's native (OS-drawn) min/max/close overlay to match the
  // theme the renderer just switched to — so light mode doesn't keep the dark
  // button strip. Two levers matter on Windows: setTitleBarOverlay's own colours
  // AND nativeTheme.themeSource, which decides whether the OS paints the whole
  // caption-button area in dark or light mode (a dark themeSource keeps the
  // buttons reading black even with a light overlay colour). We derive dark/
  // light from the overlay's background luminance so both stay in lockstep.
  ipcMain.on('sleipnir:setTitleBarTheme', (event, colors) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !colors) return
    nativeTheme.themeSource = isDarkHex(colors.color) ? 'dark' : 'light'
    if (typeof win.setTitleBarOverlay !== 'function') return
    try {
      win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 32 })
    } catch {
      // Platform without overlay support, or the window was torn down mid-call.
    }
  })
}

// True when a "#rrggbb" colour is dark enough to want light-on-dark chrome.
function isDarkHex(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim())
  if (!m) return true
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

// Asks the renderer whether this window has unsaved staged AI content
// (App.tsx's pendingOverride) so it can't be silently lost. Resolves false
// when the human cancels the close outright.
async function confirmPendingAiContent(win, wcId) {
  win.webContents.send('app:beforeClose')
  const hasUnsaved = await new Promise((resolve) => pendingBeforeClose.set(wcId, resolve))
  if (!hasUnsaved) return true
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', 'Discard', 'Save && Close'],
    defaultId: 2,
    cancelId: 0,
    message: 'You have unsaved AI-generated changes.',
    detail: 'Discard them, or save and close the window?',
  })
  if (response === 0) return false // Cancel
  if (response === 1) return true // Discard
  win.webContents.send('app:saveBeforeClose')
  await new Promise((resolve) => pendingSaveBeforeClose.set(wcId, resolve))
  return true
}

// The scratch half of the same question. A window with no chosen project has
// been writing into a throwaway per-window dir that 'closed' is about to
// delete, so this is the last chance to put that work somewhere real — the
// close-time counterpart to File ▸ Save Project to Folder….
//
// Gated on the scratch dir's *contents*, deliberately not on "is this window
// still scratch". A window that started blank, had work done in it, and then
// opened a real project (File ▸ Open Folder, not Save Project to Folder…)
// still owns that earlier scratch dir — checking windowRoots here would skip
// the prompt and let 'closed' delete it silently, which is the one way this
// change could lose work that the old shared-dir behavior kept. A window that
// only ever had a real project never created a scratch dir at all (see
// rootForSender), so it stays silent for free.
async function confirmScratchOnClose(win, wcId) {
  const scratch = scratchRoots.get(wcId)
  if (!scratchHasContent(scratch)) return true

  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Cancel', "Don't Save", 'Save…'],
    defaultId: 2,
    cancelId: 0,
    message: 'Save your unsaved project before closing?',
    detail:
      "Plans and files created while no project was open aren't in a folder yet. Closing without saving discards them.",
  })
  if (response === 0) return false // Cancel
  if (response === 1) return true // Don't Save — 'closed' discards the dir

  const picked = await dialog.showOpenDialog(win, {
    title: 'Save project to folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  // Backing out of the folder picker means "I didn't answer yet", not "throw
  // my work away" — re-ask rather than closing on a canceled dialog.
  if (picked.canceled || !picked.filePaths[0]) return confirmScratchOnClose(win, wcId)

  const dest = picked.filePaths[0]
  try {
    copyScratchInto(scratch, dest)
  } catch (e) {
    await dialog.showMessageBox(win, {
      type: 'error',
      buttons: ['OK'],
      message: 'Could not save the project.',
      detail: e instanceof Error ? e.message : String(e),
    })
    return false // Keep the window (and its scratch dir) alive to try again.
  }
  // Into the recent list + as the restored-on-launch project, exactly as
  // opening a project normally would — otherwise a project saved on the way
  // out is immediately unfindable.
  workspaceStore.touchProject(dest, readSavedProjectName(dest))
  return true
}

// The name a just-saved project will read back as: its own project.json when
// the human renamed it (copyScratchInto keeps a customized name and drops an
// untouched 'Untitled'), otherwise the folder they picked.
function readSavedProjectName(dest) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dest, '.planning', 'project.json'), 'utf8'))
    if (meta && typeof meta.name === 'string' && meta.name.trim()) return meta.name
  } catch {
    // No project.json (the normal case) — fall through to the folder name.
  }
  return path.basename(dest)
}

// Intercepted by 'close' (below) — runs both save prompts before really
// closing. Only forceCloses (win.__forceClose, checked by the 'close'
// listener) once the human has decided.
async function handleCloseAttempt(win, wcId) {
  if (!(await confirmClose(win, wcId))) return
  win.__forceClose = true
  win.close()
}

// Both save prompts, without closing — true once the human is fine with this
// window going away.
async function confirmClose(win, wcId) {
  if (!(await confirmPendingAiContent(win, wcId))) return false
  if (win.isDestroyed()) return false
  if (!(await confirmScratchOnClose(win, wcId))) return false
  return !win.isDestroyed()
}

// "Restart to update" (see updater.cjs) — every window's prompts first, and
// only once ALL of them are answered does any window get marked forceClose,
// so cancelling the third window's prompt leaves the first two open as-is.
async function confirmCloseAll() {
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  for (const win of wins) {
    if (!(await confirmClose(win, win.webContents.id))) return false
  }
  for (const win of wins) win.__forceClose = true
  return true
}

// initialRoot/initialName seed the window's own project (see windowRoots) —
// the restored-on-launch project for the first window, or null/null for a
// blank File > New Window. Its webContents id is what every workspace IPC
// call keys off (event.sender.id), so it's registered here before the page
// even loads, well before the renderer's first getWorkspaceInfo().
function createWindow(initialRoot = null, initialName = null) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#080808',
    // Windows' native dark title bar is a mid-gray, not black — override it
    // with an overlay colored to match the app's --bg-1 so the frame doesn't
    // read lighter than the content.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#080808',
      symbolColor: '#e8e8e8',
      height: 32,
    },
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Capture the id now — in the 'closed' handler below, win.webContents is
  // already destroyed, so reading win.webContents.id there throws "Object has
  // been destroyed" (surfaced as Electron's JS-error dialog).
  const wcId = win.webContents.id
  setWindowRoot(win.webContents, initialRoot)
  setWindowTitle(win, initialName)

  if (isDev) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
  // Both fire on genuine renderer failures (bad load, GPU/OOM crash) that
  // otherwise surface as nothing but a stuck or blank window with zero trace
  // in main.log — the only other error hooks (top-level uncaughtException/
  // unhandledRejection above) live in the main process and can't see across
  // to the renderer.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logMainError('did-fail-load', new Error(`${code} ${desc} ${url}`))
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logMainError('render-process-gone', new Error(JSON.stringify(details)))
  })

  win.on('close', (event) => {
    if (win.__forceClose) return
    event.preventDefault()
    handleCloseAttempt(win, wcId)
  })

  win.on('closed', () => {
    windowRoots.delete(wcId)
    // The human has already been offered the chance to save this (see
    // confirmScratchOnClose), so nothing here is a silent loss — and dropping
    // it now is what makes the *next* blank window actually blank.
    discardScratch(wcId)
    // This window's own terminal/chat/preview/commandRunner sessions would
    // otherwise leak until the whole app quits (window-all-closed/before-quit
    // are the only other place these get killed) — see ROADMAP.md's
    // "Per-window resource cleanup" gap.
    terminal.killForWindow(wcId)
    chat.killForWindow(wcId)
    preview.killForWindow(wcId)
    commandRunner.killForWindow(wcId)
    planningWatcher.killForWindow(wcId)
  })
  return win
}

app.whenReady().then(async () => {
  // Sleipnir has no light theme in Electron chrome — this only affects the
  // OS-drawn title bar (Windows defaults it to light regardless of the
  // page's own background), not the web content.
  nativeTheme.themeSource = 'dark'
  // The default File/Edit/View/Window menu is OS-drawn and can't be recolored
  // to match the app's black theme, so drop it rather than leave a gray bar.
  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  // Before any window can claim one — see sweepOrphanScratchDirs.
  sweepOrphanScratchDirs()

  const b = await getBackend()

  // First launch under the per-project Planning system: migrate Sleipnir's
  // own existing notes/plans/archive into its own .planning/ folder and seed
  // it as a recent project, so nothing regresses — Planning keeps showing
  // exactly what it showed before this change until a different project is
  // explicitly opened. An already-active project (the old single
  // lastWorkspacePath, now read as the initial activeProjectPath — see
  // workspaceStore.cjs's readStore) is preserved as the active one rather
  // than being replaced by Sleipnir's own repo. Runs at most once per install
  // (the legacySeeded flag) — an emptied recent list is also the state after
  // File > Open Recent > Clear Recent Projects, which must not re-seed.
  if (!workspaceStore.isLegacySeeded() && workspaceStore.getRecentProjects().length === 0) {
    b.migrateLegacyPlanningData(b.REPO_ROOT)
    const existingActive = workspaceStore.getActiveProjectPath()
    // renameProject (not just touchProject) so 'Sleipnir' is written into
    // REPO_ROOT/.planning/project.json itself — otherwise the next real
    // openWorkspace() re-derives the name from the raw folder basename
    // (e.g. "Sleipnir - Copy") and silently drops the friendlier seeded name.
    b.renameProject(b.REPO_ROOT, 'Sleipnir')
    workspaceStore.touchProject(b.REPO_ROOT, 'Sleipnir')
    if (existingActive && existingActive !== b.REPO_ROOT) {
      workspaceStore.touchProject(existingActive, path.basename(existingActive))
    }
    workspaceStore.markLegacySeeded()
  }

  // Restore the last active project into the FIRST window (new windows always
  // start blank). Resolved here so createWindow can seed the window's root +
  // title before the page loads, so the renderer's first getWorkspaceInfo()
  // already sees it.
  let restored = null
  const activeProjectPath = workspaceStore.getActiveProjectPath()
  if (activeProjectPath && fs.existsSync(activeProjectPath) && fs.statSync(activeProjectPath).isDirectory()) {
    try {
      restored = b.openWorkspace(activeProjectPath)
    } catch {
      // Folder became invalid (permissions, race) — just stays blank; leave
      // the stored path alone rather than clearing it, in case it's transient.
    }
  }

  // In dev, the Vite dev server (vite.config.ts) already owns the LSP proxy
  // on this port — starting a second one here races it for the port. Only
  // the packaged build (no Vite server around) needs Electron to start it.
  if (!isDev) startLspProxy()
  createWindow(restored?.root ?? null, restored?.name ?? null)
  initUpdater({ isDev, logError: logMainError, confirmCloseAll })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(restored?.root ?? null, restored?.name ?? null)
  })
})

app.on('window-all-closed', () => {
  terminal.killAll()
  chat.killAll()
  preview.killAll()
  commandRunner.killAll()
  planningWatcher.killAll()
  if (!isDev) stopLspProxy()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  terminal.killAll()
  chat.killAll()
  preview.killAll()
  commandRunner.killAll()
  planningWatcher.killAll()
  if (!isDev) stopLspProxy()
})
