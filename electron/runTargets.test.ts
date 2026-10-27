// @vitest-environment node
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { detectTargets, customTarget, packageManager } = require('./runTargets.cjs')
const { findUrl, isLocalUrl } = require('./preview.cjs')

let root: string

function write(rel: string, content = '') {
  const file = path.join(root, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-run-'))
})
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('detectTargets', () => {
  it('classifies package scripts and picks the dev server by default', () => {
    write('package.json', JSON.stringify({
      scripts: {
        build: 'tsc -b && vite build',
        'electron:dev': 'concurrently "npm:dev" "electron ."',
        'electron:build': 'npm run build && electron-builder',
        dev: 'vite',
        prepare: 'husky',
        pretest: 'echo',
        test: 'vitest',
      },
    }))
    const { targets, defaultId } = detectTargets(root)
    const byLabel = Object.fromEntries(targets.map((t: { label: string; kind: string }) => [t.label, t.kind]))
    expect(byLabel).toEqual({ dev: 'web', 'electron:dev': 'app', 'electron:build': 'task', build: 'task', test: 'task' })
    expect(targets[0].label).toBe('dev')
    expect(defaultId).toBe('.:script:dev')
    expect(targets[0]).toMatchObject({ command: 'npm', args: ['run', 'dev'], dir: '' })
  })

  it('finds child-folder projects and static sites, root first', () => {
    write('package.json', JSON.stringify({ scripts: { start: 'node server.js' } }))
    write('website/index.html', '<h1>hi</h1>')
    write('web/package.json', JSON.stringify({ scripts: { dev: 'next dev' } }))
    write('web/pnpm-lock.yaml')
    write('node_modules/pkg/index.html')
    const ids = detectTargets(root).targets.map((t: { id: string }) => t.id)
    expect(ids).toEqual(['.:script:start', 'web:script:dev', 'website:static'])
    expect(detectTargets(root).targets[1].command).toBe('pnpm')
  })

  it('treats index.html next to a package.json as a template, not a static site', () => {
    write('package.json', JSON.stringify({ scripts: { dev: 'vite' } }))
    write('index.html')
    expect(detectTargets(root).targets.map((t: { kind: string }) => t.kind)).toEqual(['web'])
  })

  it('detects non-Node projects', () => {
    write('manage.py')
    write('tool/go.mod')
    const targets = detectTargets(root).targets
    expect(targets.map((t: { id: string; kind: string }) => [t.id, t.kind])).toEqual([
      ['.:django', 'web'],
      ['tool:go', 'app'],
    ])
  })

  it('returns nothing for a missing root', () => {
    expect(detectTargets(path.join(root, 'nope'))).toEqual({ targets: [], defaultId: null })
    expect(detectTargets(null)).toEqual({ targets: [], defaultId: null })
  })

  it('reads the package manager from the nearest lockfile', () => {
    write('yarn.lock')
    write('app/package.json', '{}')
    expect(packageManager(path.join(root, 'app'), root)).toBe('yarn')
    expect(packageManager(root)).toBe('yarn')
  })

  it('runs a typed command line through the shell as written', () => {
    expect(customTarget('npm run dev -- --host')).toMatchObject({ command: 'npm run dev -- --host', args: [], shellLine: true, kind: 'web' })
  })
})

describe('dev-server URL discovery', () => {
  it('reads past colour codes and normalises wildcard hosts', () => {
    expect(findUrl('  \x1b[32m➜\x1b[39m  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n')).toBe('http://localhost:5173/')
    expect(findUrl('Starting development server at http://127.0.0.1:8000/\n')).toBe('http://127.0.0.1:8000/')
    expect(findUrl('listening on http://0.0.0.0:3000.')).toBe('http://localhost:3000')
    expect(findUrl('nothing here')).toBeNull()
  })

  it('only treats loopback http(s) as local', () => {
    expect(isLocalUrl('http://localhost:5173/')).toBe(true)
    expect(isLocalUrl('https://127.0.0.1:8443')).toBe(true)
    expect(isLocalUrl('http://example.com')).toBe(false)
    expect(isLocalUrl('file:///C:/x.html')).toBe(false)
    expect(isLocalUrl('javascript:alert(1)')).toBe(false)
  })
})
