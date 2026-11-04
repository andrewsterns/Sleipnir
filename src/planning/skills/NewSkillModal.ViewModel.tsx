import { useState } from 'react'
import { createSkill } from '../../platform/sleipnirApi'
import type { NewSkill } from '../graph/types'

export interface NewSkillModalProps {
  onClose: () => void
  /** The new skill's name, once it's written. */
  onCreated: (id: string) => void
}

type Agent = NewSkill['agents'][number]
export const SKILL_AGENTS: { id: Agent; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini CLI' },
]

// A new skill: its name, what it's for, its instructions, and the agents that
// get it — each written in that agent's own format by the same emitters as
// Sleipnir's built-ins (see the backend's createSkill).
export function useNewSkillModalViewModel({ onClose, onCreated }: NewSkillModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [agents, setAgents] = useState<Agent[]>(['claude', 'codex', 'gemini'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleAgent = (id: Agent) => setAgents((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
  const canSubmit = !!name.trim() && !!instructions.trim() && agents.length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { id } = await createSkill({ name, description, instructions, agents })
      onCreated(id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  return { name, setName, description, setDescription, instructions, setInstructions, agents, toggleAgent, canSubmit, submit, submitting, error, onClose }
}
