// AI chat request lifecycle — Electron main-process only, structurally
// parallel to terminal.cjs (id -> in-flight resource map, spawn/write/kill-
// shaped lifecycle, cleanup on quit) but for streamed LLM requests instead
// of pty processes. Provider-agnostic: delegates the actual model call to
// chatProviders/anthropic.cjs or chatProviders/ollama.cjs, selected below.
const path = require('node:path')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const anthropicProvider = require('./chatProviders/anthropic.cjs')
const ollamaProvider = require('./chatProviders/ollama.cjs')
const commandRunner = require('./commandRunner.cjs')

// SLEIPNIR_MODEL_PROVIDER=anthropic|ollama forces a provider. Left unset,
// this defaults to Anthropic when a key is present (better tool-use quality
// — see chatProviders/anthropic.cjs), else falls back to a local Ollama
// server so the chat/plan-node/approval pipeline works out of the box with
// no account or key.
function selectProvider() {
  const explicit = process.env.SLEIPNIR_MODEL_PROVIDER
  if (explicit === 'anthropic') return anthropicProvider
  if (explicit === 'ollama') return ollamaProvider
  return anthropicProvider.isAvailable() ? anthropicProvider : ollamaProvider
}

// Same lazy dynamic-import trick as main.cjs's getBackend() — needs a
// file:// URL for absolute paths on Windows. Kept separate from main.cjs's
// own cached instance since chat.cjs has no reference to it; the module
// itself is idempotent to import twice (Node caches by resolved URL).
let backend
async function getBackend() {
  if (!backend) {
    const backendPath = path.join(__dirname, '..', 'tools', 'sleipnir-backend.mjs')
    backend = await import(pathToFileURL(backendPath).href)
  }
  return backend
}

// id -> AbortController. One entry per in-flight request; removed once the
// request settles (done/error) or is explicitly cancelled.
const requests = new Map()

// requestId -> { resolve, sessionId }. One entry per run_command proposal
// awaiting a human decision (see the 'run_command' branch of executeTool).
const pendingApprovals = new Map()

// sessionId -> Set<commandRunner id>. Tracks in-flight (already-approved)
// commandRunner runs per session so cancel() can kill them, not just abort
// the model stream.
const runningCommands = new Map()

// Canonical tool definitions, translated into each provider's own schema
// shape by that provider's toProviderTools() (see chatProviders/*.cjs).
const TOOL_DEFS = [
  {
    name: 'create_plan_node',
    description:
      'Create one step of a plan the user asked for. Call this once per step — each call shows up as a node in Sleipnir\'s Planning > AI tab for the user to review and approve individually. Use the SAME plan_id for every step of one plan so they group together in the graph.',
    properties: {
      plan_id: { type: 'string', description: 'Same value for every step in this plan — a short slug, e.g. "hamburger-menu".' },
      label: { type: 'string', description: 'Short step title, e.g. "HamburgerMenu component".' },
      description: { type: 'string', description: 'One or two sentences of detail for this step.' },
      parent_id: {
        type: 'string',
        description: 'Optional: the node id returned by a previous create_plan_node call in this same plan, to link this step under it.',
      },
    },
    required: ['plan_id', 'label'],
  },
  {
    name: 'read_file',
    description:
      'Read a file in the currently open Workspace project. Use this to inspect existing code before editing it with generate_code, or to answer questions about the project.',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path, no leading slash, e.g. "src/components/Button.tsx".' },
    },
    required: ['path'],
  },
  {
    name: 'generate_code',
    description:
      'Generate or modify source code in the currently open Workspace project, staged for human review — never written to disk directly. ' +
      'Provide the FULL file content for every file in `files`, using paths relative to the Workspace root (e.g. "src/components/Button.tsx"). ' +
      'Works identically for editing an existing file or creating a brand-new one — Sleipnir creates any missing folders automatically once the human saves.',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative path (no leading slash), e.g. "src/components/Button.tsx".' },
            content: { type: 'string', description: 'The complete file content after the change.' },
          },
          required: ['path', 'content'],
        },
        description: 'One entry per file to stage for review.',
      },
    },
    required: ['files'],
  },
  {
    name: 'run_command',
    description:
      'Propose running a shell command in the currently open Workspace (e.g. running tests, installing a dependency, running a build script). ' +
      'The human is shown a confirmation dialog and must explicitly approve it before anything executes — nothing runs silently. ' +
      'Returns the captured stdout/stderr and exit code once the command finishes, or a decline notice if the human refused.',
    properties: {
      command: { type: 'string', description: 'The executable to run, e.g. "npm".' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments, e.g. ["run", "test:run"].' },
    },
    required: ['command'],
  },
]

const MAX_TOOL_TURNS = 6

