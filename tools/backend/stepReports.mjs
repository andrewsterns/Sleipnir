// Agents reporting progress on plan steps: statuses, the activity log, the
// file snapshots that record what a step changed, the agent trail and skills.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { SKILLS } from '../agentSkills/registry.mjs'
import {
  addStepComment,
  addStepSteer,
  applyStepStatus,
  attachChanges,
  inferStepStatuses,
  planActivityPath,
  planSteps,
  renderPlanDoc,
  snapshotActionFor,
  snapshotTree,
  STEP_STATUSES,
  toStepStatus,
} from '../planDoc.mjs'
import { emitSkillFiles } from '../agentSkills/emitters/index.mjs'
import { overrideFile, ensureAgentScaffolding as writeAgentScaffolding } from '../agentSkills/scaffold.mjs'
import { getWorkspaceRoot } from '../workspace-root.mjs'
import { scanSkills } from '../skillScan.mjs'
import { PLANNING_DIR, requireWorkspaceRoot, resolveSafe } from './paths.mjs'
import { readNotesFile, readPlansFile, readStages, writeFileAtomic, writePlansFile, writeStages } from './planningStore.mjs'
import { getAgentScaffolding } from './agentScaffolding.mjs'

// Regenerates one plan's plan.md from its steps, their statuses and the latest
// note each step's agent reported.
export function writePlanDoc(root, plan, data, stages) {
  const docAbs = resolveSafe(root, plan.docPath)
  const existing = fs.existsSync(docAbs) ? fs.readFileSync(docAbs, 'utf8') : null
  const text = renderPlanDoc({
    plan,
    steps: planSteps(data.nodes, plan.id),
    plannedFiles: data.nodes.filter((n) => n.type === 'planned-file' && n.planId === plan.id),
    existing,
    statuses: stages,
    events: readActivity(plan.id).events,
  })
  if (text !== existing) writeFileAtomic(docAbs, text)
}

// The one status every node carries — pending, in_progress, completed, the
// states AI agents track their own work in. The values and the migration of
// older ones live in planDoc.mjs (toStepStatus), shared with the vendored CLI.
export function requireNodeStage(stage) {
  const status = toStepStatus(stage)
  if (!status) throw new Error(`Unknown status "${stage}" — expected one of ${STEP_STATUSES.join(', ')}`)
  return status
}

// --- agents reporting progress ---------------------------------------------
// A plan's activity log (.planning/<plan>/activity.json): every status an agent
// reported on one of its steps, with its note. Step 3 of "Planning as agent
// diagnostics" grows it into a full record of what each step changed.
function readActivity(planId) {
  const root = getWorkspaceRoot()
  if (!root) return { events: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveSafe(root, planActivityPath(planId)), 'utf8'))
    return { events: Array.isArray(parsed?.events) ? parsed.events : [] }
  } catch {
    return { events: [] }
  }
}

function writeActivity(planId, activity) {
  const root = requireWorkspaceRoot()
  writeFileAtomic(resolveSafe(root, planActivityPath(planId)), `${JSON.stringify(activity, null, 2)}\n`)
}

export function getPlanActivity(planId) {
  if (!planId) throw new Error('planId is required')
  return readActivity(planId)
}

// An agent's progress report on one step: its status, and optionally one line
// of what it did and who it is. The in-app agent's update_plan_step tool and
// the vendored CLI's set-status both land here (or in the CLI's copy of it).
export function setStepStatus(stepId, status, { note, agent } = {}) {
  if (!stepId) throw new Error('stepId is required')
  const [result] = recordStepReports([{ stepId, status, note, agent }])
  return { step: result.step, status: result.status, event: result.event }
}

