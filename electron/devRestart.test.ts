import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { hasDescendantMatching, CLAUDE_PROCESS, conversationOf, resumeCommand, needsRestart, saveCarry, takeCarry } = require('./devRestart.cjs')

describe('which shells are running Claude', () => {
  const rows = [
    { pid: 10, ppid: 1, command: 'cmd.exe' },
    { pid: 11, ppid: 10, command: '"C:\\Users\\a\\.local\\bin\\claude.exe"' },
    { pid: 20, ppid: 1, command: 'cmd.exe' },
    { pid: 21, ppid: 20, command: 'node "C:\\work\\claude-tools\\server.js"' },
    { pid: 30, ppid: 1, command: 'bash' },
    { pid: 31, ppid: 30, command: 'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js' },
  ]

  it('finds it under the shell, directly or through npm', () => {
    expect(hasDescendantMatching(rows, 10, CLAUDE_PROCESS)).toBe(true)
    expect(hasDescendantMatching(rows, 30, CLAUDE_PROCESS)).toBe(true)
  })

  it('isn’t fooled by a folder with the word in its name', () => {
    expect(hasDescendantMatching(rows, 20, CLAUDE_PROCESS)).toBe(false)
  })

  it('survives a loop in the process list', () => {
    expect(hasDescendantMatching([{ pid: 2, ppid: 3, command: 'a' }, { pid: 3, ppid: 2, command: 'b' }], 2, CLAUDE_PROCESS)).toBe(false)
  })
})

describe('resuming the right conversation', () => {
  const trail = [
    JSON.stringify({ terminal: '99-1', conversation: 'old' }),
    JSON.stringify({ terminal: '99-2', conversation: 'other' }),
    JSON.stringify({ terminal: '99-1', conversation: 'newest' }),
    '{half a line 99-1',
  ].join('\n')

  it('takes the newest one recorded for that terminal', () => {
    expect(conversationOf(trail, '99-1')).toBe('newest')
    expect(conversationOf(trail, '99-2')).toBe('other')
    expect(conversationOf(trail, '99-3')).toBeNull()
  })

  it('falls back to the folder’s latest when it doesn’t know', () => {
    expect(resumeCommand('abc')).toBe('claude --resume abc')
    expect(resumeCommand(null)).toBe('claude --continue')
  })
})

describe('when a restart is due', () => {
  it('is for main-process code only', () => {
    expect(needsRestart('main.cjs')).toBe(true)
    expect(needsRestart('agent\\tools\\canvas.cjs')).toBe(true)
    expect(needsRestart('vendor/trail.mjs')).toBe(true)
    expect(needsRestart('devRestart.test.ts')).toBe(false)
    expect(needsRestart('thing.test.mjs')).toBe(false)
    expect(needsRestart('vendor/model.mjs')).toBe(false)
    expect(needsRestart('README.md')).toBe(false)
  })
})

describe('what a restart carries', () => {
  it('is read back once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sleipnir-carry-'))
    try {
      saveCarry(dir, { session: { a: '1' }, terminals: [] })
      expect(takeCarry(dir)).toEqual({ session: { a: '1' }, terminals: [] })
      expect(takeCarry(dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
