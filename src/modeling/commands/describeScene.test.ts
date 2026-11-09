// describe: the read-back an agent checks its work with — the right numbers,
// faces by the names the commands take, and few enough words to call often.

import { describe, it, expect } from 'vitest'
import type { CanvasDoc } from '../../document/types'
import { createDoc, createFrameNode } from '../../document/doc'
import { runModelCommand } from './modelCommands'
import { describeScene, sceneInfo } from './describeScene'

function build(lines: string[], start: CanvasDoc[] = []): CanvasDoc[] {
  let docs = start
  for (const line of lines) {
    const argv = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
    const r = runModelCommand(docs, argv)
    if (!r.ok) throw new Error(`${line}: ${r.error}`)
    docs = [...docs.filter((d) => !r.writes.some((w) => w.id === d.id)), ...r.writes]
  }
  return docs
}
const envIn = (docs: CanvasDoc[], name: string) => docs.find((d) => d.name === name)!

const LAPTOP = [
  'env create --name Desk',
  'sketch --env Desk --plane top --shape rect --size 0.34,0.24 --name Base',
  'extrude --env Desk --sketch Base --depth 0.015 --part "Laptop base"',
  'sketch --env Desk --plane "Laptop base: end" --shape rect --size 0.34,0.24 --name Lid',
  'extrude --env Desk --sketch Lid --depth 0.008 --part Lid',
]

describe('describe', () => {
  it('gives each part its box, its features’ numbers and its faces by the names the commands take', () => {
    const info = sceneInfo(envIn(build(LAPTOP), 'Desk'))
    const base = info.parts.find((p) => p.name === 'Laptop base')!
    expect(base.min).toEqual([-0.17, 0, -0.12])
    expect(base.max).toEqual([0.17, 0.015, 0.12])
    expect(base.features[0].does).toBe('extrudes "Base" on Top 0.015 m one way')
    expect(base.faces.map((f) => f.name)).toEqual(['end', 'start', 'side 1', 'side 2', 'side 3', 'side 4'])
    expect(base.faces[0]).toEqual({ name: 'end', size: [0.34, 0.24], center: [0, 0.015, 0], facing: '+Y' })
    // A sketch on a face says which, in the words a command takes it back in.
    expect(info.parts.find((p) => p.name === 'Lid')!.features[0].does).toBe('extrudes "Lid" on "Laptop base: end" 0.008 m one way')
  })

  it('measures a turned part’s faces on their own planes, and says it moved', () => {
    const docs = build([...LAPTOP, 'move --env Desk --part Lid --turn x,-90 --about 0,0.015,-0.12'])
    const lid = sceneInfo(envIn(docs, 'Desk')).parts.find((p) => p.name === 'Lid')!
    expect(lid.moved).toContain('turned -90, 0, 0°')
    // Standing up behind the base: its thin sides are still 8 mm by 24 cm, and its top faces back.
    expect(lid.faces.find((f) => f.name === 'side 2')!.size).toEqual([0.008, 0.24])
    expect(lid.faces.find((f) => f.name === 'end')!.facing).toBe('-Z')
  })

  it('stands a new sketch on a turned part’s face, not where that face was before it turned', () => {
    const docs = build([...LAPTOP, 'move --env Desk --part Lid --turn x,-90 --about 0,0.015,-0.12', 'sketch --env Desk --plane "Lid: side 2" --shape rect --size 0.01,0.01 --name Hinge'])
    const hinge = envIn(docs, 'Desk').nodes.find((n) => n.name === 'Hinge')!
    // The lid's +X side stands at x = 0.17 once turned; the sketch stands on it, facing +X.
    expect(hinge.space!.position[0]).toBeCloseTo(0.17, 4)
    expect(hinge.space!.rotation[1]).toBeCloseTo(90, 3)
  })

  it('sizes a placed design for its surface, centered, and keeps that when the Sketch changes', () => {
    const screen: CanvasDoc = { ...createDoc('Screen', 'sketch'), nodes: [{ ...createFrameNode({ x: 0, y: 0, w: 320, h: 200 }), name: 'Site' }] }
    const docs = build([...LAPTOP, 'place --env Desk --sketch Screen --on "Lid: end" --width 0.32'], [screen])
    expect(describeScene(envIn(docs, 'Desk'), docs)).toContain('frame 0.32 × 0.2 m on "Lid: end"')
    const placed = envIn(docs, 'Desk').nodes.find((n) => n.sketch?.link)!
    // Centered on the lid, whose middle is the origin in X: 0.32 wide spans -0.16 to 0.16.
    expect(placed.space!.position[0]).toBeCloseTo(-0.16, 4)
    // The Sketch redrawn wider: the next command refreshes the link, and the scale stays.
    const wider = docs.map((d) => (d.name === 'Screen' ? { ...d, nodes: [{ ...d.nodes[0], rect: { ...d.nodes[0].rect, w: 640 } }] } : d))
    const after = build(['rename --env Desk --part Lid --to Lid2'], wider)
    const again = envIn(after, 'Desk').nodes.find((n) => n.sketch?.link)!
    expect(again.rect.w).toBe(640)
    expect(again.space!.scale![0]).toBeCloseTo(0.1, 6)
  })

  it('leaves faces with no area out, keeping the others’ numbers', () => {
    const docs = build(['env create --name Room', 'sketch --env Room --plane front --shape ellipse --size 0.2,0.2 --name Ball', 'revolve --env Room --sketch Ball --part Ball'])
    const faces = sceneInfo(envIn(docs, 'Room')).parts[0].faces
    expect(faces.map((f) => f.name)).toEqual(['side 1'])
    expect(faces[0].facing).toBe('curved')
  })

  it('names a curved face as curved, lists unused and linked sketches, and flags what is broken', () => {
    const logo: CanvasDoc = { ...createDoc('Logo', 'sketch'), nodes: [{ ...createFrameNode({ x: 0, y: 0, w: 120, h: 80 }), name: 'Mark' }] }
    const docs = build(['env create --name Room', 'starter --env Room --shape cylinder --name Mug', 'place --env Room --sketch Logo --on top', 'sketch --env Room --plane side --name Wall', 'delete --env Room --sketch Mug'], [logo])
    const text = describeScene(envIn(docs, 'Room'), docs)
    expect(text).toContain('BROKEN')
    expect(text).toContain('placed from the Sketch "Logo"')
    expect(text).toContain('"Wall" frame 1 × 1 m on Side')
    const mugDocs = build(['env create --name Room', 'starter --env Room --shape cylinder --name Mug'])
    expect(sceneInfo(envIn(mugDocs, 'Room')).parts[0].faces.map((f) => f.facing)).toEqual(['+Y', '-Y', 'curved'])
  })

  it('stays a few hundred tokens for a small scene', () => {
    const text = describeScene(envIn(build([...LAPTOP, 'starter --env Desk --shape cylinder --name Mug']), 'Desk'))
    // About four characters a token: three parts and their faces in well under 300.
    expect(text.length / 4).toBeLessThan(300)
  })
})
