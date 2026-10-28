// @vitest-environment node
//
// The optimize lab: each folder here is a small project with problems planted
// on purpose (see its CHALLENGE.md), and expected.json says what the analyzer
// must find. Running the real scanner + graph core over every one is how a
// change to the heuristics proves it still sees the problems — and how a new
// language or a new kind of finding gets added: write a challenge, then make
// it pass.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { scanProject, contentHits } from '../agentSkills/vendor/analyze.mjs'
import { analyzeGraph, featureScope } from '../agentSkills/vendor/graphCore.mjs'

const LAB = dirname(fileURLToPath(import.meta.url))
const challenges = readdirSync(LAB, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(LAB, d.name, 'expected.json')))
  .map((d) => d.name)

interface Expected {
  cycles?: string[][]
  cyclesContaining?: string[][]
  reusedPages?: string[]
  violations?: [string, string][]
  heavy?: [string, string][]
  barrels?: string[]
  dead?: string[]
  notDead?: string[]
  fanIn?: Record<string, number>
  fanOut?: Record<string, number>
  feature?: { query: string; includes: string[]; excludes: string[] }
}

describe.each(challenges)('challenge: %s', (name) => {
  const root = join(LAB, name)
  const expected: Expected = JSON.parse(readFileSync(join(root, 'expected.json'), 'utf8'))
  const scan = scanProject(root)
  const analysis = analyzeGraph(scan)

  if (expected.cycles) {
    it('finds exactly the planted import cycles', () => {
      const found = analysis.cycles.map((c: { files: string[] }) => [...c.files].sort())
      for (const cycle of expected.cycles!) expect(found).toContainEqual([...cycle].sort())
      if (expected.cycles!.length === 0) expect(found).toEqual([])
    })
  }

  if (expected.cyclesContaining) {
    it('puts the planted loops inside a reported cycle', () => {
      for (const files of expected.cyclesContaining!) {
        expect(analysis.cycles.some((c: { files: string[] }) => files.every((f) => c.files.includes(f)))).toBe(true)
      }
    })
  }

  if (expected.reusedPages) {
    it('flags pages other files import pieces of', () => {
      expect(analysis.reusedPages.map((p: { path: string }) => p.path)).toEqual(expect.arrayContaining(expected.reusedPages!))
    })
  }

  if (expected.violations) {
    it('flags imports that point up the layers', () => {
      const found = analysis.violations.map((v: { source: string; target: string }) => [v.source, v.target])
      for (const v of expected.violations!) expect(found).toContainEqual(v)
    })
  }

  if (expected.heavy) {
    it('flags heavy packages on the first load', () => {
      const found = analysis.heavy.map((h: { path: string; package: string }) => [h.path, h.package])
      for (const h of expected.heavy!) expect(found).toContainEqual(h)
    })
  }

  if (expected.barrels) {
    it('flags re-export barrels', () => {
      expect(analysis.barrels.map((b: { path: string }) => b.path)).toEqual(expect.arrayContaining(expected.barrels!))
    })
  }

  if (expected.dead) {
    it('finds the unreferenced files, and only those', () => {
      expect([...analysis.dead].sort()).toEqual([...expected.dead!].sort())
    })
  }

  if (expected.notDead) {
    it('never calls an entry point or a used file dead', () => {
      for (const f of expected.notDead!) expect(analysis.dead).not.toContain(f)
    })
  }

  if (expected.fanIn || expected.fanOut) {
    it('counts connections exactly', () => {
      for (const [f, n] of Object.entries(expected.fanIn ?? {})) expect(analysis.perFile[f]?.fanIn, `fan-in of ${f}`).toBe(n)
      for (const [f, n] of Object.entries(expected.fanOut ?? {})) expect(analysis.perFile[f]?.fanOut, `fan-out of ${f}`).toBe(n)
    })
  }

  if (expected.feature) {
    it(`scopes "${expected.feature.query}" to the feature's own files`, () => {
      const result = featureScope(scan, expected.feature!.query, { contentHits: contentHits(scan, expected.feature!.query) })
      const files = result.files.map((e: { path: string }) => e.path)
      expect(files).toEqual(expect.arrayContaining(expected.feature!.includes))
      for (const f of expected.feature!.excludes) expect(files).not.toContain(f)
    })
  }
})
