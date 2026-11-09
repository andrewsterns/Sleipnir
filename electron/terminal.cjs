// Real pty session management via node-pty — Electron main-process only.
// Deliberately never imported by tools/sleipnir-backend.mjs or any module
// the web transport touches: this feature has no browser equivalent
// (spawning a real shell isn't possible from a sandboxed page), unlike
// everything else in the app, which works identically in both transports.
const pty = require('node-pty')
const { appendScrollback } = require('./terminalScrollback.cjs')

const DEFAULT_SHELL = process.platform === 'win32'
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || '/bin/bash')

// id -> { term, wcId }. Supports any number of concurrent sessions —
// TerminalDock mounts one <Terminal> per open tab, each spawning its own
// session here. wcId (the owning window's webContents.id) is what
// killForWindow() sweeps by when that window closes. A session survives the
// dock panel being hidden and the page reloading (it keeps what it printed, and
// a reloaded page reattaches); it's only killed on explicit kill(), its
// window closing, or app quit.
const sessions = new Map()
let nextId = 1

function spawnSession(cols, rows, cwd, ownerWcId, initialScrollback = '') {
  const id = String(nextId++)
  const home = cwd || process.cwd()
  // Named for this run of the app, so the agent-trail hook can tie a conversation to this terminal.
  const terminalId = `${process.pid}-${id}`
  const term = pty.spawn(DEFAULT_SHELL, [], {
    name: 'xterm-color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: home,
    env: { ...process.env, SLEIPNIR_TERMINAL: terminalId },
  })
  const session = { term, wcId: ownerWcId, scrollback: initialScrollback, end: initialScrollback.length, exited: false, cwd: home, terminalId }
  sessions.set(id, session)
  // Registered before the caller's own listeners, so `end` already counts each chunk they're told about.
  term.onData((data) => {
    session.scrollback = appendScrollback(session.scrollback, data)
    session.end += data.length
  })
  term.onExit(() => {
    session.exited = true
  })
  return { id, term }
}

/** How much a session has printed in all. */
function endOf(id) {
  return sessions.get(id)?.end ?? 0
}

/** The sessions a reloaded window can reattach to. Any that exited while nobody was watching are cleared away. */
function listForWindow(wcId) {
  const out = []
  for (const [id, session] of sessions) {
    if (session.wcId !== wcId) continue
    if (session.exited) sessions.delete(id)
    else out.push({ id })
  }
  return out
}

/** Everything a restart needs to know about a window's live shells. */
function describeForWindow(wcId) {
  return [...sessions.values()].filter((s) => s.wcId === wcId && !s.exited).map((s) => ({ pid: s.term.pid, cwd: s.cwd, terminalId: s.terminalId, scrollback: s.scrollback }))
}

/** A session's output so far, for a reloaded page to replay; null if it isn't this window's or is gone. */
function attach(id, wcId) {
  const session = sessions.get(id)
  if (!session || session.wcId !== wcId || session.exited) return null
  return { data: session.scrollback, end: session.end }
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

module.exports = { spawnSession, write, resize, kill, killForWindow, killAll, endOf, listForWindow, attach, describeForWindow }
