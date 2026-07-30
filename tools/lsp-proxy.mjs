// Bridges browser/Electron WebSocket clients (CodeMirror's @codemirror/lsp-client)
// to a spawned `typescript-language-server` process over its stdio.
//
// LSP over stdio is framed with HTTP-style headers ("Content-Length: N\r\n\r\n"
// + N bytes of JSON) — @codemirror/lsp-client's Transport wants plain,
// unframed JSON strings, so this module does the framing/deframing in both
// directions. Shared by vite.config.ts (web dev server) and
// electron/main.cjs (desktop) — both just call startLspProxy() once.
//
// Known simplification: one shared typescript-language-server process for
// all connections, matching this dev tool's single-local-user assumption
// (see tools/sleipnir-backend.mjs). Concurrent editors from independent
// clients aren't isolated from each other's request IDs — fine for one
// person with one app window open, not safe to generalize beyond that yet.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// The browser/renderer has no way to know this machine's absolute repo
// path, so the frontend always speaks in terms of this fake, stable root
// URI (see src/02_components/DesignSystem/lspClient.ts) and this proxy
// rewrites it to/from the real file:// URI on the way through — the one
// place that translation needs to happen.
export const FAKE_ROOT_URI = 'file:///__SLEIPNIR_ROOT__'
const REAL_ROOT_URI = pathToFileURL(REPO_ROOT).href.replace(/\/$/, '')

function toRealUris(json) {
  return json.split(FAKE_ROOT_URI).join(REAL_ROOT_URI)
}

function toFakeUris(json) {
  return json.split(REAL_ROOT_URI).join(FAKE_ROOT_URI)
}

function createLspReader(onMessage) {
  let buffer = Buffer.alloc(0)
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = buffer.subarray(0, headerEnd).toString('utf8')
      const match = /Content-Length: (\d+)/i.exec(header)
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + length) return
      const body = buffer.subarray(bodyStart, bodyStart + length).toString('utf8')
      buffer = buffer.subarray(bodyStart + length)
      onMessage(body)
    }
  }
}

function frame(json) {
  const body = Buffer.from(json, 'utf8')
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body])
}

let tsServerProcess = null

function getTsServer() {
  if (tsServerProcess) return tsServerProcess
  const cliPath = path.join(REPO_ROOT, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs')
  // Spawn via the current Node binary directly rather than the npm .bin
  // shim — sidesteps .cmd/.ps1 wrapper differences across platforms.
  tsServerProcess = spawn(process.execPath, [cliPath, '--stdio'], {
    cwd: REPO_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  tsServerProcess.stderr.on('data', (d) => {
    console.error('[typescript-language-server]', d.toString())
  })
  tsServerProcess.on('exit', (code) => {
    console.log(`[typescript-language-server] exited (${code})`)
    tsServerProcess = null
  })
  return tsServerProcess
}

let wss = null

export function startLspProxy(port = 7071) {
  if (wss) return wss
  wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    const server = getTsServer()
    const reader = createLspReader((json) => {
      if (ws.readyState === ws.OPEN) ws.send(toFakeUris(json))
    })
    server.stdout.on('data', reader)
    ws.on('message', (data) => {
      server.stdin.write(frame(toRealUris(data.toString())))
    })
    ws.on('close', () => {
      server.stdout.off('data', reader)
    })
    ws.on('error', () => {
      server.stdout.off('data', reader)
    })
  })
  console.log(`[lsp-proxy] typescript-language-server bridge listening on ws://localhost:${port}`)
  return wss
}
