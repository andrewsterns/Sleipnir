// Google Gemini chat provider (Gemini Developer API, keys from AI Studio).
// Same descriptor shape as anthropic.cjs.
//
// Tool-loop state: the model's content parts are replayed verbatim — Gemini's
// thinking models attach a `thoughtSignature` to their parts, and a function
// call sent back without it is rejected — followed by a user turn of
// functionResponse parts.
const { GoogleGenAI } = require('@google/genai')
const { resolveKey } = require('./keys.cjs')
const { describeError } = require('./errors.cjs')
const { normalizeToolSchema } = require('../agent/schemaAdapters.cjs')

const descriptor = {
  id: 'gemini',
  label: 'Gemini',
  company: 'Google',
  host: 'generativelanguage.googleapis.com',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyHint: 'AIza…',
  envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  needsKey: true,
  defaultModel: null,
}

// Gemini doesn't always give function calls an id; these stand in for one
// locally and are never sent back.
const SYNTHETIC_ID = 'gemini-local:'
const NOT_CHAT = /(embedding|tts|image|live|native-audio|aqa|veo|imagen|learnlm|robotics)/

function looksLikeKey(key) {
  return /^AIza/.test(key)
}

let client = null
let clientForKey = null
function clientFor(key) {
  if (!client || clientForKey !== key) {
    client = new GoogleGenAI({ apiKey: key })
    clientForKey = key
  }
  return client
}

function requireClient() {
  const resolved = resolveKey(descriptor)
  if (!resolved) throw new Error('Gemini is not connected. Add a Google AI Studio API key in the AI panel (Connect models).')
  return clientFor(resolved.key)
}

function isAvailable() {
  return !!resolveKey(descriptor)
}

async function validateKey(key) {
  try {
    const ai = new GoogleGenAI({ apiKey: key })
    await ai.models.list({ config: { pageSize: 1 } })
  } catch (err) {
    throw new Error(describeError(err, descriptor))
  }
}

async function listModels() {
  const ai = requireClient()
  const models = []
  const pager = await ai.models.list({ config: { pageSize: 100 } })
  for await (const m of pager) {
    const id = String(m.name ?? '').replace(/^models\//, '')
    if (!/gemini/.test(id) || NOT_CHAT.test(id)) continue
    if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue
    models.push({ id, label: m.displayName || id, description: m.description })
  }
  // No creation date in the listing — newest versions sort highest by id.
  models.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))
  // What a freshly connected key starts on (see index.cjs's firstModelFor).
  // A stable Flash, never Pro: most keys are free-tier AI Studio keys, and
  // Pro models have little or no free quota, so defaulting to one made the
  // very first message fail with a 429.
  const recommended =
    models.find((m) => m.id === 'gemini-flash-latest') ??
    models.find((m) => /flash/.test(m.id) && !/lite|preview|exp/.test(m.id)) ??
    models.find((m) => /flash/.test(m.id))
  if (recommended) recommended.recommended = true
  return models
}

function toProviderTools(defs) {
  return [
    {
      functionDeclarations: defs.map((d) => ({
        name: d.name,
        description: d.description,
        parametersJsonSchema: normalizeToolSchema(d.inputSchema),
      })),
    },
  ]
}

function toContents(messages) {
  return messages.map((m) => {
    if (m.geminiContent) return m.geminiContent
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text }] }
  })
}

async function streamTurn({ model, system, messages, toolDefs, signal, onText, onToolCall }) {
  const ai = requireClient()
  if (!model) throw new Error('Pick a Gemini model in the AI panel first.')

  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: toContents(messages),
      config: {
        ...(system ? { systemInstruction: system } : {}),
        ...(toolDefs?.length ? { tools: toProviderTools(toolDefs) } : {}),
        abortSignal: signal,
      },
    })

    const parts = []
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text && !part.thought) onText(part.text)
        parts.push(part)
      }
    }

    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('')
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, i) => ({
        id: p.functionCall.id || `${SYNTHETIC_ID}${i}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
      }))
    for (const call of toolCalls) onToolCall(call)

    return { text, toolCalls, assistantTurn: { role: 'model', parts } }
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error(describeError(err, descriptor))
  }
}

function buildToolResultMessages(assistantTurn, results) {
  return [
    { role: 'assistant', geminiContent: assistantTurn },
    {
      role: 'user',
      geminiContent: {
        role: 'user',
        parts: results.map((r) => ({
          functionResponse: {
            name: r.name,
            ...(r.id && !String(r.id).startsWith(SYNTHETIC_ID) ? { id: r.id } : {}),
            // Gemini requires an object here.
            response: r.result && typeof r.result === 'object' && !Array.isArray(r.result) ? r.result : { output: r.result },
          },
        })),
      },
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
  toContents,
  streamTurn,
  buildToolResultMessages,
}
