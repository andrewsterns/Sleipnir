// Electron main process. CommonJS on purpose (`.cjs`) so it runs the same
// way regardless of package.json's "type": "module" — avoids ESM/CJS
// friction in the one place that matters for packaging. The actual
// filesystem logic is never duplicated here: it's dynamically imported from
// tools/sleipnir-backend.mjs (ESM), the same module the Vite dev server's
// HTTP middleware (vite.config.ts) calls for the web transport.
const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const terminal = require('./terminal.cjs')
const chat = require('./chat.cjs')
const preview = require('./preview.cjs')
const apiKeyStore = require('./apiKeyStore.cjs')
const modelStore = require('./modelStore.cjs')
const workspaceStore = require('./workspaceStore.cjs')

const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:5183'
// electron/main.cjs runs from the repo root in dev (npm script cwd) and from
// inside the packaged app.asar in prod, but both cases already treat cwd as
// the project root the same way tools/sleipnir-backend.mjs's REPO_ROOT does
// — reused here so the File menu's native dialogs default to (and enforce)
// that same root.
const REPO_ROOT = process.cwd()

let backend

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

// Every handler mirrors src/00_planning/api/PlatformAPI.ts exactly — the
// renderer (electronApi.ts) never needs to know these are IPC calls instead
// of fetch() calls.
function registerIpcHandlers() {
  ipcMain.handle('sleipnir:scaffoldComponent', async (_e, name, tier, language, parts, libraryId) => {
    const b = await getBackend()
    return b.scaffoldComponent(name, tier, language, parts, libraryId)
  })
  ipcMain.handle('sleipnir:regenerateGraph', async () => {
    const b = await getBackend()
    return b.regenerateGraph()
  })
  ipcMain.handle('sleipnir:createLibrary', async (_e, input) => {
    const b = await getBackend()
    return b.createLibrary(input)
  })
  ipcMain.handle('sleipnir:listLibraries', async (_e, kind) => {
    const b = await getBackend()
    return b.getLibraries(kind)
  })
  ipcMain.handle('sleipnir:removeLibrary', async (_e, id) => {
    const b = await getBackend()
    return b.removeLibrary(id)
  })
  ipcMain.handle('sleipnir:deleteLibrary', async (_e, id) => {
    const b = await getBackend()
    return b.deleteLibrary(id)
  })
  ipcMain.handle('sleipnir:listWidgets', async () => {
    const b = await getBackend()
    return b.getWidgets()
  })
  ipcMain.handle('sleipnir:installWidget', async (_e, input) => {
    const b = await getBackend()
    return b.installWidget(input)
  })
  ipcMain.handle('sleipnir:getWidgetCatalog', async () => {
    const b = await getBackend()
    return b.getWidgetCatalog()
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
  ipcMain.handle('sleipnir:getWorkspaceInfo', async () => {
    const b = await getBackend()
    return b.getWorkspaceInfo()
  })
  ipcMain.handle('sleipnir:listWorkspaceDir', async (_e, dirPath) => {
    const b = await getBackend()
    return b.listWorkspaceDir(dirPath)
  })
  ipcMain.handle('sleipnir:readWorkspaceFile', async (_e, filePath) => {
    const b = await getBackend()
    return b.readWorkspaceFile(filePath)
  })
  ipcMain.handle('sleipnir:writeWorkspaceFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.writeWorkspaceFile(filePath, content)
  })
  ipcMain.handle('sleipnir:createWorkspaceFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.createWorkspaceFile(filePath, content)
  })
  ipcMain.handle('sleipnir:createWorkspaceDir', async (_e, dirPath) => {
    const b = await getBackend()
    b.createWorkspaceDir(dirPath)
  })
  ipcMain.handle('sleipnir:searchRepo', async (_e, query, opts) => {
    const b = await getBackend()
    return b.searchRepo(query, opts)
  })
  ipcMain.handle('sleipnir:searchWorkspace', async (_e, query, opts) => {
    const b = await getBackend()
    return b.searchWorkspace(query, opts)
  })
  ipcMain.handle('sleipnir:listRepoTree', async () => {
    const b = await getBackend()
    return b.listRepoTree()
  })
  ipcMain.handle('sleipnir:importPath', async (_e, sourceAbsolutePath, destRepoRelativeDir) => {
    const b = await getBackend()
    return b.importPath(sourceAbsolutePath, destRepoRelativeDir)
  })
  ipcMain.handle('sleipnir:detectPreviewConfig', async (_e, folderPath) => {
    const b = await getBackend()
    return b.detectPreviewConfig(folderPath)
  })
  ipcMain.handle('sleipnir:getPreviewConfig', async (_e, folderPath) => {
    const b = await getBackend()
    return b.getPreviewConfig(folderPath)
  })
  ipcMain.handle('sleipnir:setPreviewConfig', async (_e, folderPath, config) => {
    const b = await getBackend()
    return b.setPreviewConfig(folderPath, config)
  })
  ipcMain.handle('sleipnir:getArchivedPaths', async () => {
    const b = await getBackend()
    return b.getArchivedPaths()
  })
  ipcMain.handle('sleipnir:setArchived', async (_e, filePath, archived, label) => {
    const b = await getBackend()
    return b.setArchived(filePath, archived, label)
  })
  ipcMain.handle('sleipnir:getNotes', async () => {
    const b = await getBackend()
    return b.getNotes()
  })
  ipcMain.handle('sleipnir:addNote', async (_e, map, label, description) => {
    const b = await getBackend()
    return b.addNote(map, label, description)
  })
  ipcMain.handle('sleipnir:createPlanNode', async (_e, planId, label, description, parentId) => {
    const b = await getBackend()
    return b.createPlanNode(planId, label, description, parentId)
  })
  ipcMain.handle('sleipnir:setNodeStatus', async (_e, id, status) => {
    const b = await getBackend()
    return b.setNodeStatus(id, status)
  })
  ipcMain.handle('sleipnir:openFileNode', async (_e, filePath, label) => {
    const b = await getBackend()
    return b.openFileNode(filePath, label)
  })
  ipcMain.handle('sleipnir:getPlans', async () => {
    const b = await getBackend()
    return b.getPlans()
  })
  ipcMain.handle('sleipnir:createPlan', async (_e, label, nodeIds) => {
    const b = await getBackend()
    return b.createPlan(label, nodeIds)
  })
  ipcMain.handle('sleipnir:deletePlan', async (_e, id) => {
    const b = await getBackend()
    return b.deletePlan(id)
  })
  ipcMain.handle('sleipnir:runScript', async (_e, filePath) => {
    const b = await getBackend()
    return b.runScript(filePath)
  })
  ipcMain.handle('sleipnir:previewRefactor', async (_e, architecture, libraryId) => {
    const b = await getBackend()
    return b.previewRefactor(architecture, libraryId)
  })
  ipcMain.handle('sleipnir:applyRefactor', async (_e, architecture, libraryId) => {
    const b = await getBackend()
    return b.applyRefactor(architecture, libraryId)
  })
  ipcMain.handle('sleipnir:getCurrentArchitecture', async (_e, libraryId) => {
    const b = await getBackend()
    return b.getCurrentArchitecture(libraryId)
  })

  ipcMain.handle('sleipnir:getGitStatus', async () => {
    const b = await getBackend()
    return b.getGitStatus()
  })
  ipcMain.handle('sleipnir:getGitDiff', async (_e, filePath, staged) => {
    const b = await getBackend()
    return b.getGitDiff(filePath, staged)
  })
  ipcMain.handle('sleipnir:stageFiles', async (_e, paths) => {
    const b = await getBackend()
    return b.stageFiles(paths)
  })
  ipcMain.handle('sleipnir:unstageFiles', async (_e, paths) => {
    const b = await getBackend()
    return b.unstageFiles(paths)
  })
  ipcMain.handle('sleipnir:commitChanges', async (_e, message) => {
    const b = await getBackend()
    return b.commitChanges(message)
  })
  ipcMain.handle('sleipnir:getBranches', async () => {
    const b = await getBackend()
    return b.getBranches()
  })
  ipcMain.handle('sleipnir:getBranchTree', async () => {
    const b = await getBackend()
    return b.getBranchTree()
  })
  ipcMain.handle('sleipnir:checkoutBranch', async (_e, name) => {
    const b = await getBackend()
    return b.checkoutBranch(name)
  })
  ipcMain.handle('sleipnir:createBranch', async (_e, name) => {
    const b = await getBackend()
    return b.createBranch(name)
  })
  ipcMain.handle('sleipnir:gitPush', async () => {
    const b = await getBackend()
    return b.gitPush()
  })
  ipcMain.handle('sleipnir:gitPull', async () => {
    const b = await getBackend()
    return b.gitPull()
  })
  ipcMain.handle('sleipnir:gitFetch', async () => {
    const b = await getBackend()
    return b.gitFetch()
  })
  ipcMain.handle('sleipnir:getGitIdentity', async () => {
    const b = await getBackend()
    return b.getGitIdentity()
  })
  ipcMain.handle('sleipnir:setGitIdentity', async (_e, name, email) => {
    const b = await getBackend()
    return b.setGitIdentity(name, email)
  })

  // Terminal — a streaming/event-based channel, not request/response like
  // everything above. `spawn` returns a session id; data/exit flow back as
  // push events on 'terminal:data'/'terminal:exit' tagged with that id.
  ipcMain.handle('terminal:spawn', (event, cols, rows) => {
    const { id, term } = terminal.spawnSession(cols, rows, process.cwd())
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
  ipcMain.handle('chat:sendMessage', (event, sessionId, history, message) =>
    chat.sendMessage(event.sender, sessionId, history, message),
  )
  ipcMain.on('chat:cancel', (_e, sessionId) => chat.cancel(sessionId))

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

  // File menu's Open File…/Open Folder… — native pickers have no web
  // equivalent (a browser's <input type=file> returns content, never a real
  // path), so these exist only on window.electronAPI, not PlatformAPI. The
  // relative-path math happens here, not in the renderer, so the renderer
  // never has to deal with (or trust) an absolute filesystem path — same
  // containment principle as tools/sleipnir-backend.mjs's resolveSafe, just
  // enforced before the path ever crosses the IPC boundary.
  ipcMain.handle('sleipnir:openFileDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, { defaultPath: REPO_ROOT, properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const rel = path.relative(REPO_ROOT, result.filePaths[0])
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { error: 'File must be inside the project' }
    }
    return { path: rel.split(path.sep).join('/') }
  })
  ipcMain.handle('sleipnir:openFolderDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, { defaultPath: REPO_ROOT, properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const rel = path.relative(REPO_ROOT, result.filePaths[0])
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return { error: 'Folder must be inside the project' }
    }
    return { path: rel.split(path.sep).join('/') }
  })
  // Workspace's whole point is opening a DIFFERENT project — deliberately no
  // defaultPath/containment check tying it to REPO_ROOT, unlike
  // openFileDialog/openFolderDialog above (which install a read-only/editable
  // widget *onto* Sleipnir's own repo, a different feature — see
  // ROADMAP.md's Phase 0). Persists the choice so relaunching reopens it.
  ipcMain.handle('sleipnir:openWorkspace', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const b = await getBackend()
    try {
      const info = b.openWorkspace(result.filePaths[0])
      workspaceStore.setLastWorkspacePath(info.root)
      return info
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })
  // Import's whole point is pulling in something from *outside* the repo —
  // deliberately no defaultPath/containment check here, unlike
  // openFileDialog/openFolderDialog above. Returns the raw absolute path;
  // containment is enforced on the copy-in side (importPath's destination),
  // not the picker.
  ipcMain.handle('sleipnir:importDialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return { path: result.filePaths[0] }
  })
}

function createWindow() {
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

  if (isDev) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
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

  // Restore the last-opened Workspace folder, if any — awaited before
  // createWindow() below so the renderer's very first getWorkspaceInfo()
  // call already sees it (createWindow() only starts loading the page; the
  // renderer doesn't exist a moment before that).
  const lastWorkspacePath = workspaceStore.getLastWorkspacePath()
  if (lastWorkspacePath && fs.existsSync(lastWorkspacePath) && fs.statSync(lastWorkspacePath).isDirectory()) {
    try {
      const b = await getBackend()
      b.openWorkspace(lastWorkspacePath)
    } catch {
      // Folder became invalid (permissions, race) — just stays unset; leave
      // the stored path alone rather than clearing it, in case it's transient.
    }
  }

  // In dev, the Vite dev server (vite.config.ts) already owns the LSP proxy
  // on this port — starting a second one here races it for the port. Only
  // the packaged build (no Vite server around) needs Electron to start it.
  if (!isDev) startLspProxy()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  terminal.killAll()
  chat.killAll()
  preview.killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  terminal.killAll()
  chat.killAll()
  preview.killAll()
})
