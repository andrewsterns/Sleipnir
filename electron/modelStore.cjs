// Local storage for the user's selected chat model, as a model reference
// ("provider:model", see chatProviders/modelRef.cjs) — same shape as
// apiKeyStore.cjs but unencrypted, since a model choice isn't a secret.
//
// Which models exist is no longer a hard-coded list here: each connected
// provider reports its own live list (see chatProviders/index.cjs), so this
// only validates that a ref is well-formed.
const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const { parseModelRef, formatModelRef } = require('./chatProviders/modelRef.cjs')

// "Local Ollama" with whatever OLLAMA_MODEL names — the pre-multi-provider
// sentinel, still a valid ref.
const OLLAMA_MODEL_ID = 'ollama:local'

function storePath() {
  return path.join(app.getPath('userData'), 'model-preference.json')
}

// → a normalized "provider:model" ref, or null when nothing (valid) is saved.
// Old bare "claude-…" values read back as "anthropic:claude-…".
function getModel() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    const parsed = parseModelRef(data.model)
    return parsed ? formatModelRef(parsed.provider, parsed.model) : null
  } catch {
    return null
  }
}

function setModel(ref) {
  const parsed = parseModelRef(ref)
  if (!parsed) throw new Error(`Unknown model: ${ref}`)
  const normalized = formatModelRef(parsed.provider, parsed.model)
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify({ model: normalized }, null, 2))
  return normalized
}

module.exports = { getModel, setModel, OLLAMA_MODEL_ID }
