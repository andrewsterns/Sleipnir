// Real pty session management via node-pty — Electron main-process only.
// Deliberately never imported by tools/sleipnir-backend.mjs or any module
// the web transport touches: this feature has no browser equivalent
// (spawning a real shell isn't possible from a sandboxed page), unlike
// everything else in the app, which works identically in both transports.
const pty = require('node-pty')

const DEFAULT_SHELL = process.platform === 'win32'
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || '/bin/bash')

// id -> { term, wcId }. Supports any number of concurrent sessions —
// TerminalDock mounts one <Terminal> per open tab, each spawning its own
// session here. wcId (the owning window's webContents.id) is what
// killForWindow() sweeps by when that window closes. A session survives the
// dock panel being hidden; it's only killed on explicit kill() or app quit.
const sessions = new Map()
let nextId = 1

function spawnSession(cols, rows, cwd, ownerWcId) {
  const id = String(nextId++)
  const term = pty.spawn(DEFAULT_SHELL, [], {
    name: 'xterm-color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd || process.cwd(),
    env: process.env,
  })
  sessions.set(id, { term, wcId: ownerWcId })
  return { id, term }
}

function write(id, data) {
  sessions.get(id)?.term.write(data)
}

function resize(id, cols, rows) {
  const term = sessions.get(id)?.term
  if (term && cols > 0 && rows > 0) term.resize(cols, rows)
}

function kill(id) {
  sessions.get(id)?.term.kill()
  sessions.delete(id)
}

function killForWindow(wcId) {
  for (const [id, session] of sessions) {
    if (session.wcId === wcId) kill(id)
  }
}

function killAll() {
  for (const { term } of sessions.values()) {
    try { term.kill() } catch { /* already gone */ }
  }
  sessions.clear()
}

module.exports = { spawnSession, write, resize, kill, killForWindow, killAll }
