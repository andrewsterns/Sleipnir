// Tool names and schemas as every provider will accept them.
//
// Names: OpenAI and Anthropic allow [a-zA-Z0-9_-]{1,64}; Gemini also needs a
// leading letter or underscore. Built-in tools already fit; MCP tools
// (`mcp__<server>__<tool>`, where server and tool names are anyone's choice)
// often don't. buildNameMap() gives each tool a safe name for the wire and
// maps the model's calls back to the real one.
//
// Schemas: every provider wants a top-level `type: "object"` with
// `properties`; `$schema`/`$id` markers are dropped since some providers
// reject unknown top-level keys.
const crypto = require('node:crypto')

const MAX_NAME = 64
const SAFE_NAME = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/

function shortHash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 6)
}

function sanitizeName(name) {
  let safe = String(name ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!/^[a-zA-Z_]/.test(safe)) safe = `_${safe}`
  if (safe.length > MAX_NAME) safe = `${safe.slice(0, MAX_NAME - 7)}_${shortHash(name)}`
  return safe || `_${shortHash(String(name))}`
}

// → { toSafe: Map<real, safe>, fromSafe: Map<safe, real> }
function buildNameMap(names) {
  const toSafe = new Map()
  const fromSafe = new Map()
  for (const name of names) {
    let safe = SAFE_NAME.test(name) ? name : sanitizeName(name)
    // Two different real names can sanitize to the same string.
    if (fromSafe.has(safe) && fromSafe.get(safe) !== name) {
      safe = `${safe.slice(0, MAX_NAME - 7)}_${shortHash(name)}`
    }
    toSafe.set(name, safe)
    fromSafe.set(safe, name)
  }
  return { toSafe, fromSafe }
}

function normalizeToolSchema(schema) {
  const base = schema && typeof schema === 'object' && !Array.isArray(schema) ? { ...schema } : {}
  delete base.$schema
  delete base.$id
  if (base.type !== 'object') base.type = 'object'
  if (!base.properties || typeof base.properties !== 'object') base.properties = {}
  if (base.required !== undefined && !Array.isArray(base.required)) delete base.required
  return base
}

module.exports = { buildNameMap, normalizeToolSchema, sanitizeName }
