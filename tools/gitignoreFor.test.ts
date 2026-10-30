// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gitignoreFor } from './git-control.mjs'

let root: string
const write = (rel: string, text = '') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-ignore-'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('gitignoreFor', () => {
  it('ignores the build output of the languages the project uses', () => {
    write('Cargo.toml')
    write('firmware/CMakeLists.txt')
    write('firmware/src/main.c')
    const text = gitignoreFor(root)
    expect(text).toContain('target/')
    expect(text).toContain('build/')
    expect(text).toContain('*.o')
    expect(text).not.toContain('__pycache__/')
    expect(text).toContain('.DS_Store')
  })

  it('still writes the OS clutter for a project with no known language', () => {
    expect(gitignoreFor(root)).toBe('# OS clutter\n.DS_Store\nThumbs.db\n')
  })
})
