// describe (Prompt to scene, step 2): an environment read back in a few
// hundred tokens, so an agent never models blind and can afford to look after
// every change. Each part with its features and numbers, its box in meters,
// and its faces by the names the model commands take ("end", "side 2",
// "Extrude 2 end" — modelCommands.ts findFace), each with its size, middle and
// which way it faces; the sketches no part uses yet and where they stand;
// what's linked to a Sketch document and what's broken, with why; the
// triangle count. The words are LAYOUT.md's; --json gives the same as data.

import type { CanvasDoc, CanvasNode } from '../../document/types'
import { childrenOf } from '../../document/types'
import { brokenFeatures, objectsOf, usedLayers, type CanvasObject, type Feature, type PlaneRef } from '../../document/objects'
import { linksOf } from '../../document/placements'
import { worldToPlane } from '../../document/placement'
import { PX_PER_METER, type Vec3 } from '../../document/sceneTypes'
import { bodyOf, type Body } from '../geometry/body'
import { faceFrame, sketchProblem } from '../scene3d/planeRefs'
import { sceneTriangles } from '../scene3d/sceneMeshes'
import { pushNormalOf } from '../viewport/modalTransform'

const r3 = (n: number) => Math.round(n * 1000) / 1000 || 0
const m = (px: number) => r3(px / PX_PER_METER)
const vec = (v: Vec3) => `(${v.map(r3).join(', ')})`

export interface FaceInfo {
  /** As the commands take it: edit --face "<name>", or a plane "Part: <name>". */
  name: string
  /** On its own plane, meters; a curved face: its box. */
  size: number[]
  center: Vec3
  /** Which way it faces: "+Y", a unit vector, or "curved". */
  facing: string
}

export interface PartInfo {
  name: string
  features: { name: string; does: string; broken?: string; hidden?: boolean }[]
  /** Moved as a whole (G / R / S, move): where to, from where its sketches stand it. */
  moved?: string
  min: Vec3
  max: Vec3
  triangles: number
  faces: FaceInfo[]
}

export interface SceneInfo {
  name: string
  triangles: number
  parts: PartInfo[]
  /** Sketches no part reads yet. */
  sketches: { name: string; is: string; on: string; linkedFrom?: string; broken?: string }[]
}

/** Where a sketch stands, as the commands write it: Top, Top+0.5, "Base: end". */
export function planeName(doc: CanvasDoc, ref: PlaneRef | undefined): string {
  if (!ref) return 'Front'
  if (ref.kind === 'default') return ref.plane[0].toUpperCase() + ref.plane.slice(1)
  if (ref.kind === 'offset') return `${planeName(doc, ref.from)}${ref.distance >= 0 ? '+' : ''}${r3(ref.distance)}`
  if (ref.kind === 'custom') return 'a custom plane'
  const part = objectsOf(doc).find((o) => o.id === ref.objectId)
  if (!part) return 'a face that is gone'
  const index = bodyOf(doc, part).faces.findIndex((f) => f.name.feature === ref.face.feature && f.name.role === ref.face.role && (f.name.segment ?? -1) === (ref.face.segment ?? -1))
  return index < 0 ? `a face of ${part.name} that is gone` : `"${part.name}: ${faceLabel(bodyOf(doc, part), part, index)}"`
}

/**
 * A face's name as the commands read it (findFace): end, start, side — side
 * 1, side 2… when there are several — with its feature's name first when the
 * part has more than one feature.
 */
export function faceLabel(body: Body, part: CanvasObject, index: number): string {
  const face = body.faces[index]
  const feature = part.features.find((f) => f.id === face.name.feature)
  const same = body.faces.filter((f) => f.name.role === face.name.role && f.name.feature === face.name.feature)
  const n = same.indexOf(face) + 1
  const role = face.name.role === 'side' && same.length > 1 ? `side ${n}` : face.name.role
  return part.features.length > 1 && feature ? `${feature.name} ${role}` : role
}

const AXES: [string, Vec3][] = [['+X', [1, 0, 0]], ['-X', [-1, 0, 0]], ['+Y', [0, 1, 0]], ['-Y', [0, -1, 0]], ['+Z', [0, 0, 1]], ['-Z', [0, 0, -1]]]

