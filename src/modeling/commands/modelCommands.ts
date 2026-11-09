// Model commands (Prompt to scene, step 1): the verbs an agent drives instead
// of writing board JSON — make an environment, stand a sketch on a plane,
// place a Sketch document in it, extrude, revolve, sweep, add a starter, pull
// a face, move a part. Each verb is a thin call into the same pure functions
// the app runs (document/objects, document/placements, scene3d/planeRefs,
// scene3d/starterShapes, geometry/editBody, viewport/modalTransform), so an
// agent and the app can never disagree, and refusals are the app's own words.
//
// Pure: documents in, documents out. The CLI (.sleipnir/model.mjs, built from
// modelCli.ts) reads and writes `.components/.boards/`; Sleipnir picks each
// write up live, as one change. Sizes and positions are meters, as the right
// panel shows them; a plane's "up" is its own (the Top plane's up points away).

import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { childrenOf } from '../../document/types'
import { createDoc, createFrameNode, createVectorNode, deleteNode, findNode, nextId, updateNode } from '../../document/doc'
import { documentKindOf, KIND_NAMES, type DocumentKind } from '../../document/documentKind'
import {
  objectsOf,
  partReading,
  removeFeature,
  removeObject,
  renameObject,
  setSolidOf,
  SMOOTHNESS,
  updateFeature,
  type CanvasObject,
  type ExtrudeFeature,
  type FaceName,
  type Feature,
  type PlaneRef,
  type Smoothness,
} from '../../document/objects'
import { placedSketch, refreshLinks, unlinkSketch, linkOfLayer } from '../../document/placements'
import { syncPlacements } from '../../document/placement'
import { PX_PER_METER, type RevolveAxis, type Vec3 } from '../../document/sceneTypes'
import { addSketch, nextSketchName, resolvePlanes } from '../scene3d/planeRefs'
import { addStarterShape, type StarterShape } from '../scene3d/starterShapes'
import { sceneBounds } from '../viewport/cameraViews'
import { bodyOf, type Body } from '../geometry/body'
import { applyMove, pivotOf, pushNormalOf, type Move } from '../viewport/modalTransform'
import { extrudeFace } from '../geometry/editBody'
import { describeScene, sceneInfo } from './describeScene'

// ── Placing a Sketch document (shared with the app's + Sketch › From a sketch) ──

/**
 * A Sketch document (or one frame of it) placed into an environment, linked:
 * on a plane or a part's face. On Front it lands to the right of everything
 * already there, standing on the ground, so it never appears inside a part.
 * Null when the source has nothing to place or the face can't be found.
 */
export function placeSketchIn(env: CanvasDoc, source: CanvasDoc, plane: PlaneRef = { kind: 'default', plane: 'front' }, frame?: NodeId): { doc: CanvasDoc; id: NodeId } | null {
  const node = placedSketch(source, frame ? { doc: source.id, frame } : { doc: source.id }, nextId('frame'))
  if (!node) return null
  const bounds = sceneBounds(env)
  const next =
    plane.kind === 'default' && plane.plane === 'front'
      ? resolvePlanes({
          ...env,
          nodes: [...env.nodes, { ...node, sketch: { ...node.sketch, plane, at: { u: bounds ? (bounds.max[0] + 0.5) * PX_PER_METER : -node.rect.w / 2, v: -node.rect.h } } }],
        })
      : addSketch(env, plane, node)
  return next ? { doc: next, id: node.id } : null
}

// ── Arguments ──────────────────────────────────────────────────────────────

export interface ParsedArgs {
  /** The verb and any sub-verb: ['env', 'create'], ['extrude']. */
  words: string[]
  flags: Record<string, string | true>
}

/** `extrude --env Desk --sketch Lid --depth 0.02` → words and flags. A flag with no value is true. */
export function parseArgs(argv: string[]): ParsedArgs {
  const words: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) {
        flags[key] = value
        i += 1
      } else flags[key] = true
    } else words.push(a)
  }
  return { words, flags }
}

export type CommandResult = { ok: true; said: string; writes: CanvasDoc[]; removes?: string[] } | { ok: false; error: string }

class CommandError extends Error {}
const fail = (message: string): never => {
  throw new CommandError(message)
}

