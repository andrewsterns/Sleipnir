// @vitest-environment node
import { createRequire } from 'node:module'
import { beforeAll, describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)

// Stand-ins installed into Node's module cache before any provider loads:
// `electron` (for apiKeyStore/modelStore) and the two SDKs whose streaming we
// drive with scripted events.
function stubModule(id: string, exports: unknown) {
  const filename = require.resolve(id)
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as unknown as NodeJS.Module
}

let openaiScript: { events: { type: string; delta?: string }[]; response: unknown } = { events: [], response: {} }
let lastOpenAIRequest: Record<string, unknown> | null = null
class FakeOpenAI {
  responses = {
    stream: (body: Record<string, unknown>) => {
      lastOpenAIRequest = body
      const listeners: Record<string, ((e: unknown) => void)[]> = {}
      return {
        on(type: string, fn: (e: unknown) => void) {
          ;(listeners[type] ??= []).push(fn)
          return this
        },
        async finalResponse() {
          for (const e of openaiScript.events) for (const fn of listeners[e.type] ?? []) fn(e)
          return openaiScript.response
        },
      }
    },
  }
}

let geminiChunks: unknown[] = []
let lastGeminiRequest: Record<string, unknown> | null = null
class FakeGoogleGenAI {
  models = {
    generateContentStream: async (req: Record<string, unknown>) => {
      lastGeminiRequest = req
      return (async function* () {
        for (const c of geminiChunks) yield c
      })()
    },
  }
}

let modelRef: typeof import('./modelRef.cjs')
let providers: { detectProvider: (key: string) => string | null }
let openai: Record<string, any>
let gemini: Record<string, any>
let anthropic: Record<string, any>
let errors: { describeError: (err: unknown, p: { label: string; host: string }) => string }

beforeAll(() => {
  stubModule('electron', {
    app: { getPath: () => require('node:os').tmpdir() },
    safeStorage: { isEncryptionAvailable: () => false },
  })
  stubModule('openai', { default: FakeOpenAI })
  stubModule('@google/genai', { GoogleGenAI: FakeGoogleGenAI })
  process.env.OPENAI_API_KEY = 'sk-test-openai'
  process.env.GEMINI_API_KEY = 'AIza-test'

  modelRef = require('./modelRef.cjs')
  providers = require('./index.cjs')
  openai = require('./openai.cjs')
  gemini = require('./gemini.cjs')
  anthropic = require('./anthropic.cjs')
  errors = require('./errors.cjs')
})

describe('model refs', () => {
  it('parses provider:model, keeping colons inside Ollama model names', () => {
    expect(modelRef.parseModelRef('anthropic:claude-sonnet-5')).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5' })
    expect(modelRef.parseModelRef('ollama:qwen2.5-coder:7b')).toEqual({ provider: 'ollama', model: 'qwen2.5-coder:7b' })
    expect(modelRef.parseModelRef('ollama:local')).toEqual({ provider: 'ollama', model: 'local' })
  })

  it('reads the old bare Claude ids as Anthropic refs', () => {
    expect(modelRef.parseModelRef('claude-opus-5')).toEqual({ provider: 'anthropic', model: 'claude-opus-5' })
  })

  it('rejects anything else', () => {
    for (const bad of ['', 'gpt-5', 'nope:model', 'openai:', null, 42]) {
      expect(modelRef.parseModelRef(bad as string)).toBeNull()
    }
  })
})

describe('detectProvider', () => {
  it('recognizes each provider by key prefix', () => {
    expect(providers.detectProvider('sk-ant-api03-abc')).toBe('anthropic')
    expect(providers.detectProvider('sk-proj-abc')).toBe('openai')
    expect(providers.detectProvider('sk-abc')).toBe('openai')
    expect(providers.detectProvider('  AIzaSyabc ')).toBe('gemini')
    expect(providers.detectProvider('sk-or-v1-abc')).toBeNull()
    expect(providers.detectProvider('hello')).toBeNull()
  })
})

