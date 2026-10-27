// OpenAI (ChatGPT models) chat provider, on the Responses API with streamed
// function calling. Same descriptor shape as anthropic.cjs.
//
// Tool-loop state: the model's own output items (messages, function calls,
// reasoning) are replayed verbatim as input on the next turn, followed by one
// function_call_output per call — the Responses API's documented way to
// continue a conversation without previous_response_id.
const OpenAIModule = require('openai')
const { resolveKey } = require('./keys.cjs')
const { describeError } = require('./errors.cjs')
const { normalizeToolSchema } = require('../agent/schemaAdapters.cjs')

const OpenAI = OpenAIModule.default ?? OpenAIModule

const descriptor = {
  id: 'openai',
  label: 'ChatGPT',
  company: 'OpenAI',
  host: 'api.openai.com',
  keyUrl: 'https://platform.openai.com/api-keys',
  keyHint: 'sk-proj-…',
  envVars: ['OPENAI_API_KEY'],
  needsKey: true,
  defaultModel: null,
}

// The models list endpoint returns every model the key can use — embeddings,
// speech, images, moderation. Only chat-capable text models belong in the
// picker.
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/
const NOT_CHAT = /(audio|realtime|transcribe|tts|image|embedding|search|moderation|instruct|dall-e|whisper|computer-use|-preview-\d{4})/

function looksLikeKey(key) {
  return /^sk-/.test(key) && !/^sk-ant-/.test(key) && !/^sk-or-/.test(key)
}

let client = null
let clientForKey = null
function clientFor(key) {
  if (!client || clientForKey !== key) {
    client = new OpenAI({ apiKey: key })
    clientForKey = key
  }
  return client
}

function requireClient() {
  const resolved = resolveKey(descriptor)
  if (!resolved) throw new Error('ChatGPT is not connected. Add an OpenAI API key in the AI panel (Connect models).')
  return clientFor(resolved.key)
}

function isAvailable() {
  return !!resolveKey(descriptor)
}

async function validateKey(key) {
  try {
    await new OpenAI({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list()
  } catch (err) {
    throw new Error(describeError(err, descriptor))
  }
}

async function listModels() {
  const openai = requireClient()
  const models = []
  for await (const m of openai.models.list()) {
    if (!CHAT_MODEL.test(m.id) || NOT_CHAT.test(m.id)) continue
    models.push({ id: m.id, label: m.id, created: (m.created ?? 0) * 1000 })
  }
  return models.sort((a, b) => b.created - a.created)
}

function toProviderTools(defs) {
  return defs.map((d) => ({
    type: 'function',
    name: d.name,
    description: d.description,
    parameters: normalizeToolSchema(d.inputSchema),
    // Strict mode requires every property to be required and
    // additionalProperties: false — MCP schemas rarely are.
    strict: false,
  }))
}

// Plain-text history turns become easy input messages; tool-loop items built
// by buildToolResultMessages pass through untouched.
function toInput(messages) {
  return messages.flatMap((m) => {
    if (m.openaiItems) return m.openaiItems
    return [{ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  })
}

function parseArguments(raw) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { _unparsedArguments: raw }
  }
}

async function streamTurn({ model, system, messages, toolDefs, signal, onText, onToolCall }) {
  const openai = requireClient()
  if (!model) throw new Error('Pick a ChatGPT model in the AI panel first.')
  const tools = toolDefs?.length ? toProviderTools(toolDefs) : undefined

  try {
    const stream = openai.responses.stream(
      {
        model,
        ...(system ? { instructions: system } : {}),
        input: toInput(messages),
        ...(tools ? { tools } : {}),
      },
      { signal },
    )
    stream.on('response.output_text.delta', (event) => onText(event.delta))

    const response = await stream.finalResponse()
    const toolCalls = response.output
      .filter((item) => item.type === 'function_call')
      .map((item) => ({ id: item.call_id, name: item.name, input: parseArguments(item.arguments) }))
    for (const call of toolCalls) onToolCall(call)

    return { text: response.output_text ?? '', toolCalls, assistantTurn: response.output }
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(describeError(err, descriptor))
  }
}

// Carried as one synthetic message whose `openaiItems` toInput() splices back
// in, so chat.cjs's provider-agnostic `messages` array stays a flat list.
function buildToolResultMessages(assistantTurn, results) {
  return [
    {
      role: 'assistant',
      openaiItems: [
        ...assistantTurn,
        ...results.map((r) => ({ type: 'function_call_output', call_id: r.id, output: JSON.stringify(r.result) })),
      ],
    },
  ]
}

module.exports = {
  ...descriptor,
  looksLikeKey,
  isAvailable,
  validateKey,
  listModels,
  toProviderTools,
  toInput,
  streamTurn,
  buildToolResultMessages,
}