const norm = (s: string) => s.trim().toLowerCase()
const str = (flags: ParsedArgs['flags'], key: string): string | undefined => (typeof flags[key] === 'string' ? (flags[key] as string) : undefined)
const need = (flags: ParsedArgs['flags'], key: string, what: string): string => str(flags, key) ?? fail(`Say ${what} with --${key}`)
const num = (flags: ParsedArgs['flags'], key: string): number | undefined => {
  const raw = str(flags, key)
  if (raw === undefined) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : fail(`--${key} must be a number, not "${raw}"`)
}
const nums = (raw: string, count: number, key: string): number[] => {
  const parts = raw.split(',').map((s) => Number(s.trim()))
  if (parts.length !== count || parts.some((n) => !Number.isFinite(n))) fail(`--${key} takes ${count} numbers, like ${Array.from({ length: count }, (_, i) => i).join(',')}`)
  return parts
}
const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places || 0
const meters = (px: number) => round(px / PX_PER_METER)

// ── Finding things by name ─────────────────────────────────────────────────

function findDoc(docs: CanvasDoc[], name: string, kind?: DocumentKind): CanvasDoc {
  const pool = kind ? docs.filter((d) => documentKindOf(d) === kind) : docs
  const hit = pool.filter((d) => d.id === name || norm(d.name) === norm(name))
  if (hit.length === 1) return hit[0]
  const what = kind ? KIND_NAMES[kind].toLowerCase() : 'document'
  if (hit.length > 1) return fail(`More than one ${what} is called "${name}" — use its id: ${hit.map((d) => d.id).join(', ')}`)
  return fail(`No ${what} called "${name}". There ${pool.length === 1 ? 'is' : 'are'}: ${pool.map((d) => `"${d.name}"`).join(', ') || 'none yet'}`)
}

function allNodes(doc: CanvasDoc): CanvasNode[] {
  const out: CanvasNode[] = []
  const step = (nodes: CanvasNode[]) => nodes.forEach((n) => (out.push(n), step(childrenOf(n))))
  step(doc.nodes)
  return out
}

function findLayer(doc: CanvasDoc, name: string): CanvasNode {
  const hit = allNodes(doc).filter((n) => n.id === name || norm(n.name) === norm(name))
  if (hit.length === 1) return hit[0]
  if (hit.length > 1) return fail(`More than one layer in "${doc.name}" is called "${name}" — use its id: ${hit.map((n) => n.id).join(', ')}`)
  return fail(`No sketch or layer called "${name}" in "${doc.name}". Top-level: ${doc.nodes.map((n) => `"${n.name}"`).join(', ') || 'none'}`)
}

function findPart(doc: CanvasDoc, name: string): CanvasObject {
  const parts = objectsOf(doc)
  const hit = parts.filter((o) => o.id === name || norm(o.name) === norm(name))
  if (hit.length === 1) return hit[0]
  if (hit.length > 1) return fail(`More than one part is called "${name}" — use its id: ${hit.map((o) => o.id).join(', ')}`)
  return fail(`No part called "${name}" in "${doc.name}". Parts: ${parts.map((o) => `"${o.name}"`).join(', ') || 'none yet'}`)
}

function findFeature(doc: CanvasDoc, name: string): { part: CanvasObject; feature: Feature } {
  for (const part of objectsOf(doc)) for (const feature of part.features) if (feature.id === name || norm(feature.name) === norm(name)) return { part, feature }
  return fail(`No feature called "${name}" in "${doc.name}"`)
}

/**
 * A face named as people say it: "end", "start", "side" (the only side, or
 * "side 2"), optionally after its feature ("Extrude 2 end") when the part has
 * several — its lasting name and index in the part's body.
 */
export function findFace(body: Body, part: CanvasObject, spec: string): { index: number; name: FaceName } {
  const words = norm(spec).replace(/\s+face$/, '')
  const feature = part.features.find((f) => words.startsWith(norm(f.name)))
  const rest = feature ? words.slice(norm(feature.name).length).trim() : words
  const m = /^(end|start|side)(?:\s+(\d+))?$/.exec(rest)
  if (!m) return fail(`Name a face as end, start or side (side 2 for the second); with several features, put its name first: "${part.features[0]?.name ?? 'Extrude 1'} end"`)
  const faces = body.faces.map((f, index) => ({ ...f, index })).filter((f) => f.name.role === m[1] && (!feature || f.name.feature === feature.id))
  if (!faces.length) return fail(`${part.name} has no ${rest} face`)
  const features = new Set(faces.map((f) => f.name.feature))
  if (!feature && features.size > 1) return fail(`${part.name} has a ${m[1]} face on each of ${features.size} features — say which: ${part.features.map((f) => `"${f.name} ${m[1]}"`).join(', ')}`)
  const which = m[2] ? Number(m[2]) - 1 : 0
  if (m[1] === 'side' && !m[2] && faces.length > 1) return fail(`${part.name} has ${faces.length} sides — say which, side 1 to side ${faces.length}`)
  const face = faces[which] ?? fail(`${part.name} has ${faces.length} ${m[1]} face${faces.length === 1 ? '' : 's'}`)
  return { index: face.index, name: face.name }
}

