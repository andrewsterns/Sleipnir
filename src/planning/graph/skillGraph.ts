import type { AgentId, GraphData, GraphEdge, GraphNode, SkillScan, TrailEntry } from './types'
import type { Tone } from './nodeTone'
import { trailMarks, trailPath, type TrailView } from './agentTrail'

// The SKILLS view: how an agent gets from a request to the code, drawn by the
// same graph as the architecture —
//
//   agent ──▶ instruction files it loads (AGENTS.md, CLAUDE.md, …)
//   agent ──▶ its skills (/plan, /optimize, a person's own)
//   skill / instructions ──▶ Sleipnir's CLIs they run (plan.mjs, …)
//   CLI ──▶ what it touches (.planning, .components, the project's code)
//
// From the skills scan (tools/skillScan.mjs) and the agent trail: skills an
// agent has actually used read as done (white), the rest as committed (faint),
// and the corner box lands on the skill, instruction or CLI in use right now.

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  sleipnir: 'Sleipnir agent',
}
export const CODE_NODE = 'target:code'

export const agentNodeId = (id: string) => `agent:${id}`
export const instructionNodeId = (file: string) => `instruction:${file}`
export const skillNodeId = (id: string) => `skill:${id}`
export const cliNodeId = (id: string) => `cli:${id}`
export const targetNodeId = (path: string) => `target:${path}`

export function buildSkillGraph(scan: SkillScan): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const node = (id: string, label: string, type: string, extra: Partial<GraphNode> = {}) =>
    nodes.push({ id, label, kind: 'built', map: 'skills', type, ...extra })
  const link = (source: string, target: string) => edges.push({ source, target, kind: 'borrows' })

  for (const a of scan.agents) node(agentNodeId(a), AGENT_LABEL[a], 'agent')
  for (const i of scan.instructions) {
    node(instructionNodeId(i.file), i.file, 'instruction', { filePath: i.file, description: `Loaded by ${i.agents.map((a) => AGENT_LABEL[a]).join(', ')} at the start of every session · about ${i.tokens} tokens` })
    for (const a of i.agents) if (scan.agents.includes(a)) link(agentNodeId(a), instructionNodeId(i.file))
    for (const cli of i.drives ?? []) link(instructionNodeId(i.file), cliNodeId(cli))
  }
  for (const s of scan.skills) {
    // No filePath: a skill can live in several files (one per agent), and the
    // graph would tack the first one's extension onto its name.
    node(skillNodeId(s.id), `/${s.id}`, 'skill', {
      description: `${s.description}${s.description ? ' · ' : ''}${s.builtin ? "Sleipnir's" : 'Your own'} · about ${s.tokens} tokens when used`,
    })
    for (const a of new Set(s.agents.map((x) => x.agent))) link(agentNodeId(a), skillNodeId(s.id))
    for (const cli of s.drives) link(skillNodeId(s.id), cliNodeId(cli))
  }
  for (const c of scan.clis) {
    node(cliNodeId(c.id), c.file.split('/').pop()!, 'cli', { filePath: c.file })
    for (const w of c.writes) link(cliNodeId(c.id), targetNodeId(w))
    if (c.id === 'analyze') link(cliNodeId(c.id), CODE_NODE)
  }
  for (const w of new Set(scan.clis.flatMap((c) => c.writes))) node(targetNodeId(w), `${w}/`, 'folder')
  node(CODE_NODE, 'project code', 'folder')
  // Agents edit code themselves too.
  for (const a of scan.agents) link(agentNodeId(a), CODE_NODE)

  const ids = new Set(nodes.map((n) => n.id))
  return { nodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) }
}

// A trail line in the SKILLS view's terms: which of its nodes it touches, and
// whether that's looking (read) or working (edit) there.
function skillTargets(e: TrailEntry, scan: SkillScan): { kind: TrailEntry['kind']; ids: string[] } | null {
  const skillByFile = new Map(scan.skills.flatMap((s) => s.agents.filter((a) => a.file).map((a) => [a.file!, skillNodeId(s.id)] as const)))
  const instructionFiles = new Set(scan.instructions.map((i) => i.file))
  const fileNode = (p: string) => (instructionFiles.has(p) ? instructionNodeId(p) : skillByFile.get(p))
  switch (e.kind) {
    case 'session':
    case 'instruction':
      return { kind: 'read', ids: (e.paths ?? []).map(fileNode).filter((x): x is string => !!x) }
    case 'skill':
      return e.skill ? { kind: 'edit', ids: [skillNodeId(e.skill)] } : null
    case 'run':
    case 'test':
      return e.cli ? { kind: 'edit', ids: [cliNodeId(e.cli), ...(e.skill ? [skillNodeId(e.skill)] : [])] } : { kind: e.kind === 'test' ? 'edit' : 'read', ids: [CODE_NODE] }
    case 'read':
    case 'search':
      return { kind: 'read', ids: [CODE_NODE] }
    case 'edit':
      return { kind: 'edit', ids: [CODE_NODE] }
    default:
      return null
  }
}

// The trail, re-addressed to the SKILLS view's nodes: where the agent is in its
// instructions and skills right now, and the path it took through them.
export function skillTrailView(entries: readonly TrailEntry[], scan: SkillScan, now: number): TrailView {
  const mapped: TrailEntry[] = []
  for (const e of entries) {
    const t = skillTargets(e, scan)
    if (t && t.ids.length) mapped.push({ ...e, kind: t.kind, paths: t.ids })
    else if (e.kind === 'idle') mapped.push(e)
  }
  return { marks: trailMarks(mapped, now), path: trailPath(mapped, now) }
}

// Skills, instructions and CLIs an agent has used (in the trail we have) read as
// done; the rest as committed. Agents and the code are always plain.
export function skillTones(graph: GraphData, entries: readonly TrailEntry[], scan: SkillScan): Map<string, Tone> {
  const used = new Set<string>()
  for (const e of entries) for (const id of skillTargets(e, scan)?.ids ?? []) used.add(id)
  return new Map(graph.nodes.map((n) => [n.id, n.type === 'agent' || used.has(n.id) ? 'done' : 'committed']))
}
