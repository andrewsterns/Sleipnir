// Runs the open Workspace's tests and reports structured results — whichever
// test runner the project uses (see testRunners.cjs: Vitest, Jest, cargo test,
// go test, pytest, ctest, Gradle, Maven, SwiftPM, dotnet), every one read into
// the same result shape. commandRunner.cjs is the spawn+capture primitive
// underneath.
const commandRunner = require('./commandRunner.cjs')
const { detectTestRunners } = require('./testRunners.cjs')

// sessionId -> commandRunner id, so stop(sessionId) can find the right
// process without main.cjs needing to plumb an id back through a response —
// same self-contained id-tracking idea as preview.cjs's own session map.
const runs = new Map()

/** The runners this project can use, for the view's picker — first is the default. */
function runners(workspaceRoot) {
  return detectTestRunners(workspaceRoot).map(({ id, label, command, args }) => ({ id, label, command: [command, ...args].join(' ') }))
}

function run(sender, sessionId, workspaceRoot, runnerId) {
  const all = detectTestRunners(workspaceRoot)
  const runner = all.find((r) => r.id === runnerId) ?? all[0]
  if (!runner) {
    if (!sender.isDestroyed()) {
      sender.send('validation:done', sessionId, { exitCode: null, timedOut: false, raw: 'No test runner found in this project (looked for Vitest, Jest, cargo, go, pytest, ctest, Gradle, Maven, SwiftPM and dotnet).', results: null })
    }
    return
  }
  // commandRunner's own `output` combines stdout+stderr (interleaved, for
  // progress display) — a JSON reporter writes only to stdout, so it needs
  // its own clean buffer to parse, kept separate from that combined stream.
  let stdout = ''
  const startedAt = Date.now()
  const id = commandRunner.run(sender, {
    command: runner.command,
    args: runner.args,
    cwd: workspaceRoot,
    timeoutMs: 10 * 60_000,
    onChunk: (stream, text) => {
      if (stream === 'stdout') stdout += text
      if (!sender.isDestroyed()) sender.send('validation:output', sessionId, { stream, text })
    },
    onExit: ({ exitCode, output, timedOut }) => {
      runs.delete(sessionId)
      let results = null
      try {
        results = runner.read(stdout, exitCode, startedAt)
      } catch {
        // The runner never produced a report (not installed, a build error
        // before any test ran) — the renderer shows the raw combined output
        // and exit code instead.
      }
      if (!sender.isDestroyed()) sender.send('validation:done', sessionId, { exitCode, timedOut, raw: output, results, runner: { id: runner.id, label: runner.label } })
    },
  })
  runs.set(sessionId, id)
}

function stop(sessionId) {
  const id = runs.get(sessionId)
  if (id) commandRunner.stop(id)
  runs.delete(sessionId)
}

module.exports = { run, stop, runners }