/** "front" | "top" | "side", "top+0.5" (offset meters), or "Part: face" — where a sketch stands. */
function planeOf(doc: CanvasDoc, raw: string): PlaneRef {
  const off = /^(front|top|side)\s*([+-]\s*\d*\.?\d+)?$/i.exec(raw.trim())
  if (off) {
    const base: PlaneRef = { kind: 'default', plane: off[1].toLowerCase() as 'front' | 'top' | 'side' }
    return off[2] ? { kind: 'offset', from: base, distance: Number(off[2].replace(/\s/g, '')) } : base
  }
  const colon = raw.indexOf(':')
  if (colon < 0) return fail(`A plane is front, top or side (top+0.5 to offset it), or a face as "Part: end"`)
  const part = findPart(doc, raw.slice(0, colon))
  const face = findFace(bodyOf(doc, part), part, raw.slice(colon + 1))
  return { kind: 'face', objectId: part.id, face: face.name }
}

// ── Verbs ──────────────────────────────────────────────────────────────────

const SHAPES = { rect: 'rectangle', rectangle: 'rectangle', ellipse: 'ellipse', circle: 'ellipse', polygon: 'polygon', path: 'path' } as const
const STARTERS: StarterShape[] = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'polygon']

/** After every edit of an environment, as the app's own edits: placements in step and every sketch back on its plane. */
function settle(before: CanvasDoc, next: CanvasDoc): CanvasDoc {
  return { ...resolvePlanes(syncPlacements(before, next)), updatedAt: Date.now() }
}

type Ctx = { docs: CanvasDoc[]; flags: ParsedArgs['flags'] }

/** The environment a verb acts on, its placed sketches brought up to date with their Sketch documents first. */
function envOf({ docs, flags }: Ctx): CanvasDoc {
  const env = findDoc(docs, need(flags, 'env', 'the environment'), 'environment')
  return refreshLinks(env, (id) => docs.find((d) => d.id === id)).doc
}

function done(said: string, ...writes: CanvasDoc[]): CommandResult {
  return { ok: true, said, writes }
}

