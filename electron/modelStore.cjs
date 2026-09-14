// Local storage for the user's selected Anthropic chat model — same shape as
// apiKeyStore.cjs but unencrypted, since a model choice isn't a secret.
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

const DEFAULT_MODEL = 'claude-sonnet-5'

// Sentinel "model" id that means "use the local Ollama provider" rather than
// an Anthropic model — checked by chat.cjs#selectProvider() to let a user
// explicitly opt into Ollama from the model dropdown, even with a key
// configured, instead of it only ever being an implicit no-key fallback.
const OLLAMA_MODEL_ID = 'ollama:local'

// Keep in sync with MODEL_OPTIONS in src/app/AgentChat/iApiKeySettings.tsx.
const AVAILABLE_MODELS = [
  { id: 'claude-opus-5', label: 'AI Opus 5', description: 'Most capable — best for hard, multi-step work' },
  { id: 'claude-sonnet-5', label: 'AI Sonnet 5', description: 'Balanced speed and intelligence (default)' },
  { id: 'claude-haiku-4-5', label: 'AI Haiku 4.5', description: 'Fastest and cheapest' },
  { id: OLLAMA_MODEL_ID, label: 'Local Ollama', description: 'Runs on your machine via `ollama serve` — free, no API key, no cloud' },
]

function storePath() {
  return path.join(app.getPath('userData'), 'model-preference.json')
}

function getModel() {
  const p = storePath()
  if (!fs.existsSync(p)) return DEFAULT_MODEL
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    const model = data.model
    return AVAILABLE_MODELS.some((m) => m.id === model) ? model : DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

function setModel(model) {
  if (!AVAILABLE_MODELS.some((m) => m.id === model)) {
    throw new Error(`Unknown model: ${model}`)
  }
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify({ model }, null, 2))
  return model
}

module.exports = { getModel, setModel, DEFAULT_MODEL, AVAILABLE_MODELS, OLLAMA_MODEL_ID }
