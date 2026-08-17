// Bounded spawn-and-capture for one-shot commands (a single vitest run, a
// git/npm invocation) — same id -> session Map + capped-output-buffer shape
// as preview.cjs, but for "run to completion and report the result" rather
// than "start a long-lived dev server." Deliberately not built on node-pty/
// terminal.cjs: this never needs an interactive shell, just stdout/stderr
// and an exit code. Callers own their own IPC channel names via onChunk/
// onExit — this module doesn't send anything itself, so both chat.cjs's
// run_command tool and validation.cjs can each push their own event shapes.
const { spawn } = require('node:child_process')

const OUTPUT_CAP = 100_000
const DEFAULT_TIMEOUT_MS = 120_000

// id -> { proc, wcId }. wcId (the owning window's webContents.id) exists so
// a window's in-flight commands can be swept via killForWindow() when that
// window closes — same pattern terminal.cjs/chat.cjs/preview.cjs will adopt.
const sessions = new Map()
let nextId = 1

function run(sender, { command, args = [], cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, onChunk, onExit }) {
  const id = String(nextId++)
  // Windows' npm/npx/git shims are batch files — spawn can't exec those
  // directly without shell:true (same reasoning as preview.cjs).
  const child = spawn(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    shell: process.platform === 'win32',
  })
  sessions.set(id, { proc: child, wcId: sender.id })

  let output = ''
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, timeoutMs)

  const capture = (stream) => (chunk) => {
    const text = chunk.toString()
    output = (output + text).slice(-OUTPUT_CAP)
    onChunk?.(stream, text)
  }
  child.stdout?.on('data', capture('stdout'))
  child.stderr?.on('data', capture('stderr'))

  child.on('exit', (code) => {
    clearTimeout(timer)
    sessions.delete(id)
    onExit?.({ exitCode: timedOut ? null : code, output, timedOut })
  })
  // e.g. the command itself doesn't exist — 'exit' never fires for that case
  child.on('error', (err) => {
    clearTimeout(timer)
    sessions.delete(id)
    onExit?.({ exitCode: null, output: (output + `\n${err.message}`).slice(-OUTPUT_CAP), timedOut: false })
  })

  return id
}

function stop(id) {
  try {
    sessions.get(id)?.proc.kill()
  } catch {
    // already gone
  }
  sessions.delete(id)
}

function killForWindow(wcId) {
  for (const [id, session] of sessions) {
    if (session.wcId === wcId) stop(id)
  }
}

function killAll() {
  for (const id of [...sessions.keys()]) stop(id)
}

module.exports = { run, stop, killForWindow, killAll }