const VERBS: Record<string, (ctx: Ctx, words: string[]) => CommandResult> = {
  list: ({ docs }) => {
    const line = (d: CanvasDoc) => {
      const parts = objectsOf(d).map((o) => o.name)
      return `  ${d.name}${documentKindOf(d) === 'environment' ? (parts.length ? ` — parts: ${parts.join(', ')}` : ' — empty') : ` — ${d.nodes.length} frame${d.nodes.length === 1 ? '' : 's'}`}`
    }
    const of = (kind: DocumentKind) => docs.filter((d) => documentKindOf(d) === kind).map(line)
    return done(['Environments:', ...(of('environment').length ? of('environment') : ['  none']), 'Sketches:', ...(of('sketch').length ? of('sketch') : ['  none'])].join('\n'))
  },

  describe: (ctx) => {
    // Read only: what's there, in a few hundred tokens (describeScene.ts). --json for scripts, --part to narrow.
    const env = envOf(ctx)
    const part = str(ctx.flags, 'part')
    if (part) findPart(env, part)
    return done(ctx.flags.json ? JSON.stringify(sceneInfo(env, ctx.docs, part), null, 1) : describeScene(env, ctx.docs, part))
  },

  env: ({ docs, flags }, [sub]) => {
    if (sub !== 'create') return fail('env create --name <name>')
    const name = need(flags, 'name', 'its name')
    if (docs.some((d) => norm(d.name) === norm(name))) fail(`"${name}" exists already`)
    return done(`Made the environment "${name}"`, createDoc(name, 'environment'))
  },

  sketch: (ctx, [sub]) => {
    const { docs, flags } = ctx
    if (sub === 'create') {
      // A Sketch document — draw in it with .sleipnir/canvas.mjs build, then place it.
      const name = need(flags, 'name', 'its name')
      if (docs.some((d) => norm(d.name) === norm(name))) fail(`"${name}" exists already`)
      return done(`Made the sketch "${name}" — draw in it with canvas.mjs build --board "${name}", then place it`, createDoc(name, 'sketch'))
    }
    // A sketch standing on a plane of an environment: a frame, or one shape to build a part from.
    const env = envOf(ctx)
    const plane = planeOf(env, str(flags, 'plane') ?? 'front')
    const shapeKey = (str(flags, 'shape') ?? 'frame').toLowerCase()
    const name = str(flags, 'name') ?? nextSketchName(env)
    const [w, h] = str(flags, 'size') ? nums(str(flags, 'size')!, 2, 'size').map((m) => m * PX_PER_METER) : [100, 100]
    let node: CanvasNode
    if (shapeKey === 'frame') node = { ...createFrameNode({ x: 0, y: 0, w, h }), name }
    else if (shapeKey in SHAPES) {
      const shape = SHAPES[shapeKey as keyof typeof SHAPES]
      if (shape === 'path') {
        // Points in the plane's meters, x right and y up; the outline is closed.
        const pts = need(flags, 'points', 'its points ("x,y x,y …", meters)')
          .trim()
          .split(/\s+/)
          .map((p) => nums(p, 2, 'points'))
        if (pts.length < 3) fail('A path needs at least three points')
        const xs = pts.map((p) => p[0] * PX_PER_METER)
        const ys = pts.map((p) => -p[1] * PX_PER_METER)
        const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
        const rect = { x: 0, y: 0, w: Math.max(...xs) - x0 || 1, h: Math.max(...ys) - y0 || 1 }
        const points = xs.map((x, i) => ({ x: round(x - x0, 3), y: round(ys[i] - y0, 3) }))
        node = { ...createVectorNode(rect, 'path', { points, closed: true, viewBox: { w: rect.w, h: rect.h } }), name, style: { fills: [{ type: 'solid', color: '#d9d9d9' }] } }
        node = { ...node, sketch: { plane, at: { u: round(x0, 3), v: round(y0, 3) } } }
        return done(`Stood the sketch "${name}" on ${str(flags, 'plane') ?? 'front'}`, settle(env, resolvePlanes({ ...env, nodes: [...env.nodes, node] })))
      }
      node = { ...createVectorNode({ x: 0, y: 0, w, h }, shape, shape === 'polygon' ? { sides: num(flags, 'sides') ?? 6 } : {}), name }
    } else return fail(`--shape is frame, rect, ellipse, polygon or path`)
    // Centered on the plane's middle, or where --at puts its center (meters, x right, y up).
    const at = str(flags, 'at') ? nums(str(flags, 'at')!, 2, 'at') : null
    const placed = at
      ? resolvePlanes({ ...env, nodes: [...env.nodes, { ...node, sketch: { plane, at: { u: round(at[0] * PX_PER_METER - w / 2, 3), v: round(-at[1] * PX_PER_METER - h / 2, 3) } } }] })
      : addSketch(env, plane, node)
    if (!placed) fail('That face is gone — pick another')
    return done(`Stood the sketch "${name}" on ${str(flags, 'plane') ?? 'front'} (${meters(w)} × ${meters(h)} m)`, settle(env, placed!))
  },

  place: (ctx) => {
    const env = envOf(ctx)
    const source = findDoc(ctx.docs, need(ctx.flags, 'sketch', 'the Sketch document to place'), 'sketch')
    const frame = str(ctx.flags, 'frame') ? findLayer(source, str(ctx.flags, 'frame')!).id : undefined
    const plane = planeOf(env, str(ctx.flags, 'on') ?? str(ctx.flags, 'plane') ?? 'front')
    const placed = placeSketchIn(env, source, plane, frame) ?? fail(`"${source.name}" has nothing to place`)
    const node = findNode(placed.doc, placed.id)!
    const width = num(ctx.flags, 'width')
    if (width === undefined) {
      const wide = meters(node.rect.w)
      return done(`Placed "${source.name}" in "${env.name}" as the sketch "${node.name}" (${wide} × ${meters(node.rect.h)} m — 100 px to the meter; --width sets it), linked — edits to it there show here`, settle(env, placed.doc))
    }
    if (width <= 0) fail('--width is the placed width in meters')
    // A design is drawn in px, at 100 to the meter: scale it to the size it is in the scene, kept
    // centered on a face or plane — or standing on the ground, where Front puts it.
    const s = (width * PX_PER_METER) / node.rect.w
    const at = node.sketch?.at ?? { u: 0, v: 0 }
    const grounded = plane.kind === 'default' && plane.plane === 'front'
    const u = grounded ? at.u : at.u + (node.rect.w * (1 - s)) / 2
    const v = grounded ? at.v + node.rect.h * (1 - s) : at.v + (node.rect.h * (1 - s)) / 2
    const sized = updateNode(placed.doc, placed.id, { space: { ...node.space!, scale: [round(s, 6), round(s, 6), 1] }, sketch: { ...node.sketch!, at: { u: round(u, 3), v: round(v, 3) } } })
    return done(`Placed "${source.name}" in "${env.name}" as the sketch "${node.name}", ${round(width)} × ${round(meters(node.rect.h) * s)} m, linked — edits to it there show here`, settle(env, sized))
  },

  extrude: (ctx) => {
    // --part and --face: new material out of one face. Otherwise a sketch into a part.
    if (!str(ctx.flags, 'face')) return solid(ctx, 'extrude')
    const env = envOf(ctx)
    const part = findPart(env, need(ctx.flags, 'part', 'the part'))
    const face = findFace(bodyOf(env, part), part, str(ctx.flags, 'face')!)
    const edit = extrudeFace(env, part.id, face.index, num(ctx.flags, 'depth') ?? 0.1)
    if ('blocked' in edit) return fail(edit.blocked)
    return done(`${edit.did} — on ${part.name}`, settle(env, edit.doc))
  },
  revolve: (ctx) => solid(ctx, 'revolve'),
  sweep: (ctx) => solid(ctx, 'sweep'),

  starter: (ctx) => {
    const env = envOf(ctx)
    const shape = (need(ctx.flags, 'shape', `the shape (${STARTERS.join(', ')})`).toLowerCase()) as StarterShape
    if (!STARTERS.includes(shape)) fail(`--shape is one of ${STARTERS.join(', ')}`)
    const { doc, id } = addStarterShape(env, shape)
    let next = doc
    const name = str(ctx.flags, 'name')
    if (name) {
      next = updateNode(next, id, { name })
      const part = partReading(next, id)
      if (part) next = renameObject(next, part.object.id, name)
    }
    return done(`Added ${findNode(next, id)!.name}`, settle(env, next))
  },

  smoothness: (ctx) => {
    const env = envOf(ctx)
    const part = findPart(env, need(ctx.flags, 'part', 'the part'))
    const level = (need(ctx.flags, 'level', 'low, medium or high').toLowerCase()) as Smoothness
    if (!(level in SMOOTHNESS)) fail('--level is low, medium or high')
    const next = part.features.reduce((d, f) => updateFeature(d, f.id, f.kind === 'revolve' ? { smoothness: level, steps: Math.max(3, Math.round((SMOOTHNESS[level].steps * f.angle) / 360)) } : { smoothness: level }), env)
    return done(`${part.name} is ${SMOOTHNESS[level].label.toLowerCase()} smoothness`, settle(env, next))
  },

  feature: (ctx) => {
    // Set a feature's numbers: depth, direction, axis, angle, steps, op.
    const env = envOf(ctx)
    // By its name, or by its part when the part has just the one.
    const byPart = !str(ctx.flags, 'name') && str(ctx.flags, 'part') ? findPart(env, str(ctx.flags, 'part')!) : null
    if (byPart && byPart.features.length !== 1) fail(`${byPart.name} has ${byPart.features.length} features — name one with --name: ${byPart.features.map((f) => `"${f.name}"`).join(', ')}`)
    const { feature } = byPart ? { feature: byPart.features[0] } : findFeature(env, need(ctx.flags, 'name', 'the feature ("Extrude 1"), or --part for a part with one'))
    const patch: Partial<Feature> & Record<string, unknown> = {}
    const depth = num(ctx.flags, 'depth')
    if (depth !== undefined) patch.depth = Math.max(0.001, depth)
    if (str(ctx.flags, 'direction')) patch.direction = direction(str(ctx.flags, 'direction')!)
    if (str(ctx.flags, 'axis')) patch.axis = axis(str(ctx.flags, 'axis')!)
    if (num(ctx.flags, 'angle') !== undefined) patch.angle = num(ctx.flags, 'angle')
    if (num(ctx.flags, 'steps') !== undefined) patch.steps = Math.round(num(ctx.flags, 'steps')!)
    if (str(ctx.flags, 'op')) patch.op = op(str(ctx.flags, 'op')!)
    if (!Object.keys(patch).length) fail('Say what to set: --depth, --direction, --axis, --angle, --steps or --op')
    return done(`${feature.name}: ${Object.entries(patch).map(([k, v]) => `${k} ${v}`).join(', ')}`, settle(env, updateFeature(env, feature.id, patch)))
  },

  edit: (ctx) => {
    // A face pulled along its normal (push/pull), or moved by x,y,z: the editing rules decide what changes.
    const env = envOf(ctx)
    const part = findPart(env, need(ctx.flags, 'part', 'the part'))
    const face = findFace(bodyOf(env, part), part, need(ctx.flags, 'face', 'the face (end, start, side 2…)'))
    const target = { kind: 'elements' as const, elements: [{ objectId: part.id, kind: 'face' as const, index: face.index }] }
    const pull = num(ctx.flags, 'pull')
    let by: Vec3
    if (pull !== undefined) {
      const normal = pushNormalOf(env, target) ?? fail(`That face is curved — resize its sketch instead: resize --env "${env.name}" --sketch <sketch> --size w,h`)
      by = [normal[0] * pull, normal[1] * pull, normal[2] * pull]
    } else by = nums(need(ctx.flags, 'move', 'how far: --pull <m> or --move x,y,z'), 3, 'move') as Vec3
    const result = applyMove(env, target, { kind: 'translate', by }, pivotOf(env, target) ?? [0, 0, 0])
    if (result.blocked) fail(result.said)
    return done(result.said, settle(env, result.doc))
  },

  move: (ctx) => {
    // A part as a whole — its own placement, so its sketch keeps its plane.
    const env = envOf(ctx)
    const part = findPart(env, need(ctx.flags, 'part', 'the part'))
    const target = { kind: 'parts' as const, parts: [part.id], layers: [] }
    const about = str(ctx.flags, 'about') ? (nums(str(ctx.flags, 'about')!, 3, 'about') as Vec3) : (pivotOf(env, target) ?? [0, 0, 0])
    const moves: Move[] = []
    if (str(ctx.flags, 'by')) moves.push({ kind: 'translate', by: nums(str(ctx.flags, 'by')!, 3, 'by') as Vec3 })
    if (str(ctx.flags, 'turn')) {
      const [ax, deg] = str(ctx.flags, 'turn')!.split(',')
      const dir: Record<string, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
      moves.push({ kind: 'rotate', axis: dir[norm(ax)] ?? fail('--turn is axis,degrees: x,90'), deg: Number(deg) })
    }
    if (str(ctx.flags, 'scale')) {
      const s = str(ctx.flags, 'scale')!.split(',').map(Number)
      moves.push({ kind: 'scale', by: (s.length === 3 ? s : [s[0], s[0], s[0]]) as Vec3 })
    }
    if (!moves.length) fail('Say how: --by x,y,z (meters), --turn axis,degrees, --scale f — with --about x,y,z to turn or scale about a point (a hinge)')
    const next = moves.reduce((d, m) => applyMove(d, target, m, about).doc, env)
    const placed = objectsOf(next).find((o) => o.id === part.id)?.placement
    return done(`Moved ${part.name}${placed ? ` — now at ${placed.position.join(', ')} m, turned ${placed.rotation.join(', ')}°` : ' back where its sketch stands it'}`, settle(env, next))
  },

  resize: (ctx) => {
    // A sketch's size, kept centered where it stands (a curved side has no face to pull).
    const env = envOf(ctx)
    const layer = findLayer(env, need(ctx.flags, 'sketch', 'the sketch'))
    if (linkOfLayer(env, layer.id)) fail(`"${layer.name}" is placed from a Sketch document — resize it there, or unlink it first`)
    const [w, h] = nums(need(ctx.flags, 'size', 'the new size (w,h meters)'), 2, 'size').map((m) => Math.max(1, m * PX_PER_METER))
    const top = env.nodes.find((n) => n.id === layer.id)
    const at = top?.sketch?.at
    const patch: Partial<CanvasNode> = { rect: { ...layer.rect, w, h } }
    if (top?.sketch && at) patch.sketch = { ...top.sketch, at: { u: round(at.u - (w - layer.rect.w) / 2, 3), v: round(at.v - (h - layer.rect.h) / 2, 3) } }
    const sized = layer.kind === 'vector' && layer.shape === 'path' ? fail('A path keeps its points — move them in sketch mode') : updateNode(env, layer.id, patch)
    return done(`${layer.name} is ${meters(w)} × ${meters(h)} m`, settle(env, sized))
  },

  unlink: (ctx) => {
    const env = envOf(ctx)
    const layer = findLayer(env, need(ctx.flags, 'sketch', 'the placed sketch'))
    if (!linkOfLayer(env, layer.id)) fail(`"${layer.name}" isn't placed from a Sketch document`)
    return done(`"${layer.name}" is its own now — edits to its Sketch no longer reach it`, settle(env, unlinkSketch(env, layer.id)))
  },

  rename: (ctx) => {
    const env = envOf(ctx)
    const to = need(ctx.flags, 'to', 'the new name')
    if (str(ctx.flags, 'part')) {
      const part = findPart(env, str(ctx.flags, 'part')!)
      return done(`${part.name} is now ${to}`, settle(env, renameObject(env, part.id, to)))
    }
    const layer = findLayer(env, need(ctx.flags, 'sketch', 'what to rename: --part or --sketch'))
    return done(`${layer.name} is now ${to}`, settle(env, updateNode(env, layer.id, { name: to })))
  },

  delete: (ctx) => {
    const env = envOf(ctx)
    if (str(ctx.flags, 'part')) {
      const part = findPart(env, str(ctx.flags, 'part')!)
      return done(`Deleted ${part.name}; its sketches stay`, settle(env, removeObject(env, part.id)))
    }
    if (str(ctx.flags, 'feature')) {
      const { feature } = findFeature(env, str(ctx.flags, 'feature')!)
      return done(`Deleted ${feature.name}`, settle(env, removeFeature(env, feature.id)))
    }
    const layer = findLayer(env, need(ctx.flags, 'sketch', 'what to delete: --part, --feature or --sketch'))
    // As in the app: what was built from it stays, marked broken, until re-picked or deleted.
    const users = objectsOf(env).filter((o) => o.features.some((f) => 'sketchId' in f && f.sketchId === layer.id)).map((o) => o.name)
    return done(`Deleted ${layer.name}${users.length ? ` — ${users.join(', ')} now ${users.length === 1 ? 'shows' : 'show'} as broken; re-pick or delete ${users.length === 1 ? 'it' : 'them'}` : ''}`, settle(env, deleteNode(env, layer.id)))
  },
}

