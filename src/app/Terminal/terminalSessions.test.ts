import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { isNewChunk, tabsFromSessions } from './terminalSessions'

const require = createRequire(import.meta.url)
const { appendScrollback } = require('../../../electron/terminalScrollback.cjs') as { appendScrollback: (buffer: string, chunk: string, max?: number) => string }

describe('reattaching to a terminal after a reload', () => {
  it('gives each running session a tab, in order', () => {
    expect(tabsFromSessions([{ id: '7' }, { id: '9' }], 1)).toEqual([{ key: 1, sessionId: '7' }, { key: 2, sessionId: '9' }])
    expect(tabsFromSessions([], 1)).toEqual([])
  })

  it('never prints twice what the replay already covered', () => {
    expect(isNewChunk(100, 100)).toBe(false)
    expect(isNewChunk(90, 100)).toBe(false)
    expect(isNewChunk(101, 100)).toBe(true)
  })
})

describe('what a session keeps to replay', () => {
  it('keeps everything until it is full', () => {
    expect(appendScrollback('ab', 'cd', 10)).toBe('abcd')
  })

  it('drops the oldest output past the limit, starting at a whole line', () => {
    expect(appendScrollback('one\ntwo\nthree\n', 'four\n', 12)).toBe('three\nfour\n')
  })

  it('still bounds output with no line breaks in it', () => {
    expect(appendScrollback('aaaaaaaa', 'bbbb', 6)).toBe('aabbbb')
  })
})
