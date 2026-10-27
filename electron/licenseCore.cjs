// The parts of Sleipnir Pro licensing that don't need Electron: talking to
// Lemon Squeezy's public License API, deciding what its answers mean, and the
// free tier's project limit. license.cjs wraps these with storage, IPC and
// the status broadcast. `fetch` and `config` are passed in so tests can run
// every path without a network or a real store.
//
// The License API endpoints (activate / validate / deactivate) take the key
// itself as the credential — no store API key ships in the app.
const API_BASE = 'https://api.lemonsqueezy.com/v1/licenses'

// Revalidate at most this often; a lifetime key rarely changes, and the only
// thing a check can discover is a refund or a manual disable.
const REVALIDATE_MS = 7 * 24 * 60 * 60 * 1000
// Past this without a successful check, the status carries a "couldn't
// verify" note — Pro keeps working regardless (see validate's 'unreachable').
const STALE_MS = 30 * 24 * 60 * 60 * 1000

async function post(fetchFn, endpoint, fields) {
  const res = await fetchFn(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON (a proxy's HTML error page) — treated as unreachable below.
  }
  return { status: res.status, body }
}

// A key from a different Lemon Squeezy store (or a different product in
// ours) must not unlock Pro — the License API happily validates any store's
// keys. Null ids mean this build was never configured: refuse everything.
function checkMeta(meta, config) {
  if (config.STORE_ID == null || config.PRODUCT_ID == null) {
    return 'Licensing isn’t set up in this build yet.'
  }
  if (!meta || Number(meta.store_id) !== Number(config.STORE_ID) || Number(meta.product_id) !== Number(config.PRODUCT_ID)) {
    return 'This key isn’t a Sleipnir Pro license.'
  }
  return null
}

function recordFrom(key, body, now) {
  const meta = body.meta ?? {}
  return {
    key,
    instanceId: body.instance?.id ?? null,
    keyStatus: body.license_key?.status ?? 'active',
    email: meta.customer_email ?? null,
    name: meta.customer_name ?? null,
    variant: meta.variant_name ?? null,
    validatedAt: now,
  }
}

// → { ok: true, record } | { ok: false, error }
async function activate(key, instanceName, { fetch: fetchFn, config, now = Date.now() }) {
  const trimmed = String(key ?? '').trim()
  if (!trimmed) return { ok: false, error: 'Enter a license key.' }
  let res
  try {
    res = await post(fetchFn, 'activate', { license_key: trimmed, instance_name: instanceName })
  } catch {
    return { ok: false, error: 'Couldn’t reach the license server. Check your connection and try again.' }
  }
  const body = res.body
  if (!body || !body.activated) {
    return { ok: false, error: body?.error || `Activation failed (HTTP ${res.status}).` }
  }
  const metaError = checkMeta(body.meta, config)
  if (metaError) {
    // Give the activation slot back — it was spent on a key we're refusing.
    if (body.instance?.id) {
      post(fetchFn, 'deactivate', { license_key: trimmed, instance_id: body.instance.id }).catch(() => {})
    }
    return { ok: false, error: metaError }
  }
  return { ok: true, record: recordFrom(trimmed, body, now) }
}

// → { outcome: 'valid', record } — confirmed, record refreshed
//   { outcome: 'revoked', error } — the server says this key no longer counts
//   { outcome: 'unreachable' }   — offline / server trouble; keep Pro
async function validate(record, { fetch: fetchFn, config, now = Date.now() }) {
  let res
  try {
    res = await post(fetchFn, 'validate', { license_key: record.key, instance_id: record.instanceId ?? '' })
  } catch {
    return { outcome: 'unreachable' }
  }
  if (!res.body || res.status >= 500) return { outcome: 'unreachable' }
  const body = res.body
  const status = body.license_key?.status
  if (body.valid && status !== 'disabled' && status !== 'expired') {
    const metaError = checkMeta(body.meta, config)
    if (metaError) return { outcome: 'revoked', error: metaError }
    return { outcome: 'valid', record: { ...recordFrom(record.key, body, now), instanceId: record.instanceId } }
  }
  // A 4xx with an explicit answer (not found, disabled, refunded, instance
  // removed from the dashboard) — the one case that takes Pro away.
  return { outcome: 'revoked', error: body.error || `This license is ${status ?? 'no longer valid'}.` }
}

// Best effort — a failed deactivate still forgets the key locally, since the
// human asked to remove it; the dashboard can free the slot later.
async function deactivate(record, { fetch: fetchFn }) {
  if (!record?.instanceId) return
  try {
    await post(fetchFn, 'deactivate', { license_key: record.key, instance_id: record.instanceId })
  } catch {
    // Offline — see above.
  }
}

function needsRevalidation(record, now = Date.now()) {
  return !record.validatedAt || now - record.validatedAt > REVALIDATE_MS
}

function isStale(record, now = Date.now()) {
  return !record.validatedAt || now - record.validatedAt > STALE_MS
}

// Folder paths compare case-insensitively on Windows and ignore a trailing
// separator, so C:\Proj and c:\proj\ take one free slot, not two.
function samePath(a, b, platform = process.platform) {
  const norm = (p) => {
    const s = String(p).replace(/[\\/]+$/, '')
    return platform === 'win32' ? s.replace(/\//g, '\\').toLowerCase() : s
  }
  return norm(a) === norm(b)
}

// The free tier's project limit. `slots` is the list of project paths the
// free tier has already claimed (license.cjs persists it — deliberately not
// the recent-projects list, which File ▸ Clear Recent empties).
// → { allowed: true, slots } (slots possibly with `target` added) |
//   { allowed: false, slots }
function projectGate({ pro, slots, target, limit, platform }) {
  if (pro) return { allowed: true, slots }
  if (slots.some((s) => samePath(s, target, platform))) return { allowed: true, slots }
  if (slots.length < limit) return { allowed: true, slots: [...slots, target] }
  return { allowed: false, slots }
}

module.exports = {
  API_BASE,
  REVALIDATE_MS,
  STALE_MS,
  checkMeta,
  activate,
  validate,
  deactivate,
  needsRevalidation,
  isStale,
  samePath,
  projectGate,
}
