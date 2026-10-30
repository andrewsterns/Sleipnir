// Which language server answers for which language, whether it's installed,
// and how to start it. The servers themselves come from the language table
// (agentSkills/vendor/languages.mjs, each entry's `server`): clangd for C and
// C++, rust-analyzer, gopls, pyright, jdtls, kotlin-language-server,
// sourcekit-lsp, csharp-ls. None ship with Sleipnir — they're found on PATH,
// and a missing one is reported with its install command rather than failing.
//
// TypeScript and JavaScript keep their own path in lsp-proxy.mjs: their
// server is a bundled dependency, started from node_modules.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { LANGUAGES } from './agentSkills/vendor/languages.mjs'

/** The server for a table language id, or null when none is known. */
export function serverForLanguage(languageId) {
  return LANGUAGES.find((l) => l.id === languageId)?.server ?? null
}

/**
 * Where `command` resolves on PATH — honouring PATHEXT on Windows, where an
 * npm-installed server is a .cmd shim — or null when it isn't installed.
 */
export function findExecutable(command, env = process.env, platform = process.platform) {
  const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  const exts = platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())] : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext)
      try {
        if (fs.statSync(candidate).isFile()) return candidate
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return null
}

/** Whether each language's server can be started, and how to install it when it can't. */
export function serverStatus(languageId) {
  const server = serverForLanguage(languageId)
  if (!server) return { languageId, known: false, available: false }
  const executable = findExecutable(server.command)
  return { languageId, known: true, available: !!executable, command: server.command, install: server.install, executable }
}

export class ServerMissingError extends Error {
  constructor(languageId, server) {
    super(`${server.command} isn't installed — ${server.install}`)
    this.code = 'SERVER_MISSING'
    this.languageId = languageId
    this.command = server.command
    this.install = server.install
  }
}

/**
 * Stops a server and everything it started. On Windows a .cmd-shimmed server
 * runs under cmd.exe, and killing the shell would leave the server itself
 * running — so the whole process tree goes.
 */
export function stopLanguageServer(proc) {
  if (proc.exitCode !== null || proc.killed) return
  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => proc.kill())
  } else proc.kill()
}

/**
 * Starts `languageId`'s server in `root`, speaking LSP over stdio. Throws
 * ServerMissingError when it isn't installed, so the caller can tell the editor.
 */
export function spawnLanguageServer(languageId, root) {
  const server = serverForLanguage(languageId)
  if (!server) throw new Error(`No language server is known for ${languageId}`)
  const executable = findExecutable(server.command)
  if (!executable) throw new ServerMissingError(languageId, server)
  // A .cmd/.bat shim only runs through the shell on Windows; the arguments are
  // the table's own fixed flags, never user input.
  const viaShell = /\.(cmd|bat)$/i.test(executable)
  return spawn(viaShell ? `"${executable}"` : executable, server.args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], shell: viaShell, windowsHide: true })
}
