// Architecture-aware plan steps: creating, approving and relinking them, and
// keeping their paths and stage tags in step with the files on disk.
import fs from 'node:fs'
import path from 'node:path'
import {
  addPlanStep,
  detectProject as detectProjectFrom,
  isPlanningPath,
  parseFileSpec,
  planDocPath,
  planSegmentOf,
  slugify,
  toStepStatus,
} from '../planDoc.mjs'
import { getWorkspaceRoot } from '../workspace-root.mjs'
import { getRenameMap } from '../git-control.mjs'
import { requireWorkspaceRoot, resolveSafe, toStoredPath, walkFiles } from './paths.mjs'
import { readNotesFile, readPlansFile, readStages, writeNotesFile, writePlansFile, writeStages } from './planningStore.mjs'
import { recordStepReports, refreshPlanDocsFor, requireNodeStage, writePlanDoc } from './stepReports.mjs'

// --- Architecture-aware plan steps ------------------------------------------
// The pure half (ordering, planned-file nodes, plan.md rendering, detection)
// lives in tools/planDoc.mjs and is shared byte-for-byte with the vendored CLI;
// everything below is the filesystem half. tools/agentSkills/vendor/plan.mjs
// mirrors these helpers, and src/platform/vendoredPlanCli.test.ts
// compares what the two write.

// Declared new files (CLI "path:role[:language]" strings, or chat-tool
// objects) -> validated { path, role, language? } with stored paths. A planned
// file must get its real project location and must not exist yet.
function normalizePlannedFiles(root, files, defaultLanguage) {
  return (files ?? []).map((f) => {
    const spec = typeof f === 'string' ? f : `${f?.path ?? ''}:${f?.role || 'node'}${f?.language ? `:${f.language}` : ''}`
    const parsed = parseFileSpec(spec, defaultLanguage)
    const absPath = resolveSafe(root, parsed.path)
    const stored = toStoredPath(root, parsed.path)
    if (isPlanningPath(stored)) {
      throw new Error(`${stored}: planned files get their real project path, never .planning/`)
    }
    if (fs.existsSync(absPath)) {
      throw new Error(`${stored} already exists — list it under edits instead of planning it as a new file`)
    }
    return { ...parsed, path: stored }
  })
}

// Existing files a step will change — must exist (a new file is planned, not edited).
function normalizeEdits(root, edits) {
  return (edits ?? []).map((p) => {
    const absPath = resolveSafe(root, p)
    const stored = toStoredPath(root, p)
    if (!fs.existsSync(absPath)) {
      throw new Error(`${stored} doesn't exist — plan it as a new file instead of an edit`)
    }
    return stored
  })
}

// After a step is written: pull it (and its planned files) onto the saved
// plan's own tab, record the plan's doc path, and regenerate plan.md. A plan
// id that isn't a saved plan (the in-app chat's ad-hoc slugs) gets neither.
function syncPlanAfterStep(root, planId, data, newIds) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === planId)
  if (!plan) return
  const ids = new Set(plan.nodeIds ?? [])
  for (const id of newIds) ids.add(id)
  plan.nodeIds = [...ids]
  plan.docPath = planDocPath(planId)
  writePlansFile(plans)
  writePlanDoc(root, plan, data, readStages())
}

// What language(s) and layout the open project uses — run by an agent before
// it plans, so planned files match the codebase (see registry.mjs PLAN_COMMAND).
export function detectProject() {
  const root = requireWorkspaceRoot()
  return detectProjectFrom(
    (rel) => {
      try {
        return fs.readdirSync(resolveSafe(root, rel), { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }))
      } catch {
        return []
      }
    },
    (rel) => {
      try {
        return fs.readFileSync(resolveSafe(root, rel), 'utf8')
      } catch {
        return null
      }
    },
  )
}

