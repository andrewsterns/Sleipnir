#!/usr/bin/env node
// Sleipnir Planning CLI — standalone, vendored copy.
//
// This file is COPIED into each project as `.sleipnir/plan.mjs` by Sleipnir's
// scaffolder (tools/agentSkills/scaffold.mjs) and is meant to be committed. That
// is the whole point of it: a teammate who has never installed Sleipnir can
// clone the repo and still author plans into `.planning/` correctly, with
// nothing but Node. It therefore has no imports outside `node:` builtins, no
// package.json, no install step, and no absolute paths anywhere.
//
// It deliberately re-implements — rather than imports — the small slice of
// tools/sleipnir-backend.mjs that writes `.planning/plans.json` and
// `.planning/notes.json`, because importing the backend would drag in workspace
// scanning, graph generation and git for a script whose entire job is editing
// two JSON files. Drift is guarded by a conformance test that runs this file and
// the real backend against the same inputs and compares the resulting JSON
// byte-for-byte (src/00_planning/api/vendoredPlanCli.test.ts) — so if you change
// a shape in the backend, that test fails here.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PLANNING_DIR = '.planning'

// --- paths -----------------------------------------------------------------

// Mirrors the backend's resolveSafe: the one place containment is enforced.
function resolveSafe(base, ...segments) {
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root')
  }
  return resolved
}

// Mirrors the backend's toStoredPath. Anything we *store* becomes root-relative
// with forward slashes: notes.json is committed, so an absolute path in it would
// mean nothing on the next machine to clone the repo.
function toStoredPath(base, candidate) {
  return path.relative(base, path.resolve(base, candidate)).split(path.sep).join('/')
}

function planningFile(root, name) {
  return path.join(root, PLANNING_DIR, name)
}

// No README is written here, unlike the backend's ensurePlanningDir — the
// agent-facing documentation is emitted by the scaffolder, from one canonical
// source, so this file never carries a copy that could go stale.
function ensurePlanningDir(root) {
  fs.mkdirSync(path.join(root, PLANNING_DIR), { recursive: true })
}

// --- reads / writes --------------------------------------------------------

