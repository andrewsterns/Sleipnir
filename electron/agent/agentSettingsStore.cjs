// App-wide agent preferences — the permission mode a new chat starts in, and
// how many tool round-trips one message may take before the loop stops and
// hands control back. Same local-JSON-in-userData shape as modelStore.cjs.
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const { USER_MODES, DEFAULT_MODE } = require('./permissions.cjs')

const DEFAULTS = { defaultMode: DEFAULT_MODE, maxToolTurns: 25 }
const MIN_TURNS = 1
const MAX_TURNS = 200

function storePath() {
  return path.join(app.getPath('userData'), 'agent-settings.json')
}

function sanitize(raw) {
  const out = { ...DEFAULTS }
  if (raw && USER_MODES.includes(raw.defaultMode)) out.defaultMode = raw.defaultMode
  const turns = Number(raw?.maxToolTurns)
  if (Number.isInteger(turns)) out.maxToolTurns = Math.min(MAX_TURNS, Math.max(MIN_TURNS, turns))
  return out
}

function getSettings() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(storePath(), 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

function setSettings(patch) {
  const next = sanitize({ ...getSettings(), ...(patch ?? {}) })
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2))
  return next
}

module.exports = { getSettings, setSettings }
