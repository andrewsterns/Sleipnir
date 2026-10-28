// The Health view's analysis, run off the main thread.
//
// The numbers come from the same analyzer the /optimize agents run
// (agentSkills/vendor/analyze.mjs — the scanner — over graphCore.mjs), so what
// the graph shows and what an agent reports always agree. A scan reads every
// source file and asks git for churn: half a second on a few hundred files,
// seconds on a big monorepo — too long to block Electron's main process (every
// window's IPC waits on it), so it runs in a worker thread.
//
// The result is trimmed to what a renderer draws: per-file counts and the
// findings, never file contents.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { analyzeProject, describeFile } from './agentSkills/vendor/analyze.mjs'

function inWorker(task, root, opts) {
  return new Promise((resolve, reject) => {
    // execArgv: [] so the worker never inherits a parent flag meant for the main script.
    const worker = new Worker(new URL(import.meta.url), { workerData: { task, root, opts }, execArgv: [] })
    worker.once('message', (msg) => (msg.ok ? resolve(msg.result) : reject(new Error(msg.error))))
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Architecture analysis stopped (exit ${code})`))
    })
  })
}

/** Runs one analysis of `root` in a worker. Resolves with the trimmed health payload. */
export function analyzeArchitecture(root, opts = {}) {
  return inWorker('health', root, opts)
}

/** One file's counts, importers, imports and blast radius, in a worker. */
export function describeArchitectureFile(root, file) {
  return inWorker('file', root, { file })
}

/** The same trimmed payload, computed on this thread — for tests and the worker itself. */
export function architectureHealth(root, opts = {}) {
  const started = Date.now()
  const { scan, analysis, report } = analyzeProject(root, opts)

  // Every runtime import that closes a loop: both ends in the same tangle.
  // (A type-only import inside one is erased at compile time — see graphCore.)
  const cycleEdges = scan.edges
    .filter((e) => e.kind !== 'type')
    .filter((e) => {
      const a = analysis.perFile[e.source]?.cycle
      return a !== null && a !== undefined && a === analysis.perFile[e.target]?.cycle
    })
    .map((e) => [e.source, e.target])

  const perFile = {}
  for (const [f, m] of Object.entries(analysis.perFile)) {
    perFile[f] = { role: m.role, fanIn: m.fanIn, fanOut: m.fanOut, instability: m.instability, lines: m.lines, cycle: m.cycle, eager: m.eager, churn: m.churn }
  }

  return {
    analyzedAt: Date.now(),
    durationMs: Date.now() - started,
    summary: analysis.summary,
    perFile,
    entries: analysis.entries,
    cycles: analysis.cycles.map((c) => ({ files: c.files, loops: c.loops })),
    cycleEdges,
    hubs: analysis.hubs,
    orchestrators: analysis.orchestrators,
    godFiles: analysis.godFiles,
    dead: analysis.dead,
    unusedWith: analysis.unusedWith,
    reusedPages: analysis.reusedPages,
    violations: analysis.violations,
    barrels: analysis.barrels,
    misplaced: analysis.misplaced,
    heavy: analysis.heavy,
    hotspots: analysis.hotspots,
    report,
  }
}

if (!isMainThread && workerData?.root) {
  const { task, root, opts } = workerData
  try {
    const result = task === 'file' ? describeFile(root, opts.file) : architectureHealth(root, opts)
    parentPort.postMessage({ ok: true, result })
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
