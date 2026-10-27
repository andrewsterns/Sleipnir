// Anthropic (Claude) chat provider. Real tool-use quality (structured,
// multi-step calls like create_plan_node) is meaningfully more reliable
// here than on most locally-hosted models — see ollama.cjs for the
// zero-key alternative used for free local development/testing.
//
// Every provider module exports the same descriptor (see ./index.cjs):
//   id, label, host, keyUrl, keyHint, envVars, needsKey, defaultModel,
//   looksLikeKey(key), validateKey(key), listModels(),
//   streamTurn({ model, system, messages, toolDefs, signal, onText, onToolCall }),
//   buildToolResultMessages(assistantTurn, results)
const Anthropic = require('@anthropic-ai/sdk')
const { resolveKey } = require('./keys.cjs')
const { describeError } = require('./errors.cjs')
const { normalizeToolSchema } = require('../agent/schemaAdapters.cjs')

const descriptor = {
  id: 'anthropic',
  label: 'Claude',
  company: 'Anthropic',
  host: 'api.anthropic.com',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  keyHint: 'sk-ant-…',
  envVars: ['ANTHROPIC_API_KEY'],
  needsKey: true,
  defaultModel: 'claude-sonnet-5',
}

// Shown before (or instead of, if offline) the live model list.
const KNOWN_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5', description: 'Most capable — best for hard, multi-step work' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Balanced speed and intelligence', recommended: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fastest and cheapest' },
]

function looksLikeKey(key) {
  return /^sk-ant-/.test(key)
}

let client = null
let clientForKey = null
function clientFor(key) {
  if (!client || clientForKey !== key) {
    client = new Anthropic({ apiKey: key })
    clientForKey = key
  }
  return client
}

function requireClient() {
  const resolved = resolveKey(descriptor)
  if (!resolved) throw new Error('Claude is not connected. Add an Anthropic API key in the AI panel (Connect models).')
  return clientFor(resolved.key)
}

function isAvailable() {
  return !!resolveKey(descriptor)
}

async function validateKey(key) {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 })
  } catch (err) {
    throw new Error(describeError(err, descriptor))
  }
}

async function listModels() {
  const anthropic = requireClient()
  const models = []
  for await (const m of anthropic.models.list({ limit: 100 })) {
    const known = KNOWN_MODELS.find((k) => k.id === m.id)
    models.push({
      id: m.id,
      label: m.display_name || known?.label || m.id,
      description: known?.description,
      recommended: known?.recommended,
      created: Date.parse(m.created_at) || 0,
    })
  }
  return models.sort((a, b) => b.created - a.created)
}

// Canonical { name, description, inputSchema } tool defs (see
// agent/tools/registry.cjs) -> Anthropic's { name, description, input_schema }.
function toProviderTools(defs) {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: normalizeToolSchema(d.inputSchema),
  }))
}

// messages: [{ role: 'user'|'assistant', content: string | Anthropic content blocks }]
// Streams text deltas via onText, fires onToolCall once per completed tool_use block
// (informational only — chat.cjs executes tools using the returned toolCalls array).
// Returns { text, toolCalls: [{ id, name, input }], assistantTurn } — assistantTurn is
// the raw content-block array to feed back as this turn's assistant message if the
// caller continues the conversation with tool results (see buildToolResultMessages).
async function streamTurn({ model, system, messages, toolDefs, signal, onText, onToolCall }) {
  const anthropic = requireClient()
  const tools = toolDefs?.length ? toProviderTools(toolDefs) : undefined

  try {
    const stream = anthropic.messages.stream(
      {
        model: model || descriptor.defaultModel,
        max_tokens: 16000,
        ...(system ? { system } : {}),
        messages,
        ...(tools ? { tools } : {}),
      },
      { signal },
    )

    stream.on('text', (delta) => onText(delta))

    const finalMessage = await stream.finalMessage()
    const text = finalMessage.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')

    const toolCalls = finalMessage.content
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({ id: block.id, name: block.name, input: block.input }))
    for (const call of toolCalls) onToolCall(call)

    return { text, toolCalls, assistantTurn: finalMessage.content }
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(describeError(err, descriptor))
  }
}

// Anthropic wants the assistant's own turn (text + tool_use blocks, verbatim)
// followed by a user turn carrying one tool_result block per call.
function buildToolResultMessages(assistantTurn, results) {
  return [
    { role: 'assistant', content: assistantTurn },
    {
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.id,
        content: JSON.stringify(r.result),
        ...(r.result && (r.result.error || r.result.declined) ? { is_error: true } : {}),
      })),
    },
  ]
}

module.exports = {
  ...descriptor,
  KNOWN_MODELS,
  looksLikeKey,
  isAvailable,
  validateKey,
  listModels,
  toProviderTools,
  streamTurn,
  buildToolResultMessages,
}
