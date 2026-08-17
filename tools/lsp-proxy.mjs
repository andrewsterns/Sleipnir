// Bridges browser/Electron WebSocket clients (CodeMirror's @codemirror/lsp-client)
// to a spawned `typescript-language-server` process over its stdio.
//
// LSP over stdio is framed with HTTP-style headers ("Content-Length: N\r\n\r\n"
// + N bytes of JSON) — @codemirror/lsp-client's Transport wants plain,
// unframed JSON strings, so this module does the framing/deframing in both
// directions. Shared by vite.config.ts (web dev server) and
// electron/main.cjs (desktop) — both just call startLspProxy() once.
//
// Two roots, per connection: a WebSocket whose `initialize` request's
// rootUri is FAKE_ROOT_URI is Sleipnir editing itself — routed to the one
// shared, page-lifetime tsserver rooted at REPO_ROOT (unchanged from the
// original single-server design, including the fake/real URI rewriting
// below, which only that case needs — the renderer already knows an
// external workspace's real absolute path, see lspClient.ts, so those
// connections send real file:// URIs and need no rewriting at all).
// A connection with any other rootUri is an external Workspace project —
// routed to a second, single-slot tsserver rooted at that folder instead
// (see getExternalTsServer). Still a single-local-user, single-window
// simplification: one shared self-host server, one external server replaced
// whenever a different external root shows up (see tools/sleipnir-backend.mjs
// and CodeEditorView.ViewModel.tsx's LspRoot for the client-side half).
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WebSocketServer } from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// The browser/renderer has no way to know this machine's absolute repo
// path, so the frontend always speaks in terms of this fake, stable root
// URI (see src/app/DesignSystem/lspClient.ts) and this proxy
// rewrites it to/from the real file:// URI on the way through — the one
// place that translation needs to happen.
export const FAKE_ROOT_URI = 'file:///__SLEIPNIR_ROOT__'
const REAL_ROOT_URI = pathToFileURL(REPO_ROOT).href.replace(/\/$/, '')

function toRealUris(json) {
  return json.split(FAKE_ROOT_URI).join(REAL_ROOT_URI)
}

// Messages typescript-language-server constructs itself from filesystem
// paths (publishDiagnostics, definitions, ...) don't always echo the drive
// segment back byte-for-byte the way Node's pathToFileURL wrote it — on
// Windows it's been observed emitting a lowercase, percent-encoded drive
// letter (file:///c%3A/...) instead of REAL_ROOT_URI's uppercase, literal
// colon (file:///C:/...). A plain string split/join silently fails to match
// that variant, which drops every such message client-side (it doesn't
// recognize the URI as any document it has open) — so match the root
// case/encoding-insensitively instead of as an exact string.
const REAL_ROOT_PATTERN = (() => {
  const m = /^file:\/\/\/([a-zA-Z]):(.*)$/.exec(REAL_ROOT_URI)
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!m) return new RegExp(escape(REAL_ROOT_URI), 'g')
  const [, drive, rest] = m
  return new RegExp(`file:///${drive}(?::|%3[aA])${escape(rest)}`, 'gi')
})()

function toFakeUris(json) {
  return json.replace(REAL_ROOT_PATTERN, FAKE_ROOT_URI)
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

const CLI_PATH = path.join(REPO_ROOT, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs')

let tsServerProcess = null

function getTsServer() {
  if (tsServerProcess) return tsServerProcess
  // Spawn via the current Node binary directly rather than the npm .bin
  // shim — sidesteps .cmd/.ps1 wrapper differences across platforms.
  tsServerProcess = spawn(process.execPath, [CLI_PATH, '--stdio'], {
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

// Single-slot: at most one external-project tsserver alive at a time (one
// Sleipnir window, one open Workspace at a time — see the file-level comment).
// Replaced whenever a different root is requested, and torn down when its
// owning connection closes (see startLspProxy's ws.on('close') below) — a
// deleted/renamed external root, unlike REPO_ROOT, is a real possibility, so
// this (unlike getTsServer) also needs an 'error' handler rather than hanging
// silently on a bad spawn.
let externalServer = null // { root, process }

function killExternalServer() {
  if (!externalServer) return
  externalServer.process.kill()
  externalServer = null
}

function getExternalTsServer(root) {
  if (externalServer && externalServer.root === root) return externalServer.process
  killExternalServer()
  const proc = spawn(process.execPath, [CLI_PATH, '--stdio'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  proc.stderr.on('data', (d) => {
    console.error('[typescript-language-server:external]', d.toString())
  })
  proc.on('error', (err) => {
    console.error('[typescript-language-server:external] failed to start', err)
  })
  proc.on('exit', (code) => {
    console.log(`[typescript-language-server:external] exited (${code})`)
    if (externalServer?.process === proc) externalServer = null
  })
  externalServer = { root, process: proc }
  return proc
}

let wss = null

export function startLspProxy(port = 7071) {
  if (wss) return wss
  wss = new WebSocketServer({ port })
  wss.on('connection', (ws) => {
    // Routing is decided once, from the first message (guaranteed to be the
    // client's `initialize` request — @codemirror/lsp-client sends it
    // synchronously from connect(), before any other request can be queued).
    // `external` tracks whether THIS connection owns the external slot, so
    // its close can tear that server down without racing a newer connection
    // that may have already replaced it (see getExternalTsServer above).
    let server = null
    let rewrite = true
    let reader = null
    let external = false

    const bind = (chosenServer, useRewrite, isExternal) => {
      server = chosenServer
      rewrite = useRewrite
      external = isExternal
      reader = createLspReader((json) => {
        if (ws.readyState === ws.OPEN) ws.send(rewrite ? toFakeUris(json) : json)
      })
      server.stdout.on('data', reader)
    }

    ws.once('message', (data) => {
      const raw = data.toString()
      let rootUri = null
      try {
        rootUri = JSON.parse(raw)?.params?.rootUri ?? null
      } catch {
        // Malformed first message — fall through to the self-host default.
      }

      let externalRoot = null
      if (rootUri && rootUri !== FAKE_ROOT_URI) {
        try {
          externalRoot = fileURLToPath(rootUri)
        } catch {
          externalRoot = null // not a real file:// URI either — self-host default
        }
      }

      if (externalRoot) {
        bind(getExternalTsServer(externalRoot), false, true)
        server.stdin.write(frame(raw))
      } else {
        bind(getTsServer(), true, false)
        server.stdin.write(frame(toRealUris(raw)))
      }

      ws.on('message', (nextData) => {
        const json = nextData.toString()
        server.stdin.write(frame(rewrite ? toRealUris(json) : json))
      })
    })

    ws.on('close', () => {
      server?.stdout.off('data', reader)
      if (external && externalServer?.process === server) killExternalServer()
    })
    ws.on('error', () => {
      server?.stdout.off('data', reader)
    })
  })
  console.log(`[lsp-proxy] typescript-language-server bridge listening on ws://localhost:${port}`)
  return wss
}

// Kills any live tsserver children — called on app quit (see electron/main.cjs)
// so a packaged build doesn't leave orphaned language-server processes behind
// (Windows doesn't clean up non-detached children when the parent exits).
export function stopLspProxy() {
  if (tsServerProcess) {
    tsServerProcess.kill()
    tsServerProcess = null
  }
  killExternalServer()
}