function direction(raw: string): NonNullable<ExtrudeFeature['direction']> {
  const d = { normal: 'normal', 'one-way': 'normal', reverse: 'reverse', symmetric: 'symmetric', both: 'symmetric', 'both-sides': 'symmetric' }[norm(raw)]
  return (d as NonNullable<ExtrudeFeature['direction']>) ?? fail('--direction is normal, reverse or symmetric')
}
function axis(raw: string): RevolveAxis {
  return (['center', 'left', 'bottom'].includes(norm(raw)) ? norm(raw) : fail('--axis is center, left or bottom')) as RevolveAxis
}
function op(raw: string): Feature['op'] {
  return (['new', 'add', 'subtract', 'intersect'].includes(norm(raw)) ? norm(raw) : fail('--op is add, subtract or intersect')) as Feature['op']
}

/** extrude / revolve / sweep a sketch: a new part named after it (or --part), or a new setting on the feature that already builds it. */
function solid(ctx: Ctx, kind: 'extrude' | 'revolve' | 'sweep'): CommandResult {
  const env = envOf(ctx)
  const layer = findLayer(env, need(ctx.flags, 'sketch', 'the sketch'))
  if (layer.kind !== 'frame' && layer.kind !== 'vector') fail(`"${layer.name}" is ${layer.kind === 'text' ? 'text' : 'not a shape'} — extrude a frame or a shape`)
  if (linkOfLayer(env, layer.id) && layer.id !== linkOfLayer(env, layer.id)!.node.id && kind !== 'extrude') fail(`"${layer.name}" is part of a placed sketch — shape the placed sketch as a whole`)
  const spec =
    kind === 'extrude'
      ? ({ kind, depth: Math.max(0.001, num(ctx.flags, 'depth') ?? 0.2) } as const)
      : kind === 'revolve'
        ? ({ kind, axis: axis(str(ctx.flags, 'axis') ?? 'center'), angle: num(ctx.flags, 'angle') ?? 360, steps: 48 } as const)
        : ({ kind, pathId: findLayer(env, need(ctx.flags, 'path', 'the path to follow')).id } as const)
  let next = setSolidOf(env, layer.id, spec, str(ctx.flags, 'part') ?? layer.name)
  const made = partReading(next, layer.id)!
  if (kind === 'extrude' && str(ctx.flags, 'direction')) next = updateFeature(next, made.feature.id, { direction: direction(str(ctx.flags, 'direction')!) })
  const what = kind === 'extrude' ? `${spec.kind === 'extrude' ? spec.depth : ''} m` : kind === 'revolve' ? `about its ${str(ctx.flags, 'axis') ?? 'center'}` : 'along its path'
  return done(`${made.feature.name} ${kind}s "${layer.name}" ${what} — part "${made.object.name}"`, settle(env, next))
}

