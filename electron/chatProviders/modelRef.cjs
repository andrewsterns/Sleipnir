// A model reference names a provider and one of its models in one string —
// "anthropic:claude-sonnet-5", "openai:<id>", "gemini:<id>", "ollama:local".
// Pure, no Electron: see modelRef.test.ts.

const PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'ollama']

// → { provider, model } | null. Accepts the pre-multi-provider stored values
// too: a bare "claude-…" id meant Anthropic.
function parseModelRef(ref) {
  if (typeof ref !== 'string') return null
  const value = ref.trim()
  if (!value) return null
  const colon = value.indexOf(':')
  if (colon > 0) {
    const provider = value.slice(0, colon)
    const model = value.slice(colon + 1)
    if (PROVIDER_IDS.includes(provider) && model) return { provider, model }
    // Ollama model names contain colons themselves ("qwen2.5-coder:7b"), but
    // are always stored behind an "ollama:" prefix, so any other colon form is
    // not a ref.
    return null
  }
  if (/^claude-/.test(value)) return { provider: 'anthropic', model: value }
  return null
}

function formatModelRef(provider, model) {
  return `${provider}:${model}`
}

module.exports = { PROVIDER_IDS, parseModelRef, formatModelRef }
