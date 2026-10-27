// The Play button's runner — starts one run target (see runTargets.cjs) per
// window, streams its output, and works out where it's serving. Same
// structural pattern as terminal.cjs (a Map of live handles, killForWindow on
// close, killAll on quit) and push-event IPC ('run:status'/'run:output')
// instead of request/response, since a run is a multi-phase operation
// (installing -> starting -> ready -> exited), not a single result.
// Electron-only for the same reason terminal.cjs is: a plain browser tab
// can't own OS processes.
//
// Keyed by the owning window's webContents id — a window has exactly one
// Play button, so starting again while something runs is a restart.
const { spawn } = require('node:child_process')
const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const { packageManager } = require('./runTargets.cjs')

const READY_POLL_MS = 300
const SLOW_POLL_MS = 2000
// Past this a dev server that hasn't answered is reported as "running, no URL
// yet" — still polled, never killed: a cold Next.js compile can take a while,
// and some servers ignore PORT and print nothing we recognise.
const READY_TIMEOUT_MS = 60_000
const URL_SCAN_CAP = 8_000
// Most dev servers (Vite, CRA, Next.js, Django, a plain Express+logger)
// print their own bound address on startup — trusted over the PORT we asked
// for, since not every tool honours it.
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1?\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s'"<>]*)?/i
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g

const STATIC_MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.wasm': 'application/wasm',
}

// wcId -> { sender, target, proc?, server?, outputTail }
const sessions = new Map()

function stripAnsi(text) {
  return text.replace(ANSI_RE, '')
}

/** A URL a dev server printed, normalised to one the embedded frame can load (0.0.0.0/[::] aren't connectable addresses). */
function normaliseUrl(raw) {
  return raw
    .replace(/[).,;:]+$/, '')
    .replace('://0.0.0.0', '://localhost')
    .replace(/:\/\/\[::1?\]/, '://localhost')
}

function findUrl(text) {
  const m = URL_RE.exec(stripAnsi(text))
  return m ? normaliseUrl(m[0]) : null
}

/** Only ever hand loopback http(s) URLs to the embedded frame or the OS browser. */
function isLocalUrl(url) {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1500, () => req.destroy())
  })
}

// Deliberately minimal — enough for a folder of HTML/CSS/JS with relative
// paths. Not a dev-server replacement (no live reload, no SPA fallback).
function serveStatic(rootDir, port) {
  const base = path.resolve(rootDir)
  return http.createServer((req, res) => {
    let reqPath
    try {
      reqPath = decodeURIComponent((req.url || '/').split('?')[0])
    } catch {
      res.writeHead(400)
      res.end('Bad request')
      return
    }
    let filePath = path.resolve(base, '.' + reqPath)
    if (filePath !== base && !filePath.startsWith(base + path.sep)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    if (reqPath.endsWith('/')) filePath = path.join(filePath, 'index.html')
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': STATIC_MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
      res.end(data)
    })
  }).listen(port, '127.0.0.1')
}

// On Windows `shell: true` makes the child cmd.exe, and proc.kill() would
// stop only that — the node/vite process underneath keeps the port. taskkill
// /T takes the whole tree. Elsewhere the child leads its own process group
// (spawned detached), so signalling -pid reaches every descendant.
function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null || !proc.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {})
    return
  }
  try {
    process.kill(-proc.pid, 'SIGTERM')
  } catch {
    try { proc.kill('SIGTERM') } catch { /* already gone */ }
  }
}