// Created by the AI chat's create_plan_node tool (see electron/chat.cjs) —
// always lands in the `claude` map ("Claude's drafting area"), starts life
// as `status: 'draft'` awaiting human approval in Planning. `planId` groups
// every step of one plan together; when `parentId` is given (the plan's own
// parent node, created first with no parentId), a `plan-step` edge links
// them so the graph can render the grouping.
//
// Not atomic with the edge write below — two sequential writeNotesFile
// calls. Fine for a single local desktop user; would need real locking
// under concurrent writers.
//
// `opts` (all optional):
//   after           — step id to insert after, or 'none' for no sequence edge;
//                     default chains after the plan's last step
//   files           — new files this step will create (see normalizePlannedFiles)
//   edits           — existing files this step will change
//   defaultLanguage — language for a declared file whose extension doesn't say
export function createPlanNode(planId, label, description, parentId, opts = {}) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  const hasFileWork = (opts.files?.length ?? 0) > 0 || (opts.edits?.length ?? 0) > 0
  const root = hasFileWork ? requireWorkspaceRoot() : getWorkspaceRoot()
  const files = hasFileWork ? normalizePlannedFiles(root, opts.files, opts.defaultLanguage) : []
  const edits = hasFileWork ? normalizeEdits(root, opts.edits) : []
  // planId is usually a short caller-chosen slug ("hamburger-menu"), but
  // sleipnir-plan.mjs's create-node also accepts a real saved-plan id
  // (already "plan/...") — planSegmentOf strips that prefix so the id doesn't
  // double up into "plan/plan/...". `node.planId` keeps the exact value.
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slugify(label) || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
  }
  const data = readNotesFile()
  const { planned } = addPlanStep(data, { planId, node, after: opts.after, files, edits })
  if (parentId) {
    data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  }
  writeNotesFile(data)
  if (root) syncPlanAfterStep(root, planId, data, [node.id, ...planned.map((p) => p.id)])
  return { node, planned }
}

// Moves a planned file (not yet on disk) to a different path before its step
// is approved — the review modal's editable path. Same rules as declaring it:
// a real project path, not under .planning/, not an existing file. The node id
// embeds the path, so the id, every edge touching it, the plan's nodeIds and
// plan.md all follow.
export function updatePlannedFilePath(nodeId, newPath) {
  const root = requireWorkspaceRoot()
  const data = readNotesFile()
  const node = data.nodes.find((n) => n.id === nodeId)
  if (!node || node.type !== 'planned-file') throw new Error(`No planned file with id "${nodeId}"`)
  const [file] = normalizePlannedFiles(root, [`${newPath}:${node.role ?? 'node'}`], node.language)
  if (file.path === node.filePath) return { node }
  const newId = `planned/${planSegmentOf(node.planId)}/${file.path}`
  if (data.nodes.some((n) => n.id === newId)) throw new Error(`${file.path} is already planned in this plan`)

  node.id = newId
  node.filePath = file.path
  node.label = file.path.slice(file.path.lastIndexOf('/') + 1)
  if (file.language) node.language = file.language
  for (const e of data.edges) {
    if (e.source === nodeId) e.source = newId
    if (e.target === nodeId) e.target = newId
  }
  writeNotesFile(data)

  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === node.planId)
  if (plan) {
    plan.nodeIds = (plan.nodeIds ?? []).map((id) => (id === nodeId ? newId : id))
    writePlansFile(plans)
    syncPlanAfterStep(root, node.planId, data, [])
  }
  return { node }
}

