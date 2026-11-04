// @vitest-environment node
// The skills scan behind Planning's SKILLS view: every skill each agent can
// run, what it drives, what it costs, and the instruction files agents load.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { scanSkills } from './skillScan.mjs'
import { ensureAgentScaffolding } from './agentSkills/scaffold.mjs'
import { readFileSync, existsSync } from 'node:fs'
import * as backend from './sleipnir-backend.mjs'

let root: string
const write = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sleipnir-skills-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('scanSkills', () => {
  it("finds Sleipnir's built-ins in every agent, with what they drive and write", () => {
    ensureAgentScaffolding(root, { trail: false })
    const { skills, agents } = scanSkills(root)
    const plan = skills.find((s) => s.id === 'plan')!
    expect(plan).toMatchObject({ builtin: true, drives: ['plan'], writes: ['.planning'] })
    expect(plan.agents.map((a) => a.agent).sort()).toEqual(['claude', 'codex', 'gemini', 'sleipnir'])
    expect(plan.tokens).toBeGreaterThan(500)
    expect(skills.find((s) => s.id === 'optimize')!.drives).toContain('analyze')
    expect(agents).toEqual(['claude', 'codex', 'gemini', 'sleipnir'])
  })

  it("finds a person's own skills and commands, merged by name across agents", () => {
    write('.claude/skills/review/SKILL.md', '---\nname: review\ndescription: Review the diff\n---\nLook carefully.\n')
    write('.claude/commands/ops/deploy.md', '---\ndescription: "Ship it"\n---\nRun node .sleipnir/plan.mjs list-steps first.\n')
    write('.codex/prompts/review.md', '---\ndescription: Review the diff\n---\nLook.\n')
    write('.gemini/commands/release.toml', 'description = "Cut a release"\nprompt = \'\'\'go\'\'\'\n')
    const { skills } = scanSkills(root)
    expect(skills.find((s) => s.id === 'review')).toMatchObject({ builtin: false, description: 'Review the diff' })
    expect(skills.find((s) => s.id === 'review')!.agents.map((a) => a.agent)).toEqual(['claude', 'codex'])
    expect(skills.find((s) => s.id === 'ops:deploy')).toMatchObject({ description: 'Ship it', drives: ['plan'], writes: ['.planning'] })
    expect(skills.find((s) => s.id === 'release')).toMatchObject({ description: 'Cut a release', agents: [{ agent: 'gemini', file: '.gemini/commands/release.toml', kind: 'command' }] })
  })

  it('lists the instruction files each agent loads, with their cost', () => {
    write('AGENTS.md', 'x'.repeat(360))
    write('CLAUDE.md', '@AGENTS.md\n')
    const { instructions } = scanSkills(root)
    expect(instructions.find((i) => i.file === 'AGENTS.md')).toMatchObject({ tokens: 100, agents: ['codex', 'claude', 'sleipnir'] })
    expect(instructions.find((i) => i.file === 'CLAUDE.md')!.agents).toEqual(['claude'])
  })
})

describe('editing and adding skills (backend)', () => {
  beforeEach(() => backend.setWorkspaceRoot(root))
  afterEach(() => backend.setWorkspaceRoot(null))
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

  it('writes a new skill in each chosen agent’s own format, and only there', () => {
    const { written } = backend.createSkill({ name: 'Review', description: 'Review the diff', instructions: 'Review {{ARGS}} carefully.', agents: ['claude', 'gemini'] })
    expect(written).toEqual(['.claude/commands/review.md', '.gemini/commands/review.toml'])
    expect(read('.claude/commands/review.md')).toContain('Review $ARGUMENTS carefully.')
    expect(read('.gemini/commands/review.toml')).toContain('Review {{args}} carefully.')
    expect(existsSync(join(root, '.codex/prompts/review.md'))).toBe(false)
    expect(scanSkills(root).skills.find((x) => x.id === 'review')).toMatchObject({ builtin: false, description: 'Review the diff' })
  })

  it('refuses a bad name, a taken name, or no agents', () => {
    expect(() => backend.createSkill({ name: 'no spaces', description: '', instructions: 'x', agents: ['claude'] })).toThrow(/lowercase/)
    backend.createSkill({ name: 'ship', description: '', instructions: 'x', agents: ['claude'] })
    expect(() => backend.createSkill({ name: 'ship', description: '', instructions: 'x', agents: ['codex'] })).toThrow(/already/)
    expect(() => backend.createSkill({ name: 'other', description: '', instructions: 'x', agents: [] })).toThrow(/agent/)
  })

  it("keeps a person's change to a built-in, for every agent, through the next setup", () => {
    ensureAgentScaffolding(root, { trail: false })
    backend.saveSkillText('frame', 'Design {{ARGS}} as one frame, mobile first.')
    for (const f of ['.claude/commands/frame.md', '.codex/prompts/frame.md', '.gemini/commands/frame.toml']) expect(read(f)).toContain('mobile first')
    expect(backend.getSkillText('frame')).toMatchObject({ builtin: true, overridden: true, file: '.sleipnir/skills/frame.md' })
    ensureAgentScaffolding(root, { trail: false })
    expect(read('.claude/commands/frame.md')).toContain('mobile first')
  })

  it("saves a person's own skill to its file", () => {
    write('.claude/skills/review/SKILL.md', '---\nname: review\n---\nOld.\n')
    backend.saveSkillText('review', '---\nname: review\n---\nNew.\n')
    expect(read('.claude/skills/review/SKILL.md')).toContain('New.')
  })
})
