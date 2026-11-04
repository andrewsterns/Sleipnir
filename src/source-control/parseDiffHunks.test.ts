import { describe, it, expect } from 'vitest'
import { parseUnifiedDiff } from './parseDiffHunks'

describe('parseUnifiedDiff', () => {
  it('pairs a single-line change with matching old/new line numbers', () => {
    const diff = [
      'diff --git a/foo.txt b/foo.txt',
      'index abc123..def456 100644',
      '--- a/foo.txt',
      '+++ b/foo.txt',
      '@@ -1,4 +1,4 @@',
      ' line1',
      '-old line2',
      '+new line2',
      ' line3',
      ' line4',
    ].join('\n')

    const hunks = parseUnifiedDiff(diff)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].header).toBe('@@ -1,4 +1,4 @@')
    expect(hunks[0].rows).toEqual([
      { left: { num: 1, text: 'line1', type: 'context' }, right: { num: 1, text: 'line1', type: 'context' } },
      { left: { num: 2, text: 'old line2', type: 'remove' }, right: { num: 2, text: 'new line2', type: 'add' } },
      { left: { num: 3, text: 'line3', type: 'context' }, right: { num: 3, text: 'line3', type: 'context' } },
      { left: { num: 4, text: 'line4', type: 'context' }, right: { num: 4, text: 'line4', type: 'context' } },
    ])
  })

  it('pads the shorter side when a run has an unequal number of removed/added lines', () => {
    const diff = ['@@ -1,2 +1,1 @@', '-removed one', '-removed two', '+added one'].join('\n')

    const hunks = parseUnifiedDiff(diff)
    expect(hunks[0].rows).toEqual([
      { left: { num: 1, text: 'removed one', type: 'remove' }, right: { num: 1, text: 'added one', type: 'add' } },
      { left: { num: 2, text: 'removed two', type: 'remove' }, right: null },
    ])
  })

  it('handles multiple hunks in one diff', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '@@ -10,1 +10,1 @@',
      '-c',
      '+d',
    ].join('\n')

    const hunks = parseUnifiedDiff(diff)
    expect(hunks).toHaveLength(2)
    expect(hunks[1].header).toBe('@@ -10,1 +10,1 @@')
    expect(hunks[1].rows[0]).toEqual({
      left: { num: 10, text: 'c', type: 'remove' },
      right: { num: 10, text: 'd', type: 'add' },
    })
  })

  it('ignores preamble lines before the first hunk header', () => {
    const diff = ['diff --git a/x b/x', 'index 1..2 100644', '--- a/x', '+++ b/x'].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([])
  })
})
