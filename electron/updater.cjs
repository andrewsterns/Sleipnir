// Auto-update via electron-updater against GitHub Releases (see package.json's
// build.publish). Checks on launch and every CHECK_INTERVAL_MS after, downloads
// a newer version in the background, then waits: nothing installs until the
// user clicks the title bar's "Restart to update" (see updater:install below)
// or quits normally (autoInstallOnAppQuit), so it never interrupts a working
// session. Every state change is pushed to every window as 'updater:status'.
// NOTE: on macOS an update only APPLIES for a signed + notarized build;
// unsigned Windows/Linux builds update fine.
const { app, BrowserWindow, ipcMain } = require('electron')

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// state: 'unsupported' (dev — no release feed) | 'idle' | 'checking' |
// 'upToDate' | 'downloading' | 'ready' | 'error'
let status = { state: 'idle', currentVersion: app.getVersion() }
let autoUpdater = null

function setStatus(patch) {
  status = { currentVersion: app.getVersion(), ...patch }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('updater:status', status)
  }
}

async function check() {
  if (!autoUpdater) return status
  // Already have (or are fetching) an update — re-checking would only flicker
  // the title bar button back to 'checking'.
  if (status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // Already logged + surfaced by the 'error' listener in initUpdater.
  }
  return status
}

// confirmCloseAll runs every window's save-on-close prompts (see main.cjs's
// handleCloseAttempt) and resolves false if the user cancels any of them, so
// "Restart to update" can never drop unsaved work.
function initUpdater({ isDev, logError, confirmCloseAll }) {
  ipcMain.handle('updater:getStatus', () => status)
  ipcMain.handle('updater:check', () => check())
  ipcMain.handle('updater:install', async () => {
    if (!autoUpdater || status.state !== 'ready') return false
    if (!(await confirmCloseAll())) return false
    autoUpdater.quitAndInstall()
    return true
  })

  if (isDev) {
    status = { state: 'unsupported', currentVersion: app.getVersion() }
    return
  }
  try {
    ({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    logError('autoUpdater require', err)
    status = { state: 'unsupported', currentVersion: app.getVersion() }
    return
  }

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'upToDate' }))
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (progress) =>
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(progress.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    logError('autoUpdater', err)
    setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  })

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}

module.exports = { initUpdater }