// Same shape as createPlanNode above, plus a staged `proposedFile` — a
// workspace-relative path + full content that does NOT touch real disk here.
// Deliberately mirrors generate_code's own trust boundary (see chat.cjs's
// TOOL_DEFS comment): nothing gets written until a human explicitly reviews
// and saves it. `filePath` is resolveSafe-checked immediately so a bad path
// fails loud at proposal time, not later at bake time; refuses to propose a
// path that already has a real file on disk, same guard createWorkspaceFile
// itself uses. What gets *stored* on the node is toStoredPath's normalized
// root-relative form, never the caller's raw string — notes.json is committed
// and travels to other machines, so an absolute path in there would break on
// every clone. `linkTargetIds`, when given, draws 'borrows' edges from the
// new node via setNodeBorrows so multiple proposed files can visibly
// reference each other in the graph before any of them are real.
export function proposeFileNode(planId, label, description, filePath, content, parentId, linkTargetIds) {
  if (!label || !label.trim()) {
    throw new Error('Label is required')
  }
  if (!filePath || !filePath.trim()) {
    throw new Error('filePath is required')
  }
  const root = requireWorkspaceRoot()
  const absPath = resolveSafe(root, filePath)
  const storedPath = toStoredPath(root, filePath)
  if (fs.existsSync(absPath)) {
    throw new Error(`${storedPath} already exists — propose a different path, or edit the real file directly instead of proposing it`)
  }
  const node = {
    id: `plan/${planSegmentOf(planId)}/${slugify(label) || 'step'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map: 'claude',
    type: 'plan-step',
    description: description?.trim() || undefined,
    status: 'draft',
    planId,
    proposedFile: { path: storedPath, content: content ?? '' },
  }
  const data = readNotesFile()
  addPlanStep(data, { planId, node })
  if (parentId) {
    data.edges.push({ source: parentId, target: node.id, kind: 'plan-step' })
  }
  writeNotesFile(data)
  syncPlanAfterStep(root, planId, data, [node.id])
  if (Array.isArray(linkTargetIds) && linkTargetIds.length) {
    setNodeBorrows(node.id, linkTargetIds)
  }
  return { node }
}

const NODE_STATUSES = new Set(['draft', 'approved', 'done'])

export function setNodeStatus(id, status) {
  if (!NODE_STATUSES.has(status)) {
    throw new Error(`Unknown status "${status}" — expected one of ${[...NODE_STATUSES].join(', ')}`)
  }
  const data = readNotesFile()
  const node = data.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`No note node with id "${id}"`)
  if (!node.status) throw new Error(`Node "${id}" is not a plan node (no status field)`)
  node.status = status
  writeNotesFile(data)
  syncStatusWithApproval([id], status)
  return { node }
}

// Approval is an action, and the step's one status follows it: approving starts
// a pending step (in_progress), saving its staged file completes it. A status an
// agent already moved further along is left alone, so approving a step the
// agent finished doesn't reopen it.
function syncStatusWithApproval(ids, approval) {
  if (approval === 'draft' || ids.length === 0) return
  const stages = readStages()
  const next = toStepStatus(approval)
  const moved = ids.filter((id) => {
    const current = stages[id] ?? 'pending'
    return next === 'completed' ? current !== 'completed' : current === 'pending'
  })
  if (moved.length) recordStepReports(moved.map((stepId) => ({ stepId, status: next, agent: 'you' })))
}

// Bulk counterpart to setNodeStatus, same "one read/write regardless of how
// many ids" shape as setDefaultNodeStages below — the Planning graph's
// "Approve All" action on a freshly AI-drafted plan (see PlanBuildStatusBar
// in the renderer) would otherwise mean N separate writes (and N separate
// planningWatcher-debounced refreshes) for an N-step plan. Targets every
// draft node belonging to `planId` — both the ones actually referenced by
// the plan's own `nodeIds` (its named tab) and any sharing that `planId`
// field on the shared "claude" review map (createPlanNode always writes
// both), matching the same dual-membership `live` merge rule PlanningView.
// ViewModel.tsx's graph resolution already uses. Silently no-ops on a plan
// with nothing left in `draft` — approving twice isn't an error.
// File-carrying drafts (see proposeFileNode above) are deliberately skipped
// here, not bulk-approved: approving one means baking real content into the
// workspace, which stays behind the same explicit review-then-save gate
// generate_code already uses (see PlanningView's per-node Approve handler
// for the review-queue counterpart to this bulk action) — a single click
// on Approve All must never write file content the human hasn't looked at.
// Returned separately so the caller can tell the human "N files still need
// review" rather than silently doing nothing about them.
export function approvePlanNodes(planId) {
  const plans = readPlansFile()
  const plan = plans.find((p) => p.id === planId)
  const nodeIds = new Set(plan?.nodeIds ?? [])
  const data = readNotesFile()
  const stages = readStages()
  const approved = []
  const needsReview = []
  for (const node of data.nodes) {
    if (node.status !== 'draft') continue
    // Finished by an agent that went ahead without approval: nothing to approve.
    if (stages[node.id] === 'completed') continue
    if (node.planId !== planId && !nodeIds.has(node.id)) continue
    // A step with planned files is approved through its review modal, which
    // writes those files — never blindly in bulk.
    if (node.proposedFile || data.nodes.some((n) => n.stepId === node.id)) {
      needsReview.push(node.id)
      continue
    }
    node.status = 'approved'
    approved.push(node.id)
  }
  if (approved.length) {
    writeNotesFile(data)
    syncStatusWithApproval(approved, 'approved')
  }
  return { approvedIds: approved, needsReviewIds: needsReview }
}

// Full-replace of one node's outgoing 'borrows' edges — used both by the
// node-card link editor (PlanningView, an explicit user edit) and by
// CodeEditorView's save-hook (re-parsing a saved file's real imports and
// reconciling the graph to match, see WorkspaceView's onImportsChanged).
// A full replace rather than individual add/remove calls is the simplest
// correct approach for the parse direction, since re-scanning a file's
// imports always yields its complete current set, not a delta.
export function setNodeBorrows(nodeId, targetIds) {
  if (!Array.isArray(targetIds)) {
    throw new Error('targetIds must be an array')
  }
  const data = readNotesFile()
  // Called on every editor save with the file's freshly scanned imports, which
  // usually haven't changed. Rewriting notes.json anyway fires the planning
  // watcher, and every open Planning view refetches and redraws its graph —
  // so an unchanged set is left exactly as it is, file untouched.
  const wanted = new Set(targetIds.filter((targetId) => targetId !== nodeId))
  const current = data.edges.filter((e) => e.source === nodeId && e.kind === 'borrows').map((e) => e.target)
  if (current.length === wanted.size && current.every((targetId) => wanted.has(targetId))) {
    return { edges: data.edges.filter((e) => e.source === nodeId) }
  }
  data.edges = data.edges.filter((e) => !(e.source === nodeId && e.kind === 'borrows'))
  for (const targetId of wanted) {
    data.edges.push({ source: nodeId, target: targetId, kind: 'borrows' })
  }
  writeNotesFile(data)
  return { edges: data.edges.filter((e) => e.source === nodeId) }
}

// Permanently removes one notes.json node plus every edge touching it (as
// source or target). Notes, scaffolded nodes, and plan-step nodes all live
// in notes.json, so this one function is the hard-delete counterpart for all
// three — unlike setArchived, which is a *restorable* soft-hide for the
// build-generated src nodes that combine.ts owns (those aren't in notes.json
// and can't be deleted here; they'd just regenerate from source).
//
// Deliberately does NOT touch any real Workspace file a scaffolded node
// points at — deleting that file is the caller's separate, explicit choice
// via deleteWorkspacePath (see PlanningView's DeleteNodeModal), same
// node-only-vs-node-plus-files split deletePlan offers.
// Edit a notes.json node's label (and optionally description) in place — the
// rename counterpart to addNote. Only nodes that actually live in notes.json
// (notes, scaffolded, plan-steps) can be renamed here; build-generated src
// nodes aren't stored here (they regenerate from source), so this throws for
// an unknown id and callers gate "Rename" to notes-backed nodes.
export function updateNote(id, patch) {
  const data = readNotesFile()
  const node = data.nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`No note node with id "${id}"`)
  }
  if (patch && patch.label !== undefined) {
    const label = String(patch.label).trim()
    if (!label) throw new Error('Name is required')
    node.label = label
  }
  if (patch && patch.description !== undefined) {
    node.description = String(patch.description).trim() || undefined
  }
  writeNotesFile(data)
  return { node }
}

export function deleteNote(id) {
  const data = readNotesFile()
  if (!data.nodes.some((n) => n.id === id)) {
    throw new Error(`No note node with id "${id}"`)
  }
  data.nodes = data.nodes.filter((n) => n.id !== id)
  data.edges = data.edges.filter((e) => e.source !== id && e.target !== id)
  writeNotesFile(data)
  // A stage tag on a now-deleted node would just be dead weight in the overlay.
  const stages = readStages()
  if (id in stages) {
    delete stages[id]
    writeStages(stages)
  }
}

// ── Stale file references ──────────────────────────────────────────────────
// `.planning/` stores workspace-relative paths, and nothing keeps them in step
// with files renamed, moved, or deleted outside Sleipnir (another editor, git).
// These three functions find the stale ones, suggest where they went, and
// rewrite or drop them — see src/planning/usePlanningHealth.ts.

const STAGE_FILE_PREFIX = 'file:'

// Every stored path a Planning node is drawn from, grouped by path. A loose
// assetPath under one of its own plan's assetFolders is skipped: the folder is
// re-listed live (see resolveAssetPlan.ts), so that entry never becomes a node
// and a missing one isn't worth flagging. Proposed-file nodes are skipped too —
// their file isn't supposed to exist until someone reviews and saves it.
function collectPlanningRefs() {
  const byPath = new Map()
  const add = (p, isDir, ref) => {
    if (!p) return
    const entry = byPath.get(p) ?? { path: p, isDir, refs: [] }
    entry.refs.push(ref)
    byPath.set(p, entry)
  }
  for (const plan of readPlansFile()) {
    const folders = plan.assetFolders ?? []
    for (const f of folders) add(f, true, { kind: 'assetFolder', planId: plan.id, label: plan.label })
    for (const p of plan.assetPaths ?? []) {
      if (folders.some((f) => p.startsWith(`${f}/`))) continue
      add(p, false, { kind: 'assetPath', planId: plan.id, label: plan.label })
    }
  }
  for (const node of readNotesFile().nodes) {
    // Planned-file placeholders point at a path that doesn't exist until their
    // step is approved — not missing, just not built yet.
    if (node.filePath && !node.proposedFile && !node.planned) add(node.filePath, false, { kind: 'note', nodeId: node.id, mapId: node.map, label: node.label })
  }
  return [...byPath.values()]
}

// Follows a rename chain (a→b→c) to the first path that exists now.
function followRename(renames, from, exists) {
  let cur = from
  for (let i = 0; i < 50; i++) {
    const next = renames.get(cur)
    if (!next || next === from) return null
    if (exists(next)) return next
    cur = next
  }
  return null
}

// git records renames per file, never per folder — a moved folder shows up as
// its children's renames sharing a common suffix. The newest child rename that
// lands somewhere real gives the folder's new location.
function followFolderRename(renames, folder, exists) {
  const prefix = `${folder}/`
  for (const [from, to] of renames) {
    if (!from.startsWith(prefix)) continue
    const rest = from.slice(prefix.length)
    if (!to.endsWith(`/${rest}`)) continue
    const candidate = to.slice(0, to.length - rest.length - 1)
    if (candidate && exists(candidate)) return candidate
  }
  return null
}

export async function checkPlanningPaths() {
  // Captured once: main.cjs's `ws` points the shared root at the calling window
  // only for the synchronous part of a call, and git below is awaited.
  const root = getWorkspaceRoot()
  if (!root) return { missing: [] }
  const exists = (rel) => fs.existsSync(path.join(root, rel))
  const missing = collectPlanningRefs().filter((entry) => !exists(entry.path))
  if (missing.length === 0) return { missing }

  // basename -> its only path, or null once a second file shares the name.
  const byName = new Map()
  for (const { rel } of walkFiles(root, '')) {
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    byName.set(name, byName.has(name) ? null : rel)
  }

  const renames = await getRenameMap(root).catch(() => new Map())
  for (const entry of missing) {
    const viaGit = entry.isDir
      ? followFolderRename(renames, entry.path, exists)
      : followRename(renames, entry.path, exists)
    if (viaGit) {
      entry.suggestion = { path: viaGit, source: 'git' }
    } else if (!entry.isDir) {
      const match = byName.get(entry.path.slice(entry.path.lastIndexOf('/') + 1))
      if (match) entry.suggestion = { path: match, source: 'name' }
    }
  }
  return { missing }
}

function remapPath(p, from, to) {
  if (p === from) return to
  if (p.startsWith(`${from}/`)) return to + p.slice(from.length)
  return p
}

// Rewrites every stored reference to `from` (and, for a folder, everything
// under it) to point at `to`: plan asset/generated paths and edges, notes'
// filePath, and `file:` stage keys — the last one matters, since a workspace
// file's stage is keyed by its path (see graph/stages.ts's nodeStageKey) and
// would otherwise be silently lost. Each file is written only if it changed.
export function relinkPlanningPath(from, to) {
  if (!from || !to) throw new Error('from and to are required')
  const root = requireWorkspaceRoot()
  resolveSafe(root, to)
  const src = toStoredPath(root, from)
  const dest = toStoredPath(root, to)
  if (src === dest) return { changed: 0 }

  let changed = 0
  const remap = (p) => {
    const next = remapPath(p, src, dest)
    if (next !== p) changed++
    return next
  }
  const remapList = (list) => [...new Set(list.map(remap))]

  const plans = readPlansFile()
  let before = changed
  for (const plan of plans) {
    if (Array.isArray(plan.assetPaths)) plan.assetPaths = remapList(plan.assetPaths)
    if (Array.isArray(plan.assetFolders)) plan.assetFolders = remapList(plan.assetFolders)
    if (Array.isArray(plan.generatedFiles)) plan.generatedFiles = remapList(plan.generatedFiles)
    if (Array.isArray(plan.assetEdges)) {
      plan.assetEdges = plan.assetEdges.map((e) => ({ source: remap(e.source), target: remap(e.target) }))
    }
  }
  if (changed > before) writePlansFile(plans)

  const notes = readNotesFile()
  before = changed
  for (const node of notes.nodes) {
    if (node.filePath) node.filePath = remap(node.filePath)
  }
  if (changed > before) writeNotesFile(notes)

  const stages = readStages()
  before = changed
  for (const key of Object.keys(stages)) {
    if (!key.startsWith(STAGE_FILE_PREFIX)) continue
    const next = STAGE_FILE_PREFIX + remap(key.slice(STAGE_FILE_PREFIX.length))
    if (next === key) continue
    if (!(next in stages)) stages[next] = stages[key]
    delete stages[key]
  }
  if (changed > before) writeStages(stages)

  return { changed }
}

// Drops every stored reference to `relPath` (and anything under it): plan
// asset/generated paths and the edges touching them, `file:` stage keys, and
// notes nodes backed by it — those go through deleteNote so their edges and
// stage tags go with them. Never touches the workspace itself.
export function removePlanningRef(relPath) {
  if (!relPath) throw new Error('path is required')
  const root = requireWorkspaceRoot()
  const target = toStoredPath(root, relPath)
  const hit = (p) => p === target || p.startsWith(`${target}/`)
  let removed = 0

  const plans = readPlansFile()
  let plansDirty = false
  for (const plan of plans) {
    for (const field of ['assetPaths', 'assetFolders', 'generatedFiles']) {
      if (!Array.isArray(plan[field])) continue
      const kept = plan[field].filter((p) => !hit(p))
      if (kept.length === plan[field].length) continue
      removed += plan[field].length - kept.length
      plan[field] = kept
      plansDirty = true
    }
    if (Array.isArray(plan.assetEdges)) {
      const kept = plan.assetEdges.filter((e) => !hit(e.source) && !hit(e.target))
      if (kept.length !== plan.assetEdges.length) {
        plan.assetEdges = kept
        plansDirty = true
      }
    }
  }
  if (plansDirty) writePlansFile(plans)

  for (const node of readNotesFile().nodes) {
    if (node.filePath && hit(node.filePath)) {
      deleteNote(node.id)
      removed++
    }
  }

  const stages = readStages()
  const staleKeys = Object.keys(stages).filter((k) => k.startsWith(STAGE_FILE_PREFIX) && hit(k.slice(STAGE_FILE_PREFIX.length)))
  if (staleKeys.length) {
    for (const k of staleKeys) delete stages[k]
    writeStages(stages)
  }

  return { removed }
}

export function getNodeStages() {
  return { stages: readStages() }
}

// Tags one node (any node, by id) with a sprint stage, or clears it when
// `stage` is null/undefined/empty. Not scoped to notes.json — the overlay is
// keyed by bare node id so build-generated nodes can be tagged too.
export function setNodeStage(id, stage) {
  if (!id) throw new Error('id is required')
  // A plan step's status is a report like any agent's: logged, and its changes
  // tracked from the moment it starts (see recordStepReports).
  if (stage && readNotesFile().nodes.some((n) => n.id === id && n.type === 'plan-step')) {
    recordStepReports([{ stepId: id, status: stage, agent: 'you' }])
    return { stages: readStages() }
  }
  const stages = readStages()
  if (!stage) {
    delete stages[id]
  } else {
    stages[id] = requireNodeStage(stage)
  }
  writeStages(stages)
  refreshPlanDocsFor([id], stages)
  return { stages }
}
