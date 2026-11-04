// Reading and writing a project's Planning data: notes.json, plans.json,
// stages.json and archive.json.
import fs from 'node:fs'
import path from 'node:path'
import { toStepStatus } from '../planDoc.mjs'
import { ensurePlanningDir, planningFilePath } from './agentScaffolding.mjs'
import { SRC_ROOT, requireWorkspaceRoot, resolveSafe } from './paths.mjs'

function readArchive() {
  const p = planningFilePath('archive.json')
  if (!p || !fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

function writeArchive(entries) {
  const p = planningFilePath('archive.json')
  if (!p) throw new Error('No project is open')
  ensurePlanningDir()
  fs.writeFileSync(p, JSON.stringify(entries, null, 2))
}

// Per-node status overlay — a plain { [nodeId]: status } map, kept in its own
// file rather than on the node records so it can tag *any* node (including
// build-generated ones that don't live in notes.json). Missing file = no tags
// yet. See graph/stages.ts for how each value renders. Older values migrate
// here, on read, so every reader sees the three statuses and the next write
// persists them; a value nothing recognizes is dropped.
export function readStages() {
  const p = planningFilePath('stages.json')
  if (!p || !fs.existsSync(p)) return {}
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const stages = {}
  for (const [id, value] of Object.entries(parsed)) {
    const status = toStepStatus(value)
    if (status) stages[id] = status
  }
  return stages
}

export function writeStages(stages) {
  const p = planningFilePath('stages.json')
  if (!p) throw new Error('No project is open')
  ensurePlanningDir()
  fs.writeFileSync(p, JSON.stringify(stages, null, 2))
}

export function getArchivedPaths() {
  return { entries: readArchive() }
}

export function setArchived(relPath, archived, label) {
  // Also validates relPath stays within SRC_ROOT, even though we only ever
  // store the relative string in the manifest.
  resolveSafe(SRC_ROOT, relPath)
  const entries = readArchive().filter((e) => e.path !== relPath)
  if (archived) {
    entries.push({ path: relPath, label: label ?? relPath, archivedAt: Date.now() })
  }
  writeArchive(entries)
  return { entries }
}

const FIXED_MAP_IDS = new Set(['welcome', 'validation', 'todo', 'claude'])

function isValidMapId(map) {
  return FIXED_MAP_IDS.has(map)
}

// A node can also be authored straight into a saved plan (Planning's "Add
// node" on a plan tab) — a plan id isn't one of the fixed maps, so accept it
// too as long as the plan actually exists. The created note carries
// `map: <planId>` and the renderer surfaces it on that plan's own tab (see
// usePlanningViewModel's `live`, which merges every note whose map matches the
// open tab). `readPlansFile` is a hoisted function declaration below.
function isNoteTarget(map) {
  return isValidMapId(map) || readPlansFile().some((p) => p.id === map)
}

// Was a flat GraphNode[] array; now { nodes, edges } so plan-step nodes can
// carry a `plan-step` edge back to their parent plan node. `readNotesFile`
// transparently upgrades the old flat-array shape on read (still written on
// disk as the old shape until the next write), so an existing notes.json
// from before this change keeps working with no manual migration step.
export function readNotesFile() {
  const p = planningFilePath('notes.json')
  if (!p || !fs.existsSync(p)) return { nodes: [], edges: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (Array.isArray(parsed)) return { nodes: parsed, edges: [] }
    return { nodes: parsed.nodes ?? [], edges: parsed.edges ?? [] }
  } catch {
    return { nodes: [], edges: [] }
  }
}

// Write to a sibling temp file, then rename over the target, so the planning
// watcher (and any agent reading concurrently) never sees a half-written
// file. Falls back to a plain write if the rename is refused — on Windows a
// reader holding the target open can make renameSync throw EPERM.
export function writeFileAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text)
  try {
    fs.renameSync(tmp, p)
  } catch {
    fs.writeFileSync(p, text)
    fs.rmSync(tmp, { force: true })
  }
}

export function writeNotesFile(data) {
  const p = planningFilePath('notes.json')
  if (!p) throw new Error('No project is open')
  ensurePlanningDir()
  writeFileAtomic(p, JSON.stringify(data, null, 2))
}

export function getNotes() {
  return readNotesFile()
}