function faceInfo(doc: CanvasDoc, part: CanvasObject, body: Body, index: number): FaceInfo {
  const points: Vec3[] = []
  for (const t of body.faces[index].triangles) {
    for (let k = 0; k < 3; k += 1) {
      const i = body.mesh.indices[t * 3 + k]
      points.push([body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2]])
    }
  }
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let i = 0; i < 3; i += 1) [lo[i], hi[i]] = [Math.min(lo[i], p[i]), Math.max(hi[i], p[i])]
  const center = lo.map((v, i) => (v + hi[i]) / 2) as Vec3
  const normal = pushNormalOf(doc, { kind: 'elements', elements: [{ objectId: part.id, kind: 'face', index }] })
  let size: number[]
  let facing: string
  if (normal) {
    // Flat: its extent on its own plane.
    const frame = faceFrame(doc, body, index)
    const on = points.map((p) => worldToPlane({ position: frame.origin, rotation: frame.rotation }, p))
    const us = on.map((p) => p.u)
    const vs = on.map((p) => p.v)
    size = [m(Math.max(...us) - Math.min(...us)), m(Math.max(...vs) - Math.min(...vs))]
    const axis = AXES.find(([, a]) => a[0] * normal[0] + a[1] * normal[1] + a[2] * normal[2] > 0.9999)
    facing = axis ? axis[0] : vec(normal)
  } else {
    size = hi.map((v, i) => r3(v - lo[i]))
    facing = 'curved'
  }
  return { name: faceLabel(body, part, index), size, center: center.map(r3) as Vec3, facing }
}

function nameOf(doc: CanvasDoc, id: string): string {
  const find = (nodes: CanvasNode[]): CanvasNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      const hit = find(childrenOf(n))
      if (hit) return hit
    }
    return null
  }
  return find(doc.nodes)?.name ?? 'a layer that is gone'
}

/** What a feature does, in words with its numbers. */
function featureDoes(doc: CanvasDoc, feature: Feature): string {
  if (feature.kind === 'loft') return `lofts ${feature.sketchIds.length} sketches (not built yet)`
  const top = doc.nodes.find((n) => n.id === feature.sketchId) ?? doc.nodes.find((n) => childrenOf(n).some((c) => c.id === feature.sketchId))
  const from = `"${nameOf(doc, feature.sketchId)}" on ${planeName(doc, top?.sketch?.plane)}`
  const how = feature.op === 'new' || feature.op === 'add' ? '' : `, ${feature.op}s (shown as added for now)`
  const smooth = feature.smoothness && feature.smoothness !== 'medium' ? `, ${feature.smoothness} smoothness` : ''
  const moved = feature.kind === 'extrude' && feature.tweaks ? `, ${Object.keys(feature.tweaks).length} corners moved on their own` : ''
  if (feature.kind === 'extrude') return `extrudes ${from} ${r3(feature.depth)} m ${feature.direction === 'reverse' ? 'reversed' : feature.direction === 'symmetric' ? 'both sides' : 'one way'}${how}${smooth}${moved}`
  if (feature.kind === 'revolve') return `revolves ${from} ${r3(feature.angle)}° about its ${feature.axis}${feature.axis === 'center' ? '' : ' edge'}, ${feature.steps} steps${how}${smooth}`
  return `sweeps ${from} along "${nameOf(doc, feature.pathId)}"${how}${smooth}`
}

