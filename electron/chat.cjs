// AI chat request lifecycle — Electron main-process only, structurally
// parallel to terminal.cjs (id -> in-flight resource map, spawn/write/kill-
// shaped lifecycle, cleanup on quit) but for streamed LLM requests instead
// of pty processes. Provider-agnostic: delegates the actual model call to
// chatProviders/anthropic.cjs or chatProviders/ollama.cjs, selected below.
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const anthropicProvider = require('./chatProviders/anthropic.cjs')
const ollamaProvider = require('./chatProviders/ollama.cjs')

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

// Canonical tool definitions, translated into each provider's own schema
// shape by that provider's toProviderTools() (see chatProviders/*.cjs).
const TOOL_DEFS = [
  {
    name: 'create_plan_node',
    description:
      'Create one step of a plan the user asked for. Call this once per step — each call shows up as a node in Sleipnir\'s Planning > CLAUDE tab for the user to review and approve individually. Use the SAME plan_id for every step of one plan so they group together in the graph.',
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
]

const MAX_TOOL_TURNS = 6

async function executeTool(call) {
  if (call.name === 'create_plan_node') {
    const b = await getBackend()
    const { node } = b.createPlanNode(call.input.plan_id, call.input.label, call.input.description, call.input.parent_id)
    return { node, result: { created: true, node_id: node.id } }
  }
  if (call.name === 'generate_code') {
    const files = call.input.files || []
    // Not written to disk here — chat:codeGenerated hands the content to the
    // renderer, which stages it in an unsaved Code Editor tab (see
    // WorkspaceView.tsx's pendingOverride). Disk writes only happen when the
    // human hits Save.
    return { codeGenerated: { files }, result: { staged: true, fileCount: files.length } }
  }
  throw new Error(`Unknown tool: ${call.name}`)
}

async function sendMessage(sender, sessionId, history, userMessage) {
  const provider = selectProvider()
  const controller = new AbortController()
  requests.set(sessionId, controller)

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
          const { node, codeGenerated, result } = await executeTool(call)
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
  requests.get(sessionId)?.abort()
  requests.delete(sessionId)
}

function killAll() {
  for (const controller of requests.values()) {
    try {
      controller.abort()
    } catch {
      /* already settled */
    }
  }
  requests.clear()
}

module.exports = { sendMessage, cancel, killAll }
