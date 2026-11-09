// An environment's left panel, by what was built (src/canvas/LAYOUT.md):
// Parts first — each with its features, each feature's sketch under it — then
// the sketches no feature uses yet, then the planes. A Sketch document has
// none of this: its panel is the layer tree alone.

import { findNode } from '../../document/doc'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { inputsOf, objectsOf, usedLayers, type CanvasObject, type DefaultPlane, type Feature, type PlaneRef, type SketchLink } from '../../document/objects'

/** A row of the Planes section: a plane, and every top-level layer standing on it, used by a part or not. */
export interface PlaneGroup {
  id: string
  label: string
  /** A default plane, which can take a new sketch; absent for the custom row. */
  plane?: DefaultPlane
  nodes: CanvasNode[]
}

const PLANE_NAMES: Record<DefaultPlane, string> = { front: 'Front', top: 'Top', side: 'Side' }

/** Where a top-level layer stands, as the panel files it: a default plane (offsets with theirs), a face, or a custom plane. */
export function planeKeyOf(node: CanvasNode): DefaultPlane | 'face' | 'custom' {
  let ref: PlaneRef | undefined = node.sketch?.plane
  while (ref?.kind === 'offset') ref = ref.from
  if (ref?.kind === 'default') return ref.plane
  if (ref?.kind === 'face') return 'face'
  return ref?.kind === 'custom' || node.space ? 'custom' : 'front'
}

/** Where a sketch stands, in the few words its row trails with: "Top", "Top + 0.5 m", "On a face", "Custom plane". */
export function whereOf(node: CanvasNode): string {
  const ref = node.sketch?.plane
  if (ref?.kind === 'offset') {
    let base: PlaneRef = ref.from
    while (base.kind === 'offset') base = base.from
    const name = base.kind === 'default' ? PLANE_NAMES[base.plane] : base.kind === 'face' ? 'A face' : 'Custom plane'
    return `${name} ${ref.distance < 0 ? '−' : '+'} ${Math.abs(Math.round(ref.distance * 1000) / 1000)} m`
  }
  const key = planeKeyOf(node)
  return key === 'face' ? 'On a face' : key === 'custom' ? 'Custom plane' : PLANE_NAMES[key]
}

/**
 * The Planes section: Front, Top and Side always, then a custom row when any
 * layer stands on a plane of its own. Each holds every top-level layer on it —
 * what its eye hides. Layers on a face belong to that face's part, not a plane.
 */
export function planeGroupsOf(doc: CanvasDoc): PlaneGroup[] {
  const groups: PlaneGroup[] = [
    { id: 'front', label: 'Front', plane: 'front', nodes: [] },
    { id: 'top', label: 'Top', plane: 'top', nodes: [] },
    { id: 'side', label: 'Side', plane: 'side', nodes: [] },
    { id: 'custom', label: 'Custom plane', nodes: [] },
  ]
  const byId = new Map(groups.map((g) => [g.id, g]))
  for (const node of doc.nodes) {
    const key = planeKeyOf(node)
    if (key !== 'face') byId.get(key)!.nodes.push(node)
  }
  return groups.filter((g) => g.plane || g.nodes.length)
}

/** A sketch no feature uses yet: listed flat under Sketches, with where it stands and, placed, what it links to. */
export interface SketchEntry {
  node: CanvasNode
  where: string
  link?: SketchLink
}

/** The environment's sketches no part uses yet, top-most first — the order the board paints them in reverse. */
export function unusedSketchesOf(doc: CanvasDoc): SketchEntry[] {
  const used = usedLayers(doc)
  return [...doc.nodes]
    .reverse()
    .filter((node) => !used.has(node.id))
    .map((node) => ({ node, where: whereOf(node), ...(node.sketch?.link ? { link: node.sketch.link } : {}) }))
}

/** A part in the layers panel: its features in order, each with the sketches it reads. */
export interface ObjectGroup {
  object: CanvasObject
  features: { feature: Feature; sketches: CanvasNode[] }[]
  /** Every layer the part reads, so its eye can hide or show the whole of it. */
  layers: CanvasNode[]
}

/** The environment's parts for the Parts section, in the order they were made. */
export function objectGroupsOf(doc: CanvasDoc): ObjectGroup[] {
  return objectsOf(doc).map((object) => {
    const features = object.features.map((feature) => ({
      feature,
      sketches: [...new Set(inputsOf(feature))].map((id) => findNode(doc, id)).filter((n): n is CanvasNode => !!n),
    }))
    const layers = [...new Map(features.flatMap((f) => f.sketches).map((n) => [n.id, n])).values()]
    return { object, features, layers }
  })
}
