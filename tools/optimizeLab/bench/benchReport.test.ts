// @vitest-environment node
// The benchmark's report: fixed rate and median cost per challenge × condition,
// and the change since the previous batch.
import { describe, it, expect } from 'vitest'
import { formatReport, summarize } from './benchReport.mjs'

const run = (batch: string, condition: string, score: number, cost: number) => ({
  batch,
  challenge: 'go-inventory',
  condition,
  score,
  cost,
  turns: 10,
  tokens: { input: 1, cacheRead: 100, cacheWrite: 10, output: 5 },
  wrongReads: 2,
  readsBeforeFirstEdit: 4,
})

describe('benchReport', () => {
  it('summarizes runs by challenge and condition, with medians', () => {
    const [row] = summarize([run('b1', 'map', 1, 0.5), run('b1', 'map', 0, 0.7), run('b1', 'map', 1, 0.9)])
    expect(row).toMatchObject({ challenge: 'go-inventory', condition: 'map', runs: 3, cost: 0.7, turns: 10, tokens: 116, detours: 2 })
    expect(row.fixed).toBeCloseTo(2 / 3)
  })

  it('shows the latest batch against the one before', () => {
    const text = formatReport([run('b1', 'plain', 0, 0.4), run('b2', 'plain', 1, 0.5)])
    expect(text).toContain('Batch b2 vs b1')
    expect(text).toMatch(/plain\s+1\s+100% \(\+100%\)\s+\$0\.50 \(\+\$0\.10\)/)
  })
})
