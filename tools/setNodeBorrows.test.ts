// @vitest-environment node
// setNodeBorrows runs on every editor save with the file's re-scanned imports.
// Rewriting notes.json when nothing changed fires the planning watcher, and
// every open graph refetches and redraws — so an unchanged set must leave the
// file alone.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openWorkspace, closeWorkspace, setNodeBorrows } from './sleipnir-backend.mjs'

let root: string
const notesPath = () => path.join(root, '.planning', 'notes.json')
const readEdges = () => JSON.parse(fs.readFileSync(notesPath(), 'utf8')).edges as { source: string; target: string; kind: string }[]

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sleipnir-borrows-'))
  fs.mkdirSync(path.join(root, '.planning'))
  const node = (id: string) => ({ id, label: id, kind: 'built', map: 'todo', filePath: `src/${id}.ts` })
  fs.writeFileSync(
    notesPath(),
    JSON.stringify({ nodes: [node('a'), node('b'), node('c')], edges: [{ source: 'a', target: 'b', kind: 'borrows' }] }, null, 2),
  )
  openWorkspace(root)
})

afterEach(() => {
  closeWorkspace()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('setNodeBorrows', () => {
  it('leaves notes.json untouched when the links are unchanged', () => {
    const before = fs.readFileSync(notesPath(), 'utf8')
    const mtime = fs.statSync(notesPath()).mtimeMs
    setNodeBorrows('a', ['b'])
    expect(fs.readFileSync(notesPath(), 'utf8')).toBe(before)
    expect(fs.statSync(notesPath()).mtimeMs).toBe(mtime)
  })

  it('treats a repeated target as one link', () => {
    const before = fs.readFileSync(notesPath(), 'utf8')
    setNodeBorrows('a', ['b', 'b'])
    expect(fs.readFileSync(notesPath(), 'utf8')).toBe(before)
  })

  it('writes when a link is added or removed', () => {
    setNodeBorrows('a', ['b', 'c'])
    expect(readEdges().filter((e) => e.source === 'a').map((e) => e.target).sort()).toEqual(['b', 'c'])
    setNodeBorrows('a', [])
    expect(readEdges().filter((e) => e.source === 'a')).toEqual([])
  })

  it('never links a node to itself', () => {
    setNodeBorrows('a', ['a', 'c'])
    expect(readEdges().filter((e) => e.source === 'a').map((e) => e.target)).toEqual(['c'])
  })
})