function readNotes(root) {
  const p = planningFile(root, 'notes.json')
  if (!fs.existsSync(p)) return { nodes: [], edges: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    // Legacy flat-array shape, upgraded on read exactly as the backend does.
    if (Array.isArray(parsed)) return { nodes: parsed, edges: [] }
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

function writeNotes(root, data) {
  ensurePlanningDir(root)
  fs.writeFileSync(planningFile(root, 'notes.json'), JSON.stringify(data, null, 2))
}

function readPlans(root) {
  const p = planningFile(root, 'plans.json')
  if (!fs.existsSync(p)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePlans(root, data) {
  ensurePlanningDir(root)
  fs.writeFileSync(planningFile(root, 'plans.json'), JSON.stringify(data, null, 2))
}

// --- core ------------------------------------------------------------------

function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// A plan id is already "plan/..."; strip the prefix so a step id built from it
// doesn't double up into "plan/plan/...".
function planSegmentOf(planId) {
  return planId.startsWith('plan/') ? planId.slice('plan/'.length) : planId
}

export function createPlan(root, label, { temporary, expectedSteps } = {}) {
  if (!label || !label.trim()) throw new Error('Label is required')
  const slug = slugify(label)
  const plan = {
    id: `plan/${slug || 'plan'}-${Date.now()}`,
    label: label.trim(),
    nodeIds: [],
    ...(temporary ? { temporary: true } : {}),
    ...(Number.isInteger(expectedSteps) && expectedSteps > 0 ? { expectedSteps } : {}),
    createdAt: Date.now(),
  }
  const plans = readPlans(root)
  plans.push(plan)
  writePlans(root, plans)
  return plan
}

export function createPlanNode(root, planId, label, description, parentId) {
  if (!label || !label.trim()) throw new Error('Label is required')
  const slug = slugify(label)
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slug || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
  }
  const data = readNotes(root)
  data.nodes.push(node)
  if (parentId) data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  writeNotes(root, data)
  return node
}

export function proposeFileNode(root, planId, label, description, filePath, content, parentId, linkTargetIds) {
  if (!label || !label.trim()) throw new Error('Label is required')
  if (!filePath || !filePath.trim()) throw new Error('filePath is required')
  const absPath = resolveSafe(root, filePath)
  const storedPath = toStoredPath(root, filePath)
  if (fs.existsSync(absPath)) {
    throw new Error(`${storedPath} already exists — propose a different path, or edit the real file directly instead of proposing it`)
  }
  const slug = slugify(label)
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slug || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
    proposedFile: { path: storedPath, content: content ?? '' },
  }
  const data = readNotes(root)
  data.nodes.push(node)
  if (parentId) data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  writeNotes(root, data)
  if (Array.isArray(linkTargetIds) && linkTargetIds.length) {
    setNodeBorrows(root, node.id, linkTargetIds)
  }
  return node
}

// A full replace of this node's 'borrows' edges, matching the backend:
// re-scanning a file's imports always yields its complete current set.
export function setNodeBorrows(root, nodeId, targetIds) {
  const data = readNotes(root)
  data.edges = data.edges.filter((e) => !(e.source === nodeId && e.kind === 'borrows'))
  for (const targetId of targetIds) {
    if (targetId !== nodeId) data.edges.push({ source: nodeId, target: targetId, kind: 'borrows' })
  }
  writeNotes(root, data)
}

// A step always carries `map: 'claude'` so it lands in the shared review tab. If
// planId is also a real saved plan, add the id to that plan's nodeIds so the step
// shows on its own named tab too.
export function pullIntoNamedPlanIfExists(root, planId, nodeId) {
  const plans = readPlans(root)
  const plan = plans.find((p) => p.id === planId)
  if (!plan) return
  const existing = new Set(plan.nodeIds ?? [])
  existing.add(String(nodeId))
  plan.nodeIds = [...existing]
  writePlans(root, plans)
}

// --- CLI -------------------------------------------------------------------

const HELP = `Sleipnir Planning CLI (vendored — needs only Node)

  node .sleipnir/plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
  node .sleipnir/plan.mjs create-node --root <path> --plan-id <id> --label "Step" \\
      --description "..." [--parent-id <nodeId>]
  node .sleipnir/plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \\
      --description "..." --file-path <workspace-relative-path> \\
      --content-file <path|-> [--parent-id <nodeId>] [--links <nodeId1,nodeId2>]

create-plan prints the new plan — pass its id as --plan-id to create-node for
every step so they land on that plan's own tab in Sleipnir's Planning graph.
--total-steps N (optional): if you already know your step count, Sleipnir shows
a real N-of-M progress bar and a definitive "done" moment instead of guessing
from a quiet period after your last write.

propose-file stages a NEW file (path + content) on the step instead of just a
text description — nothing is written to real disk until a human reviews and
explicitly saves it in Sleipnir. --content-file points at a file holding the
proposed content (write it there first — a CLI argument can't cleanly carry
multi-line source), or pass "-" to read it from stdin. --links draws visible
"borrows" edges to other node ids, so a batch of proposed files can show how
they reference each other before any of them exist on disk.

See AGENTS.md at the project root for the data shapes and the full workflow.
`

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith('--')) {
      const key = tok.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = true
      } else {
        args[key] = next
        i++
      }
    } else {
      args._.push(tok)
    }
  }
  return args
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function requireOpt(args, name) {
  const v = args[name]
  if (!v || v === true) fail(`--${name} is required`)
  return v
}

function parseIntOpt(args, name) {
  const v = args[name]
  if (v === undefined || v === true) return undefined
  const n = Number.parseInt(v, 10)
  if (!Number.isInteger(n) || n <= 0) fail(`--${name} must be a positive integer, got "${v}"`)
  return n
}

function resolveRoot(args) {
  const root = path.resolve(args.root ?? process.cwd())
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`Not a folder: ${root}`)
  return fs.realpathSync(root)
}

function readContentFile(pathOrDash) {
  try {
    return pathOrDash === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(pathOrDash), 'utf8')
  } catch (err) {
    return fail(`Couldn't read --content-file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    process.exit(command ? 0 : 1)
  }

  const root = resolveRoot(args)
  const out = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

  try {
    if (command === 'create-plan') {
      out(createPlan(root, requireOpt(args, 'label'), {
        temporary: !!args.temporary,
        expectedSteps: parseIntOpt(args, 'total-steps'),
      }))
      return
    }

    if (command === 'create-node') {
      const planId = requireOpt(args, 'plan-id')
      const node = createPlanNode(
        root,
        planId,
        requireOpt(args, 'label'),
        typeof args.description === 'string' ? args.description : undefined,
        typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined,
      )
      pullIntoNamedPlanIfExists(root, planId, node.id)
      out(node)
      return
    }

    if (command === 'propose-file') {
      const planId = requireOpt(args, 'plan-id')
      const label = requireOpt(args, 'label')
      const filePath = requireOpt(args, 'file-path')
      const content = readContentFile(requireOpt(args, 'content-file'))
      const node = proposeFileNode(
        root,
        planId,
        label,
        typeof args.description === 'string' ? args.description : undefined,
        filePath,
        content,
        typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined,
        typeof args.links === 'string' ? args.links.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      )
      pullIntoNamedPlanIfExists(root, planId, node.id)
      out(node)
      return
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  fail(`Unknown command "${command}". Run with --help for usage.`)
}

// Only run the CLI when executed directly, so the conformance test can import
// the functions above without the process exiting under it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
