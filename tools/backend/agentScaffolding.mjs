// The project's .planning/ folder and the agent files written beside it
// (AGENTS.md, CLAUDE.md, slash commands, the vendored CLI).
import fs from 'node:fs'
import path from 'node:path'
import { PLAN_CLI, SCAFFOLD_VERSION } from '../agentSkills/registry.mjs'
import { ensureAgentScaffolding as writeAgentScaffolding, readState as readScaffoldState, scaffoldPaths } from '../agentSkills/scaffold.mjs'
import { getWorkspaceRoot } from '../workspace-root.mjs'
import { PLANNING_DIR, REPO_ROOT, readProjectMeta, requireWorkspaceRoot, writeProjectMeta } from './paths.mjs'

// ─── Planning data (Notes graph / Saved Plans / Archive) ───────────────────
// One board per open project — stored as real files under the currently open
// Workspace root's own `.planning/` folder (portable, git-committable,
// travels with the project). Deliberately independent of REPO_ROOT/SRC_ROOT:
// Sleipnir's own generated component-library/graph-scanning system
// (generate-graph.mjs, combine.ts's build-time import.meta.glob) stays
// pinned to Sleipnir's own repo regardless of which project is open — see
// ROADMAP.md's Phase 4 for why generalizing *that* system is a separate,
// deliberately deferred, much larger rewrite. `null` (no project open) reads
// as empty and refuses writes, same as requireWorkspaceRoot's other callers.
export function planningFilePath(fileName) {
  const root = getWorkspaceRoot()
  return root ? path.join(root, PLANNING_DIR, fileName) : null
}

// One-time onboarding note, dropped into every project's `.planning/` folder
// the first time anything is written there (see ensurePlanningDir below) —
// written once, never overwritten, so any local notes a human adds survive.
//
// Deliberately short: the full agent-facing instructions now live in the
// project's own AGENTS.md, emitted from tools/agentSkills/registry.mjs, which is
// where an external agent actually looks. This file used to carry that whole
// document *plus* an absolute path to this machine's Sleipnir install — which
// broke the moment anyone else cloned the repo, since it is written once and
// never refreshed afterwards.
function planningReadmeContent() {
  return `# .planning/ — Sleipnir Planning data (do not hand-edit)

This folder is the live backing store for this project's Planning graph in
Sleipnir. Anything written here in the right shapes shows up as real nodes and
tabs automatically — no restart, no manual refresh — whatever wrote it.

Don't hand-edit these files. The id/slug/edge shapes are easy to get subtly
wrong: a plan's \`nodeIds\` only ever *references* node ids that live in
notes.json, so a plan written with a description and \`nodeIds: []\` renders as a
named tab containing nothing. Use the bundled CLI, which needs only Node:

  node ${PLAN_CLI} create-plan --root . --label "My plan" [--total-steps N]
  node ${PLAN_CLI} create-node --root . --plan-id <id> --label "Step" \\
      --description "What this step does"

See AGENTS.md at the project root for the full workflow, propose-file, and the
exact data shapes.

Files:
  plans.json    Named plan tabs. nodeIds only ever *reference* ids in notes.json.
  notes.json    Real graph node content (drafts, scaffolds, AI plan steps).
  stages.json   Per-node status ({ [nodeId]: 'pending'|'in_progress'|'testing'|'completed' }).
  archive.json  Archived/hidden node ids.
`
}

// Centralizes what every write*File below used to do inline
// (fs.mkdirSync(path.dirname(p), {recursive:true})) — same effect, plus a
// one-time README drop the moment this project actually starts using
// Planning, rather than on every openWorkspace() regardless of whether the
// project ever touches it.
export function ensurePlanningDir() {
  const root = getWorkspaceRoot()
  if (!root) return
  const dir = path.join(root, PLANNING_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const readmePath = path.join(dir, 'README.md')
  if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, planningReadmeContent())
  // The first real Planning write is what opts a project into the agent files
  // (see isAgentScaffoldingActive). Keyed on the vendored CLI so steady-state
  // writes pay one existsSync, not a scaffolder run.
  if (getAgentScaffolding(root).enabled !== false && !fs.existsSync(path.join(root, PLAN_CLI))) {
    ensureAgentScaffolding(root, { firstUse: true })
  }
}

// --- agent scaffolding -----------------------------------------------------

// Per-project config for the generated agent files (AGENTS.md, CLAUDE.md, the
// slash commands, the vendored CLI — see tools/agentSkills/scaffold.mjs), stored
// in project.json so it travels with the project rather than living in this
// machine's userData.
//
// `commit` defaults to true because that is the point of the feature: a teammate
// who clones the repo should get a working /plan, and that only happens if the
// files are committed. Setting it false keeps them out of git via
// .git/info/exclude, which is per-clone and never committed itself.
const DEFAULT_AGENT_SCAFFOLDING = { commit: true }

