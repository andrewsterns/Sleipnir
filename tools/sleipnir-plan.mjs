#!/usr/bin/env node
// Standalone CLI for creating real Sleipnir Planning graph nodes from outside
// the app — a terminal AI agent (Claude Code, or anything else), a script,
// or a human. Exists because an agent poking around a project's .planning/
// folder with no guidance has no way to know plans.json only ever
// *references* node ids (it owns no content of its own) while notes.json
// holds the real step content — guessing wrong produces a named plan tab
// with zero actual nodes. This wraps the exact same functions Sleipnir's own
// in-app AI chat tool (create_plan_node, see electron/chat.cjs) calls, so
// external and in-app plan authoring both write correctly-shaped data, and
// both show up live in the graph (see electron/planningWatcher.cjs) with no
// restart needed.
//
// Usage:
//   node sleipnir-plan.mjs detect-project --root <path>
//   node sleipnir-plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
//   node sleipnir-plan.mjs create-node --root <path> --plan-id <id> --label "Step" \
//       --description "..." [--after <stepId|none>] [--parent-id <nodeId>] \
//       [--file <path>:<role>[:<language>]]... [--edits <path1,path2>]
//   node sleipnir-plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \
//       --description "..." --file-path <workspace-relative-path> \
//       --content-file <path-to-file-with-the-proposed-content|-> \
//       [--parent-id <nodeId>] [--links <nodeId1,nodeId2,...>]
//
// Projects get a vendored copy of this CLI as .sleipnir/plan.mjs
// (tools/agentSkills/vendor/plan.mjs); both share tools/planDoc.mjs's logic.
//
// detect-project reports the project's languages and layout so an agent plans
// files that match it. create-node steps chain in creation order (--after
// inserts or unlinks), --file declares NEW files a step will create at their
// real project paths (placeholders — nothing touches disk until a human
// approves the step in Sleipnir), and --edits lists EXISTING files it changes.
// Every saved plan also gets .planning/<plan>/plan.md, regenerated per step.
//
// propose-file (legacy) stages one NEW file with full content on a step
// instead — still never written until a human reviews and saves it.
import fs from 'node:fs'
import path from 'node:path'
import * as backend from './sleipnir-backend.mjs'

// Repeated flags (--file a --file b) collect into an array.
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith('--')) {
      const key = tok.slice(2)
      const next = argv[i + 1]
      let value = true // boolean flag, e.g. --temporary
      if (next !== undefined && !next.startsWith('--')) {
        value = next
        i++
      }
      if (key in args) args[key] = [].concat(args[key], value)
      else args[key] = value
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
  if (!v || v === true || Array.isArray(v)) fail(`--${name} is required (once)`)
  return v
}

function parseIntOpt(args, name) {
  const v = args[name]
  if (v === undefined || v === true) return undefined
  const n = Number.parseInt(v, 10)
  if (!Number.isInteger(n) || n <= 0) fail(`--${name} must be a positive integer, got "${v}"`)
  return n
}

function listOpt(args, name) {
  return [].concat(args[name] ?? []).filter((v) => typeof v === 'string')
}

function openTargetWorkspace(args) {
  const root = path.resolve(args.root ?? process.cwd())
  try {
    backend.openWorkspace(root)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
  return root
}

// Shared by create-node and propose-file: if planId is a real saved plan
// (created via create-plan), pull the new node into its own tab too — see
// the `live` merge rule in PlanningView.ViewModel.tsx: a note renders on a
// plan's tab if its `map` equals the plan id OR its id is in the plan's
// `nodeIds`. createPlanNode/proposeFileNode always set `map: 'claude'` (the
// shared drafting/review tab, same as Sleipnir's own in-app AI chat), so
// this is what makes a step ALSO show up on the plan's own named tab.
function pullIntoNamedPlanIfExists(planId, nodeId) {
  const { plans } = backend.getPlans()
  if (plans.some((p) => p.id === planId)) {
    backend.addPlanNodes(planId, [nodeId])
  }
}

function readContentFile(pathOrDash) {
  try {
    return pathOrDash === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(pathOrDash), 'utf8')
  } catch (err) {
    fail(`Couldn't read --content-file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`)
  }
}