/** Runs one command over every document of the project. Never throws: a refusal comes back as `error`, in the app's words. */
export function runModelCommand(docs: CanvasDoc[], argv: string[]): CommandResult {
  const { words, flags } = parseArgs(argv)
  const [verb, ...rest] = words
  const run = verb ? VERBS[verb] : undefined
  if (!run) return { ok: false, error: `Unknown command "${verb ?? ''}". Commands: ${Object.keys(VERBS).join(', ')} (help for details)` }
  try {
    return run({ docs, flags }, rest)
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: e.message }
    throw e
  }
}

/** One line of a batch as its words: spaces separate, "double quotes" keep together. */
export function splitLine(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
}

/**
 * Many commands as one: each line is a command, `#` starts a comment, and
 * `env` is the --env of any line that doesn't say. All or nothing — a line
 * that fails names itself and nothing is written, so the fix is to correct it
 * and run the whole script again. A `describe` line reads back the scene as
 * built so far, so a build and its check are one call.
 */
export function runBatch(docs: CanvasDoc[], script: string, env?: string): CommandResult {
  let current = docs
  const written = new Map<string, CanvasDoc>()
  const said: string[] = []
  let ran = 0
  const lines = script.split(/\r?\n/)
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n].trim()
    if (!line || line.startsWith('#')) continue
    const argv = splitLine(line)
    if (env && !argv.includes('--env')) argv.push('--env', env)
    const result = runModelCommand(current, argv)
    if (!result.ok) return { ok: false, error: `Line ${n + 1} failed: ${line}\n${result.error}\nNothing was written. Fix that line and run the whole batch again.` }
    for (const doc of result.writes) {
      written.set(doc.id, doc)
      current = current.some((d) => d.id === doc.id) ? current.map((d) => (d.id === doc.id ? doc : d)) : [...current, doc]
    }
    said.push(result.said)
    ran += 1
  }
  if (!ran) return { ok: false, error: 'The batch has no commands in it' }
  return { ok: true, said: said.join('\n'), writes: [...written.values()] }
}

