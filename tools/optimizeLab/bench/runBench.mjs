#!/usr/bin/env node
// Does Sleipnir's map help an agent find and fix a problem? A repeatable
// benchmark on the optimize lab's planted problems.
//
// Each run copies one challenge into a fresh folder and hands it to headless
// Claude Code with the same task, under one of three conditions:
//
//   plain     no Sleipnir instructions at all
//   map       Sleipnir's slim instructions, which point at the analyzer map
//   optimize  the same, and the task given as /optimize
//
// Every condition gets the agent-trail hook — silent and free (measured: no
// tokens added) — so each run says which files the agent read before it found
// the right ones. A run is scored by checking the code it left behind (see each
// challenge's `score`), and one line per run is appended to history.jsonl, so
// every change to the instructions, skills or map shows whether agents got
// better or worse over time. Read the results with benchReport.mjs.
//
//   node tools/optimizeLab/bench/runBench.mjs [--challenges a,b] [--conditions plain,map,optimize]
//       [--runs N] [--effort medium] [--budget 2] [--parallel 3]
//
// It spends real money (each run is a Claude Code session): --budget caps
// each run in dollars.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ensureAgentScaffolding, ensureTrailHook } from '../../agentSkills/scaffold.mjs'
import { analyzeProject } from '../../agentSkills/vendor/analyze.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LAB = path.dirname(HERE)
const REPO = path.resolve(LAB, '..', '..')
export const HISTORY = path.join(HERE, 'history.jsonl')

const read = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return ''
  }
}

const GO_ERROR = `package example.com/inventory/cmd/server
    imports example.com/inventory/internal/handlers
    imports example.com/inventory/internal/service
    imports example.com/inventory/internal/store
    imports example.com/inventory/internal/handlers: import cycle not allowed`

// The task, the files that matter for it (reading anything else is a detour),
// and how to tell from the code left behind whether it was fixed (0..1).
export const CHALLENGES = {
  'context-menu-lag': {
    task: 'Right-clicking an item takes a moment before the menu shows. Find out why and fix it.',
    // /optimize proposes fixes as a plan and applies them only when asked, so the
    // task asks — as the plain task does.
    optimize: '/optimize my right click menu — right-clicking an item takes a moment before the menu shows. Fix it.',
    relevant: ['src/menu/ContextMenu.tsx', 'src/menu/useContextMenu.ts', 'src/menu/menuItems.ts', 'src/menu/MenuItem.tsx', 'src/App.tsx', 'src/board/Board.tsx', 'src/board/BoardItem.tsx', 'src/board/items.ts'],
    // The four planted causes (see its CHALLENGE.md), each checked in the code.
    score(root) {
      const app = read(root, 'src/App.tsx')
      const item = read(root, 'src/board/BoardItem.tsx') + read(root, 'src/board/Board.tsx')
      const menuItems = read(root, 'src/menu/menuItems.ts')
      const menuCode = read(root, 'src/menu/ContextMenu.tsx') + read(root, 'src/menu/useContextMenu.ts')
      const fixes = [
        !/<Board[^>]*\bmenu=\{menu\}/.test(app), // menu state no longer passed to every item
        /\bmemo\(/.test(item), // items memoized
        !/findIndex/.test(menuItems), // the O(n²) dedupe gone
        (menuCode.match(/buildMenuItems\(/g) ?? []).length <= 1 || /useMemo/.test(menuCode), // built once
      ]
      return { score: fixes.filter(Boolean).length / fixes.length, detail: fixes.map((f) => (f ? 1 : 0)).join('') }
    },
  },
  'go-inventory': {
    task: `CI is red: \`go build ./...\` fails with\n\n${GO_ERROR}\n\nFix it.`,
    optimize: `/optimize CI is red: \`go build ./...\` fails with\n\n${GO_ERROR}\n\nFix it.`,
    relevant: ['internal/store/store.go', 'internal/handlers/routes.go', 'internal/service/items.go', 'cmd/server/main.go', 'go.mod'],
    // Fixed when the import loop is gone (the analyzer sees no cycles).
    score(root) {
      const { analysis } = analyzeProject(root, {})
      const cycles = analysis.summary?.cycles ?? analysis.cycles?.length ?? 0
      return { score: cycles === 0 ? 1 : 0, detail: `cycles ${cycles}` }
    },
  },
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i]
  return out
}

// A fresh copy of a challenge, set up for one condition.
function prepare(challenge, condition, runDir) {
  fs.cpSync(path.join(LAB, challenge), runDir, { recursive: true, filter: (src) => !/[\\/](node_modules|expected\.json|CHALLENGE\.md)$/.test(src) })
  if (condition === 'plain') {
    // Only the trail hook — so the run is measured, not instructed.
    fs.mkdirSync(path.join(runDir, '.sleipnir'), { recursive: true })
    fs.copyFileSync(path.join(REPO, 'tools/agentSkills/vendor/trail.mjs'), path.join(runDir, '.sleipnir/trail.mjs'))
    ensureTrailHook(runDir)
  } else {
    ensureAgentScaffolding(runDir, { trail: true })
  }
  const git = (...args) => execFileSync('git', args, { cwd: runDir, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', 'commit', '-q', '-m', 'start')
}

function runClaude({ cwd, prompt, effort, budget }) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      '--effort', effort,
      '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(go:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
      '--setting-sources', 'project,local',
      '--no-session-persistence',
      '--max-budget-usd', String(budget),
    ]
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', () => {})
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out))
    child.stdin.end(prompt)
  })
}