// Applies status reports — from an agent, the card toggle or an approval — and
// tracks what each step changes: a step that starts gets a snapshot of the
// workspace, a step that completes is compared against it and its report lists
// the files that changed in between (see planDoc.mjs's snapshotTree). One
// snapshot serves every report in the call.
export function recordStepReports(reports) {
  const root = requireWorkspaceRoot()
  const data = readNotesFile()
  const stages = readStages()
  const activities = new Map()
  let current
  const now = () => (current === undefined ? (current = snapshotWorkspace(root)) : current)
  const results = []
  for (const { stepId, status, note, agent, touched } of reports) {
    if (!stepId) throw new Error('stepId is required')
    const previous = stages[stepId]
    const planId = data.nodes.find((n) => n.id === stepId)?.planId
    if (planId && !activities.has(planId)) activities.set(planId, readActivity(planId))
    const events = planId ? activities.get(planId).events : []
    const result = applyStepStatus({ nodes: data.nodes, stages, events, stepId, status, note, agent, at: Date.now() })
    const action = snapshotActionFor(previous, result.status)
    if (action === 'take') writeBaseline(root, stepId, { at: result.event.at, files: now(), ...(touched?.length ? { touched } : {}) })
    if (action === 'compare') {
      attachChanges(result.event, readBaseline(root, stepId), now())
      // The files the step changed are done with it.
      for (const change of result.event.changes ?? []) {
        if (change.change === 'deleted') continue
        for (const key of stageKeysForPath(data.nodes, change.path)) stages[key] = 'completed'
      }
    }
    if (action === 'compare' || action === 'drop') dropBaseline(root, stepId)
    results.push(result)
  }
  writeStages(stages)
  for (const [planId, activity] of activities) writeActivity(planId, activity)
  refreshPlanDocsFor(reports.map((r) => r.stepId), stages, data)
  return results
}

// Every key a file's status can be stored under: its own `file:<path>` entry,
// and any graph node backed by it (a scaffolded or planned file) — the views
// each read one or the other (see graph/stages.ts's nodeStageKey).
function stageKeysForPath(nodes, filePath) {
  const keys = [`file:${filePath}`]
  for (const n of nodes) if (n.filePath === filePath && n.type !== 'plan-step') keys.push(n.id)
  return keys
}

// Whether git sees a path as changed or new; git lists a new folder once, so a
// file under a listed folder counts too (as graph/nodeTone.ts's isUncommitted).
function isUncommitted(dirty, filePath) {
  if (dirty.has(filePath)) return true
  for (let i = filePath.lastIndexOf('/'); i > 0; i = filePath.lastIndexOf('/', i - 1)) {
    if (dirty.has(filePath.slice(0, i))) return true
  }
  return false
}

// A file that's in progress or done but that git no longer sees as changed has
// been committed (or reverted): its status is cleared, so the next change to it
// starts in progress again instead of reading as done. Proposed stays — a plan
// can propose changing a committed file. Plan steps and planned files that
// aren't on disk yet are never touched. `dirtyPaths`: what git sees as changed
// or new, workspace-relative.
export function settleCommittedStages(dirtyPaths) {
  const root = requireWorkspaceRoot()
  const dirty = new Set(dirtyPaths ?? [])
  const stages = readStages()
  const nodesById = new Map(readNotesFile().nodes.map((n) => [n.id, n]))
  let cleared = 0
  for (const [key, status] of Object.entries(stages)) {
    if (status === 'pending') continue
    const node = nodesById.get(key)
    if (node?.type === 'plan-step') continue
    const filePath = key.startsWith('file:') ? key.slice('file:'.length) : node?.filePath
    if (!filePath || isUncommitted(dirty, filePath)) continue
    if (!fs.existsSync(path.join(root, filePath))) continue
    delete stages[key]
    cleared++
  }
  if (cleared) writeStages(stages)
  return { cleared }
}