export function getAgentScaffolding(root = getWorkspaceRoot()) {
  if (!root) return { ...DEFAULT_AGENT_SCAFFOLDING }
  const stored = readProjectMeta(root).agentScaffolding
  return {
    ...DEFAULT_AGENT_SCAFFOLDING,
    ...(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}),
  }
}

// Whether this project gets the agent files at all.
//
// Opening a folder is not consent to write seven files into it. Scaffolding
// used to run on every open, so merely looking at a repo in Sleipnir lit up
// its git status with AGENTS.md, CLAUDE.md, GEMINI.md, three command files and
// .sleipnir/ — before anyone had planned anything. Now an explicit choice in
// Settings (`enabled`) wins, and without one a project is in only once it
// actually uses Planning: it has plan data, or it was already scaffolded
// (which keeps existing projects' files up to date). ensurePlanningDir opts a
// project in on its first Planning write.
function isAgentScaffoldingActive(root) {
  const { enabled } = getAgentScaffolding(root)
  if (typeof enabled === 'boolean') return enabled
  return (
    fs.existsSync(path.join(root, PLAN_CLI)) ||
    ['notes.json', 'plans.json'].some((f) => fs.existsSync(path.join(root, PLANNING_DIR, f)))
  )
}

// Persists the toggle and immediately re-runs the scaffolder, so flipping
// "share with the team" off takes effect without waiting for the next open.
// Choosing share or local IS opting in, so either implies `enabled: true`;
// turning it off stops future writes and leaves existing files where they are
// — they may already be committed, and deleting them is the human's call.
export function setAgentScaffolding(root, patch) {
  const target = root ?? requireWorkspaceRoot()
  const next = { ...getAgentScaffolding(target), enabled: true, ...patch, version: SCAFFOLD_VERSION }
  writeProjectMeta(target, { agentScaffolding: next })
  return { agentScaffolding: next, ...ensureAgentScaffolding(target) }
}

// Called whenever a window's open project changes (see electron/main.cjs's
// setWindowRoot). Deliberately never throws: this runs on the path that opens a
// project — including the boot restore that blocks the first window — so a
// read-only folder has to degrade to "scaffolded less", never to "couldn't open
// the project". A no-op for a project that hasn't opted in, unless `firstUse`
// says the caller is the opt-in.
export function ensureAgentScaffolding(root = getWorkspaceRoot(), { firstUse = false } = {}) {
  if (!root) return { written: [], skipped: [], excluded: [] }
  try {
    if (!firstUse && !isAgentScaffoldingActive(root)) return { written: [], skipped: [], excluded: [] }
    return writeAgentScaffolding(root, { commit: getAgentScaffolding(root).commit })
  } catch (err) {
    return {
      written: [],
      skipped: [{ path: '.sleipnir', reason: err instanceof Error ? err.message : String(err) }],
      excluded: [],
    }
  }
}

export function getAgentScaffoldingState(root = getWorkspaceRoot()) {
  if (!root) return null
  return {
    ...getAgentScaffolding(root),
    active: isAgentScaffoldingActive(root),
    state: readScaffoldState(root),
    paths: scaffoldPaths(),
  }
}

// One-time migration for installs that predate per-project Planning data —
// copies the old REPO_ROOT-fixed notes/plans/archive.json into `projectRoot`'s
// own .planning/ folder, so opening Sleipnir's own repo as a project (which
// electron/main.cjs seeds as the first recent project on first launch under
// this system) shows exactly what Planning showed before this change, with
// nothing lost. Additive only — never touches or deletes the legacy files.
const LEGACY_PLANNING_FILES = {
  'notes.json': path.join(REPO_ROOT, 'src/planning/graph/notes.json'),
  'plans.json': path.join(REPO_ROOT, 'src/planning/graph/plans.json'),
  'archive.json': path.join(REPO_ROOT, 'src/planning/graph/archive.json'),
}

export function migrateLegacyPlanningData(projectRoot) {
  const targetDir = path.join(projectRoot, PLANNING_DIR)
  for (const [fileName, legacyPath] of Object.entries(LEGACY_PLANNING_FILES)) {
    const targetPath = path.join(targetDir, fileName)
    if (fs.existsSync(legacyPath) && !fs.existsSync(targetPath)) {
      fs.mkdirSync(targetDir, { recursive: true })
      fs.copyFileSync(legacyPath, targetPath)
    }
  }
}
