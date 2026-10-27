// Where a provider's API key comes from: a key saved in Sleipnir (encrypted,
// see apiKeyStore.cjs) wins over one found in the environment. No caching —
// it's cheap to re-read, and a key saved in Settings takes effect on the very
// next message without a restart.
const apiKeyStore = require('../apiKeyStore.cjs')

// → { key, source: 'saved' | 'env', envVar? } | null
function resolveKey(provider) {
  const saved = apiKeyStore.getKey(provider.id)
  if (saved) return { key: saved, source: 'saved' }
  for (const envVar of provider.envVars ?? []) {
    const value = process.env[envVar]
    if (value && value.trim()) return { key: value.trim(), source: 'env', envVar }
  }
  return null
}

module.exports = { resolveKey }
