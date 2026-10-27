// The provider registry: which model providers exist, whether each is
// connected, what models it offers, and which provider + model a chat message
// should actually use right now.
const apiKeyStore = require('../apiKeyStore.cjs')
const modelStore = require('../modelStore.cjs')
const { resolveKey } = require('./keys.cjs')
const { parseModelRef, formatModelRef } = require('./modelRef.cjs')
const anthropic = require('./anthropic.cjs')
const openai = require('./openai.cjs')
const gemini = require('./gemini.cjs')
const ollama = require('./ollama.cjs')

// Order matters twice: it's the order of the Connect panel, and the order the
// fallback walks when the chosen model's provider isn't connected.
const PROVIDERS = [anthropic, openai, gemini, ollama]

const MODEL_CACHE_MS = 60 * 60 * 1000

function get(id) {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

// Which cloud provider a pasted key belongs to, by its prefix.
function detectProvider(key) {
  const value = String(key ?? '').trim()
  return PROVIDERS.find((p) => p.needsKey && p.looksLikeKey(value))?.id ?? null
}

async function status(provider) {
  const base = {
    id: provider.id,
    label: provider.label,
    company: provider.company,
    keyUrl: provider.keyUrl,
    keyHint: provider.keyHint,
    needsKey: provider.needsKey,
  }
  if (!provider.needsKey) {
    return { ...base, connected: await provider.probe(), source: null, hint: null, envVar: null }
  }
  const resolved = resolveKey(provider)
  return {
    ...base,
    connected: !!resolved,
    source: resolved?.source ?? null,
    hint: resolved ? resolved.key.slice(-4) : null,
    envVar: resolved?.envVar ?? null,
  }
}

function listProviders() {
  return Promise.all(PROVIDERS.map(status))
}

// providerId -> { at, key, models }. Keyed on the key too, so connecting a
// different account refetches instead of showing the old account's models.
const modelCache = new Map()

function clearModelCache(providerId) {
  if (providerId) modelCache.delete(providerId)
  else modelCache.clear()
}

async function listModels(providerId, { refresh = false } = {}) {
  const provider = get(providerId)
  if (!provider) throw new Error(`Unknown provider: ${providerId}`)
  const cacheKey = provider.needsKey ? resolveKey(provider)?.key ?? null : 'local'
  const cached = modelCache.get(providerId)
  if (!refresh && cached && cached.key === cacheKey && Date.now() - cached.at < MODEL_CACHE_MS) return cached.models
  const models = await provider.listModels()
  modelCache.set(providerId, { at: Date.now(), key: cacheKey, models })
  return models
}

// Every connected provider's models, grouped. A provider whose listing fails
// still appears — with its error, and (for Claude) the known models — so one
// flaky endpoint doesn't empty the whole picker.
async function listAllModels({ refresh = false } = {}) {
  const statuses = await listProviders()
  const groups = []
  for (const s of statuses) {
    if (!s.connected && s.needsKey) continue
    const provider = get(s.id)
    try {
      groups.push({ provider: s.id, label: s.label, models: await listModels(s.id, { refresh }) })
    } catch (err) {
      groups.push({
        provider: s.id,
        label: s.label,
        models: provider.KNOWN_MODELS ?? (s.id === 'ollama' ? await provider.listModels() : []),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return groups
}

async function firstModelFor(provider) {
  if (provider.defaultModel) return provider.defaultModel
  try {
    const models = await listModels(provider.id)
    return (models.find((m) => m.recommended) ?? models[0])?.id ?? null
  } catch {
    return null
  }
}

// → { provider, model, ref, fallback }. `fallback` is true when the saved
// choice couldn't be used (its provider isn't connected) and something else
// was picked, so the UI can say so.
async function resolveActive() {
  const saved = parseModelRef(modelStore.getModel())

  // Dev-only escape hatch: SLEIPNIR_MODEL_PROVIDER forces a provider.
  const forced = get(process.env.SLEIPNIR_MODEL_PROVIDER)
  if (forced) {
    const model = saved?.provider === forced.id ? saved.model : await firstModelFor(forced)
    return { provider: forced, model, ref: formatModelRef(forced.id, model), fallback: false }
  }

  if (saved) {
    const provider = get(saved.provider)
    if (provider && (!provider.needsKey || provider.isAvailable())) {
      return { provider, model: saved.model, ref: formatModelRef(provider.id, saved.model), fallback: false }
    }
  }

  // Nothing usable saved: the first connected cloud provider, else local
  // Ollama so the chat still works with no account at all.
  for (const provider of PROVIDERS) {
    if (!provider.needsKey || !provider.isAvailable()) continue
    const model = await firstModelFor(provider)
    if (model) return { provider, model, ref: formatModelRef(provider.id, model), fallback: !!saved }
  }
  return { provider: ollama, model: ollama.LOCAL_MODEL_ID, ref: modelStore.OLLAMA_MODEL_ID, fallback: !!saved }
}

// Checks a pasted key live, saves it encrypted, and — if no usable model is
// chosen yet — picks this provider's default so the very next message works.
async function connect(key, providerId) {
  const value = String(key ?? '').trim()
  if (!value) throw new Error('Paste an API key first.')
  const id = providerId || detectProvider(value)
  if (!id) throw new Error("Couldn't tell which provider this key is for. Pick the provider, then paste it again.")
  const provider = get(id)
  if (!provider?.needsKey) throw new Error(`Unknown provider: ${id}`)

  await provider.validateKey(value)
  apiKeyStore.setKey(id, value)
  clearModelCache(id)

  const active = await resolveActive()
  if (active.fallback || !parseModelRef(modelStore.getModel())) {
    const model = await firstModelFor(provider)
    if (model) modelStore.setModel(formatModelRef(id, model))
  }
  return status(provider)
}

async function disconnect(providerId) {
  const provider = get(providerId)
  if (!provider?.needsKey) throw new Error(`Unknown provider: ${providerId}`)
  apiKeyStore.clearKey(providerId)
  clearModelCache(providerId)
  return status(provider)
}

module.exports = {
  PROVIDERS,
  get,
  detectProvider,
  listProviders,
  listModels,
  listAllModels,
  resolveActive,
  connect,
  disconnect,
  clearModelCache,
}
