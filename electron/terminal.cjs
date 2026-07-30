// Real pty session management via node-pty — Electron main-process only.
// Deliberately never imported by tools/sleipnir-backend.mjs or any module
// the web transport touches: this feature has no browser equivalent
// (spawning a real shell isn't possible from a sandboxed page), unlike
// everything else in the app, which works identically in both transports.
const pty = require('node-pty')

const DEFAULT_SHELL = process.platform === 'win32'
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || '/bin/bash')

// id -> pty process. One persistent session per app launch for this
// milestone (not multiple tabs) — a session survives the dock panel being
// hidden; it's only killed on explicit kill() or app quit.
const sessions = new Map()
let nextId = 1

function spawnSession(cols, rows, cwd) {
  const id = String(nextId++)
  const term = pty.spawn(DEFAULT_SHELL, [], {
    name: 'xterm-color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.cwd(),
    env: process.env,
  })
  sessions.set(id, term)
  return { id, term }
}

function write(id, data) {
  sessions.get(id)?.write(data)
}

function resize(id, cols, rows) {
  const term = sessions.get(id)
  if (term && cols > 0 && rows > 0) term.resize(cols, rows)
}

function kill(id) {
  sessions.get(id)?.kill()
  sessions.delete(id)
}

function killAll() {
  for (const term of sessions.values()) {
    try { term.kill() } catch { /* already gone */ }
  }
  sessions.clear()
}

module.exports = { spawnSession, write, resize, kill, killAll }
