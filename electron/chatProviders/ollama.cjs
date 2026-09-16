// Ollama-backed chat provider — local, no API key. Zero-cost way to
// exercise the whole chat/plan-node/approval pipeline during development.
// Tool-calling support and reliability depend entirely on the local model;
// expect it to be flakier than anthropic.cjs for structured multi-step
// tool use (see that module's comment).
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b'

// Can't cheaply probe whether `ollama serve` is actually running without an
// async round-trip, so this just reflects "configured to try" — a dead
// server surfaces as a normal chat:error from streamTurn's fetch failing.
function isAvailable() {
  return true
}

// Canonical { name, description, inputSchema } tool defs (see
// agent/tools/registry.cjs) -> Ollama's OpenAI-style function-calling schema.
function toProviderTools(defs) {
  return defs.map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: d.inputSchema ?? { type: 'object', properties: {} } },
  }))
}

// Same normalized return shape as anthropic.cjs#streamTurn. messages may
// carry a `tool_calls` field (on prior assistant turns) alongside role/content
// — preserved below, not just role+content, or a continued tool-use turn
// would silently lose the model's own prior tool calls.
async function streamTurn({ system, messages, toolDefs, signal, onText, onToolCall }) {
  const tools = toolDefs?.length ? toProviderTools(toolDefs) : undefined
  const withSystem = system ? [{ role: 'system', content: system }, ...messages] : messages
  let res
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
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
    throw new Error(
      `Couldn't reach Ollama at ${OLLAMA_URL} (${err instanceof Error ? err.message : String(err)}). Is 'ollama serve' running?`,
    )
  }

  if (!res.ok || !res.body) {
    throw new Error(`Ollama request failed (${res.status}). Is model "${MODEL}" pulled ('ollama pull ${MODEL}')?`)
  }

  let text = ''
  const toolCalls = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
      const delta = chunk.message?.content
      if (delta) {
        text += delta
        onText(delta)
      }
      if (chunk.message?.tool_calls) {
        for (const call of chunk.message.tool_calls) {
          const normalized = { id: `${Date.now()}-${toolCalls.length}`, name: call.function.name, input: call.function.arguments }
          toolCalls.push(normalized)
          onToolCall(normalized)
        }
      }
    }
  }

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

module.exports = { streamTurn, buildToolResultMessages, isAvailable, MODEL }
