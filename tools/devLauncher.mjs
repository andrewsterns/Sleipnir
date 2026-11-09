// npm run electron:dev. Starts Vite once and Electron on top of it, and starts
// Electron again whenever it asks to restart, so a change to the main process
// doesn't take the dev server down with it. Quitting the app ends both.

import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { RESTART_EXIT_CODE } = require('../electron/devRestart.cjs')
const electronPath = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_TO_WAIT_FOR = 'http://localhost:5183'

const vite = spawn('npm', ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: true })

function stopVite() {
  // Synchronous: this process exits straight after, and would otherwise take the kill with it.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' })
  else vite.kill()
}

const waitForVite = () =>
  new Promise((resolve) => {
    const attempt = () => {
      http.get(URL_TO_WAIT_FOR, (res) => {
        res.resume()
        resolve()
      }).on('error', () => setTimeout(attempt, 250))
    }
    attempt()
  })

function startElectron() {
  const env = { ...process.env, SLEIPNIR_DEV_LAUNCHER: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  // Extra arguments go to Electron (--remote-debugging-port, say).
  const app = spawn(electronPath, ['.', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env })
  app.on('exit', (code) => {
    if (code === RESTART_EXIT_CODE) {
      startElectron()
      return
    }
    stopVite()
    process.exit(code ?? 0)
  })
}

vite.on('exit', () => process.exit(1))
await waitForVite()
startElectron()
