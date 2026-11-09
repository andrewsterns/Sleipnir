// The agent's model commands, run the way the CLI runs them: documents in,
// the changed documents out, refusals in the app's own words.

import { describe, it, expect } from 'vitest'
import type { CanvasDoc } from '../../document/types'
import { createDoc, createFrameNode } from '../../document/doc'
import { objectsOf } from '../../document/objects'
import { linkOfLayer } from '../../document/placements'
import { bodyOf } from '../geometry/body'
import { parseArgs, runBatch, runModelCommand, type CommandResult } from './modelCommands'

/** Runs commands in order over a project, keeping what each writes — as the CLI does on disk. */
function project(start: CanvasDoc[] = []) {
  let docs = start
  const run = (line: string): CommandResult => {
    // Quoted words stay together: --plane "Base: end".
    const argv = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
    const result = runModelCommand(docs, argv)
    if (result.ok) docs = [...docs.filter((d) => !result.writes.some((w) => w.id === d.id)), ...result.writes]
    return result
  }
  const ok = (line: string) => {
    const r = run(line)
    if (!r.ok) throw new Error(r.error)
    return r.said
  }
  return { run, ok, env: (name: string) => docs.find((d) => d.name === name)! }
}

/** Where the parts really are: the box around every body's vertices, in meters. */
function bounds(doc: CanvasDoc) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const o of objectsOf(doc)) {
    const p = bodyOf(doc, o).mesh.positions
    for (let i = 0; i < p.length; i += 1) {
      min[i % 3] = Math.min(min[i % 3], p[i])
      max[i % 3] = Math.max(max[i % 3], p[i])
    }
  }
  return { min, max }
}

describe('reading a command line', () => {
  it('splits words from flags, a flag with no value being true', () => {
    expect(parseArgs(['env', 'create', '--name', 'Desk', '--force'])).toEqual({ words: ['env', 'create'], flags: { name: 'Desk', force: true } })
  })
})

describe('a batch of commands', () => {
  const script = [
    '# the laptop',
    'env create --name Desk',
    'sketch --plane top --shape rect --size 0.34,0.24 --name Base --env Desk',
    'extrude --sketch Base --depth 0.015 --part "Laptop base"',
    'describe --part "Laptop base"',
  ].join('\n')

  it('runs every line as one change, env filled in, and can end by reading the scene back', () => {
    const result = runBatch([], script, 'Desk')
    if (!result.ok) throw new Error(result.error)
    expect(result.writes.map((d) => d.name)).toEqual(['Desk'])
    expect(objectsOf(result.writes[0]).map((o) => o.name)).toEqual(['Laptop base'])
    expect(result.said).toContain('Laptop base: 0.34 × 0.015 × 0.24 box')
  })

  it('writes nothing when a line fails, and names the line', () => {
    const result = runBatch([], `${script}\nextrude --sketch Nope --depth 1`, 'Desk')
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.error).toMatch(/^Line 6 failed: extrude --sketch Nope[\s\S]*Nothing was written/)
    expect(runBatch([], '# only a comment').ok).toBe(false)
  })
})