function shellLine(command, args) {
  return [command, ...args.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`))].join(' ')
}

function childEnv(port) {
  const env = { ...process.env, PORT: String(port), BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' }
  // Inherited from a packaged Sleipnir, this would make a project's own
  // `electron .` start as plain Node instead of opening its window.
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

function start(sender, root, target) {
  stop(sender.id, { silent: true })
  const session = { sender, target, proc: null, server: null, outputTail: '' }
  sessions.set(sender.id, session)
  const current = () => sessions.get(sender.id) === session
  const send = (status) => {
    if (current() && !sender.isDestroyed()) sender.send('run:status', { targetId: target.id, ...status })
  }
  const emit = (text) => {
    if (current() && !sender.isDestroyed()) sender.send('run:output', stripAnsi(text))
  }
  const cwd = path.join(root, target.dir || '')
  const fail = (message) => {
    send({ phase: 'error', message })
    sessions.delete(sender.id)
  }

  if (target.command === '__static__') {
    getFreePort().then((port) => {
      if (!current()) return
      session.server = serveStatic(cwd, port)
      session.server.on('error', (err) => fail(err.message))
      const url = `http://localhost:${port}`
      emit(`Serving ${target.dir || '.'}/ at ${url}\n`)
      send({ phase: 'ready', url })
    }, (err) => fail(err.message))
    return
  }

  const spawnTracked = (command, args, opts) => {
    // npm/npx/yarn and most other CLI shims are batch files on Windows —
    // spawn can't exec those without a shell. A typed command line always
    // goes through one, since it's a line, not an argv. Through a shell the
    // argv is joined into one quoted line here rather than handed to spawn,
    // which would concatenate it unquoted.
    const useShell = target.shellLine || process.platform === 'win32'
    const child = spawn(useShell ? shellLine(command, args) : command, useShell ? [] : args, {
      cwd,
      shell: useShell,
      detached: process.platform !== 'win32',
      windowsHide: true,
      ...opts,
    })
    session.proc = child
    child.stdout?.on('data', (c) => onOutput(c.toString()))
    child.stderr?.on('data', (c) => onOutput(c.toString()))
    // e.g. `python` isn't installed — 'exit' never fires for a spawn failure.
    child.on('error', (err) => {
      if (session.proc === child) fail(err.message)
    })
    return child
  }

  let discoveredUrl = null
  const onOutput = (text) => {
    emit(text)
    if (discoveredUrl) return
    session.outputTail = (session.outputTail + text).slice(-URL_SCAN_CAP)
    const url = findUrl(session.outputTail)
    if (url) {
      discoveredUrl = url
      // An app opens its own window; the URL is still worth surfacing as a
      // link (e.g. electron:dev's renderer server), just not embedding.
      if (target.kind !== 'web') send({ phase: 'running', url })
    }
  }

  const run = async () => {
    const port = await getFreePort()
    if (!current()) return
    send({ phase: 'starting' })
    emit(`> ${[target.command, ...target.args].join(' ')}\n`)
    const child = spawnTracked(target.command, target.args, { env: childEnv(port) })
    child.on('exit', (code) => {
      if (!current() || session.proc !== child) return
      sessions.delete(sender.id)
      if (!sender.isDestroyed()) {
        sender.send('run:status', code === 0
          ? { targetId: target.id, phase: 'exited', code }
          : { targetId: target.id, phase: 'error', code, message: `Exited with code ${code ?? 'unknown'}` })
      }
    })

    if (target.kind !== 'web') {
      send({ phase: 'running' })
      return
    }
    const deadline = Date.now() + READY_TIMEOUT_MS
    let reportedSlow = false
    const check = async () => {
      if (!current() || session.proc !== child) return
      const candidate = discoveredUrl || `http://localhost:${port}`
      if (await probe(candidate)) {
        send({ phase: 'ready', url: candidate })
        return
      }
      const slow = Date.now() > deadline
      if (slow && !reportedSlow) {
        reportedSlow = true
        send({ phase: 'running', message: 'No local URL detected yet — still waiting for the server to answer.' })
      }
      setTimeout(check, slow ? SLOW_POLL_MS : READY_POLL_MS)
    }
    check()
  }

  const needsInstall = target.usesPackageManager
    && fs.existsSync(path.join(cwd, 'package.json'))
    && !fs.existsSync(path.join(cwd, 'node_modules'))
    // A workspace member resolves from the root's node_modules.
    && !(target.dir && fs.existsSync(path.join(root, 'node_modules')))

  if (!needsInstall) {
    run().catch((err) => fail(err.message))
    return
  }

  const pm = packageManager(cwd, root)
  send({ phase: 'installing' })
  emit(`> ${pm} install\n`)
  const install = spawnTracked(pm, ['install'], { env: childEnv(0) })
  install.on('exit', (code) => {
    if (!current() || session.proc !== install) return
    if (code !== 0) {
      fail(`${pm} install failed (code ${code})`)
      return
    }
    run().catch((err) => fail(err.message))
  })
}

function stop(wcId, { silent = false } = {}) {
  const session = sessions.get(wcId)
  if (!session) return
  sessions.delete(wcId)
  try {
    if (session.server) session.server.close()
    killTree(session.proc)
  } catch {
    // already gone
  }
  if (!silent && !session.sender.isDestroyed()) {
    session.sender.send('run:status', { targetId: session.target.id, phase: 'idle' })
  }
}

// Some dev servers forbid being framed (Django's default X-Frame-Options:
// DENY, a CSP frame-ancestors), which would leave the Run panel's embedded
// preview blank. Only loopback responses loaded as a subframe are touched —
// the app's own top-level page and every remote site keep their headers.
function allowEmbeddingLocalPreviews(ses) {
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'subFrame' || !isLocalUrl(details.url)) {
      callback({})
      return
    }
    const responseHeaders = {}
    for (const [name, value] of Object.entries(details.responseHeaders || {})) {
      const lower = name.toLowerCase()
      if (lower === 'x-frame-options') continue
      if (lower === 'content-security-policy') {
        const kept = value.map((v) => v.split(';').filter((d) => !/^\s*frame-ancestors\b/i.test(d)).join(';'))
        responseHeaders[name] = kept
        continue
      }
      responseHeaders[name] = value
    }
    callback({ responseHeaders })
  })
}

function killForWindow(wcId) {
  stop(wcId, { silent: true })
}

function killAll() {
  for (const wcId of [...sessions.keys()]) stop(wcId, { silent: true })
}

module.exports = { start, stop, killForWindow, killAll, isLocalUrl, findUrl, allowEmbeddingLocalPreviews }
