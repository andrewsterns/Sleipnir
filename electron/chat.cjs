// AI chat request lifecycle — Electron main-process only, structurally
// parallel to terminal.cjs (id -> in-flight resource map, cleanup per window
// and on quit) but for streamed LLM requests instead of pty processes.
//
// Provider-agnostic: the model call is delegated to chatProviders/*.cjs, the
// tools come from agent/tools/registry.cjs, and whether each tool call may run
// is decided by agent/permissions.cjs for the session's permission mode. This
// file is only the loop that ties them together and the IPC it speaks.
const crypto = require('node:crypto')
const anthropicProvider = require('./chatProviders/anthropic.cjs')
const ollamaProvider = require('./chatProviders/ollama.cjs')
const modelStore = require('./modelStore.cjs')
const registry = require('./agent/tools/registry.cjs')
const permissions = require('./agent/permissions.cjs')
const permissionStore = require('./agent/permissionStore.cjs')
const agentSettings = require('./agent/agentSettingsStore.cjs')
const systemPrompt = require('./agent/systemPrompt.cjs')
const changeSets = require('./agent/changeSets.cjs')

// SLEIPNIR_MODEL_PROVIDER=anthropic|ollama forces a provider, overriding
// everything else (dev-only escape hatch). Otherwise: an explicit "Local
// Ollama" pick in the model dropdown (modelStore.OLLAMA_MODEL_ID) always wins
// — even with a key configured — since picking it is a deliberate choice to
// run local. Left unset, this defaults to Anthropic when a key is present
// (better tool-use quality — see chatProviders/anthropic.cjs), else falls
// back to a local Ollama server so the chat/plan-node/approval pipeline works
// out of the box with no account or key.
function selectProvider() {
  const explicit = process.env.SLEIPNIR_MODEL_PROVIDER
  if (explicit === 'anthropic') return anthropicProvider
  if (explicit === 'ollama') return ollamaProvider
  if (modelStore.getModel() === modelStore.OLLAMA_MODEL_ID) return ollamaProvider
  return anthropicProvider.isAvailable() ? anthropicProvider : ollamaProvider
}

// sessionId -> { controller, wcId, cancelHooks }. One entry per in-flight
// message; removed once it settles or is cancelled. cancelHooks stop work a
// tool started (a running command) that aborting the model stream can't reach.
const requests = new Map()

// callId -> { resolve, sessionId, wcId }. One entry per tool call waiting on a
// human decision. cancel()/killForWindow() resolve these as a denial, so a
// cancelled chat fails closed instead of hanging forever.
const pendingApprovals = new Map()

function send(sender, channel, sessionId, payload) {
  if (!sender.isDestroyed()) sender.send(channel, sessionId, payload)
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err)
}

function safeSummary(tool, input) {
  try {
    return String(tool.summarize?.(input) ?? '').slice(0, 200)
  } catch {
    return ''
  }
}

// What an approval card shows for "what exactly will this do" — capped, since
// generate_code's input carries whole files (its change set shows those).
const INPUT_PREVIEW_CHARS = 2_000
function previewInput(input) {
  try {
    const json = JSON.stringify(input, null, 2)
    return json.length > INPUT_PREVIEW_CHARS ? `${json.slice(0, INPUT_PREVIEW_CHARS)}\n…` : json
  } catch {
    return ''
  }
}

function waitForDecision(callId, sessionId, wcId) {
  return new Promise((resolve) => pendingApprovals.set(callId, { resolve, sessionId, wcId }))
}

// Runs one tool call end to end — permission check, optional prepare step,
// approval, execution — and returns what goes back to the model. Every stage
// is mirrored to the renderer as `chat:tool` patches keyed by callId, so the
// chat shows one row per call that updates in place.
async function runToolCall(call, byName, base) {
  const { sender, sessionId, workspaceRoot, mode, request } = base
  const tool = byName.get(call.name)
  if (!tool) {
    return { error: `Tool "${call.name}" is not available in ${mode} mode.` }
  }

  const callId = crypto.randomUUID()
  const input = call.input && typeof call.input === 'object' ? call.input : {}
  const ctx = {
    ...base,
    callId,
    emit: (channel, payload) => send(sender, channel, sessionId, payload),
    update: (patch) => send(sender, 'chat:tool', sessionId, { callId, ...patch }),
    output: (text) => send(sender, 'chat:toolOutput', sessionId, { callId, text }),
    onCancel: (fn) => request.cancelHooks.add(fn),
  }

  ctx.update({
    name: tool.name,
    kind: tool.kind,
    summary: safeSummary(tool, input),
    inputPreview: previewInput(input),
    status: 'running',
  })

  try {
    const verdict = permissions.decide({ mode, tool, input, rules: permissionStore.getRules(workspaceRoot) })
    if (verdict === 'deny') {
      ctx.update({ status: 'denied' })
      return { error: `${tool.name} is not allowed in ${mode} mode.` }
    }

    const prepared = tool.prepare ? await tool.prepare(input, ctx) : undefined
    if (prepared?.card) ctx.update(prepared.card)

    let decision = { decision: 'auto' }
    if (verdict === 'ask') {
      const canRemember = permissions.canRemember(tool, input)
      ctx.update({ status: 'awaiting-approval', canRemember })
      decision = await waitForDecision(callId, sessionId, base.wcId)
      if (decision.decision === 'deny') {
        tool.onDenied?.(input, ctx, { prepared })
        ctx.update({ status: 'denied' })
        return { declined: true, reason: 'The human declined this.' }
      }
      if (decision.decision === 'always' && canRemember) {
        permissionStore.addRule(workspaceRoot, permissions.ruleKeyFor(tool, input))
      }
      ctx.update({ status: 'running' })
    }

    const result = await tool.execute(input, ctx, { prepared, decision })
    ctx.update({ status: 'done' })
    return result ?? { ok: true }
  } catch (err) {
    const message = errorMessage(err)
    ctx.update({ status: 'error', error: message })
    return { error: message }
  }
}

