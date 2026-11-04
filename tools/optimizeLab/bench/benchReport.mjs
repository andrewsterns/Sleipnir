#!/usr/bin/env node
// The benchmark's results (runBench.mjs → history.jsonl), as a table per
// challenge and condition: how often the problem was fixed, and at what cost —
// medians, since agent runs vary — with the change since the previous batch.
//
//   node tools/optimizeLab/bench/benchReport.mjs [--batch latest|all]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const HISTORY = path.join(HERE, 'history.jsonl')

export function readHistory(file = HISTORY) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

// One row per challenge × condition: runs, fixed (mean score), and medians.
export function summarize(lines) {
  const groups = new Map()
  for (const l of lines) {
    const key = `${l.challenge}|${l.condition}`
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  return [...groups].map(([key, runs]) => {
    const [challenge, condition] = key.split('|')
    return {
      challenge,
      condition,
      runs: runs.length,
      fixed: runs.reduce((s, r) => s + (r.score ?? 0), 0) / runs.length,
      cost: median(runs.map((r) => r.cost)),
      turns: median(runs.map((r) => r.turns)),
      tokens: median(runs.map((r) => (r.tokens ? r.tokens.input + r.tokens.cacheRead + r.tokens.cacheWrite + r.tokens.output : null))),
      detours: median(runs.map((r) => r.wrongReads)),
      readsBeforeFirstEdit: median(runs.map((r) => r.readsBeforeFirstEdit)),
    }
  })
}

export function formatReport(lines) {
  const batches = [...new Set(lines.map((l) => l.batch))].sort()
  if (!batches.length) return 'No benchmark runs yet: node tools/optimizeLab/bench/runBench.mjs\n'
  const latest = batches.at(-1)
  const previous = batches.at(-2)
  const now = summarize(lines.filter((l) => l.batch === latest))
  const before = previous ? new Map(summarize(lines.filter((l) => l.batch === previous)).map((r) => [`${r.challenge}|${r.condition}`, r])) : new Map()
  const pct = (x) => `${Math.round(x * 100)}%`
  const money = (x) => (x == null ? '—' : `$${x.toFixed(2)}`)
  const delta = (a, b, fmt) => (a == null || b == null ? '' : ` (${a - b >= 0 ? '+' : ''}${fmt(a - b)})`)
  let out = `Batch ${latest}${previous ? ` vs ${previous}` : ''}\n\n`
  out += 'challenge          condition  runs  fixed        cost            turns      detours  reads before edit\n'
  for (const r of now.sort((a, b) => a.challenge.localeCompare(b.challenge) || a.condition.localeCompare(b.condition))) {
    const p = before.get(`${r.challenge}|${r.condition}`)
    out +=
      `${r.challenge.padEnd(19)}${r.condition.padEnd(11)}${String(r.runs).padEnd(6)}` +
      `${(pct(r.fixed) + delta(r.fixed, p?.fixed, pct)).padEnd(13)}` +
      `${(money(r.cost) + delta(r.cost, p?.cost, money)).padEnd(16)}` +
      `${String(r.turns ?? '—').padEnd(11)}${String(r.detours ?? '—').padEnd(9)}${r.readsBeforeFirstEdit ?? '—'}\n`
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = process.argv.includes('--batch') && process.argv[process.argv.indexOf('--batch') + 1] === 'all'
  const lines = readHistory()
  process.stdout.write(all ? JSON.stringify(summarize(lines), null, 2) + '\n' : formatReport(lines))
}