async function executeTool(call, ctx) {
  const b = await getBackend()
  // The backend tracks one workspace root at a time (workspace-root.mjs), so
  // it must be set to THIS message's calling window right before dispatch —
  // same safety property as main.cjs's `ws()` wrapper (set + synchronous
  // call, no await between), so two windows' concurrent in-flight messages
  // can't clobber each other's root mid-tool-call.
  b.setWorkspaceRoot(ctx.workspaceRoot)

  if (call.name === 'create_plan_node') {
    const { node } = b.createPlanNode(call.input.plan_id, call.input.label, call.input.description, call.input.parent_id)
    return { node, result: { created: true, node_id: node.id } }
  }
  if (call.name === 'read_file') {
    const { content } = b.readWorkspaceFile(call.input.path)
    return { result: { content } }
  }
  if (call.name === 'generate_code') {
    const files = call.input.files || []
    // Not written to disk here — chat:codeGenerated hands the content to the
    // renderer, which stages it in an unsaved Code Editor tab (see
    // WorkspaceView.tsx's pendingOverride). Disk writes only happen when the
    // human hits Save.
    return { codeGenerated: { files }, result: { staged: true, fileCount: files.length } }
  }
  if (call.name === 'run_command') {
    const { sender, sessionId } = ctx
    const { command, args = [] } = call.input
    const requestId = crypto.randomUUID()

    if (!sender.isDestroyed()) sender.send('chat:commandProposed', sessionId, { requestId, command, args })
    // Resolved by resolveCommandDecision() once the renderer answers (or by
    // cancel()/killAll() below if the chat is cancelled/the app quits first)
    // — nothing runs until a human explicitly approves.
    const approved = await new Promise((resolve) => pendingApprovals.set(requestId, { resolve, sessionId }))
    if (!approved) return { result: { ran: false, reason: 'Declined by the user.' } }

    return new Promise((resolve) => {
      const runId = commandRunner.run(sender, {
        command,
        args,
        cwd: ctx.workspaceRoot,
        timeoutMs: 60_000,
        onChunk: (stream, text) => {
          if (!sender.isDestroyed()) sender.send('chat:commandOutput', sessionId, { requestId, stream, text })
        },
        onExit: ({ exitCode, output, timedOut }) => {
          runningCommands.get(sessionId)?.delete(runId)
          if (!sender.isDestroyed()) sender.send('chat:commandDone', sessionId, { requestId, exitCode, timedOut })
          resolve({ result: { ran: true, exitCode, timedOut, output: output.slice(-4000) } })
        },
      })
      if (!runningCommands.has(sessionId)) runningCommands.set(sessionId, new Set())
      runningCommands.get(sessionId).add(runId)
    })
  }
  throw new Error(`Unknown tool: ${call.name}`)
}

function resolveCommandDecision(requestId, approved) {
  const pending = pendingApprovals.get(requestId)
  if (!pending) return // already resolved (e.g. the chat was cancelled first)
  pendingApprovals.delete(requestId)
  pending.resolve(approved)
}

async function sendMessage(sender, sessionId, history, userMessage, workspaceRoot) {
  const provider = selectProvider()
  const controller = new AbortController()
  requests.set(sessionId, { controller, wcId: sender.id })

  let messages = [...history, { role: 'user', content: userMessage }]
  let finalText = ''

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const { text, toolCalls, assistantTurn } = await provider.streamTurn({
        messages,
        toolDefs: TOOL_DEFS,
        signal: controller.signal,
        onText: (delta) => {
          if (!sender.isDestroyed()) sender.send('chat:token', sessionId, delta)
        },
        // Real work happens after the turn settles (below) — this is
        // informational only, fired as tool_use blocks complete mid-stream.
        onToolCall: () => {},
      })

      finalText = text
      if (!toolCalls.length) break

      const results = []
      for (const call of toolCalls) {
        try {
          const { node, codeGenerated, result } = await executeTool(call, { sender, sessionId, workspaceRoot })
          if (node && !sender.isDestroyed()) sender.send('chat:planNodeCreated', sessionId, node)
          if (codeGenerated && !sender.isDestroyed()) sender.send('chat:codeGenerated', sessionId, codeGenerated)
          results.push({ id: call.id, name: call.name, result })
        } catch (err) {
          results.push({ id: call.id, name: call.name, result: { error: err instanceof Error ? err.message : String(err) } })
        }
      }

      messages = [...messages, ...provider.buildToolResultMessages(assistantTurn, results)]
    }

    if (!sender.isDestroyed()) sender.send('chat:done', sessionId, finalText)
  } catch (err) {
    if (!sender.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      sender.send('chat:error', sessionId, message)
    }
  } finally {
    requests.delete(sessionId)
  }
}

function cancel(sessionId) {
  requests.get(sessionId)?.controller.abort()
  requests.delete(sessionId)
  // Without this, a run_command awaiting approval (or already running) for a
  // cancelled chat would hang its executeTool() promise forever — cancel
  // must fail it closed, same as an explicit decline.
  for (const [requestId, pending] of pendingApprovals) {
    if (pending.sessionId === sessionId) {
      pendingApprovals.delete(requestId)
      pending.resolve(false)
    }
  }
  const running = runningCommands.get(sessionId)
  if (running) {
    for (const runId of running) commandRunner.stop(runId)
    runningCommands.delete(sessionId)
  }
}

function killForWindow(wcId) {
  for (const [sessionId, request] of requests) {
    if (request.wcId === wcId) cancel(sessionId)
  }
}

function killAll() {
  for (const sessionId of [...requests.keys()]) cancel(sessionId)
}

module.exports = { sendMessage, cancel, killForWindow, killAll, resolveCommandDecision }