// Every workspace file's size and modification time, skipping what git ignores.
function snapshotWorkspace(root) {
  return snapshotTree(
    (rel) => {
      try {
        return fs.readdirSync(path.join(root, rel), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return []
      }
    },
    (rel) => {
      try {
        const stat = fs.statSync(path.join(root, rel))
        return [stat.size, Math.round(stat.mtimeMs)]
      } catch {
        return null
      }
    },
    gitIgnoredPaths(root),
  )
}

// Everything git ignores and doesn't track — folders (collapsed) and files —
// as root-relative paths. Empty outside a repo or without git.
function gitIgnoredPaths(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
      cwd: root,
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).toString('utf8')
    return new Set(out.split('\0').filter(Boolean).map((p) => p.replace(/\/$/, '')))
  } catch {
    return new Set()
  }
}

// A step's snapshot lives outside the project — in the OS temp folder, keyed by
// project and step — so it never shows up in git or the planning watcher. The
// vendored CLI keeps them in the same place, so a step started by one (the
// in-app agent) can be completed by the other (a terminal agent).
const snapshotHash = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)

// One project's snapshot folder. Exported so tests can clear theirs.
export function stepSnapshotDir(root) {
  let real = root
  try {
    real = fs.realpathSync.native(root)
  } catch {
    // keep the path as given
  }
  if (process.platform === 'win32') real = real.toLowerCase()
  return path.join(os.tmpdir(), 'sleipnir-baselines', snapshotHash(real))
}

function baselineFile(root, stepId) {
  return path.join(stepSnapshotDir(root), `${snapshotHash(stepId)}.json`)
}

function readBaseline(root, stepId) {
  try {
    return JSON.parse(fs.readFileSync(baselineFile(root, stepId), 'utf8'))
  } catch {
    return null
  }
}

function writeBaseline(root, stepId, baseline) {
  try {
    writeFileAtomic(baselineFile(root, stepId), JSON.stringify(baseline))
  } catch {
    // No snapshot only means the step's changes go unlisted.
  }
}

function dropBaseline(root, stepId) {
  fs.rmSync(baselineFile(root, stepId), { force: true })
}

// The agent trail (.planning/trail.jsonl, written by the vendored trail hook and
// the in-app agent — see tools/agentSkills/vendor/trail.mjs): the newest
// `limit` lines, oldest first, optionally only those after `since`.
export function getAgentTrail({ since = 0, limit = 400 } = {}) {
  const root = getWorkspaceRoot()
  if (!root) return { entries: [] }
  let text = ''
  try {
    text = fs.readFileSync(path.join(root, PLANNING_DIR, 'trail.jsonl'), 'utf8')
  } catch {
    return { entries: [] }
  }
  const entries = []
  for (const line of text.split('\n').slice(-Math.max(1, limit) - 1)) {
    if (!line) continue
    try {
      const entry = JSON.parse(line)
      if (typeof entry?.at === 'number' && entry.at > since) entries.push(entry)
    } catch {
      // a line cut short by a trim mid-write: skip it
    }
  }
  return { entries: entries.slice(-limit) }
}

// Every skill the project's agents can run, and the instruction files they load
// (see skillScan.mjs) — what Planning's SKILLS view draws.
export function getSkills() {
  return scanSkills(requireWorkspaceRoot())
}

// One skill's text, to read and edit on its card. A built-in's is its project
// override when there is one, else Sleipnir's own; a person's own skill is its
// file (Claude's when it has several — the first otherwise).
export function getSkillText(id) {
  const root = requireWorkspaceRoot()
  const skill = scanSkills(root).skills.find((s) => s.id === id)
  if (!skill) throw new Error(`No skill "${id}"`)
  if (skill.builtin) {
    const override = overrideFile(id)
    const overridden = fs.existsSync(path.join(root, override))
    const text = overridden ? fs.readFileSync(path.join(root, override), 'utf8') : SKILLS.find((s) => s.id === id).command
    return { id, builtin: true, overridden, file: overridden ? override : null, text }
  }
  const file = (skill.agents.find((a) => a.agent === 'claude' && a.file) ?? skill.agents.find((a) => a.file))?.file
  if (!file) throw new Error(`Skill "${id}" has no file`)
  return { id, builtin: false, overridden: false, file, text: fs.readFileSync(resolveSafe(root, file), 'utf8') }
}

