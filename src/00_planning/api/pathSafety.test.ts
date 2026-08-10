// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setWorkspaceRoot, resolveWorkspacePath } from '../../../tools/sleipnir-backend.mjs'

// The security boundary for every Workspace file operation: resolveWorkspacePath
// (via resolveSafe) must refuse any path that escapes the open project root,
// so an app pointed at a user's real folder can't read/write/delete outside it.
describe('workspace path containment', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-pathsafe-'))
    writeFileSync(join(root, 'inside.txt'), 'ok')
    setWorkspaceRoot(root)
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  it('resolves a real in-root file to its absolute path', () => {
    expect(resolveWorkspacePath('inside.txt')).toBe(join(root, 'inside.txt'))
  })

  it.each([
    '../escape.txt',
    '../../etc/passwd',
    'sub/../../escape',
    '/etc/passwd',
  ])('rejects an escaping path: %s', (p) => {
    expect(() => resolveWorkspacePath(p)).toThrow(/escapes allowed root/i)
  })
})