/** The scene as data. `docs` names the Sketch documents placed sketches come from; `part` narrows to one part. */
export function sceneInfo(env: CanvasDoc, docs: CanvasDoc[] = [], part?: string): SceneInfo {
  const broken = brokenFeatures(env)
  const parts = objectsOf(env)
    .filter((o) => !part || o.id === part || o.name.toLowerCase() === part.toLowerCase())
    .map((object): PartInfo => {
      const body = bodyOf(env, object)
      const p = body.mesh.positions
      const min: Vec3 = [Infinity, Infinity, Infinity]
      const max: Vec3 = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < p.length; i += 1) [min[i % 3], max[i % 3]] = [Math.min(min[i % 3], p[i]), Math.max(max[i % 3], p[i])]
      const placed = object.placement
      const moved = placed
        ? [`moved ${vec(placed.position)} m`, placed.rotation.some((v) => v) ? `turned ${placed.rotation.map(r3).join(', ')}°` : '', placed.scale ? `scaled ${placed.scale.map(r3).join(', ')}×` : ''].filter(Boolean).join(', ')
        : undefined
      return {
        name: object.name,
        features: object.features.map((f) => ({ name: f.name, does: featureDoes(env, f), ...(broken.get(f.id) ? { broken: broken.get(f.id) } : {}), ...(f.hidden ? { hidden: true } : {}) })),
        ...(moved ? { moved } : {}),
        min: (p.length ? min : [0, 0, 0]).map(r3) as Vec3,
        max: (p.length ? max : [0, 0, 0]).map(r3) as Vec3,
        triangles: body.mesh.indices.length / 3,
        // A revolve leaves faces with no area at its poles and on its axis: nothing to see or pull. Their
        // neighbours keep their numbers, which is what the commands read.
        faces: body.faces.map((_, i) => faceInfo(env, object, body, i)).filter((f) => f.size.filter((v) => v > 0).length >= 2),
      }
    })
  const used = usedLayers(env)
  const links = new Map(linksOf(env).map(({ node, link }) => [node.id, docs.find((d) => d.id === link.doc)?.name ?? 'a Sketch that is gone']))
  const sketches = part
    ? []
    : env.nodes
        .filter((n) => !used.has(n.id) && !childrenOf(n).some((c) => used.has(c.id)))
        .map((n) => {
          const problem = sketchProblem(env, n)
          return {
            name: n.name,
            // As it stands in the scene: a placed design is scaled to fit (place --width).
            is: `${n.kind === 'vector' ? (n.shape === 'rectangle' ? 'rect' : n.shape) : n.kind} ${m(n.rect.w * (n.space?.scale?.[0] ?? 1))} × ${m(n.rect.h * (n.space?.scale?.[1] ?? 1))} m`,
            on: planeName(env, n.sketch?.plane),
            ...(links.has(n.id) ? { linkedFrom: links.get(n.id) } : {}),
            ...(problem ? { broken: problem } : {}),
          }
        })
  return { name: env.name, triangles: sceneTriangles(env), parts, sketches }
}

/** The scene in words: a few hundred tokens for a handful of parts. */
export function describeScene(env: CanvasDoc, docs: CanvasDoc[] = [], part?: string): string {
  const info = sceneInfo(env, docs, part)
  const lines: string[] = [`${info.name} — ${info.parts.length} part${info.parts.length === 1 ? '' : 's'}, ${info.triangles.toLocaleString('en-US')} triangles. Meters; Y is up.`]
  if (part && !info.parts.length) lines.push(`No part called "${part}".`)
  const links = new Map(linksOf(env).map(({ node, link }) => [node.id, docs.find((d) => d.id === link.doc)?.name]))
  for (const p of info.parts) {
    const size = p.max.map((v, i) => r3(v - p.min[i]))
    lines.push('', `${p.name}: ${size.join(' × ')} box, ${vec(p.min)} to ${vec(p.max)}${p.moved ? `; ${p.moved}` : ''}`)
    for (const f of p.features) lines.push(`  ${f.name} ${f.does}${f.hidden ? ' — turned off' : ''}${f.broken ? ` — BROKEN: ${f.broken}` : ''}`)
    const object = objectsOf(env).find((o) => o.name === p.name)
    const linked = object?.features.map((f) => ('sketchId' in f ? links.get(env.nodes.find((n) => n.id === f.sketchId || childrenOf(n).some((c) => c.id === f.sketchId))?.id ?? '') : undefined)).find(Boolean)
    if (linked) lines.push(`  its sketch is placed from the Sketch "${linked}" — edit it there`)
    lines.push(`  faces: ${p.faces.map((f) => `${f.name} ${f.size.join('×')} at ${vec(f.center)} ${f.facing}`).join('; ')}`)
  }
  if (info.sketches.length) {
    lines.push('', 'Sketches no part uses yet:')
    for (const s of info.sketches) lines.push(`  "${s.name}" ${s.is} on ${s.on}${s.linkedFrom ? `, placed from the Sketch "${s.linkedFrom}"` : ''}${s.broken ? ` — BROKEN: ${s.broken}` : ''}`)
  }
  return lines.join('\n')
}