const HELP = `Sleipnir Planning CLI

  node sleipnir-plan.mjs detect-project --root <path>
  node sleipnir-plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
  node sleipnir-plan.mjs create-node --root <path> --plan-id <id> --label "Step" \\
      --description "..." [--after <stepId|none>] [--parent-id <nodeId>] \\
      [--file <path>:<role>[:<language>]]... [--edits <path1,path2>]
  node sleipnir-plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \\
      --description "..." --file-path <workspace-relative-path> \\
      --content-file <path|-> [--parent-id <nodeId>] [--links <nodeId1,nodeId2>]

detect-project prints the project's languages and layout. Run it first and plan
files that match it.

create-plan prints the new plan's id — pass it as --plan-id to create-node for
every step. --total-steps N (optional) gives Sleipnir a real N-of-M progress bar.

create-node steps chain in the order you create them. --after <stepId> inserts a
step after that one instead; --after none leaves it unlinked (parallel work).
--file declares a NEW file the step will create, at its real project path (never
.planning/). Repeat it per file. Roles: node, view, view-model, interface,
controller, presenter. Language defaults to the file extension, then the
detected primary language. Files are placeholders only — nothing is written to
disk until a human approves the step in Sleipnir. Sibling role files of one
feature (cartView.tsx + cartViewModel.tsx) are linked automatically.
--edits lists EXISTING files the step will change.

Each plan also gets .planning/<plan>/plan.md, regenerated as steps are written.
Notes written under the title, or between a step's /step-meta and /step
markers, are kept.

propose-file (legacy) stages one NEW file with full content on a step. Prefer
create-node --file.
`

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    process.exit(command ? 0 : 1)
  }

  if (command === 'detect-project') {
    openTargetWorkspace(args)
    try {
      process.stdout.write(`${JSON.stringify(backend.detectProject(), null, 2)}\n`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (command === 'create-plan') {
    openTargetWorkspace(args)
    const label = requireOpt(args, 'label')
    const expectedSteps = parseIntOpt(args, 'total-steps')
    try {
      const { plan } = backend.createPlan(label, [], undefined, undefined, undefined, !!args.temporary, expectedSteps)
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (command === 'create-node') {
    openTargetWorkspace(args)
    const planId = requireOpt(args, 'plan-id')
    const label = requireOpt(args, 'label')
    const description = typeof args.description === 'string' ? args.description : undefined
    const parentId = typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined
    const files = listOpt(args, 'file')

    try {
      const { node } = backend.createPlanNode(planId, label, description, parentId, {
        after: typeof args.after === 'string' ? args.after : undefined,
        files,
        edits: listOpt(args, 'edits').flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean),
        defaultLanguage: files.length ? backend.detectProject().primary ?? undefined : undefined,
      })
      pullIntoNamedPlanIfExists(planId, node.id)
      process.stdout.write(`${JSON.stringify(node, null, 2)}\n`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (command === 'propose-file') {
    openTargetWorkspace(args)
    const planId = requireOpt(args, 'plan-id')
    const label = requireOpt(args, 'label')
    const filePath = requireOpt(args, 'file-path')
    const contentFile = requireOpt(args, 'content-file')
    const description = typeof args.description === 'string' ? args.description : undefined
    const parentId = typeof args['parent-id'] === 'string' ? args['parent-id'] : undefined
    const linkTargetIds = typeof args.links === 'string' ? args.links.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    const content = readContentFile(contentFile)

    try {
      const { node } = backend.proposeFileNode(planId, label, description, filePath, content, parentId, linkTargetIds)
      pullIntoNamedPlanIfExists(planId, node.id)
      process.stdout.write(`${JSON.stringify(node, null, 2)}\n`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
    return
  }

  fail(`Unknown command "${command}". Run with --help for usage.`)
}

main()
