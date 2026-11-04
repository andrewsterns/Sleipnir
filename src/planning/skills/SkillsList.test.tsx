// The Skills view's left panel: instruction files with their cost, then each
// skill as a row that opens in place and closes again.

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { SkillsList } from './SkillsList'
import type { SkillScan } from '../graph/types'

vi.mock('./SkillCard', () => ({ SkillCard: ({ skill }: { skill: { id: string } }) => <div>card for {skill.id}</div> }))

const SCAN: SkillScan = {
  agents: ['claude'],
  instructions: [
    { file: 'CLAUDE.md', tokens: 120, agents: ['claude'] },
    { file: 'AGENTS.md', tokens: 500, agents: ['claude'] },
  ],
  skills: [
    { id: 'plan', description: 'Draft a plan', builtin: true, agents: [], drives: ['plan'], writes: ['.planning'], tokens: 900 },
    { id: 'frame', description: 'Design a frame', builtin: true, agents: [], drives: ['canvas'], writes: ['.components'], tokens: 700 },
  ],
  clis: [],
}

function Harness() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return <SkillsList scan={SCAN} selectedId={selectedId} onSelect={setSelectedId} toneFor={() => 'committed'} nodes={[]} onSaved={() => {}} />
}

const row = (label: string) => screen.getByText(label).closest('[aria-expanded]') as HTMLElement

describe('SkillsList', () => {
  it('lists the instruction files and what they cost together', () => {
    render(<Harness />)
    expect(screen.getByText('CLAUDE.md')).toBeTruthy()
    expect(screen.getByText('~620 tokens')).toBeTruthy()
  })

  it('opens a skill to its card and closes it again', () => {
    render(<Harness />)
    fireEvent.click(row('/plan'))
    expect(screen.getByText('card for plan')).toBeTruthy()
    fireEvent.click(row('/plan'))
    expect(screen.queryByText('card for plan')).toBeNull()
    fireEvent.click(row('/plan'))
    expect(screen.getByText('card for plan')).toBeTruthy()
  })
})
