// Every skill the agents in a project can run, and the instruction files they
// load — the data behind Planning's SKILLS view.
//
//   Sleipnir's built-ins   tools/agentSkills/registry.mjs (/plan, /frame, …)
//   Claude Code            .claude/commands/**/*.md, .claude/skills/*/SKILL.md
//   Codex                  .codex/prompts/*.md
//   Gemini CLI             .gemini/commands/**/*.toml
//   Sleipnir's own agent   the commands its chat knows (/frame, /component, /optimize)
//
// For each skill: what it says it does, which agents have it and from which
// file, which of Sleipnir's CLIs it drives and so what it writes, and roughly
// what it costs to load. Cheap by design — frontmatter and a search for known
// commands, no parsing beyond that — so it can run whenever the view opens.

import fs from 'node:fs'
import path from 'node:path'
import { SKILLS } from './agentSkills/registry.mjs'

// A rough token count: about 3.6 characters a token for prose and code alike.
export const tokensOf = (text) => Math.round(String(text ?? '').length / 3.6)

// What each vendored CLI does, so a skill that runs it can be drawn reaching it.
export const CLI_TARGETS = {
  plan: { file: '.sleipnir/plan.mjs', writes: ['.planning'] },
  canvas: { file: '.sleipnir/canvas.mjs', writes: ['.components'] },
  analyze: { file: '.sleipnir/analyze.mjs', writes: [] },
}
const CLI_MENTION = /\.sleipnir[\\/](plan|canvas|analyze|model)\.mjs/g

// The in-app agent's built-in commands (electron/agent/systemPrompt.cjs).
const SLEIPNIR_AGENT_SKILLS = ['plan', 'frame', 'component', 'optimize']

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function walk(dir, match, rel = '') {
  let entries = []
  try {
    entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((e) => {
    const p = rel ? `${rel}/${e.name}` : e.name
    return e.isDirectory() ? walk(dir, match, p) : match(p) ? [p] : []
  })
}

// `description: "..."` from Markdown frontmatter, or `description = "..."` from TOML.
function descriptionOf(text) {
  const md = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const field = (src, name) => src?.match(new RegExp(`^${name}\\s*[:=]\\s*["']?(.*?)["']?\\s*$`, 'm'))?.[1]
  return field(md?.[1], 'description') ?? field(text, 'description') ?? ''
}
function frontmatterName(text) {
  const md = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return md?.[1].match(/^name\s*:\s*["']?(.*?)["']?\s*$/m)?.[1]
}

function drivesOf(text) {
  return [...new Set([...String(text).matchAll(CLI_MENTION)].map((m) => m[1]))]
}

export function scanSkills(root) {
  const skills = new Map()
  const add = (id, agent, file, text, kind) => {
    const skill = skills.get(id) ?? { id, description: '', builtin: false, agents: [], drives: [], writes: [], tokens: 0 }
    skill.agents.push({ agent, file, kind })
    if (!skill.description && text) skill.description = descriptionOf(text)
    for (const cli of drivesOf(text ?? '')) if (!skill.drives.includes(cli)) skill.drives.push(cli)
    skill.tokens = Math.max(skill.tokens, tokensOf(text))
    skills.set(id, skill)
  }

  // Claude Code: commands (subfolders namespace them, dir:name) and skills.
  const claudeCommands = path.join(root, '.claude', 'commands')
  for (const rel of walk(claudeCommands, (p) => p.endsWith('.md'))) {
    add(rel.slice(0, -3).replace(/\//g, ':'), 'claude', `.claude/commands/${rel}`, readText(path.join(claudeCommands, rel)), 'command')
  }
  const claudeSkills = path.join(root, '.claude', 'skills')
  for (const rel of walk(claudeSkills, (p) => /^[^/]+\/SKILL\.md$/.test(p))) {
    const text = readText(path.join(claudeSkills, rel))
    add(frontmatterName(text ?? '') ?? rel.split('/')[0], 'claude', `.claude/skills/${rel}`, text, 'skill')
  }
  // Codex prompts and Gemini commands.
  const codex = path.join(root, '.codex', 'prompts')
  for (const rel of walk(codex, (p) => p.endsWith('.md'))) add(rel.slice(0, -3), 'codex', `.codex/prompts/${rel}`, readText(path.join(codex, rel)), 'command')
  const gemini = path.join(root, '.gemini', 'commands')
  for (const rel of walk(gemini, (p) => p.endsWith('.toml'))) {
    add(rel.slice(0, -5).replace(/\//g, ':'), 'gemini', `.gemini/commands/${rel}`, readText(path.join(gemini, rel)), 'command')
  }
  // Sleipnir's own agent knows its commands without any file.
  for (const id of SLEIPNIR_AGENT_SKILLS) add(id, 'sleipnir', null, null, 'built-in')

  // Built-ins: their description from the registry, whatever the files say.
  for (const s of SKILLS) {
    const skill = skills.get(s.id)
    if (!skill) continue
    skill.builtin = true
    skill.description = s.description
    for (const cli of drivesOf(`${s.context}\n${s.command}`)) if (!skill.drives.includes(cli)) skill.drives.push(cli)
  }
  for (const skill of skills.values()) {
    skill.writes = [...new Set(skill.drives.flatMap((cli) => CLI_TARGETS[cli]?.writes ?? []))]
  }

  // The instruction files each agent loads at the start of every session.
  const instructions = []
  const claudeMd = readText(path.join(root, 'CLAUDE.md'))
  const agentsMd = readText(path.join(root, 'AGENTS.md'))
  const geminiMd = readText(path.join(root, 'GEMINI.md'))
  const imports = (text) => /^@AGENTS\.md\s*$/m.test(text ?? '')
  if (claudeMd !== null) instructions.push({ file: 'CLAUDE.md', tokens: tokensOf(claudeMd), agents: ['claude'] })
  if (agentsMd !== null) {
    const agents = ['codex', ...(imports(claudeMd) ? ['claude'] : []), ...(imports(geminiMd) ? ['gemini'] : []), 'sleipnir']
    instructions.push({ file: 'AGENTS.md', tokens: tokensOf(agentsMd), agents, drives: drivesOf(agentsMd) })
  }
  if (geminiMd !== null) instructions.push({ file: 'GEMINI.md', tokens: tokensOf(geminiMd), agents: ['gemini'] })

  const agents = ['claude', 'codex', 'gemini', 'sleipnir'].filter((a) => [...skills.values()].some((s) => s.agents.some((x) => x.agent === a)) || instructions.some((i) => i.agents.includes(a)))
  return {
    agents,
    skills: [...skills.values()].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.id.localeCompare(b.id)),
    instructions,
    clis: Object.entries(CLI_TARGETS).map(([id, t]) => ({ id, ...t })),
  }
}