describe('building a scene by command', () => {
  it('makes an environment, stands a sketch on Top and extrudes it into a named part', () => {
    const p = project()
    p.ok('env create --name Desk')
    expect(p.ok('sketch --env Desk --plane top --shape rect --size 0.34,0.24 --name Base')).toBe('Stood the sketch "Base" on top (0.34 × 0.24 m)')
    expect(p.ok('extrude --env Desk --sketch Base --depth 0.015 --part "Laptop base"')).toBe('Extrude 1 extrudes "Base" 0.015 m — part "Laptop base"')
    const desk = p.env('Desk')
    expect(objectsOf(desk).map((o) => o.name)).toEqual(['Laptop base'])
    // Lying on the ground, centered on the origin, 15 mm thick.
    const b = bounds(desk)
    expect(b.min[1]).toBeCloseTo(0, 6)
    expect(b.max[1]).toBeCloseTo(0.015, 6)
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.34, 6)
  })

  it('stands a sketch on a part’s face, pulls a face through the editing rules, and swings a part about a hinge', () => {
    const p = project()
    p.ok('env create --name Desk')
    p.ok('sketch --env Desk --plane top --shape rect --size 0.34,0.24 --name Base')
    p.ok('extrude --env Desk --sketch Base --depth 0.015 --part Base')
    p.ok('sketch --env Desk --plane "Base: end" --shape rect --size 0.34,0.24 --name Lid')
    p.ok('extrude --env Desk --sketch Lid --depth 0.008 --part Lid')
    expect(bounds(p.env('Desk'))!.max[1]).toBeCloseTo(0.023, 6)
    expect(p.ok('edit --env Desk --part Base --face end --pull 0.005')).toBe('Extrude 1 is 0.02 m deep')
    // The lid rides the base's top face up.
    expect(bounds(p.env('Desk'))!.max[1]).toBeCloseTo(0.028, 6)
    // Opened 90° about its back edge (turning −90° about X lifts its front): it now stands up behind the base, its sketch still on that face.
    p.ok('move --env Desk --part Lid --turn x,-90 --about 0,0.02,-0.12')
    const desk = p.env('Desk')
    expect(objectsOf(desk).find((o) => o.name === 'Lid')!.placement!.rotation).toEqual([-90, 0, 0])
    expect(bounds(desk).max[1]).toBeGreaterThan(0.25)
    expect(desk.nodes.find((n) => n.name === 'Lid')!.sketch!.plane.kind).toBe('face')
  })

  it('places a Sketch document linked, and unlinks it', () => {
    const logo = createDoc('Logo', 'sketch')
    const withFrame: CanvasDoc = { ...logo, nodes: [{ ...createFrameNode({ x: 0, y: 0, w: 120, h: 80 }), name: 'Mark' }] }
    const p = project([withFrame])
    p.ok('env create --name Desk')
    expect(p.ok('place --env Desk --sketch Logo --on top')).toContain('linked')
    const placed = p.env('Desk').nodes[0]
    expect(linkOfLayer(p.env('Desk'), placed.id)?.link.doc).toBe(logo.id)
    p.ok(`extrude --env Desk --sketch "${placed.name}" --depth 0.01`)
    p.ok(`unlink --env Desk --sketch "${placed.name}"`)
    expect(linkOfLayer(p.env('Desk'), placed.id)).toBeNull()
  })

  it('adds starters, sets smoothness, a feature’s numbers, and resizes a round sketch', () => {
    const p = project()
    p.ok('env create --name Desk')
    p.ok('starter --env Desk --shape cylinder --name Mug')
    p.ok('smoothness --env Desk --part Mug --level high')
    expect(objectsOf(p.env('Desk'))[0].features[0].smoothness).toBe('high')
    expect(p.ok('feature --env Desk --name "Extrude 1" --depth 0.1 --direction symmetric')).toBe('Extrude 1: depth 0.1, direction symmetric')
    expect(p.ok('feature --env Desk --part Mug --depth 0.12')).toBe('Extrude 1: depth 0.12')
    // A cylinder's side is one curved face: it can't be pulled, so the refusal says what to do instead.
    const pulled = p.run('edit --env Desk --part Mug --face side --pull 0.1')
    expect(pulled.ok ? '' : pulled.error).toContain('resize its sketch instead')
    expect(p.ok('resize --env Desk --sketch Mug --size 0.08,0.08')).toBe('Mug is 0.08 × 0.08 m')
  })

  it('refuses in the app’s words, naming what is there', () => {
    const p = project()
    p.ok('env create --name Desk')
    p.ok('starter --env Desk --shape box')
    const nope = p.run('extrude --env Desk --sketch Nope')
    expect(nope.ok ? '' : nope.error).toBe('No sketch or layer called "Nope" in "Desk". Top-level: "Box 1"')
    const two = p.run('env create --name desk')
    expect(two.ok ? '' : two.error).toBe('"desk" exists already')
    const verb = p.run('fly')
    expect(verb.ok ? '' : verb.error).toMatch(/^Unknown command "fly"/)
    // Deleting a sketch a part reads leaves the part, broken, as the app does.
    expect(p.ok('delete --env Desk --sketch "Box 1"')).toContain('now shows as broken')
    expect(objectsOf(p.env('Desk'))).toHaveLength(1)
  })
})
