// Anthropic-backed chat provider. Real tool-use quality (structured,
// multi-step calls like create_plan_node) is meaningfully more reliable
// here than on most locally-hosted models — see ollama.cjs for the
// zero-key alternative used for free local development/testing.
const Anthropic = require('@anthropic-ai/sdk')
const apiKeyStore = require('../apiKeyStore.cjs')
const modelStore = require('../modelStore.cjs')

const PROVIDER_ID = 'anthropic'

// BYOK key (see apiKeyStore.cjs, set via Settings in the AI Chat panel)
// takes precedence over ANTHROPIC_API_KEY in the environment — the env var
// is a dev-only convenience, not how an end user of a packaged build would
// configure this. No caching of the resolved key itself: cheap to re-read,
// and it lets Settings changes take effect on the very next message without
// restarting the app.
function resolveApiKey() {
  return apiKeyStore.getKey(PROVIDER_ID) || process.env.ANTHROPIC_API_KEY || null
}

let client = null
let clientForKey = null
function getClient() {
  const apiKey = resolveApiKey()
  if (!apiKey) return null
  if (!client || clientForKey !== apiKey) {
    client = new Anthropic({ apiKey })
    clientForKey = apiKey
  }
  return client
}

function isAvailable() {
  return !!resolveApiKey()
}

// Canonical { name, description, inputSchema } tool defs (see
// agent/tools/registry.cjs) -> Anthropic's { name, description, input_schema }.
function toProviderTools(defs) {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema ?? { type: 'object', properties: {} },
  }))
}

// system: the shared system prompt (agent/systemPrompt.cjs).
// messages: [{ role: 'user'|'assistant', content: string | Anthropic content blocks }]
// toolDefs: canonical tool definitions — empty/undefined for a plain turn.
// Streams text deltas via onText, fires onToolCall once per completed tool_use block
// (informational only — chat.cjs executes tools using the returned toolCalls array).
// Returns { text, toolCalls: [{ id, name, input }], assistantTurn } — assistantTurn is
// the raw content-block array to feed back as this turn's assistant message if the
// caller continues the conversation with tool results (see buildToolResultMessages).
async function streamTurn({ system, messages, toolDefs, signal, onText, onToolCall }) {
  const anthropic = getClient()
  if (!anthropic) {
    throw new Error('No Anthropic API key configured. Add one in AI Chat\'s Settings (gear icon), or switch SLEIPNIR_MODEL_PROVIDER=ollama.')
  }

  const tools = toolDefs?.length ? toProviderTools(toolDefs) : undefined

  const stream = anthropic.messages.stream(
    {
      model: modelStore.getModel(),
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
}

// Anthropic wants the assistant's own turn (text + tool_use blocks, verbatim)
// followed by a user turn carrying one tool_result block per call.
function buildToolResultMessages(assistantTurn, results) {
  return [
    { role: 'assistant', content: assistantTurn },
    {
      role: 'user',
      content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result) })),
    },
  ]
}

module.exports = { streamTurn, buildToolResultMessages, isAvailable }