// User-created graph nodes with no backing file — plain ideas/tasks tracked
// directly from Planning's "+" flow, distinct from scaffoldComponent's
// atoms/molecules/organisms tiering. Always `kind: 'proposed'` (dashed in
// the graph), matching the same "not yet built" visual language as the
// hand-authored PROPOSED nodes.
export function addNote(map, label, description) {
  if (!isNoteTarget(map)) {
    throw new Error(`Unknown map "${map}"`)
  }
  if (!label || !label.trim()) {
    throw new Error('Name is required')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const node = {
    id: `note/${map}/${slug || 'note'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map,
    type: 'note',
    description: description?.trim() || undefined,
  }
  const data = readNotesFile()
  data.nodes.push(node)
  writeNotesFile(data)
  return { node }
}

// "Scaffold Files…" — the richer, second creation flow alongside addNote
// above: writes N real files into the open Workspace plus N graph nodes in
// one atomic call, rather than N separate createWorkspaceFile/addNote round
// trips (which would be non-atomic and leave orphaned files on a mid-loop
// failure). The renderer owns all business logic (which roles, which
// template content, which pairs get an auto-link) — this stays a dumb bulk
// writer, same "content is always caller-supplied" convention as
// createWorkspaceFile.
//
// entries: [{ label, role, language, description?, filePath, content }]
// links: [{ from: <index into entries>, to: <index into entries> }] —
// architecture-implied pairs (e.g. a View linking to its ViewModel),
// computed client-side from architectures.ts's `linksTo` against whichever
// roles were checked.
export function scaffoldNodes(map, entries, links) {
  if (!isNoteTarget(map)) {
    throw new Error(`Unknown map "${map}"`)
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('entries must be a non-empty array')
  }
  const root = requireWorkspaceRoot()

  // Pre-check every path before writing anything, so a single collision
  // fails the whole batch instead of leaving a partial scaffold on disk.
  const resolvedPaths = entries.map((e) => resolveSafe(root, e.filePath))
  resolvedPaths.forEach((filePath, i) => {
    if (fs.existsSync(filePath)) {
      throw new Error(`${entries[i].filePath} already exists`)
    }
  })
  resolvedPaths.forEach((filePath, i) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, entries[i].content ?? '')
  })

  const now = Date.now()
  const nodes = entries.map((e, i) => {
    const slug = e.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return {
      id: `note/${map}/${slug || 'node'}-${now}-${i}`,
      label: e.label.trim(),
      kind: 'proposed',
      map,
      type: 'scaffold',
      role: e.role,
      language: e.language,
      architecture: e.architecture,
      filePath: e.filePath,
      description: e.description?.trim() || undefined,
    }
  })
  const edges = (links ?? [])
    .filter((l) => nodes[l.from] && nodes[l.to])
    .map((l) => ({ source: nodes[l.from].id, target: nodes[l.to].id, kind: 'borrows' }))

  const data = readNotesFile()
  data.nodes.push(...nodes)
  data.edges.push(...edges)
  writeNotesFile(data)
  return { nodes, edges }
}

// A "saved plan" is a named, persisted list of existing graph node ids (plus
// their already-computed neighbors — see src/planning/graph/resolvePlan.ts,
// which does that expansion client-side) — NOT a library (no folder on disk)
// and NOT a `createPlanNode` AI draft (no `map`/`status`, doesn't live in
// notes.json). It only ever *references* real nodes, never owns/duplicates
// their data, so deleting one can't affect the files it points at.
export function readPlansFile() {
  const p = planningFilePath('plans.json')
  if (!p || !fs.existsSync(p)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writePlansFile(data) {
  const p = planningFilePath('plans.json')
  if (!p) throw new Error('No project is open')
  ensurePlanningDir()
  writeFileAtomic(p, JSON.stringify(data, null, 2))
}

export function getPlans() {
  return { plans: readPlansFile() }
}

// `temporary`/`expectedSteps` are CLI-only conveniences today (see
// sleipnir-plan.mjs) — no in-app UI sets either yet, so they're trailing
// params existing IPC/web callers simply never pass rather than a change to
// PlatformAPI's request shape. `expectedSteps`, when an external agent
// declares it up front (it usually already knows how many steps it's about
// to draft), lets PlanningView show a real N-of-M build progress bar and a
// definitive completion moment instead of an indeterminate pulse + quiet-
// timeout guess — see PlanningView.ViewModel.tsx's planBuildStatus.
export function createPlan(label, nodeIds = [], assetPaths, assetEdges, assetFolders, temporary, expectedSteps) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  if (!Array.isArray(nodeIds)) {
    throw new Error('nodeIds must be an array')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const plan = {
    id: `plan/${slug || 'plan'}-${Date.now()}`,
    label: label.trim(),
    nodeIds,
    ...(Array.isArray(assetPaths) && assetPaths.length ? { assetPaths } : {}),
    ...(Array.isArray(assetEdges) && assetEdges.length ? { assetEdges } : {}),
    ...(Array.isArray(assetFolders) && assetFolders.length ? { assetFolders } : {}),
    ...(temporary ? { temporary: true } : {}),
    ...(Number.isInteger(expectedSteps) && expectedSteps > 0 ? { expectedSteps } : {}),
    createdAt: Date.now(),
  }
  const plans = readPlansFile()
  plans.push(plan)
  writePlansFile(plans)
  return { plan }
}

// Merges workspace-relative paths into a plan's `generatedFiles` — called
// once per "Generate Code" run that happened while this plan's tab was
// active (see PlanningView.tsx's generateCode/App.tsx's onCodeGenerated).
// Lets a later deletePlan(id, {deleteFiles:true}) know what to clean up.
export function appendPlanGeneratedFiles(id, paths) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (!plan) throw new Error(`No plan with id "${id}"`)
  const existing = new Set(plan.generatedFiles ?? [])
  for (const p of paths) existing.add(p)
  plan.generatedFiles = [...existing]
  writePlansFile(plans)
  return { plan }
}

// Merges existing graph node ids into a plan's `nodeIds` (deduped) — the
// counterpart to createPlan's initial seed, used when a link drawn on a plan
// tab points at a node from *another* plan: that node gets pulled into this
// plan so the new edge actually resolves on its graph (see
// src/planning/graph/resolvePlan.ts + usePlanningViewModel's `live`).
// Idempotent: re-adding an id already present is a no-op.
export function addPlanNodes(id, nodeIds) {
  if (!Array.isArray(nodeIds)) {
    throw new Error('nodeIds must be an array')
  }
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (!plan) throw new Error(`No plan with id "${id}"`)
  const existing = new Set(plan.nodeIds ?? [])
  for (const n of nodeIds) existing.add(String(n))
  plan.nodeIds = [...existing]
  writePlansFile(plans)
  return { plan }
}

// Merges Workspace-relative file paths and/or whole folders into a plan's
// assetPaths/assetFolders (deduped) — the "pull this real file/folder from
// Workspace straight into an existing plan" primitive (see LeftRailingView's
// "Add node ▸" context-menu action). Unlike createPlanNode, this never
// invents a draft node with a made-up name: the file itself becomes a real,
// file-backed asset node the next time the plan is viewed (see
// src/planning/graph/resolveAssetPlan.ts), with its actual current
// imports/exports detected fresh — nothing is renamed, duplicated, or
// generated. Additive alongside any existing nodeIds (see graphForPlan in
// PlanningView.ViewModel.tsx) — a plan can hold both curated graph nodes and
// loose pulled-in files at once.
export function addPlanAssets(id, paths = [], folders = []) {
  if (!Array.isArray(paths) || !Array.isArray(folders)) {
    throw new Error('paths and folders must be arrays')
  }
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (!plan) throw new Error(`No plan with id "${id}"`)
  if (paths.length) {
    const existing = new Set(plan.assetPaths ?? [])
    for (const p of paths) existing.add(String(p))
    plan.assetPaths = [...existing]
  }
  if (folders.length) {
    const existing = new Set(plan.assetFolders ?? [])
    for (const f of folders) existing.add(String(f))
    plan.assetFolders = [...existing]
  }
  writePlansFile(plans)
  return { plan }
}

// Renames a plan — its LABEL only, never its id.
//
// The id embeds a slug of the original label (see createPlan), which makes it
// tempting to regenerate. It must not be: plan ids are referenced from graph
// nodes' `planId`, from open tabs, and from anything holding a plan id across a
// reload, and none of those would follow a re-slug. The slug in an id is a
// readability nicety fixed at creation, not the plan's name.
export function renamePlan(id, label) {
  const next = typeof label === 'string' ? label.trim() : ''
  if (!next) throw new Error('Label is required')
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)
  if (!plan) throw new Error(`No plan with id "${id}"`)
  plan.label = next
  writePlansFile(plans)
  return { plan }
}

// opts.deleteFiles also removes every workspace-relative path recorded in
// the plan's generatedFiles (see appendPlanGeneratedFiles) — resolved
// against the open Workspace root, same fs.rmSync pattern deleteLibrary used
// to use for a library's whole folder, just per-file here.
export function deletePlan(id, opts = {}) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === id)

  if (plan && (opts.deleteFiles || opts.deleteNodes)) {
    const nodeIds = new Set(plan.nodeIds ?? [])
    const data = readNotesFile()
    // Notes authored straight into the plan (map === plan id, via AddNodeModal)
    // belong to it too, even if they never made it into plan.nodeIds.
    for (const n of data.nodes) {
      if (n.map === id) nodeIds.add(n.id)
    }

    // Delete the workspace files this plan is responsible for: the ones it
    // generated via "Generate Code" (plan.generatedFiles) plus the real file
    // any of the plan's own graph nodes backs (node.filePath, e.g. a scaffolded
    // View/ViewModel). Deduped so a path that is both is never removed twice;
    // resolveSafe keeps every delete inside the open Workspace root. Permanent
    // (fs.rmSync) — the modal warns before calling this.
    if (opts.deleteFiles) {
      const root = requireWorkspaceRoot()
      const files = new Set(plan.generatedFiles ?? [])
      if (opts.deleteNodes) {
        for (const n of data.nodes) {
          if (nodeIds.has(n.id) && n.filePath) files.add(n.filePath)
        }
      }
      for (const relPath of files) {
        fs.rmSync(resolveSafe(root, relPath), { force: true, recursive: true })
      }
    }

    // Drop the plan's nodes from the graph and any edge touching one of them —
    // edges key on source/target (not from/to), so filter both ends to leave
    // nothing dangling.
    if (opts.deleteNodes && nodeIds.size) {
      data.nodes = data.nodes.filter((n) => !nodeIds.has(n.id))
      data.edges = data.edges.filter((e) => !nodeIds.has(e.source) && !nodeIds.has(e.target))
      writeNotesFile(data)
    }
  }

  writePlansFile(plans.filter((p) => p.id !== id))
}
