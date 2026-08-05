// Local, encrypted-at-rest storage for user-supplied API keys (BYOK) —
// Electron main-process only. Uses safeStorage, which defers to the OS's
// own credential protection (DPAPI on Windows, Keychain on macOS, libsecret
// on Linux) rather than inventing our own encryption. The key never touches
// localStorage/renderer-accessible storage and never round-trips through
// the log-appending debug patterns used elsewhere in this codebase.
const fs = require('node:fs')
const path = require('node:path')
const { app, safeStorage } = require('electron')

function storePath() {
  return path.join(app.getPath('userData'), 'api-keys.json')
}

function readStoreRaw() {
  const p = storePath()
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

function writeStoreRaw(data) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2))
}

// Encryption is unavailable in rare cases (e.g. no keychain on a stripped-
// down Linux box) — callers should treat setKey's failure as "BYOK isn't
// usable on this machine, fall back to env vars/Ollama" rather than crash.
function encryptionAvailable() {
  return safeStorage.isEncryptionAvailable()
}

function setKey(provider, key) {
  if (!encryptionAvailable()) {
    throw new Error('OS-level credential encryption is unavailable on this machine — cannot store API keys securely.')
  }
  const data = readStoreRaw()
  data[provider] = safeStorage.encryptString(key).toString('base64')
  writeStoreRaw(data)
}

function getKey(provider) {
  if (!encryptionAvailable()) return null
  const data = readStoreRaw()
  const encoded = data[provider]
  if (!encoded) return null
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return null
  }
}

function clearKey(provider) {
  const data = readStoreRaw()
  delete data[provider]
  writeStoreRaw(data)
}

// Never returns the key itself — only enough for the settings UI to show
// "a key is set" plus a non-sensitive hint (last 4 chars), same convention
// most consoles use for displaying stored secrets.
function getKeyStatus(provider) {
  const key = getKey(provider)
  return key ? { configured: true, hint: key.slice(-4) } : { configured: false, hint: null }
}

module.exports = { setKey, getKey, clearKey, getKeyStatus, encryptionAvailable }
