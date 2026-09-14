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
//   node sleipnir-plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
//   node sleipnir-plan.mjs create-node --root <path> --plan-id <id> --label "Step" \
//       --description "..." [--parent-id <nodeId>]
//   node sleipnir-plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \
//       --description "..." --file-path <workspace-relative-path> \
//       --content-file <path-to-file-with-the-proposed-content|-> \
//       [--parent-id <nodeId>] [--links <nodeId1,nodeId2,...>]
//
// --total-steps, when you already know how many steps you're about to
// create, gets you a real N-of-M progress bar and a definitive completion
// moment in Sleipnir's Planning graph instead of an indeterminate pulse +
// quiet-period guess. Optional — harmless to omit.
//
// create-plan prints the new plan's id — pass it as --plan-id to create-node
// for every step so they land on that plan's own tab (in addition to always
// landing in Sleipnir's shared "Claude" review tab, grouped by --plan-id,
// same as the in-app AI chat's own drafts). Skipping create-plan and picking
// any --plan-id string for create-node still works — steps just won't have a
// dedicated named tab, identical to today's in-app AI chat behavior.
//
// propose-file is create-node's file-carrying sibling: it stages a NEW
// workspace file (path + full content) on the node instead of just a text
// description — but does NOT write anything to real disk. Nothing gets
// written until a human reviews the actual content in Sleipnir and
// explicitly saves it (same trust boundary as the in-app AI chat's own
// generate_code tool — see chat.cjs). --content-file takes a path to a file
// holding the proposed content (write it there yourself first — a CLI flag
// can't cleanly carry multi-line source with quotes/backticks in it), or "-"
// to read content from stdin. --links, a comma-separated list of other node
// ids (e.g. ones this create-plan/propose-file run already returned),
// draws visible "borrows" edges from this node to them — use it to make a
// batch of proposed files show their real import relationships in the graph
// before any of them exist on disk.
import fs from 'node:fs'
import path from 'node:path'
import * as backend from './sleipnir-backend.mjs'

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok.startsWith('--')) {
      const key = tok.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = true // boolean flag, e.g. --temporary
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

  node sleipnir-plan.mjs create-plan --root <path> --label "My plan" [--temporary] [--total-steps N]
  node sleipnir-plan.mjs create-node --root <path> --plan-id <id> --label "Step" \\
      --description "..." [--parent-id <nodeId>]
  node sleipnir-plan.mjs propose-file --root <path> --plan-id <id> --label "Step" \\
      --description "..." --file-path <workspace-relative-path> \\
      --content-file <path|-> [--parent-id <nodeId>] [--links <nodeId1,nodeId2>]

create-plan prints the new plan's id — pass it as --plan-id to create-node for
every step so they land on that plan's own tab in Sleipnir's Planning graph.
--total-steps N (optional): if you already know your step count, Sleipnir
shows a real N-of-M progress bar and a definitive "done" moment instead of
guessing from a quiet period after your last write.

propose-file stages a NEW file (path + content) on the step instead of just a
text description — nothing is written to real disk until a human reviews and
explicitly saves it in Sleipnir (same trust boundary as the in-app AI chat's
own generate_code tool). --content-file points at a file holding the proposed
content (write it there first — can't cleanly pass multi-line source as a CLI
argument), or pass "-" to read it from stdin. --links draws visible "borrows"
edges to other node ids, so a batch of proposed files can show how they'll
actually reference each other before any of them exist on disk.
`

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = parseArgs(rest)

  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP)
    process.exit(command ? 0 : 1)
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

    try {
      const { node } = backend.createPlanNode(planId, label, description, parentId)
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