describe('describeError', () => {
  const p = { label: 'ChatGPT', host: 'api.openai.com' }
  it('explains auth, quota and network failures in plain words', () => {
    expect(errors.describeError({ status: 401, message: 'x' }, p)).toMatch(/rejected the key \(401\)/)
    expect(errors.describeError({ status: 429, message: 'x' }, p)).toMatch(/rate limited or out of credit/)
    expect(errors.describeError(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }), p)).toMatch(
      /Can't reach api\.openai\.com/,
    )
    expect(errors.describeError(new Error('got status: 403 Forbidden'), p)).toMatch(/\(403\)/)
  })
})

describe('OpenAI provider', () => {
  it('streams text, parses function-call arguments, and replays output items on the next turn', async () => {
    const functionCall = { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{"path":"a.ts"}', id: 'fc_1' }
    openaiScript = {
      events: [
        { type: 'response.output_text.delta', delta: 'Let me ' },
        { type: 'response.output_text.delta', delta: 'look.' },
      ],
      response: { output_text: 'Let me look.', output: [{ type: 'message', id: 'msg_1', content: [] }, functionCall] },
    }
    const deltas: string[] = []
    const turn = await openai.streamTurn({
      model: 'gpt-test',
      system: 'SYS',
      messages: [{ role: 'user', content: 'hi' }],
      toolDefs: [{ name: 'read_file', description: 'd', inputSchema: { $schema: 'x', type: 'object', properties: { path: { type: 'string' } } } }],
      onText: (d: string) => deltas.push(d),
      onToolCall: () => {},
    })

    expect(deltas.join('')).toBe('Let me look.')
    expect(turn.toolCalls).toEqual([{ id: 'call_1', name: 'read_file', input: { path: 'a.ts' } }])
    expect(lastOpenAIRequest).toMatchObject({ model: 'gpt-test', instructions: 'SYS', input: [{ role: 'user', content: 'hi' }] })
    const tools = lastOpenAIRequest!.tools as { parameters: Record<string, unknown>; strict: boolean }[]
    expect(tools[0].parameters.$schema).toBeUndefined()
    expect(tools[0].strict).toBe(false)

    const next = openai.buildToolResultMessages(turn.assistantTurn, [{ id: 'call_1', name: 'read_file', result: { content: 'x' } }])
    const input = openai.toInput([{ role: 'user', content: 'hi' }, ...next])
    expect(input).toEqual([
      { role: 'user', content: 'hi' },
      { type: 'message', id: 'msg_1', content: [] },
      functionCall,
      { type: 'function_call_output', call_id: 'call_1', output: '{"content":"x"}' },
    ])
  })

  it('keeps malformed arguments visible instead of throwing', async () => {
    openaiScript = { events: [], response: { output_text: '', output: [{ type: 'function_call', call_id: 'c', name: 't', arguments: '{oops' }] } }
    const turn = await openai.streamTurn({ model: 'm', messages: [], toolDefs: [], onText: () => {}, onToolCall: () => {} })
    expect(turn.toolCalls[0].input).toEqual({ _unparsedArguments: '{oops' })
  })
})

describe('Gemini provider', () => {
  it('keeps every part verbatim (thought signatures included) and answers calls by name', async () => {
    const callPart = { functionCall: { name: 'read_file', args: { path: 'a.ts' } }, thoughtSignature: 'SIG' }
    geminiChunks = [
      { candidates: [{ content: { parts: [{ text: 'Checking ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'now.' }] } }] },
      { candidates: [{ content: { parts: [callPart] } }] },
    ]
    const deltas: string[] = []
    const turn = await gemini.streamTurn({
      model: 'gemini-test',
      system: 'SYS',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      toolDefs: [{ name: 'read_file', description: 'd', inputSchema: { type: 'object', properties: {} } }],
      onText: (d: string) => deltas.push(d),
      onToolCall: () => {},
    })

    expect(deltas.join('')).toBe('Checking now.')
    expect(turn.text).toBe('Checking now.')
    expect(turn.toolCalls).toHaveLength(1)
    expect(turn.toolCalls[0]).toMatchObject({ name: 'read_file', input: { path: 'a.ts' } })
    expect(lastGeminiRequest).toMatchObject({
      model: 'gemini-test',
      contents: [
        { role: 'user', parts: [{ text: 'hi' }] },
        { role: 'model', parts: [{ text: 'hello' }] },
      ],
      config: { systemInstruction: 'SYS' },
    })

    const next = gemini.buildToolResultMessages(turn.assistantTurn, [
      { id: turn.toolCalls[0].id, name: 'read_file', result: { content: 'x' } },
    ])
    const contents = gemini.toContents(next)
    expect(contents[0].parts).toContainEqual(callPart)
    expect(contents[1]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'read_file', response: { content: 'x' } } }],
    })
  })

  it('wraps non-object results, and sends back a real call id', () => {
    const [, results] = gemini.buildToolResultMessages({ role: 'model', parts: [] }, [{ id: 'real-id', name: 't', result: 'plain' }])
    expect(results.geminiContent.parts[0].functionResponse).toEqual({ name: 't', id: 'real-id', response: { output: 'plain' } })
  })
})

describe('Ollama provider', () => {
  let ollama: Record<string, any>
  beforeAll(() => {
    ollama = require('./ollama.cjs')
  })

  // An NDJSON body Ollama would stream, one content delta per line.
  function fakeFetch(deltas: string[]) {
    const lines = deltas.map((d) => JSON.stringify({ message: { content: d } }) + '\n').join('')
    return async () => new Response(lines, { status: 200 })
  }

  const offered = new Set(['generate_code', 'read_file'])

  it('reads a tool call a small model wrote out as text', () => {
    expect(ollama.textToolCall('{"name": "read_file", "arguments": {"path": "a.ts"}}', offered)).toEqual({
      name: 'read_file',
      input: { path: 'a.ts' },
    })
    expect(ollama.textToolCall('```json\n{"name":"read_file","parameters":"{\\"path\\":\\"b\\"}"}\n```', offered)).toEqual({
      name: 'read_file',
      input: { path: 'b' },
    })
  })

  it('ignores JSON that is not a call to an offered tool', () => {
    expect(ollama.textToolCall('{"name": "rm_rf", "arguments": {}}', offered)).toBeNull()
    expect(ollama.textToolCall('Here you go: {"name": "read_file"}', offered)).toBeNull()
    expect(ollama.textToolCall('{"not": "a call"}', offered)).toBeNull()
  })

  it('turns a text tool call into a real one without streaming the raw JSON', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch(['{"name": "generate_code", ', '"arguments": {"files": [{"path": "x.txt", "content": "hi"}]}}']) as typeof fetch
    try {
      const shown: string[] = []
      const turn = await ollama.streamTurn({
        model: 'local',
        messages: [{ role: 'user', content: 'make x' }],
        toolDefs: [{ name: 'generate_code', description: 'd', inputSchema: {} }],
        onText: (d: string) => shown.push(d),
        onToolCall: () => {},
      })
      expect(shown).toEqual([])
      expect(turn.text).toBe('')
      expect(turn.toolCalls).toHaveLength(1)
      expect(turn.toolCalls[0]).toMatchObject({ name: 'generate_code', input: { files: [{ path: 'x.txt', content: 'hi' }] } })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('still streams an ordinary reply, and flushes held-back JSON that was not a call', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = fakeFetch(['  Hello', ' there']) as typeof fetch
      const shown: string[] = []
      const defs = [{ name: 'read_file', description: 'd', inputSchema: {} }]
      await ollama.streamTurn({ model: 'local', messages: [], toolDefs: defs, onText: (d: string) => shown.push(d), onToolCall: () => {} })
      expect(shown.join('')).toBe('  Hello there')

      globalThis.fetch = fakeFetch(['{"answer":', ' 42}']) as typeof fetch
      const flushed: string[] = []
      const turn = await ollama.streamTurn({ model: 'local', messages: [], toolDefs: defs, onText: (d: string) => flushed.push(d), onToolCall: () => {} })
      expect(flushed.join('')).toBe('{"answer": 42}')
      expect(turn.toolCalls).toEqual([])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('Anthropic provider', () => {
  it('normalizes schemas and flags failed tool results', () => {
    const [tool] = anthropic.toProviderTools([{ name: 't', description: 'd', inputSchema: { properties: 'bad' } }])
    expect(tool.input_schema).toEqual({ type: 'object', properties: {} })

    const [, user] = anthropic.buildToolResultMessages([], [
      { id: 'a', result: { ok: true } },
      { id: 'b', result: { error: 'nope' } },
    ])
    expect(user.content[0].is_error).toBeUndefined()
    expect(user.content[1].is_error).toBe(true)
  })
})