export const MODEL_HELP = `Sleipnir model commands — build 3D environments from the command line.
Sizes and positions are meters; a plane's up is its own (Top's up points away).

  list
  describe --env <env> [--part <part>] [--json]     what is there: parts, numbers, faces by name, sizes
  env create --name <name>
  sketch create --name <name>                     a Sketch document (draw in it with canvas.mjs, then place it)
  sketch --env <env> [--plane front|top|side|top+0.5|"Part: end"]
         [--shape frame|rect|ellipse|polygon|path] [--size w,h] [--at x,y] [--sides n]
         [--points "x,y x,y …"] [--name <name>]  a sketch standing in the environment
  place --env <env> --sketch <Sketch doc> [--frame <frame>] [--on <plane or "Part: face">] [--width m]
  extrude --env <env> --sketch <sketch> [--depth m] [--direction normal|reverse|symmetric] [--part <name>]
  extrude --env <env> --part <part> --face end|side 2|… [--depth m]     new material out of one flat face
  revolve --env <env> --sketch <sketch> [--axis center|left|bottom] [--angle deg] [--part <name>]
  sweep   --env <env> --sketch <sketch> --path <sketch> [--part <name>]
  starter --env <env> --shape box|cylinder|sphere|cone|torus|polygon [--name <name>]
  feature --env <env> (--name "Extrude 1" | --part <part>) [--depth m] [--direction …] [--axis …] [--angle deg] [--steps n] [--op add|subtract|intersect]
  smoothness --env <env> --part <part> --level low|medium|high
  edit --env <env> --part <part> --face end|start|side [n]|"Extrude 2 end" (--pull m | --move x,y,z)
  move --env <env> --part <part> [--by x,y,z] [--turn x|y|z,deg] [--scale f|x,y,z] [--about x,y,z]
  unlink --env <env> --sketch <placed sketch>
  rename --env <env> (--part <part> | --sketch <sketch>) --to <name>
  resize --env <env> --sketch <sketch> --size w,h      kept centered where it stands
  delete --env <env> (--part <part> | --feature <feature> | --sketch <sketch>)

  batch [--env <env>] [--file <path>]   many commands, one per line, from a file or stdin; all or nothing
                                        (# comments; --env is the default for lines without one; end with describe)

Each command is one change; Sleipnir shows it live.`
