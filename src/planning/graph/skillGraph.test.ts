import { describe, it, expect } from 'vitest'
import { agentNodeId, buildSkillGraph, cliNodeId, CODE_NODE, instructionNodeId, skillNodeId, skillTones, skillTrailView, targetNodeId } from './skillGraph'
import type { SkillScan, TrailEntry } from './types'

// The SKILLS view: agents, the instructions they load, their skills, the tools
// those drive and what they touch — with the trail showing where an agent is.
const scan: SkillScan = {
  agents: ['claude', 'codex'],
  skills: [
    { id: 'plan', description: 'Draft a plan', builtin: true, agents: [{ agent: 'claude', file: '.claude/commands/plan.md', kind: 'command' }, { agent: 'codex', file: '.codex/prompts/plan.md', kind: 'command' }], drives: ['plan'], writes: ['.planning'], tokens: 3000 },
    { id: 'review', description: 'Review the diff', builtin: false, agents: [{ agent: 'claude', file: '.claude/skills/review/SKILL.md', kind: 'skill' }], drives: [], writes: [], tokens: 40 },
  ],
  instructions: [{ file: 'AGENTS.md', tokens: 500, agents: ['codex', 'claude'], drives: ['plan', 'analyze'] }],
  clis: [
    { id: 'plan', file: '.sleipnir/plan.mjs', writes: ['.planning'] },
    { id: 'analyze', file: '.sleipnir/analyze.mjs', writes: [] },
  ],
}
const e = (at: number, kind: TrailEntry['kind'], extra: Partial<TrailEntry> = {}): TrailEntry => ({ at, agent: 'claude', kind, ...extra })

describe('buildSkillGraph', () => {
  it('links agents to what they load and have, skills to the tools they run, tools to what they touch', () => {
    const { nodes, edges } = buildSkillGraph(scan)
    const has = (s: string, t: string) => edges.some((x) => x.source === s && x.target === t)
    expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining([agentNodeId('claude'), instructionNodeId('AGENTS.md'), skillNodeId('plan'), skillNodeId('review'), cliNodeId('plan'), targetNodeId('.planning'), CODE_NODE]))
    expect(has(agentNodeId('claude'), instructionNodeId('AGENTS.md'))).toBe(true)
    expect(has(agentNodeId('codex'), skillNodeId('plan'))).toBe(true)
    expect(has(agentNodeId('codex'), skillNodeId('review'))).toBe(false)
    expect(has(skillNodeId('plan'), cliNodeId('plan'))).toBe(true)
    expect(has(cliNodeId('plan'), targetNodeId('.planning'))).toBe(true)
    expect(has(cliNodeId('analyze'), CODE_NODE)).toBe(true)
    expect(nodes.find((n) => n.id === skillNodeId('review'))!.description).toContain('Your own')
  })
})

describe('the trail in the SKILLS view', () => {
  it('boxes the instructions read, the skill in use and the tool it runs', () => {
    const view = skillTrailView(
      [e(0, 'session', { paths: ['AGENTS.md'] }), e(10, 'skill', { skill: 'plan' }), e(20, 'run', { cli: 'plan', skill: 'plan', cmd: 'node .sleipnir/plan.mjs list-steps' })],
      scan,
      30,
    )
    expect(view.marks.get(instructionNodeId('AGENTS.md'))?.kind).toBe('read')
    expect(view.marks.get(skillNodeId('plan'))?.kind).toBe('edit')
    expect(view.marks.get(cliNodeId('plan'))?.current).toBe(true)
  })

  it('reads used skills as done and the rest as committed', () => {
    const tones = skillTones(buildSkillGraph(scan), [e(0, 'instruction', { paths: ['.claude/skills/review/SKILL.md'] })], scan)
    expect(tones.get(skillNodeId('review'))).toBe('done')
    expect(tones.get(skillNodeId('plan'))).toBe('committed')
    expect(tones.get(agentNodeId('claude'))).toBe('done')
  })
})
