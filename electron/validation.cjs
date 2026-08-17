// Runs the open Workspace's own Vitest suite and reports structured results
// — see commandRunner.cjs for the underlying spawn+capture primitive. Kept
// as its own thin module (rather than folding into commandRunner) so the
// vitest-specific JSON-reporter parsing lives in one obvious place.
const commandRunner = require('./commandRunner.cjs')

// sessionId -> commandRunner id, so stop(sessionId) can find the right
// process without main.cjs needing to plumb an id back through a response —
// same self-contained id-tracking idea as preview.cjs's own session map.
const runs = new Map()

function run(sender, sessionId, workspaceRoot) {
  // commandRunner's own `output` combines stdout+stderr (interleaved, for
  // progress display) — the JSON reporter writes only to stdout, so it needs
  // its own clean buffer to parse, kept separate from that combined stream.
  let stdout = ''
  const id = commandRunner.run(sender, {
    command: 'npx',
    args: ['vitest', 'run', '--reporter=json'],
    cwd: workspaceRoot,
    timeoutMs: 5 * 60_000,
    onChunk: (stream, text) => {
      if (stream === 'stdout') stdout += text
      if (!sender.isDestroyed()) sender.send('validation:output', sessionId, { stream, text })
    },
    onExit: ({ exitCode, output, timedOut }) => {
      runs.delete(sessionId)
      let results = null
      try {
        results = JSON.parse(stdout)
      } catch {
        // Vitest itself failed to start (no config, not installed, a syntax
        // error before the reporter could emit anything) — the renderer
        // falls back to showing the raw combined output + exit code.
      }
      if (!sender.isDestroyed()) sender.send('validation:done', sessionId, { exitCode, timedOut, raw: output, results })
    },
  })
  runs.set(sessionId, id)
}

function stop(sessionId) {
  const id = runs.get(sessionId)
  if (id) commandRunner.stop(id)
  runs.delete(sessionId)
}

module.exports = { run, stop }
