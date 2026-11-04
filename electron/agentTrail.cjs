// The in-app agent's half of the agent trail (.planning/trail.jsonl — see
// tools/agentSkills/vendor/trail.mjs, which Claude Code runs as a hook and
// which this imports, so both write exactly the same lines). Every tool call
// the in-app agent makes is recorded before it runs: what it reads, edits and
// runs, drawn on the Planning graph as it happens. Recording never costs the
// model anything and never gets in a tool call's way.
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let trailModule = null
function loadTrail() {
  trailModule ??= import(pathToFileURL(path.join(__dirname, '..', 'tools', 'agentSkills', 'vendor', 'trail.mjs')).href)
  return trailModule
}

// The in-app tools in the trail's terms. Plan reports are left out: they're
// already on the graph as statuses.
function inAppEntry(trail, toolName, input, root, agent) {
  const base = { agent, root }
  const p = (x) => trail.relativePath(root, x)
  const entry = (kind, paths, extra = {}) => ({ ...trail.entryFor({ ...base, tool: toolName }), kind, paths: paths.filter(Boolean), ...extra })
  switch (toolName) {
    case 'read_file':
    case 'describe_file_architecture':
      return entry('read', [p(input?.path)])
    case 'list_files':
    case 'search_workspace':
    case 'analyze_architecture':
      return entry('search', [p(input?.path ?? input?.scope ?? '.')], input?.query ? { query: String(input.query).slice(0, 80) } : {})
    case 'generate_code':
      return entry('edit', (Array.isArray(input?.files) ? input.files : []).map((f) => p(f?.path)))
    case 'canvas_build':
      return entry('edit', [])
    case 'run_command': {
      const cmd = String(input?.command ?? '')
      return entry(trail.TEST_COMMAND.test(cmd) ? 'test' : 'run', [], { cmd: cmd.slice(0, 160) })
    }
    default:
      return null
  }
}

// After a test command the in-app agent ran: whether it passed.
async function recordToolResult({ root, toolName, input, result, agent = 'sleipnir' }) {
  if (!root || toolName !== 'run_command') return
  try {
    const trail = await loadTrail()
    const output = typeof result === 'string' ? result : JSON.stringify(result ?? '')
    const entry = trail.testedEntry({ agent, tool: 'Bash', input: { command: input?.command }, response: output })
    if (entry) trail.appendTrail(root, entry)
  } catch {
    // as above
  }
}

// Fire and forget: called as a tool call starts.
async function recordToolCall({ root, toolName, input, agent = 'sleipnir' }) {
  if (!root) return
  try {
    const trail = await loadTrail()
    const entry = inAppEntry(trail, toolName, input, root, agent)
    if (entry) trail.appendTrail(root, entry)
  } catch {
    // Watching must never get in the agent's way.
  }
}

// A person's message to the in-app agent: thinking starts, and a slash command
// (/frame, /component, /optimize) names its skill. Never the message's text.
async function recordPrompt({ root, prompt, agent = 'sleipnir' }) {
  if (!root) return
  try {
    const trail = await loadTrail()
    trail.appendTrail(root, trail.promptEntry({ agent, prompt }))
  } catch {
    // as above
  }
}

// The agent's turn ended.
async function recordIdle({ root, agent = 'sleipnir' }) {
  if (!root) return
  try {
    const trail = await loadTrail()
    trail.appendTrail(root, trail.entryFor({ agent, root }))
  } catch {
    // as above
  }
}

module.exports = { recordToolCall, recordToolResult, recordIdle, recordPrompt, inAppEntry }
