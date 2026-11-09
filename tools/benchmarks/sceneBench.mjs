// Is modeling through Sleipnir actually better for an agent than writing
// three.js? Runs the same scene and follow-up edits (scenePrompts.json) through
// a fresh headless Claude twice — once in a plain folder with three.js, once
// in a Sleipnir-scaffolded folder with .sleipnir/model.mjs — and measures
// tokens, turns, time, cost, and whether every part ended up exactly where the
// prompt says, computed from the answer rather than judged.
//
//   node tools/benchmarks/sceneBench.mjs [--arms plain,sleipnir] [--runs 1]
//        [--model claude-sonnet-5-5] [--budget 2] [--out <dir>] [--prompts scenePromptsCurved.json]
//
// It spends real tokens: --budget caps each stage (dollars). Runs in throwaway
// folders under the OS temp dir, with only file tools and `node` allowed, no
// MCP servers and only each folder's own settings.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
let prompts = JSON.parse(fs.readFileSync(path.join(here, 'scenePrompts.json'), 'utf8'))

function argsOf(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[(i += 1)]
  return out
}

// ── The answer ─────────────────────────────────────────────────────────────

/** Every part's box as the prompt defines it at a stage: { name: {min, max} }, legs by corner. */
export function expectedBoxes({ thickness, angle, dx }) {
  const H = 0.75
  const boxes = {
    'Desk top': { min: [-0.6, H - 0.03, -0.3], max: [0.6, H, 0.3] },
    'Laptop base': { min: [-0.17 + dx, H, -0.12], max: [0.17 + dx, H + 0.015, 0.12] },
  }
  // The lid about the hinge: (out of the inner face, along it from the hinge) turned by the opening angle.
  const a = (angle * Math.PI) / 180
  const hinge = { y: H + 0.015, z: -0.12 }
  const ys = []
  const zs = []
  for (const out of [0, thickness]) {
    for (const along of [0, 0.24]) {
      ys.push(hinge.y + out * Math.cos(a) + along * Math.sin(a))
      zs.push(hinge.z - out * Math.sin(a) + along * Math.cos(a))
    }
  }
  boxes.Lid = { min: [-0.17 + dx, Math.min(...ys), Math.min(...zs)], max: [0.17 + dx, Math.max(...ys), Math.max(...zs)] }
  return boxes
}

const LEG_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({
  min: [sx < 0 ? -0.6 : 0.55, 0, sz < 0 ? -0.3 : 0.25],
  max: [sx < 0 ? -0.55 : 0.6, 0.72, sz < 0 ? -0.25 : 0.3],
}))

const TOLERANCE = 0.002 // 2 mm
/** What's wrong against a stage's own listed boxes (a scene whose answer is written out in its prompts file). */
function checkListed(measured, boxes) {
  return Object.entries(boxes).flatMap(([name, want]) => (!measured[name] ? [`${name}: missing`] : off(measured[name], want) > TOLERANCE ? [`${name}: off by ${(off(measured[name], want) * 1000).toFixed(1)} mm`] : []))
}

const off = (a, b) => Math.max(...[...a.min, ...a.max].map((v, i) => Math.abs(v - [...b.min, ...b.max][i])))

/** What's wrong with the measured boxes at a stage: [] when every part is within tolerance. */
export function checkBoxes(measured, state) {
  const wrong = []
  for (const [name, want] of Object.entries(expectedBoxes(state))) {
    const got = measured[name]
    if (!got) wrong.push(`${name}: missing`)
    else if (off(got, want) > TOLERANCE) wrong.push(`${name}: off by ${(off(got, want) * 1000).toFixed(1)} mm`)
  }
  const legs = [1, 2, 3, 4].map((n) => measured[`Leg ${n}`])
  if (legs.some((l) => !l)) wrong.push('a leg is missing')
  else for (const corner of LEG_CORNERS) if (!legs.some((l) => off(l, corner) <= TOLERANCE)) wrong.push(`no leg at corner (${corner.min[0]}, ${corner.min[2]})`)
  return wrong
}

// ── The two arms ───────────────────────────────────────────────────────────

const MEASURE_THREE = `
import { pathToFileURL } from 'node:url'
const [dir, stamp] = process.argv.slice(2)
const THREE = await import(pathToFileURL(dir + '/node_modules/three/build/three.module.js').href)
const mod = await import(pathToFileURL(dir + '/scene.mjs').href + '?' + stamp)
const root = await mod.default()
root.updateMatrixWorld(true)
const out = {}
root.traverse((o) => { if (o.isMesh && o.name) { const b = new THREE.Box3().setFromObject(o); out[o.name] = { min: b.min.toArray(), max: b.max.toArray() } } })
console.log(JSON.stringify(out))
`

const arms = {
  plain: {
    setUp(dir) {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scene', private: true, type: 'module' }))
      fs.mkdirSync(path.join(dir, 'node_modules'))
      fs.symlinkSync(path.join(repo, 'node_modules/three'), path.join(dir, 'node_modules/three'), 'junction')
    },
    measure(dir, out, stamp) {
      const script = path.join(out, 'measure-three.mjs')
      fs.writeFileSync(script, MEASURE_THREE)
      const r = spawnSync(process.execPath, [script, dir, String(stamp)], { encoding: 'utf8' })
      if (r.status !== 0) return { error: (r.stderr || 'could not load scene.mjs').trim().split('\n').slice(0, 4).join(' ') }
      return { boxes: JSON.parse(r.stdout) }
    },
  },
  sleipnir: {
    async setUp(dir) {
      const { ensureAgentScaffolding } = await import(pathToFileURL(path.join(repo, 'tools/agentSkills/scaffold.mjs')).href)
      ensureAgentScaffolding(dir)
    },
    measure(dir) {
      const r = spawnSync(process.execPath, [path.join(dir, '.sleipnir/model.mjs'), 'describe', '--env', 'Bench', '--json', '--root', dir], { encoding: 'utf8' })
      if (r.status !== 0) return { error: (r.stderr || 'no Environment "Bench"').trim() }
      return { boxes: Object.fromEntries(JSON.parse(r.stdout).parts.map((p) => [p.name, { min: p.min, max: p.max }])) }
    },
  },
}

