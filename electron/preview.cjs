// Spawns/tracks/kills live preview processes for prototype folders — same
// structural pattern as terminal.cjs (an id -> handle Map, killAll on quit),
// push-event IPC ('preview:status', mirroring 'terminal:data'/'terminal:exit')
// instead of request/response, since starting a preview is a multi-phase
// (installing -> starting -> ready) operation, not a single result.
// Electron-only for the same reason terminal.cjs is: a plain browser tab
// can't own OS processes. The folder's own repo-relative path IS the
// session id — there's only ever one live preview per folder, so no
// separate counter is needed, and it doubles as a "already running" guard.
const { spawn } = require('node:child_process')
const net = require('node:net')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const REPO_ROOT = process.cwd()
const READY_POLL_MS = 300
const READY_TIMEOUT_MS = 45_000
// Most dev servers (Vite, CRA, Next.js, a plain Express+logger) print their
// own bound address on startup — trusted as the authoritative port/URL over
// whatever we asked for via the PORT env var, since not every tool honors it.
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?\/?\S*/i
const OUTPUT_CAP = 20_000

const STATIC_MIME = {
  '.html': 'text/html', '.htm': 'text/html',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
}

// id -> { kind: 'static', server } | { kind: 'process', proc }
const sessions = new Map()

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

function pollReady(url, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, READY_POLL_MS)
      })
      req.setTimeout(2000, () => req.destroy())
    }
    attempt()
  })
}

// Deliberately minimal — just enough to serve a lone static HTML file's own
// directory (relative <script>/<link> paths resolve fine). Not a general
// dev-server replacement (no live reload, no SPA fallback routing).
function serveStatic(rootDir, port) {
  return http.createServer((req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0])
    const filePath = path.join(rootDir, reqPath === '/' ? 'index.html' : reqPath)
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': STATIC_MIME[path.extname(filePath)] || 'application/octet-stream' })
      res.end(data)
    })
  }).listen(port)
}

async function start(sender, folderRepoRelativePath, config) {
  const id = folderRepoRelativePath
  if (sessions.has(id)) return // already running — Play is idempotent, not a relaunch button
  const folderPath = path.join(REPO_ROOT, folderRepoRelativePath)
  const send = (status) => {
    if (!sender.isDestroyed()) sender.send('preview:status', id, status)
  }

  if (config.command === '__static__') {
    const port = await getFreePort()
    const server = serveStatic(folderPath, port)
    sessions.set(id, { kind: 'static', server })
    send({ phase: 'ready', url: `http://localhost:${port}` })
    return
  }

  const port = await getFreePort()
  // Windows' `npm`/`npm.cmd` (and most other CLI shims) are batch files —
  // node:child_process.spawn can't exec those directly without shell:true.
  const useShell = process.platform === 'win32'

  const runDevCommand = () => {
    send({ phase: 'starting' })
    const child = spawn(config.command, config.args, {
      cwd: folderPath,
      env: { ...process.env, PORT: String(port) },
      shell: useShell,
    })
    sessions.set(id, { kind: 'process', proc: child })

    let output = ''
    let discoveredUrl = null
    const onChunk = (chunk) => {
      const text = chunk.toString()
      output = (output + text).slice(-OUTPUT_CAP)
      if (!discoveredUrl) {
        const m = URL_RE.exec(text)
        if (m) discoveredUrl = m[0]
      }
    }
    child.stdout?.on('data', onChunk)
    child.stderr?.on('data', onChunk)

    child.on('exit', (code) => {
      // Only an error if it died before we ever confirmed ready — an
      // explicit stop() already deletes the session first, so this won't
      // double-report on a clean user-requested shutdown.
      if (sessions.get(id)?.proc === child) {
        sessions.delete(id)
        send({ phase: 'error', message: `Process exited (code ${code})`, output })
      }
    })

    const deadline = Date.now() + READY_TIMEOUT_MS
    const checkReady = async () => {
      if (!sessions.has(id)) return // stopped or already errored out mid-wait
      const candidateUrl = discoveredUrl || `http://localhost:${port}`
      const ok = await pollReady(candidateUrl, 1500)
      if (!sessions.has(id)) return
      if (ok) {
        send({ phase: 'ready', url: candidateUrl })
        return
      }
      if (Date.now() > deadline) {
        send({ phase: 'error', message: 'Timed out waiting for the preview to start', output })
        stop(id)
        return
      }
      setTimeout(checkReady, READY_POLL_MS)
    }
    checkReady()
  }

  const needsInstall = fs.existsSync(path.join(folderPath, 'package.json'))
    && !fs.existsSync(path.join(folderPath, 'node_modules'))

  if (!needsInstall) {
    runDevCommand()
    return
  }

  send({ phase: 'installing' })
  const install = spawn('npm', ['install'], { cwd: folderPath, shell: useShell })
  sessions.set(id, { kind: 'process', proc: install })
  let installOutput = ''
  install.stdout?.on('data', (c) => { installOutput = (installOutput + c).slice(-OUTPUT_CAP) })
  install.stderr?.on('data', (c) => { installOutput = (installOutput + c).slice(-OUTPUT_CAP) })
  install.on('exit', (code) => {
    if (!sessions.has(id)) return // stopped mid-install
    if (code !== 0) {
      sessions.delete(id)
      send({ phase: 'error', message: `npm install failed (code ${code})`, output: installOutput })
      return
    }
    runDevCommand()
  })
}

function stop(id) {
  const session = sessions.get(id)
  if (!session) return
  try {
    if (session.kind === 'static') session.server.close()
    else session.proc.kill()
  } catch {
    // already gone
  }
  sessions.delete(id)
}

function killAll() {
  for (const id of [...sessions.keys()]) stop(id)
}

module.exports = { start, stop, killAll }