// Saves a skill's text. A built-in's goes to its project override, and every
// agent's command is rewritten from it; a person's own skill's to its file.
export function saveSkillText(id, text) {
  const root = requireWorkspaceRoot()
  const current = getSkillText(id)
  if (current.builtin) {
    const abs = path.join(root, overrideFile(id))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, String(text ?? ''))
    const { written } = writeAgentScaffolding(root, { commit: getAgentScaffolding(root).commit, trail: false })
    return { file: overrideFile(id), written }
  }
  fs.writeFileSync(resolveSafe(root, current.file), String(text ?? ''))
  return { file: current.file, written: [current.file] }
}

// A new skill, written for each agent chosen in that agent's own format — the
// same emitters the built-ins go through. Never overwrites a file.
export function createSkill({ name, description, instructions, agents }) {
  const root = requireWorkspaceRoot()
  const id = String(name ?? '').trim().replace(/^\//, '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('A skill name is lowercase letters, digits and dashes, like "review" or "ship-it"')
  if (scanSkills(root).skills.some((s) => s.id === id)) throw new Error(`There's already a skill called "${id}"`)
  const chosen = (Array.isArray(agents) ? agents : []).filter((a) => ['claude', 'codex', 'gemini'].includes(a))
  if (chosen.length === 0) throw new Error('Pick at least one agent')
  if (!String(instructions ?? '').trim()) throw new Error('A skill needs instructions')
  const files = emitSkillFiles({ id, description: String(description ?? '').trim(), argumentHint: '', context: '', command: String(instructions).trim() }, chosen)
  for (const f of files) if (fs.existsSync(path.join(root, f.path))) throw new Error(`${f.path} already exists`)
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true })
    fs.writeFileSync(path.join(root, f.path), f.content)
  }
  return { id, written: files.map((f) => f.path) }
}

// Statuses from the trail (planDoc.mjs's inferStepStatuses): reads the trail
// lines since the last call and applies what they say — a step in progress when
// an agent edits its files, testing when it runs tests, done when they passed
// and it moved on — as reports by 'auto'. Called whenever the trail grows.
// Lines from before Sleipnir started looking (more than TRAIL_LOOKBACK_MS ago)
// are left alone, so opening a project never rewrites its plans' history.
const TRAIL_LOOKBACK_MS = 10 * 60_000
const trailCursor = new Map() // root -> time of the last trail line applied
export function applyTrailStatuses() {
  const root = getWorkspaceRoot()
  if (!root) return { applied: [] }
  const since = trailCursor.get(root) ?? Date.now() - TRAIL_LOOKBACK_MS
  const { entries } = getAgentTrail({ since, limit: 2000 })
  if (entries.length === 0) return { applied: [] }
  trailCursor.set(root, entries[entries.length - 1].at)

  const data = readNotesFile()
  const steps = data.nodes.filter((n) => n.type === 'plan-step')
  if (steps.length === 0) return { applied: [] }
  const plannedBy = new Map()
  for (const n of data.nodes) if (n.type === 'planned-file' && n.stepId && n.filePath) plannedBy.set(n.stepId, [...(plannedBy.get(n.stepId) ?? []), n.filePath])
  const filesOf = (step) => [...(step.editsPaths ?? []), ...(plannedBy.get(step.id) ?? [])]
  // The latest report each step had from an agent or a person: those win.
  const reportedAt = {}
  for (const planId of new Set(steps.map((s) => s.planId).filter(Boolean))) {
    for (const e of readActivity(planId).events) {
      if (e.status && e.agent !== 'auto') reportedAt[e.stepId] = Math.max(reportedAt[e.stepId] ?? 0, e.at)
    }
  }
  const moves = inferStepStatuses({ entries, steps, filesOf, stages: readStages(), reportedAt })
  if (moves.length) recordStepReports(moves.map((m) => ({ stepId: m.stepId, status: m.status, agent: 'auto', touched: m.touched })))
  return { applied: moves }
}

