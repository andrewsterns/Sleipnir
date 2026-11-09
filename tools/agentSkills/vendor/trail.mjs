// Sleipnir agent trail — vendored copy, run as a Claude Code hook.
//
// Copied into each project as `.sleipnir/trail.mjs` by Sleipnir's scaffolder
// (tools/agentSkills/scaffold.mjs), which also registers it as a hook in the
// project's `.claude/settings.local.json`. Claude Code runs it outside the model
// before every tool call and when the agent stops: it appends one line saying
// what the agent is about to do — read this file, edit that one, run the tests
// — to `.planning/trail.jsonl`, and Sleipnir draws the line on its graph.
//
// It costs the agent nothing: it prints nothing and always exits 0, and a
// silent hook adds no tokens to the conversation. It never blocks or fails a
// tool call — any error is swallowed. And it does nothing in a project Sleipnir
// hasn't set up (no `.sleipnir/` or `.planning/` folder).
//
// Node built-ins only, like the other vendored CLIs. The in-app agent writes the
// same lines through electron/agentTrail.cjs, which imports this file.

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

export const TRAIL_FILE = '.planning/trail.jsonl'
// The trail is for watching, not keeping: past this size only the newest lines stay.
export const MAX_TRAIL_BYTES = 1_000_000
export const KEEP_LINES = 2000

// The vendored CLIs, and the skill each one serves.
export const SKILL_CLIS = { plan: 'plan', canvas: 'canvas', analyze: 'optimize' }
const CLI_IN_COMMAND = /\.sleipnir[\\/](plan|canvas|analyze)\.mjs/

// Files that instruct an agent: the context files every session loads, and
// each agent's skill and command files.
export const INSTRUCTION_FILE =
  /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|^\.claude\/(commands\/.+\.md|skills\/.+\/SKILL\.md)$|^\.codex\/prompts\/.+\.md$|^\.gemini\/commands\/.+\.toml$|^\.sleipnir\/skills\/.+\.md$/

// A command that runs tests, in any of the toolchains Sleipnir knows.
export const TEST_COMMAND =
  /\b(vitest|jest|pytest|mocha|playwright test|cargo test|go test|dotnet test|gradlew? test|mvn test|swift test|ctest|node --test|(npm|pnpm|yarn|bun)( run)? test)\b/

