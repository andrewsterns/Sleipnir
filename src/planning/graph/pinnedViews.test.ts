// The Agent area's picker: the pinned views, and the plans as a history.

import { describe, it, expect } from 'vitest'
import { PINNED_VIEWS, dayLabel, pinnedViewFor, planHistory } from './pinnedViews'
import type { GraphNode, SavedPlan } from './types'

const NOW = new Date(2026, 10, 2, 15, 0).getTime()
const DAY = 86_400_000
const plan = (id: string, createdAt: number): SavedPlan => ({ id, label: id, nodeIds: [], createdAt })
const step = (id: string, planId: string): GraphNode => ({ id, label: id, kind: 'proposed', map: 'claude', type: 'plan-step', planId })

describe('pinned views', () => {
  it('are Architecture and Skills, each its own whole-project mode', () => {
    expect(PINNED_VIEWS.map((v) => v.mode)).toEqual(['architecture', 'skills'])
    expect(pinnedViewFor('view:skills')?.label).toBe('Skills')
    expect(pinnedViewFor('plan/x-1')).toBeUndefined()
  })
})

describe('planHistory', () => {
  it('lists plans newest first with their date and progress', () => {
    const rows = planHistory(
      [plan('old', NOW - 3 * DAY), plan('new', NOW - 60_000), plan('mid', NOW - DAY)],
      [step('a', 'new'), step('b', 'new'), step('c', 'new'), step('d', 'old')],
      { a: 'completed', b: 'completed', c: 'in_progress', d: 'completed' },
      NOW,
    )
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
    expect(rows[0].meta).toBe('today · 2/3')
    expect(rows[1].meta).toBe('yesterday')
    expect(rows[2].meta).toBe('Oct 30 · 1/1')
  })
})

describe('dayLabel', () => {
  it('names the day, with the year only when it differs', () => {
    expect(dayLabel(NOW - 1000, NOW)).toBe('today')
    expect(dayLabel(new Date(2025, 0, 5).getTime(), NOW)).toBe('Jan 5 2025')
  })
})