// What one run did, from its event stream, its trail and the code it left.
function measure({ challenge, condition, runDir, stream }) {
  const events = stream.split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
  const result = events.find((e) => e.type === 'result') ?? {}
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init') ?? {}
  const trail = read(runDir, '.planning/trail.jsonl')
    .split('\n')
    .flatMap((l) => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
  const relevant = new Set(CHALLENGES[challenge].relevant)
  const readPaths = trail.filter((e) => e.kind === 'read').flatMap((e) => e.paths ?? [])
  const firstEdit = trail.findIndex((e) => e.kind === 'edit')
  const before = firstEdit < 0 ? trail : trail.slice(0, firstEdit)
  const edited = execFileSync('git', ['status', '--porcelain'], { cwd: runDir, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((p) => !/^(\.planning|\.sleipnir|\.claude)\//.test(p))
  const { score, detail } = CHALLENGES[challenge].score(runDir)
  return {
    model: init.model,
    score,
    detail,
    cost: result.total_cost_usd ?? null,
    turns: result.num_turns ?? null,
    tokens: {
      input: result.usage?.input_tokens ?? 0,
      cacheRead: result.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: result.usage?.cache_creation_input_tokens ?? 0,
      output: result.usage?.output_tokens ?? 0,
    },
    seconds: Math.round((result.duration_ms ?? 0) / 1000),
    reads: readPaths.length,
    distinctReads: new Set(readPaths).size,
    wrongReads: [...new Set(readPaths)].filter((p) => !relevant.has(p)).length,
    readsBeforeFirstEdit: before.filter((e) => e.kind === 'read' || e.kind === 'search').length,
    edited,
    error: result.is_error ? result.subtype : undefined,
  }
}

export async function runBench(opts = {}) {
  const challenges = opts.challenges ?? Object.keys(CHALLENGES)
  const conditions = opts.conditions ?? ['plain', 'map', 'optimize']
  const runs = opts.runs ?? 3
  const effort = opts.effort ?? 'medium'
  const budget = opts.budget ?? 2
  const parallel = opts.parallel ?? 3
  const batch = new Date().toISOString()
  let commit = null
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
  } catch {
    // not in git
  }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-bench-'))
  const jobs = []
  for (const challenge of challenges) for (const condition of conditions) for (let run = 1; run <= runs; run++) jobs.push({ challenge, condition, run })

  const results = []
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const runDir = path.join(base, `${job.challenge}-${job.condition}-${job.run}`)
      prepare(job.challenge, job.condition, runDir)
      const c = CHALLENGES[job.challenge]
      const stream = await runClaude({ cwd: runDir, prompt: job.condition === 'optimize' ? c.optimize : c.task, effort, budget })
      const line = { batch, commit, effort, ...job, ...measure({ ...job, runDir, stream }) }
      fs.appendFileSync(HISTORY, `${JSON.stringify(line)}\n`)
      results.push(line)
      process.stdout.write(`${job.challenge} ${job.condition} #${job.run}: score ${line.score} (${line.detail}) · $${line.cost?.toFixed(3)} · ${line.turns} turns · ${line.wrongReads} detours\n`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, worker))
  fs.rmSync(base, { recursive: true, force: true })
  return { batch, results }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2))
  await runBench({
    challenges: typeof a.challenges === 'string' ? a.challenges.split(',') : undefined,
    conditions: typeof a.conditions === 'string' ? a.conditions.split(',') : undefined,
    runs: Number(a.runs) || undefined,
    effort: typeof a.effort === 'string' ? a.effort : undefined,
    budget: Number(a.budget) || undefined,
    parallel: Number(a.parallel) || undefined,
  })
}
