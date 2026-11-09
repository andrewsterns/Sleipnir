// Developing Sleipnir from inside Sleipnir. Renderer changes hot-reload, but a
// change to the main process needs the app to restart, and a restart ends every
// terminal. So this notices when a restart is due, and carries across it what
// matters: the window's state, each shell's scrollback, and which shells were
// running Claude, so each one resumes its own conversation.
//
// Only in development (not app.isPackaged). The parsing is pure and tested.

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

// Exit code tools/devLauncher.mjs takes as "start Electron again, keep Vite".
const RESTART_EXIT_CODE = 75
const MAX_CARRIED_SCROLLBACK = 200_000

// ── Which shells are running Claude ────────────────────────────────────────

/** True when a process under `rootPid` has a command line matching `pattern`. */
function hasDescendantMatching(rows, rootPid, pattern) {
  const children = new Map()
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, [])
    children.get(row.ppid).push(row)
  }
  const stack = [...(children.get(rootPid) ?? [])]
  const seen = new Set()
  while (stack.length) {
    const row = stack.pop()
    if (seen.has(row.pid)) continue
    seen.add(row.pid)
    if (pattern.test(row.command)) return true
    stack.push(...(children.get(row.pid) ?? []))
  }
  return false
}

/** Every running process as { pid, ppid, command }; [] if that can't be read. */
function processRows() {
  return new Promise((resolve) => {
    const done = (rows) => resolve(rows)
    if (process.platform === 'win32') {
      const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'
      execFile('powershell.exe', ['-NoProfile', '-Command', script], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
        if (error) return done([])
        try {
          done([].concat(JSON.parse(stdout)).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, command: p.CommandLine ?? '' })))
        } catch {
          done([])
        }
      })
      return
    }
    execFile('ps', ['-A', '-o', 'pid=,ppid=,args='], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      if (error) return done([])
      done(stdout.split('\n').flatMap((line) => {
        const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
        return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }] : []
      }))
    })
  })
}

// Claude itself, not a path that happens to contain the word (this project's own folders, say).
const CLAUDE_PROCESS = /(^|[\\/\s"])claude(\.exe|\.cmd)?("|\s|$)|@anthropic-ai[\\/]claude-code/i

/** The newest conversation the agent-trail hook recorded for this terminal, or null. */
function conversationOf(trailText, terminalId) {
  const lines = String(trailText).split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes(terminalId)) continue
    try {
      const entry = JSON.parse(lines[i])
      if (entry.terminal === terminalId && entry.conversation) return entry.conversation
    } catch {
      // A half-written line: keep looking.
    }
  }
  return null
}

/** What to type to bring a shell's Claude back: its own conversation, or the folder's latest. */
function resumeCommand(conversation) {
  return conversation ? `claude --resume ${conversation}` : 'claude --continue'
}

const readTrail = (root) => {
  try {
    return fs.readFileSync(path.join(root, '.planning', 'trail.jsonl'), 'utf8')
  } catch {
    return ''
  }
}

/** Each shell as it needs to come back: where it was, what it printed, and the command that resumes Claude if it was running. */
async function terminalsToCarry(sessions) {
  const rows = await processRows()
  return sessions.map((s) => ({
    cwd: s.cwd,
    scrollback: s.scrollback.slice(-MAX_CARRIED_SCROLLBACK),
    command: hasDescendantMatching(rows, s.pid, CLAUDE_PROCESS) ? resumeCommand(conversationOf(readTrail(s.cwd), s.terminalId)) : null,
  }))
}

// ── Across the restart ─────────────────────────────────────────────────────

const carryFile = (userData) => path.join(userData, 'dev-restart.json')

function saveCarry(userData, carry) {
  fs.writeFileSync(carryFile(userData), JSON.stringify(carry))
}

/** What the last restart carried, once; a later launch finds nothing. */
function takeCarry(userData) {
  try {
    const carry = JSON.parse(fs.readFileSync(carryFile(userData), 'utf8'))
    fs.rmSync(carryFile(userData), { force: true })
    return carry
  } catch {
    return null
  }
}

// ── Noticing a restart is due ──────────────────────────────────────────────

/** Whether a changed file is code the main process runs. The rebuilt agent CLI and tests aren't. */
function needsRestart(file) {
  const f = file.replace(/\\/g, '/')
  return /\.(cjs|mjs|js)$/.test(f) && !/\.test\./.test(f) && !f.endsWith('vendor/model.mjs')
}

const WATCHED = ['electron', 'tools/backend', 'tools/agentSkills']

function watchMainProcess(repoRoot, onDue) {
  const due = new Set()
  let timer = null
  for (const dir of WATCHED) {
    try {
      fs.watch(path.join(repoRoot, dir), { recursive: true }, (_event, file) => {
        if (!file || !needsRestart(file)) return
        due.add(`${dir}/${String(file).replace(/\\/g, '/')}`)
        clearTimeout(timer)
        timer = setTimeout(() => onDue([...due]), 300)
      })
    } catch {
      // Not watchable here: the restart button just won't appear on its own.
    }
  }
  return () => [...due]
}

module.exports = { RESTART_EXIT_CODE, MAX_CARRIED_SCROLLBACK, hasDescendantMatching, CLAUDE_PROCESS, conversationOf, resumeCommand, terminalsToCarry, saveCarry, takeCarry, needsRestart, watchMainProcess }