// The project files a read-only shell command names (cat, head, tail, sed,
// grep, rg, wc, less) — every command in it must be one of those, so nothing
// that writes is ever mistaken for a read. Paths are checked against the disk.
const READ_COMMANDS = new Set(['cat', 'head', 'tail', 'sed', 'grep', 'rg', 'wc', 'less', 'cd', 'echo', 'ls', 'nl'])
export function shellReads(cmd, root) {
  const parts = cmd.split(/&&|\|\||;|\|/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length || !parts.every((p) => READ_COMMANDS.has(p.split(/\s+/)[0]))) return []
  if (/\bsed\b[^|;&]*\s-i\b|>/.test(cmd)) return []
  const found = []
  for (const token of cmd.match(/"[^"]+"|'[^']+'|[^\s"']+/g) ?? []) {
    const t = token.replace(/^["']|["']$/g, '')
    if (!/[\/.]/.test(t) || t.startsWith('-')) continue
    const rel = relativePath(root, t)
    if (!rel || rel === '.' || found.includes(rel)) continue
    try {
      if (fs.statSync(path.join(root, rel)).isFile()) found.push(rel)
    } catch {
      // not a file here
    }
  }
  return found.slice(0, 8)
}

// A workspace-relative path, or null for one outside the project.
export function relativePath(root, p) {
  if (typeof p !== 'string' || !p) return null
  const rel = path.relative(root, path.resolve(root, p)).replace(/\\/g, '/')
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel || '.'
}

// One trail line, from what a tool is about to do:
//   read    a file was opened
//   search  a folder or pattern was searched
//   edit    a file is being written
//   run     a command
//   test    a command that runs tests
//   tool         anything else (fetching a page, starting a subagent)
//   instruction  an instruction or skill file was read
//   skill        a skill or slash command started (its name, never the prompt)
//   prompt       a person sent a prompt — the agent starts thinking
//   session      a session started, with the context files it loads
//   tested       a test command finished, and whether it passed (`ok`)
//   idle         the agent stopped
export function entryFor({ agent, session, tool, input = {}, root, at = Date.now() }) {
  const base = { at, agent, ...(session ? { session } : {}) }
  if (!tool) return { ...base, kind: 'idle' }
  const paths = (...ps) => ps.map((p) => relativePath(root, p)).filter(Boolean)
  switch (tool) {
    case 'Read':
    case 'NotebookRead': {
      const read = paths(input.file_path ?? input.notebook_path)
      return { ...base, tool, kind: read.some((p) => INSTRUCTION_FILE.test(p)) ? 'instruction' : 'read', paths: read }
    }
    case 'Skill': {
      const name = String(input.skill ?? input.command ?? input.name ?? '').replace(/^\//, '').trim()
      return { ...base, tool, kind: 'skill', ...(name ? { skill: name.slice(0, 60) } : {}) }
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return { ...base, tool, kind: 'edit', paths: paths(input.file_path ?? input.notebook_path) }
    case 'Grep':
    case 'Glob':
      return { ...base, tool, kind: 'search', paths: paths(input.path ?? '.'), query: String(input.pattern ?? '').slice(0, 80) }
    case 'Bash': {
      const cmd = String(input.command ?? '')
      const cli = cmd.match(CLI_IN_COMMAND)?.[1]
      // Reading through the shell (cat, sed -n, grep…) is still reading: the
      // project files it names count, so the trail sees where attention goes.
      const read = !TEST_COMMAND.test(cmd) && !cli ? shellReads(cmd, root) : []
      return {
        ...base,
        tool,
        kind: TEST_COMMAND.test(cmd) ? 'test' : read.some((r) => INSTRUCTION_FILE.test(r)) ? 'instruction' : read.length ? 'read' : 'run',
        cmd: cmd.slice(0, 160),
        ...(read.length ? { paths: read } : {}),
        ...(cli ? { cli, skill: SKILL_CLIS[cli] } : {}),
      }
    }
    default:
      return { ...base, tool, kind: 'tool' }
  }
}

// Whether a test run passed, from what it printed: false on any failure
// summary, true on a pass summary, undefined when neither shows.
const TESTS_FAILED = /\b[1-9]\d* (failed|failing)\b|^FAIL\b|\bFAILED\b|test result: FAILED|^--- FAIL|^# fail [1-9]/m
const TESTS_PASSED = /\b\d+ passed\b|test result: ok|^ok\s|^PASS\b|\bOK \(\d+ tests?\)|\bAll tests passed\b|^# pass [1-9]/m
export function testOutcome(output) {
  const text = String(output ?? '')
  if (TESTS_FAILED.test(text)) return false
  if (TESTS_PASSED.test(text)) return true
  return undefined
}

// After a test command: whether it passed. Nothing for any other tool.
export function testedEntry({ agent, session, tool, input = {}, response, at = Date.now() }) {
  if (tool !== 'Bash' || !TEST_COMMAND.test(String(input.command ?? ''))) return null
  const output = typeof response === 'string' ? response : `${response?.stdout ?? ''}\n${response?.stderr ?? ''}`
  const ok = testOutcome(output)
  return { at, agent, ...(session ? { session } : {}), tool, kind: 'tested', ...(ok === undefined ? {} : { ok }) }
}

// A person's prompt, as a trail line: that the agent started thinking, and the
// slash command's name when it is one. The prompt's text is never kept.
export function promptEntry({ agent, session, prompt, at = Date.now() }) {
  const command = String(prompt ?? '').trim().match(/^\/([\w:.-]+)/)?.[1]
  return { at, agent, ...(session ? { session } : {}), kind: command ? 'skill' : 'prompt', ...(command ? { skill: command.slice(0, 60) } : {}) }
}

// A session starting, with the context files Claude Code loads for it.
export function sessionEntry({ agent, session, root, at = Date.now() }) {
  const loaded = ['CLAUDE.md', 'AGENTS.md'].filter((f) => fs.existsSync(path.join(root, f)))
  return { at, agent, ...(session ? { session } : {}), kind: 'session', paths: loaded }
}

// Appends one line, trimming the file to its newest lines once it grows past
// MAX_TRAIL_BYTES. Only in a project Sleipnir has set up.
export function appendTrail(root, entry) {
  if (!entry) return false
  if (!fs.existsSync(path.join(root, '.sleipnir')) && !fs.existsSync(path.join(root, '.planning'))) return false
  const file = path.join(root, TRAIL_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
  if (fs.statSync(file).size > MAX_TRAIL_BYTES) {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    fs.writeFileSync(file, `${lines.slice(-KEEP_LINES).join('\n')}\n`)
  }
  return true
}

// --- what the trail says about how an agent worked ----------------------------
// Computed from the lines alone, so it costs no agent anything. Per session:
// how many tool calls, reads, searches, edits and test runs; files read over
// and over; the longest run of searches with nothing read after; reads before
// the first edit; rounds of edit → failing test → edit. Plus each file's share
// of the effort (reads count once, edits twice), and findings worth a look,
// most telling first. Sleipnir draws it (Planning's effort view); agents read it
// with `node .sleipnir/analyze.mjs trail --root .`.
export const REREAD_AT = 3
export const SEARCH_STREAK_AT = 4
export const READS_BEFORE_EDIT_AT = 15
export const FIX_LOOPS_AT = 2

export function trailInsights(entries) {
  const sessions = new Map()
  const effort = new Map()
  const bump = (p, by) => effort.set(p, (effort.get(p) ?? 0) + by)
  for (const e of entries) {
    const key = `${e.agent ?? 'unknown'}|${e.session ?? ''}`
    let s = sessions.get(key)
    if (!s) {
      s = { agent: e.agent ?? 'unknown', session: e.session ?? null, start: e.at, end: e.at, calls: 0, reads: 0, searches: 0, edits: 0, runs: 0, tests: 0, testFailures: 0, fixLoops: 0, readsBeforeFirstEdit: 0, longestSearchStreak: 0, readCounts: {}, edited: false, searchStreak: 0, failedSinceEdit: false }
      sessions.set(key, s)
    }
    s.end = e.at
    if (!['idle', 'prompt', 'session', 'tested'].includes(e.kind)) s.calls++
    if (e.kind === 'read' || e.kind === 'instruction') {
      s.reads++
      if (!s.edited) s.readsBeforeFirstEdit++
      for (const p of e.paths ?? []) {
        s.readCounts[p] = (s.readCounts[p] ?? 0) + 1
        bump(p, 1)
      }
      s.searchStreak = 0
    } else if (e.kind === 'search') {
      s.searches++
      s.searchStreak++
      s.longestSearchStreak = Math.max(s.longestSearchStreak, s.searchStreak)
    } else if (e.kind === 'edit') {
      s.edits++
      if (s.failedSinceEdit) s.fixLoops++
      s.failedSinceEdit = false
      s.edited = true
      s.searchStreak = 0
      for (const p of e.paths ?? []) bump(p, 2)
    } else if (e.kind === 'test') {
      s.tests++
    } else if (e.kind === 'run') {
      s.runs++
    } else if (e.kind === 'tested' && e.ok === false) {
      s.testFailures++
      s.failedSinceEdit = true
    }
  }

  const findings = []
  const out = [...sessions.values()].map((s) => {
    const rereads = Object.entries(s.readCounts)
      .filter(([, n]) => n >= REREAD_AT)
      .sort((a, b) => b[1] - a[1])
      .map(([path, count]) => ({ path, count }))
    const who = s.agent
    for (const r of rereads) findings.push({ weight: r.count, agent: who, path: r.path, text: `Read ${r.path} ${r.count} times` })
    if (s.fixLoops >= FIX_LOOPS_AT) findings.push({ weight: s.fixLoops * 3, agent: who, text: `${s.fixLoops} rounds of edit → failing tests → edit` })
    else if (s.testFailures >= 2) findings.push({ weight: s.testFailures * 2, agent: who, text: `Tests failed ${s.testFailures} times` })
    if (s.longestSearchStreak >= SEARCH_STREAK_AT) findings.push({ weight: s.longestSearchStreak, agent: who, text: `${s.longestSearchStreak} searches in a row before reading anything` })
    if (s.readsBeforeFirstEdit >= READS_BEFORE_EDIT_AT && s.edits > 0) findings.push({ weight: s.readsBeforeFirstEdit / 3, agent: who, text: `Read ${s.readsBeforeFirstEdit} files before the first edit` })
    return {
      agent: s.agent,
      session: s.session,
      start: s.start,
      end: s.end,
      calls: s.calls,
      reads: s.reads,
      searches: s.searches,
      edits: s.edits,
      runs: s.runs,
      tests: s.tests,
      testFailures: s.testFailures,
      fixLoops: s.fixLoops,
      readsBeforeFirstEdit: s.readsBeforeFirstEdit,
      longestSearchStreak: s.longestSearchStreak,
      rereads,
    }
  })
  findings.sort((a, b) => b.weight - a.weight)
  return {
    sessions: out,
    effort: [...effort].sort((a, b) => b[1] - a[1]).map(([path, score]) => ({ path, score })),
    findings: findings.map(({ weight: _weight, ...f }) => f),
  }
}

// The hook: Claude Code hands the event to stdin as JSON.
function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => (raw += d))
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(raw)
      const root = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd()
      const name = event.hook_event_name
      const session = String(event.session_id ?? '').slice(0, 8) || undefined
      const stopping = name === 'Stop' || name === 'SubagentStop'
      // Silence matters most here: Claude Code adds whatever a prompt or
      // session-start hook prints to the conversation. This prints nothing.
      const entry =
        name === 'UserPromptSubmit'
          ? promptEntry({ agent: 'claude', session, prompt: event.prompt })
          : name === 'PostToolUse'
            ? testedEntry({ agent: 'claude', session, tool: event.tool_name, input: event.tool_input, response: event.tool_response })
            : name === 'SessionStart'
            ? sessionEntry({ agent: 'claude', session, root })
            : entryFor({ agent: 'claude', session, tool: stopping ? undefined : event.tool_name, input: event.tool_input, root })
      // In a Sleipnir terminal: which conversation this terminal holds, so a restart can resume it.
      if (process.env.SLEIPNIR_TERMINAL && event.session_id) Object.assign(entry, { terminal: process.env.SLEIPNIR_TERMINAL, conversation: event.session_id })
      appendTrail(root, entry)
    } catch {
      // Watching must never get in the agent's way.
    }
    process.exit(0)
  })
}

// The renderer imports this file for trailInsights; only Node runs the hook.
if (typeof window === 'undefined' && process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
