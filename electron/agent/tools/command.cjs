// run_command — runs one shell command in the open Workspace, streaming its
// output into the tool's chat row. Whether it may run at all is decided by the
// permission engine before execute() is ever called.
const commandRunner = require('../../commandRunner.cjs')

const OUTPUT_TO_MODEL_CHARS = 4_000
const TIMEOUT_MS = 120_000
// cmd.exe and POSIX shell operators, quoting, expansion and line breaks.
const SHELL_META = /[&|<>^%!`$;"'()\r\n]/

const runCommand = {
  name: 'run_command',
  kind: 'exec',
  description:
    'Run a shell command in the currently open Workspace (e.g. running tests, installing a dependency, running a build script). ' +
    'Depending on the permission mode the human may have to approve it first. ' +
    'Returns the captured stdout/stderr tail and exit code once the command finishes, or a decline notice if the human refused.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The executable to run, e.g. "npm".' },
      args: { type: 'array', items: { type: 'string' }, description: 'Arguments, e.g. ["run", "test:run"].' },
    },
    required: ['command'],
  },
  summarize: (input) => [input?.command, ...(Array.isArray(input?.args) ? input.args : [])].filter(Boolean).join(' '),
  // "Always allow" is remembered per executable, so allowing `npm` never
  // quietly allows `rm` too. commandRunner runs through the shell on Windows,
  // which joins args unescaped — so a call carrying shell metacharacters
  // (`npm test & del …`) could smuggle a second command past an `npm` rule.
  // Those calls get no key: never pre-approved, always asked.
  ruleKey: (input) => {
    const command = String(input?.command ?? '').trim()
    const args = Array.isArray(input?.args) ? input.args.map(String) : []
    if (!command || [command, ...args].some((part) => SHELL_META.test(part))) return null
    return `run_command:${command.toLowerCase()}`
  },

  execute(input, ctx) {
    const command = String(input.command ?? '').trim()
    if (!command) throw new Error('run_command needs a command.')
    const args = Array.isArray(input.args) ? input.args.map(String) : []
    return new Promise((resolve) => {
      const runId = commandRunner.run(ctx.sender, {
        command,
        args,
        cwd: ctx.workspaceRoot,
        timeoutMs: TIMEOUT_MS,
        onChunk: (_stream, text) => ctx.output(text),
        onExit: ({ exitCode, output, timedOut }) => {
          ctx.update({ exitCode, timedOut })
          resolve({ ran: true, exitCode, timedOut, output: output.slice(-OUTPUT_TO_MODEL_CHARS) })
        },
      })
      ctx.onCancel(() => commandRunner.stop(runId))
    })
  },
}

module.exports = [runCommand]
