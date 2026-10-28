// Sleipnir Pro licensing — Electron main-process only. A Lemon Squeezy
// license key (bought at licenseConfig.cjs's CHECKOUT_URL) unlocks the Pro
// features and the commercial-use grant in LICENSE. The API calls and their
// interpretation live in licenseCore.cjs; this file owns storage, IPC, the
// pushed 'license:status' broadcast (same shape as updater.cjs's), and the
// gates main.cjs checks before a Pro-only action.
//
// This is a soft gate by design: the source is public, so it keeps honest
// people honest rather than trying to be DRM. A network failure never takes
// Pro away — only the license server saying the key is invalid does.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, ipcMain, net, safeStorage, shell } = require('electron')
const core = require('./licenseCore.cjs')
const config = require('./licenseConfig.cjs')

// What each gate says when it stops a free user — also the copy the
// renderer's UpgradePrompt shows (see src/app/License/iLicense.ts).
const GATE_MESSAGES = {
  unlimitedProjects: `The free version opens up to ${config.FREE_PROJECT_LIMIT} projects. Sleipnir Pro opens as many as you like.`,
  multiWindow: 'Multiple windows are a Sleipnir Pro feature.',
  mcpServers: 'Connecting MCP servers to the agent is a Sleipnir Pro feature.',
}

let devPro = false
let checking = false
let lastError = null
let logError = () => {}

function storePath() {
  return path.join(app.getPath('userData'), 'license.json')
}

// { record: { ...record, key: <encrypted b64> , keyEncrypted }, freeProjects: string[] }
function readStore() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    let record = null
    if (data.record?.key) {
      const key = data.record.keyEncrypted
        ? safeStorage.decryptString(Buffer.from(data.record.key, 'base64'))
        : data.record.key
      record = { ...data.record, key }
      delete record.keyEncrypted
    }
    return { record, freeProjects: Array.isArray(data.freeProjects) ? data.freeProjects : [] }
  } catch {
    return { record: null, freeProjects: [] }
  }
}

// The key is encrypted at rest like apiKeyStore.cjs's keys when the OS
// offers it; a license key isn't worth refusing to store over, so a machine
// without a keychain keeps it in plain JSON instead.
function writeStore({ record, freeProjects }) {
  let stored = null
  if (record) {
    const encrypt = safeStorage.isEncryptionAvailable()
    stored = {
      ...record,
      key: encrypt ? safeStorage.encryptString(record.key).toString('base64') : record.key,
      keyEncrypted: encrypt,
    }
  }
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify({ record: stored, freeProjects }, null, 2))
}

// Until a release names its Lemon Squeezy store, nobody can buy Pro — so
// nothing is held back either: every gate stays open, and they all switch on
// in the first build whose licenseConfig.cjs has the store and product ids.
const storeConfigured = () => config.STORE_ID != null && config.PRODUCT_ID != null

function isPro() {
  if (devPro || !storeConfigured()) return true
  const { record } = readStore()
  return !!record && record.keyStatus !== 'invalid'
}

function getStatus() {
  const { record, freeProjects } = readStore()
  const base = {
    configured: storeConfigured(),
    freeProjects,
    freeProjectLimit: config.FREE_PROJECT_LIMIT,
  }
  if (devPro) return { ...base, tier: 'pro', state: 'dev' }
  if (!storeConfigured()) return { ...base, tier: 'pro', state: 'unlocked' }
  if (record && record.keyStatus === 'invalid') {
    return { ...base, tier: 'free', state: 'invalid', error: record.error ?? lastError ?? undefined }
  }
  if (record) {
    return {
      ...base,
      tier: 'pro',
      state: checking ? 'checking' : 'active',
      email: record.email ?? undefined,
      variant: record.variant ?? undefined,
      keyHint: record.key.slice(-4),
      stale: core.isStale(record) || undefined,
    }
  }
  return { ...base, tier: 'free', state: 'none', error: lastError ?? undefined }
}

function broadcast() {
  const status = getStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('license:status', status)
  }
  return status
}

const deps = () => ({ fetch: (url, init) => net.fetch(url, init), config })

async function activate(key) {
  lastError = null
  const result = await core.activate(key, os.hostname(), deps())
  if (!result.ok) {
    lastError = result.error
    return { ok: false, error: result.error, status: broadcast() }
  }
  writeStore({ ...readStore(), record: result.record })
  return { ok: true, status: broadcast() }
}

async function deactivate() {
  const store = readStore()
  if (store.record) await core.deactivate(store.record, deps())
  lastError = null
  writeStore({ ...store, record: null })
  return broadcast()
}

async function revalidate({ force = false } = {}) {
  const { record } = readStore()
  if (!record || record.keyStatus === 'invalid' || checking) return getStatus()
  if (!force && !core.needsRevalidation(record)) return getStatus()
  checking = true
  broadcast()
  try {
    const result = await core.validate(record, deps())
    const store = readStore()
    if (result.outcome === 'valid') {
      writeStore({ ...store, record: result.record })
    } else if (result.outcome === 'revoked') {
      // Kept (not deleted) so Settings can say why Pro went away and the
      // human can see which key it was.
      writeStore({ ...store, record: { ...record, keyStatus: 'invalid', error: result.error } })
    }
  } catch (err) {
    logError('license revalidate', err)
  } finally {
    checking = false
  }
  return broadcast()
}

// Main.cjs's project-opening handlers call this with the folder about to
// open. Claims a free slot when one is left; Pro always passes.
function checkProject(target) {
  const store = readStore()
  const gate = core.projectGate({
    pro: isPro(),
    slots: store.freeProjects,
    target,
    limit: config.FREE_PROJECT_LIMIT,
  })
  if (gate.allowed && gate.slots !== store.freeProjects) {
    writeStore({ ...store, freeProjects: gate.slots })
    broadcast()
  }
  return gate.allowed
}

// Hands a free slot back (Settings ▸ License), e.g. for a project the human
// deleted or no longer works on.
function releaseProject(target) {
  const store = readStore()
  writeStore({ ...store, freeProjects: store.freeProjects.filter((p) => !core.samePath(p, target)) })
  return broadcast()
}

// The uniform "stopped by a gate" result: an `{ error }` every existing
// caller already displays, plus a push to the calling window so its
// UpgradePrompt opens no matter which UI triggered the action.
function proRequired(sender, feature) {
  const message = GATE_MESSAGES[feature] ?? 'This is a Sleipnir Pro feature.'
  if (sender && !sender.isDestroyed()) sender.send('license:upgradeNeeded', { feature, message })
  return { error: message, proRequired: feature }
}

function initLicense({ isDev, logError: log }) {
  logError = log
  devPro = isDev && process.env.SLEIPNIR_PRO === '1'

  ipcMain.handle('license:getStatus', () => getStatus())
  ipcMain.handle('license:activate', (_e, key) => activate(key))
  ipcMain.handle('license:deactivate', () => deactivate())
  ipcMain.handle('license:revalidate', () => revalidate({ force: true }))
  ipcMain.handle('license:releaseProject', (_e, projectPath) => releaseProject(projectPath))
  ipcMain.handle('license:openCheckout', () => shell.openExternal(config.CHECKOUT_URL))

  revalidate()
}

module.exports = { initLicense, isPro, checkProject, releaseProject, proRequired }