// What a plan is for: shown above its steps and under its title in plan.md.
export function describePlan(planId, text) {
  const root = requireWorkspaceRoot()
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === planId)
  if (!plan) throw new Error(`No plan with id "${planId}"`)
  const description = String(text ?? '').trim()
  if (description) plan.description = description
  else delete plan.description
  writePlansFile(plans)
  if (plan.docPath) writePlanDoc(root, plan, readNotesFile(), readStages())
  return { plan }
}

// A comment on a step: from a person on the card (agent 'you'), or from an agent
// answering. It lands in the plan's activity log and plan.md, where agents read.
export function commentOnStep(stepId, text, { agent } = {}) {
  if (!stepId) throw new Error('stepId is required')
  const root = requireWorkspaceRoot()
  const data = readNotesFile()
  const planId = data.nodes.find((n) => n.id === stepId)?.planId
  const activity = planId ? readActivity(planId) : { events: [] }
  const { step, event } = addStepComment({ nodes: data.nodes, events: activity.events, stepId, text, agent, at: Date.now() })
  if (planId) {
    writeActivity(planId, activity)
    const plan = readPlansFile().find((p) => p.id === planId)
    if (plan?.docPath) writePlanDoc(root, plan, data, readStages())
  }
  return { step, event }
}

// A person steering a step from the graph: a file marked 'focus' or 'avoid'
// for it, or the mark cleared. Logged and put in plan.md like a comment, so the
// agent working the step reads it.
export function steerStep(stepId, filePath, steer) {
  if (!stepId) throw new Error('stepId is required')
  const root = requireWorkspaceRoot()
  const data = readNotesFile()
  const planId = data.nodes.find((n) => n.id === stepId)?.planId
  const activity = planId ? readActivity(planId) : { events: [] }
  const { step, event } = addStepSteer({ nodes: data.nodes, events: activity.events, stepId, path: filePath, steer, agent: 'you', at: Date.now() })
  if (planId) {
    writeActivity(planId, activity)
    const plan = readPlansFile().find((p) => p.id === planId)
    if (plan?.docPath) writePlanDoc(root, plan, data, readStages())
  }
  return { step, event }
}

// plan.md shows each step's status, so a status written by anything — the card
// toggle, an approval, an agent — regenerates the docs of the plans it touched.
export function refreshPlanDocsFor(ids, stages, data = null) {
  const root = getWorkspaceRoot()
  if (!root || ids.length === 0) return
  const notes = data ?? readNotesFile()
  const planIds = new Set()
  for (const id of ids) {
    const node = notes.nodes.find((n) => n.id === id)
    if (node?.type === 'plan-step' && node.planId) planIds.add(node.planId)
  }
  if (planIds.size === 0) return
  const plans = readPlansFile()
  for (const planId of planIds) {
    const plan = plans.find((p) => p.id === planId)
    if (plan?.docPath) writePlanDoc(root, plan, notes, stages)
  }
}

// Bulk-fills `stage` for any of `ids` that have no stage yet — used when a
// plan picks up files/nodes so they start life with an explicit status
// (see PlanningView.ViewModel.tsx's asset-plan resolve effect) instead of
// silently reading as untagged. Never overwrites an id that already has one
// — from a prior plan, Workspace, or Source Control — that's the difference
// between "default" and "reset". One read + one write regardless of how many
// ids are passed, unlike calling setNodeStage per id (a plan can easily have
// hundreds of files).
export function setDefaultNodeStages(ids, stage) {
  stage = requireNodeStage(stage)
  const stages = readStages()
  let changed = false
  for (const id of ids) {
    if (!(id in stages)) {
      stages[id] = stage
      changed = true
    }
  }
  if (changed) writeStages(stages)
  return { stages }
}