// options.mode: one of permissions.MODES; defaults to the user's saved default.
async function sendMessage(sender, sessionId, history, userMessage, workspaceRoot, options = {}) {
  const settings = agentSettings.getSettings()
  const mode = permissions.normalizeMode(options?.mode ?? settings.defaultMode)
  const provider = selectProvider()
  const controller = new AbortController()
  const request = { controller, wcId: sender.id, cancelHooks: new Set() }
  requests.set(sessionId, request)

  const base = { sender, wcId: sender.id, sessionId, workspaceRoot, mode, signal: controller.signal, request }
  let messages = [...history, { role: 'user', content: userMessage }]
  let finalText = ''

  try {
    const { tools, byName } = await registry.toolsFor({ mode, workspaceRoot, wcId: sender.id })
    const toolDefs = registry.toDefs(tools)
    const system = systemPrompt.build({ mode, workspaceRoot })
    let hitTurnLimit = true

    for (let turn = 0; turn < settings.maxToolTurns; turn++) {
      const { text, toolCalls, assistantTurn } = await provider.streamTurn({
        system,
        messages,
        toolDefs,
        signal: controller.signal,
        onText: (delta) => send(sender, 'chat:token', sessionId, delta),
        // Real work happens after the turn settles (below) — this is
        // informational only, fired as tool calls complete mid-stream.
        onToolCall: () => {},
      })

      finalText = text
      if (!toolCalls.length) {
        hitTurnLimit = false
        break
      }

      const results = []
      for (const call of toolCalls) {
        results.push({ id: call.id, name: call.name, result: await runToolCall(call, byName, base) })
        if (controller.signal.aborted) break
      }
      if (controller.signal.aborted) break

      messages = [...messages, ...provider.buildToolResultMessages(assistantTurn, results)]
    }

    if (hitTurnLimit && !controller.signal.aborted) {
      const notice = `\n\n[Stopped after ${settings.maxToolTurns} tool steps — send "continue" to keep going.]`
      send(sender, 'chat:token', sessionId, notice)
      finalText += notice
    }
    send(sender, 'chat:done', sessionId, finalText)
  } catch (err) {
    // A cancel aborts the stream mid-flight; that's the human's own doing,
    // not an error worth reporting back to them.
    if (controller.signal.aborted) send(sender, 'chat:done', sessionId, finalText)
    else send(sender, 'chat:error', sessionId, errorMessage(err))
  } finally {
    if (requests.get(sessionId) === request) requests.delete(sessionId)
  }
}

// decision: 'once' | 'always' | 'deny'. `paths` narrows an approved change
// set to some of its files. Only the window that owns the call may answer it.
function resolveToolDecision(wcId, callId, decision, paths) {
  const pending = pendingApprovals.get(callId)
  if (!pending || pending.wcId !== wcId) return
  pendingApprovals.delete(callId)
  const normalized = decision === 'once' || decision === 'always' ? decision : 'deny'
  pending.resolve({ decision: normalized, paths: Array.isArray(paths) ? paths : undefined })
}

async function applyChangeSet(wcId, id, paths) {
  if (!changeSets.belongsTo(id, wcId)) throw new Error('That change set no longer exists.')
  return changeSets.apply(id, paths)
}

async function undoChangeSet(wcId, id) {
  if (!changeSets.belongsTo(id, wcId)) throw new Error('That change set no longer exists.')
  return changeSets.undo(id)
}

function cancel(sessionId) {
  const request = requests.get(sessionId)
  request?.controller.abort()
  requests.delete(sessionId)
  for (const [callId, pending] of pendingApprovals) {
    if (pending.sessionId === sessionId) {
      pendingApprovals.delete(callId)
      pending.resolve({ decision: 'deny' })
    }
  }
  for (const stop of request?.cancelHooks ?? []) {
    try {
      stop()
    } catch {
      // already gone
    }
  }
}

function killForWindow(wcId) {
  for (const [sessionId, request] of requests) {
    if (request.wcId === wcId) cancel(sessionId)
  }
  changeSets.killForWindow(wcId)
}

function killAll() {
  for (const sessionId of [...requests.keys()]) cancel(sessionId)
  changeSets.killAll()
}

module.exports = { sendMessage, cancel, killForWindow, killAll, resolveToolDecision, applyChangeSet, undoChangeSet }
