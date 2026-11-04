// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const { buildNameMap, normalizeToolSchema } = require('./schemaAdapters.cjs')

const SAFE = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/

describe('buildNameMap', () => {
  it('leaves names that are already safe alone', () => {
    const { toSafe, fromSafe } = buildNameMap(['read_file', 'mcp__github__create_issue'])
    expect(toSafe.get('read_file')).toBe('read_file')
    expect(fromSafe.get('mcp__github__create_issue')).toBe('mcp__github__create_issue')
  })

  it('makes any MCP tool name provider-safe and maps it back', () => {
    const names = ['mcp__my server__search.docs', '9lives', 'mcp__' + 'x'.repeat(100) + '__tool']
    const { toSafe, fromSafe } = buildNameMap(names)
    for (const name of names) {
      const safe = toSafe.get(name)
      expect(safe).toMatch(SAFE)
      expect(fromSafe.get(safe)).toBe(name)
    }
  })

  it('keeps two names that sanitize alike distinct', () => {
    const { toSafe } = buildNameMap(['mcp__a b__t', 'mcp__a.b__t'])
    expect(toSafe.get('mcp__a b__t')).not.toBe(toSafe.get('mcp__a.b__t'))
  })
})

describe('normalizeToolSchema', () => {
  it('produces a top-level object schema without $schema markers', () => {
    expect(normalizeToolSchema(undefined)).toEqual({ type: 'object', properties: {} })
    expect(
      normalizeToolSchema({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { a: { type: 'string' } }, required: 'a' }),
    ).toEqual({ type: 'object', properties: { a: { type: 'string' } } })
  })

  it('does not mutate the original', () => {
    const original = { $schema: 'x', properties: {} }
    normalizeToolSchema(original)
    expect(original.$schema).toBe('x')
  })
})
