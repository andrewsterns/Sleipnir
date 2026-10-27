// Ollama-backed chat provider — local, no API key. Zero-cost way to
// exercise the whole chat/plan-node/approval pipeline during development.
// Tool-calling support and reliability depend entirely on the local model;
// expect it to be flakier than anthropic.cjs for structured multi-step
// tool use (see that module's comment).
const { normalizeToolSchema } = require('../agent/schemaAdapters.cjs')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b'

// "ollama:local" in the model picker — whatever OLLAMA_MODEL (or the built-in
// default) names, for people who never picked a specific local model.
const LOCAL_MODEL_ID = 'local'

const descriptor = {
  id: 'ollama',
  label: 'Local Ollama',
  company: 'Ollama',
  host: OLLAMA_URL.replace(/^https?:\/\//, ''),
  keyUrl: 'https://ollama.com/download',
  keyHint: null,
  envVars: [],
  needsKey: false,
  defaultModel: LOCAL_MODEL_ID,
}

// No key to check — "available" means "configured to try". A dead server
// surfaces as a readable chat error from streamTurn, and as `reachable: false`
// from probe() in the Connect panel.
function isAvailable() {
  return true
}

function looksLikeKey() {
  return false
}

async function probe(timeoutMs = 1500) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

// Every model pulled locally (`ollama pull …`), plus the "local" default.
async function listModels() {
  const models = [{ id: LOCAL_MODEL_ID, label: `Default (${MODEL})`, description: 'OLLAMA_MODEL, or the built-in default', recommended: true }]
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      for (const m of data.models ?? []) {
        if (m.name && m.name !== MODEL) models.push({ id: m.name, label: m.name })
      }
    }
  } catch {
    // Not running — the default entry alone still lets someone pick Ollama.
  }
  return models
}

// Smaller local models (qwen2.5-coder among them) often answer a tool-enabled
// request with the call written out as text — `{"name": "…", "arguments": {…}}`,
// sometimes in a ```json fence — instead of Ollama's structured tool_calls.
// When the whole reply is exactly that, for a tool that was actually offered,
// it's treated as the call it was meant to be.
function textToolCall(text, offeredNames) {
  const body = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  if (!body.startsWith('{') || !body.endsWith('}')) return null
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  const name = parsed?.name ?? parsed?.function?.name
  if (typeof name !== 'string' || !offeredNames.has(name)) return null
  let input = parsed.arguments ?? parsed.parameters ?? parsed.input ?? parsed.function?.arguments ?? {}
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch {
      return null
    }
  }
  return input && typeof input === 'object' && !Array.isArray(input) ? { name, input } : null
}

// Canonical { name, description, inputSchema } tool defs (see
// agent/tools/registry.cjs) -> Ollama's OpenAI-style function-calling schema.
function toProviderTools(defs) {
  return defs.map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: normalizeToolSchema(d.inputSchema) },
  }))
}

// Same normalized return shape as anthropic.cjs#streamTurn. messages may
// carry a `tool_calls` field (on prior assistant turns) alongside role/content
// — preserved below, not just role+content, or a continued tool-use turn
// would silently lose the model's own prior tool calls.
async function streamTurn({ model, system, messages, toolDefs, signal, onText, onToolCall }) {
  const tools = toolDefs?.length ? toProviderTools(toolDefs) : undefined
  const withSystem = system ? [{ role: 'system', content: system }, ...messages] : messages
  const modelName = !model || model === LOCAL_MODEL_ID ? MODEL : model
  let res
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: withSystem.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        })),
        stream: true,
        ...(tools ? { tools } : {}),
      }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(
      `Couldn't reach Ollama at ${OLLAMA_URL} (${err instanceof Error ? err.message : String(err)}). Is 'ollama serve' running?`,
    )
  }

  if (!res.ok || !res.body) {
    throw new Error(`Ollama request failed (${res.status}). Is model "${modelName}" pulled ('ollama pull ${modelName}')?`)
  }

  let text = ''
  const toolCalls = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // A reply that opens with "{" or a code fence may be a tool call written as
  // text (see textToolCall) — held back rather than streamed, so raw JSON
  // never flashes into the chat. Flushed at the end if it wasn't one.
  let holding = null
  let sentChars = 0

  const emitText = (delta) => {
    text += delta
    if (holding === null) {
      if (!text.trim()) return // only whitespace so far — undecided
      holding = !!tools && /^\s*(\{|```)/.test(text)
    }
    if (holding) return
    onText(text.slice(sentChars))
    sentChars = text.length
  }

  // Ollama streams newline-delimited JSON objects, one per chunk — not SSE.
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (!line) continue

      const chunk = JSON.parse(line)
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`)
      const delta = chunk.message?.content
      if (delta) emitText(delta)
      if (chunk.message?.tool_calls) {
        for (const call of chunk.message.tool_calls) {
          const normalized = { id: `${Date.now()}-${toolCalls.length}`, name: call.function.name, input: call.function.arguments }
          toolCalls.push(normalized)
          onToolCall(normalized)
        }
      }
    }
  }

  if (!toolCalls.length && tools) {
    const call = textToolCall(text, new Set(toolDefs.map((d) => d.name)))
    if (call) {
      const normalized = { id: `${Date.now()}-0`, ...call }
      toolCalls.push(normalized)
      onToolCall(normalized)
      text = ''
    }
  }
  if (holding && text) onText(text)

  const assistantTurn = {
    content: text,
    tool_calls: toolCalls.length ? toolCalls.map((c) => ({ function: { name: c.name, arguments: c.input } })) : undefined,
  }
  return { text, toolCalls, assistantTurn }
}

// Ollama wants the assistant's own turn (content + tool_calls, verbatim)
// followed by one role:'tool' message per call result. No id-matching in
// Ollama's simplified schema — order must match the assistant's tool_calls.
function buildToolResultMessages(assistantTurn, results) {
  return [
    { role: 'assistant', content: assistantTurn.content, tool_calls: assistantTurn.tool_calls },
    ...results.map((r) => ({ role: 'tool', content: JSON.stringify(r.result) })),
  ]
}

module.exports = {
  ...descriptor,
  MODEL,
  LOCAL_MODEL_ID,
  looksLikeKey,
  isAvailable,
  probe,
  textToolCall,
  validateKey: async () => {},
  listModels,
  toProviderTools,
  streamTurn,
  buildToolResultMessages,
}
