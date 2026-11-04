// The plan in the left panel: steps open and close in place, the working step
// opens by itself once, and the list is read-only apart from status.

import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { PlanStepsList } from './PlanStepsList'
import type { GraphNode, SavedPlan } from './graph/types'
import type { Tone } from './graph/nodeTone'

const PLAN: SavedPlan = { id: 'plan/p-1', label: 'P', nodeIds: [], createdAt: 0, description: 'What it is for' }
const step = (n: number): GraphNode => ({ id: `s${n}`, label: `Step ${n}`, kind: 'proposed', map: 'claude', type: 'plan-step', planId: PLAN.id, order: n, description: `About step ${n}` })
const STEPS = [step(1), step(2), step(3)]

function Harness({ tones }: { tones: Record<string, Tone> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <PlanStepsList
      plan={PLAN}
      steps={STEPS}
      plannedByStep={new Map()}
      toneFor={(n) => tones[n.id] ?? 'proposed'}
      selectedId={selectedId}
      onSelect={setSelectedId}
      events={[]}
      renderStatus={() => null}
      renderActions={() => null}
      flagsFor={() => []}
    />
  )
}

const row = (label: string) => screen.getByText(label).closest('[aria-expanded]') as HTMLElement
const isOpen = (label: string) => row(label).getAttribute('aria-expanded') === 'true'

describe('PlanStepsList', () => {
  it('opens a step on click and closes it on the next', () => {
    render(<Harness tones={{}} />)
    expect(isOpen('Step 1')).toBe(false)
    fireEvent.click(row('Step 1'))
    expect(isOpen('Step 1')).toBe(true)
    expect(screen.getByText('About step 1')).toBeTruthy()
    fireEvent.click(row('Step 1'))
    expect(isOpen('Step 1')).toBe(false)
    fireEvent.click(row('Step 1'))
    expect(isOpen('Step 1')).toBe(true)
  })

  it('opens the working step by itself, and lets it be closed', () => {
    render(<Harness tones={{ s1: 'done', s2: 'in_progress' }} />)
    expect(isOpen('Step 2')).toBe(true)
    fireEvent.click(row('Step 2'))
    expect(isOpen('Step 2')).toBe(false)
    // Another step picked and closed doesn't bring it back.
    fireEvent.click(row('Step 3'))
    fireEvent.click(row('Step 3'))
    expect(isOpen('Step 2')).toBe(false)
  })

  it('shows the plan description and its progress above the steps', () => {
    render(<Harness tones={{ s1: 'done' }} />)
    expect(screen.getByText('What it is for')).toBeTruthy()
    expect(screen.getByText(/1 of 3 done/)).toBeTruthy()
  })

  it('has no comment box', () => {
    render(<Harness tones={{ s1: 'in_progress' }} />)
    expect(screen.queryByPlaceholderText(/comment/i)).toBeNull()
  })
})