// ── One headless agent turn ────────────────────────────────────────────────

// A fresh, independent session: nothing that ties a child to the session running this script.
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE' && !k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_PID' && k !== 'CLAUDE_EFFORT' && k !== 'CLAUDE_AGENT_SDK_VERSION'))

function askAgent({ dir, prompt, model, budget, session }) {
  const args = ['-p', '--output-format', 'json', '--model', model, '--max-budget-usd', String(budget), '--strict-mcp-config', '--setting-sources', 'project', '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node:*)']
  if (session) args.push('--resume', session)
  const started = Date.now()
  // shell: the CLI may be a .cmd on Windows; the prompt goes by stdin, so nothing needs quoting but the tool list.
  const r = spawnSync('claude', args.map((a) => (/[(*:,]/.test(a) ? `"${a}"` : a)), { cwd: dir, input: prompt, encoding: 'utf8', shell: true, env: childEnv(), timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 })
  const ms = Date.now() - started
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {
    // Reported below.
  }
  if (!json) return { failed: `no result: ${(r.stderr || r.stdout || String(r.error)).slice(0, 300)}`, ms }
  const u = json.usage ?? {}
  return {
    session: json.session_id,
    ms: json.duration_ms ?? ms,
    turns: json.num_turns ?? 0,
    cost: json.total_cost_usd ?? 0,
    fresh: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    cached: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    isError: !!json.is_error,
    subtype: json.subtype,
    result: String(json.result ?? '').slice(0, 400),
  }
}

// ── Running it ─────────────────────────────────────────────────────────────

async function runArm(arm, run, { model, budget, out }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `scenebench-${arm}-`))
  await arms[arm].setUp(dir)
  console.log(`\n${arm} (run ${run}) in ${dir}`)
  let session
  const rows = []
  for (const [i, stage] of prompts.stages.entries()) {
    const prompt = `${stage.prompt}\n\n${i === 0 ? prompts.where[arm] : prompts.followUp[arm]}`
    const r = askAgent({ dir, prompt, model, budget, session })
    session = r.session ?? session
    const measured = r.failed ? { error: r.failed } : arms[arm].measure(dir, out, `${arm}${run}${i}`)
    const wrong = measured.error ? [measured.error] : stage.boxes ? checkListed(measured.boxes, stage.boxes) : checkBoxes(measured.boxes, stage.state)
    // total_cost_usd runs on across a resumed session: this stage's is the difference.
    const stageCost = (r.cost ?? 0) - rows.reduce((s, row) => s + (row.cost ?? 0), 0)
    rows.push({ stage: stage.name, ...r, cost: stageCost, wrong, boxes: measured.boxes })
    console.log(`  ${stage.name}: ${wrong.length ? 'WRONG — ' + wrong.join('; ') : 'exact'} · ${r.turns ?? '?'} turns · ${((r.ms ?? 0) / 1000).toFixed(0)} s · ${stageCost.toFixed(3)}${r.isError ? ` · ended ${r.subtype}` : ''}`)
    if (r.failed) break
  }
  return { arm, run, dir, rows }
}

function table(results) {
  const lines = ['| Arm | Stage | Result | Turns | Time | Output tokens | New input | Cached input | Cost |', '|---|---|---|---|---|---|---|---|---|']
  for (const { arm, rows } of results) {
    for (const r of rows) lines.push(`| ${arm} | ${r.stage} | ${r.wrong.length ? 'wrong: ' + r.wrong.join('; ') : 'exact'} | ${r.turns ?? ''} | ${((r.ms ?? 0) / 1000).toFixed(0)} s | ${r.output ?? ''} | ${r.fresh ?? ''} | ${r.cached ?? ''} | $${(r.cost ?? 0).toFixed(3)} |`)
    const sum = (k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0)
    lines.push(`| **${arm}** | **total** | **${rows.filter((r) => !r.wrong.length).length} of ${prompts.stages.length} exact** | ${sum('turns')} | ${(sum('ms') / 1000).toFixed(0)} s | ${sum('output')} | ${sum('fresh')} | ${sum('cached')} | $${sum('cost').toFixed(3)} |`)
  }
  return lines.join('\n')
}

async function main() {
  const a = argsOf(process.argv.slice(2))
  if (a.prompts) prompts = JSON.parse(fs.readFileSync(path.resolve(here, a.prompts), 'utf8'))
  const out = a.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'scenebench-results-'))
  fs.mkdirSync(out, { recursive: true })
  const options = { model: a.model ?? 'claude-sonnet-5-5', budget: Number(a.budget ?? 2), out }
  const results = []
  for (let run = 1; run <= Number(a.runs ?? 1); run += 1) for (const arm of (a.arms ?? 'plain,sleipnir').split(',')) results.push(await runArm(arm, run, options))
  const text = table(results)
  fs.writeFileSync(path.join(out, 'results.md'), `Model: ${options.model}\n\n${text}\n`)
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`\n${text}\n\nSaved to ${out}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main()
