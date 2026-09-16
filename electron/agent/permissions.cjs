// Permission decisions for agent tool calls — pure, no Electron imports, so
// it's unit-testable directly (see permissions.test.ts). Every tool call from
// every provider, every MCP server and the Sleipnir MCP server goes through
// decide() before it runs; chat.cjs owns actually waiting on a human when the
// answer is 'ask'.
//
// A tool declares what it does via `kind`, not what mode it's allowed in —
// the mode table below is the single place that maps one onto the other:
//
//   read      inspects the project, changes nothing        (read_file, git_status)
//   edit      changes reviewable/undoable project state     (generate_code, create_plan_node, canvas edits, git_stage)
//   exec      runs something or changes history            (run_command, git_commit, git_checkout)
//   external  an outside MCP tool that may change anything
//
// `alwaysAsk` (push, pull, destructive MCP tools) outranks every mode and every
// saved rule: those are asked about every single time, and denied outright in
// the modes where nobody is there to ask.

const MODES = ['ask', 'acceptEdits', 'plan', 'auto', 'headless']

// The modes a person picks between in the chat UI, in Shift+Tab cycle order.
// 'headless' is internal: Planning's one-shot build sessions, which have no
// chat UI mounted to show an approval card in.
const USER_MODES = ['ask', 'acceptEdits', 'plan', 'auto']

const DEFAULT_MODE = 'ask'

function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : DEFAULT_MODE
}

// The key an "Always allow in this project" rule is stored under. Most tools
// are allowed as a whole; a tool can narrow that with ruleKey(input) —
// run_command does, so allowing `npm` doesn't also allow `rm`. A ruleKey that
// returns null means "this particular call can never be pre-approved" (e.g. a
// command line carrying shell metacharacters), so it always asks.
function ruleKeyFor(tool, input) {
  if (typeof tool.ruleKey === 'function') return tool.ruleKey(input ?? {}) || null
  return tool.name
}

// → 'allow' | 'ask' | 'deny'
function decide({ mode, tool, input, rules }) {
  const m = normalizeMode(mode)
  const kind = tool.kind

  if (kind === 'read') return 'allow'

  if (m === 'plan') {
    // Plan mode explores and writes the plan itself — nothing else.
    return kind === 'edit' && tool.allowInPlan ? 'allow' : 'deny'
  }

  if (m === 'headless') {
    if (tool.alwaysAsk) return 'deny'
    return kind === 'edit' ? 'allow' : 'deny'
  }

  if (tool.alwaysAsk) return 'ask'

  if (m === 'auto') return 'allow'
  if (m === 'acceptEdits' && kind === 'edit') return 'allow'

  const saved = rules instanceof Set ? rules : new Set(rules ?? [])
  const key = ruleKeyFor(tool, input)
  if (key && saved.has(key)) return 'allow'
  return 'ask'
}

// Whether the model should be offered this tool at all in this mode. A tool
// that would only ever be denied is left out of the list entirely, so the
// model plans around it instead of calling it and hitting a refusal.
function isOffered(mode, tool) {
  return decide({ mode, tool, input: undefined, rules: undefined }) !== 'deny'
}

// Whether an approval card for this call may offer "Always allow".
function canRemember(tool, input) {
  return !tool.alwaysAsk && tool.kind !== 'read' && ruleKeyFor(tool, input) !== null
}

module.exports = { MODES, USER_MODES, DEFAULT_MODE, normalizeMode, ruleKeyFor, decide, isOffered, canRemember }
