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
    name: 'create_library',
    description:
      'Create a brand-new blank component library or prototype library when the user asks to start a new one (e.g. "create a new component library called X", "start a fresh prototype library"). Same effect as the Planning UI\'s "+ New Library" button / the `/plan` slash command — do not use create_plan_node for this.',
    properties: {
      id: { type: 'string', description: 'Lowercase slug, letters/digits/hyphens only, e.g. "my-design-system".' },
      kind: { type: 'string', enum: ['component', 'prototype'] },
      label: { type: 'string', description: 'Human-readable display name, e.g. "My Design System".' },
      architecture: { type: 'string', enum: ['atomic', 'mvvm', 'mvc', 'mvp'], description: 'Defaults to "atomic" if not specified by the user.' },
      language: { type: 'string', enum: ['typescript', 'python', 'rust', 'go'], description: 'Defaults to "typescript" if not specified by the user.' },
    },
    required: ['id', 'kind', 'label'],
  },
  {
    name: 'generate_code',
    description:
      'Generate or modify real source code for an approved plan node, staged for human review — never written to disk directly. ' +
      'If editing a file that already exists in the project (the prompt may list likely candidate paths), set existing_path to its exact path and provide the FULL updated file content, not a diff or a snippet. ' +
      'If creating a brand-new component, provide component_name (PascalCase), tier, and parts instead, and its file shell will be scaffolded first. ' +
      'Always include the complete resulting file content for every file in `files` — the human reviews and saves each one manually in the Code Editor.',
    properties: {
      existing_path: { type: 'string', description: 'Exact existing file path to modify, e.g. "02_components/02_molecules/Button/Button.tsx". Omit when creating a new component.' },
      component_name: { type: 'string', description: 'PascalCase name — only when creating a brand-new component, not when editing an existing one.' },
      tier: { type: 'string', enum: ['atoms', 'molecules', 'organisms', 'templates', 'pages'], description: 'Only relevant when creating a new component.' },
      library_id: { type: 'string', description: 'Which component library to scaffold into — defaults to the default library if omitted. Only relevant when creating a new component.' },
      parts: {
        type: 'array',
        items: { type: 'string', enum: ['view', 'viewModel', 'interface'] },
        description: 'Which MVVM files to scaffold — only relevant when creating a new component.',
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Repo-relative path (no leading src/), e.g. "02_components/02_molecules/Button/Button.tsx".' },
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
  if (call.name === 'create_library') {
    const b = await getBackend()
    const { library } = b.createLibrary({
      id: call.input.id,
      kind: call.input.kind,
      label: call.input.label,
      architecture: call.input.architecture || 'atomic',
      language: call.input.language || 'typescript',
    })
    await b.regenerateGraph()
    return { library, result: { created: true, library_id: library.id } }
  }
  if (call.name === 'generate_code') {
    const files = call.input.files || []
    // New-component case: scaffold real file shells from templates first
    // (same mechanism NewComponentForm uses) so the staged paths actually
    // exist on disk once the human saves. Editing an existing file needs no
    // scaffold — existing_path already points at a real file.
    if (call.input.component_name) {
      const b = await getBackend()
      try {
        b.scaffoldComponent(call.input.component_name, call.input.tier, 'typescript', call.input.parts, call.input.library_id)
        await b.regenerateGraph()
      } catch {
        // Already exists — fine, we're just overlaying staged content on the existing shell.
      }
    }
    // Not written to disk here — chat:codeGenerated hands the content to the
    // renderer, which stages it in an unsaved Code Editor tab (see
    // DesignLibrary.view.tsx's pendingOverride). Disk writes only happen
    // when the human hits Save.
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
          const { node, library, codeGenerated, result } = await executeTool(call)
          if (node && !sender.isDestroyed()) sender.send('chat:planNodeCreated', sessionId, node)
          if (library && !sender.isDestroyed()) sender.send('chat:libraryCreated', sessionId, library)
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
