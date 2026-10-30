// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'
import { findExecutable, serverStatus } from './languageServers.mjs'
import { startLspProxy, stopLspProxy } from './lsp-proxy.mjs'

// A stand-in clangd: answers `initialize` over stdio like a real server would.
const FAKE_SERVER = `
let buf = ''
process.stdin.on('data', (d) => {
  buf += d
  const m = buf.match(/Content-Length: (\\d+)\\r\\n\\r\\n/)
  if (!m) return
  const body = JSON.parse(buf.slice(m.index + m[0].length, m.index + m[0].length + Number(m[1])))
  const reply = JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { capabilities: {}, serverInfo: { name: 'fake-clangd', cwd: process.cwd() } } })
  process.stdout.write('Content-Length: ' + Buffer.byteLength(reply) + '\\r\\n\\r\\n' + reply)
})
`

let bin: string
let project: string
const savedPath = process.env.PATH

beforeAll(() => {
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-bin-'))
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-c-'))
  fs.writeFileSync(path.join(bin, 'fake-server.cjs'), FAKE_SERVER)
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(bin, 'clangd.cmd'), `@"${process.execPath}" "%~dp0fake-server.cjs" %*\r\n`)
  } else {
    fs.writeFileSync(path.join(bin, 'clangd'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-server.cjs" "$@"\n`, { mode: 0o755 })
  }
  process.env.PATH = `${bin}${path.delimiter}${savedPath}`
})

afterAll(async () => {
  process.env.PATH = savedPath
  stopLspProxy()
  // The server's process tree is going down; Windows frees its folders once it has.
  await new Promise((r) => setTimeout(r, 1500))
  fs.rmSync(bin, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  fs.rmSync(project, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('finding language servers', () => {
  it('finds a server on PATH, including a Windows .cmd shim', () => {
    expect(findExecutable('clangd')).toMatch(/clangd(\.cmd)?$/i)
    expect(serverStatus('cpp')).toMatchObject({ known: true, available: true, command: 'clangd' })
    expect(findExecutable('surely-not-a-real-server')).toBeNull()
    expect(serverStatus('html')).toMatchObject({ known: false, available: false })
  })
})

describe('the proxy', () => {
  it('starts the language server in the project and relays its answer', async () => {
    const port = 7098
    startLspProxy(port)
    const reply = await new Promise<{ name?: string; cwd?: string }>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/?language=c`)
      const timer = setTimeout(() => reject(new Error('no answer')), 15000)
      ws.on('open', () =>
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { processId: null, rootUri: pathToFileURL(project).href, capabilities: {} } })),
      )
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data))
        if (msg.id === 1) {
          clearTimeout(timer)
          ws.close()
          resolve(msg.result.serverInfo)
        }
      })
    })
    expect(reply.name).toBe('fake-clangd')
    expect(fs.realpathSync(reply.cwd!)).toBe(fs.realpathSync(project))
  })
})
