// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect, vi } from 'vitest'

const require = createRequire(import.meta.url)
const core = require('./licenseCore.cjs')

const CONFIG = { STORE_ID: 111, PRODUCT_ID: 222 }
const META = { store_id: 111, product_id: 222, customer_email: 'a@b.c', customer_name: 'A', variant_name: 'Founder' }

// A fetch that answers each endpoint from `replies` (status + JSON body), or throws for 'offline'.
function fakeFetch(replies: Record<string, { status: number; body: unknown } | 'offline'>) {
  return vi.fn(async (url: string) => {
    const reply = replies[url.split('/').pop() as string]
    if (!reply || reply === 'offline') throw new Error('network down')
    return { status: reply.status, json: async () => reply.body }
  })
}

const record = { key: 'KEY-1', instanceId: 'inst-1', keyStatus: 'active', validatedAt: 0 }

describe('activate', () => {
  it('stores the instance and customer from a valid activation', async () => {
    const fetch = fakeFetch({
      activate: { status: 200, body: { activated: true, instance: { id: 'inst-1' }, license_key: { status: 'active' }, meta: META } },
    })
    const result = await core.activate(' KEY-1 ', 'host', { fetch, config: CONFIG, now: 5 })
    expect(result).toEqual({
      ok: true,
      record: { key: 'KEY-1', instanceId: 'inst-1', keyStatus: 'active', email: 'a@b.c', name: 'A', variant: 'Founder', validatedAt: 5 },
    })
  })

  it('rejects a key from another store and gives the activation back', async () => {
    const fetch = fakeFetch({
      activate: { status: 200, body: { activated: true, instance: { id: 'inst-9' }, meta: { ...META, store_id: 999 } } },
      deactivate: { status: 200, body: { deactivated: true } },
    })
    const result = await core.activate('KEY-1', 'host', { fetch, config: CONFIG })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/isn’t a Sleipnir Pro license/)
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/deactivate'))).toBe(true)
  })

  it('refuses every key while the store is unconfigured', async () => {
    const fetch = fakeFetch({ activate: { status: 200, body: { activated: true, instance: { id: 'i' }, meta: META } } })
    const result = await core.activate('KEY-1', 'host', { fetch, config: { STORE_ID: null, PRODUCT_ID: null } })
    expect(result).toEqual({ ok: false, error: 'Licensing isn’t set up in this build yet.' })
  })

  it('passes the server error through', async () => {
    const fetch = fakeFetch({ activate: { status: 400, body: { activated: false, error: 'This license key has reached the activation limit.' } } })
    expect(await core.activate('KEY-1', 'host', { fetch, config: CONFIG })).toEqual({
      ok: false,
      error: 'This license key has reached the activation limit.',
    })
  })

  it('reports being offline', async () => {
    const result = await core.activate('KEY-1', 'host', { fetch: fakeFetch({ activate: 'offline' }), config: CONFIG })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Couldn’t reach/)
  })
})

describe('validate', () => {
  it('refreshes the record when the key is still valid', async () => {
    const fetch = fakeFetch({ validate: { status: 200, body: { valid: true, license_key: { status: 'active' }, meta: META } } })
    const result = await core.validate(record, { fetch, config: CONFIG, now: 9 })
    expect(result.outcome).toBe('valid')
    expect(result.record).toMatchObject({ instanceId: 'inst-1', validatedAt: 9, email: 'a@b.c' })
  })

  it('keeps Pro when the server is unreachable or erroring', async () => {
    expect((await core.validate(record, { fetch: fakeFetch({ validate: 'offline' }), config: CONFIG })).outcome).toBe('unreachable')
    const fetch = fakeFetch({ validate: { status: 503, body: {} } })
    expect((await core.validate(record, { fetch, config: CONFIG })).outcome).toBe('unreachable')
  })

  it('revokes a disabled (refunded) key', async () => {
    const fetch = fakeFetch({ validate: { status: 200, body: { valid: true, license_key: { status: 'disabled' }, meta: META } } })
    expect((await core.validate(record, { fetch, config: CONFIG })).outcome).toBe('revoked')
  })

  it('revokes a key the server no longer recognises', async () => {
    const fetch = fakeFetch({ validate: { status: 404, body: { valid: false, error: 'license_key not found.' } } })
    expect(await core.validate(record, { fetch, config: CONFIG })).toEqual({ outcome: 'revoked', error: 'license_key not found.' })
  })
})

describe('needsRevalidation', () => {
  it('waits a week between checks', () => {
    expect(core.needsRevalidation({ validatedAt: 1000 }, 1000 + core.REVALIDATE_MS - 1)).toBe(false)
    expect(core.needsRevalidation({ validatedAt: 1000 }, 1000 + core.REVALIDATE_MS + 1)).toBe(true)
  })
})

describe('projectGate', () => {
  const gate = (pro: boolean, slots: string[], target: string, platform = 'linux') =>
    core.projectGate({ pro, slots, target, limit: 3, platform })

  it('claims a slot while any are left', () => {
    expect(gate(false, ['/a'], '/b')).toEqual({ allowed: true, slots: ['/a', '/b'] })
  })

  it('reopens an already-claimed project without a new slot', () => {
    const slots = ['/a', '/b', '/c']
    expect(gate(false, slots, '/b/').slots).toBe(slots)
    expect(gate(false, ['C:\\Proj', 'x', 'y'], 'c:/proj', 'win32').allowed).toBe(true)
  })

  it('stops a fourth project on the free tier', () => {
    expect(gate(false, ['/a', '/b', '/c'], '/d')).toEqual({ allowed: false, slots: ['/a', '/b', '/c'] })
  })

  it('never limits Pro, and never spends slots for it', () => {
    expect(gate(true, ['/a', '/b', '/c'], '/d')).toEqual({ allowed: true, slots: ['/a', '/b', '/c'] })
  })
})
