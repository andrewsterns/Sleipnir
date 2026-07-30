// Electron main process. CommonJS on purpose (`.cjs`) so it runs the same
// way regardless of package.json's "type": "module" — avoids ESM/CJS
// friction in the one place that matters for packaging. The actual
// filesystem logic is never duplicated here: it's dynamically imported from
// tools/sleipnir-backend.mjs (ESM), the same module the Vite dev server's
// HTTP middleware (vite.config.ts) calls for the web transport.
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const terminal = require('./terminal.cjs')

const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173'

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
  start()
}

// Every handler mirrors src/00_planning/api/PlatformAPI.ts exactly — the
// renderer (electronApi.ts) never needs to know these are IPC calls instead
// of fetch() calls.
function registerIpcHandlers() {
  ipcMain.handle('sleipnir:scaffoldComponent', async (_e, name, tier, language, parts) => {
    const b = await getBackend()
    return b.scaffoldComponent(name, tier, language, parts)
  })
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
  ipcMain.handle('sleipnir:createFile', async (_e, filePath, content) => {
    const b = await getBackend()
    b.createFile(filePath, content)
  })
  ipcMain.handle('sleipnir:createDir', async (_e, dirPath) => {
    const b = await getBackend()
    b.createDir(dirPath)
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
  ipcMain.handle('sleipnir:runScript', async (_e, filePath) => {
    const b = await getBackend()
    return b.runScript(filePath)
  })
  ipcMain.handle('sleipnir:previewRefactor', async (_e, architecture) => {
    const b = await getBackend()
    return b.previewRefactor(architecture)
  })
  ipcMain.handle('sleipnir:applyRefactor', async (_e, architecture) => {
    const b = await getBackend()
    return b.applyRefactor(architecture)
  })
  ipcMain.handle('sleipnir:getCurrentArchitecture', async () => {
    const b = await getBackend()
    return b.getCurrentArchitecture()
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
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0d11',
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

app.whenReady().then(() => {
  registerIpcHandlers()
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
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  terminal.killAll()
})
