// A Sketch placed into an Environment, linked (src/canvas/LAYOUT.md: Place,
// Unlink). The environment keeps a copy of the sketch's layers on the plane
// the placement stands on, so everything that reads layers — features, the 3D
// view, sketch mode's backdrop — works on it unchanged; the link says where the
// copy comes from, and refreshing rewrites it from the sketch as it is now.
//
// What is the environment's own stays put through a refresh: the placement's
// id (features point at it), its plane, its spot there, hidden and locked.
// What is the sketch's is replaced: the layers, their size and their look.
// Layers inside keep ids derived from the placement's and the sketch's, so a
// feature that reads a region of the sketch still finds it next time.
//
// Unlink drops the link and keeps the copy: a local sketch, as if drawn there
// (Figma's detach, Blender's append).

import type { CanvasDoc, CanvasDocId, CanvasNode, NodeId } from './types'
import { childrenOf, isFrameNode } from './types'
import type { SketchLink } from './objects'

/** The id a layer of a linked sketch has inside the placement `placementId`. */
export function linkedLayerId(placementId: NodeId, sourceId: NodeId): NodeId {
  return `${placementId}~${sourceId}`
}

function copyTree(node: CanvasNode, placementId: NodeId): CanvasNode {
  const copy: CanvasNode = { ...node, id: linkedLayerId(placementId, node.id) }
  if (node.repeatOf) copy.repeatOf = linkedLayerId(placementId, node.repeatOf)
  // A layer of a sketch is flat in it: where it stands is the placement's to say.
  delete copy.space
  delete copy.sketch
  delete copy.request
  if (isFrameNode(node) && isFrameNode(copy)) copy.children = node.children.map((child) => copyTree(child, placementId))
  return copy
}

/**
 * What a link shows, as a top-level layer standing nowhere yet: the one frame
 * it names, or — linking the whole sketch — every layer of it in one frame the
 * size of them all, named after the sketch. Null when the sketch is empty or
 * the frame is gone.
 */
export function linkedContent(source: CanvasDoc, link: SketchLink, placementId: NodeId): CanvasNode | null {
  if (link.frame) {
    const frame = source.nodes.find((n) => n.id === link.frame)
    if (!frame) return null
    return { ...copyTree(frame, placementId), id: placementId, rect: { ...frame.rect, x: 0, y: 0 } }
  }
  const layers = source.nodes.filter((n) => !n.hidden)
  if (layers.length === 0) return null
  if (layers.length === 1 && isFrameNode(layers[0])) {
    return { ...copyTree(layers[0], placementId), id: placementId, name: source.name, rect: { ...layers[0].rect, x: 0, y: 0 } }
  }
  const left = Math.min(...layers.map((n) => n.rect.x))
  const top = Math.min(...layers.map((n) => n.rect.y))
  const right = Math.max(...layers.map((n) => n.rect.x + n.rect.w))
  const bottom = Math.max(...layers.map((n) => n.rect.y + n.rect.h))
  return {
    id: placementId,
    name: source.name,
    kind: 'frame',
    rect: { x: 0, y: 0, w: right - left, h: bottom - top },
    style: {},
    children: layers.map((n) => {
      const copy = copyTree(n, placementId)
      return { ...copy, rect: { ...copy.rect, x: n.rect.x - left, y: n.rect.y - top } }
    }),
  }
}

/** The sketch layer a placement shows, with its link: ready for an environment to stand on a plane. */
export function placedSketch(source: CanvasDoc, link: SketchLink, placementId: NodeId): CanvasNode | null {
  const content = linkedContent(source, link, placementId)
  return content && { ...content, sketch: { plane: { kind: 'default', plane: 'front' }, link } }
}

/** Every linked placement in an environment. */
export function linksOf(doc: Pick<CanvasDoc, 'nodes'>): { node: CanvasNode; link: SketchLink }[] {
  return doc.nodes.flatMap((node) => (node.sketch?.link ? [{ node, link: node.sketch.link }] : []))
}

/** The Sketch documents an environment links to, each once — for the board list. */
export function linkedDocIds(doc: Pick<CanvasDoc, 'nodes'>): CanvasDocId[] {
  return [...new Set(linksOf(doc).map(({ link }) => link.doc))]
}

/**
 * Rewrites every linked placement from its sketch as `load` returns it. A
 * sketch `load` can't find (deleted, unreadable) leaves its copy as it last
 * was, listed in `missing`; the doc comes back as the same object when nothing
 * changed, so an open with nothing new to pull in stays clean.
 */
export function refreshLinks(doc: CanvasDoc, load: (id: CanvasDocId) => CanvasDoc | null | undefined): { doc: CanvasDoc; missing: NodeId[] } {
  const missing: NodeId[] = []
  let changed = false
  const nodes = doc.nodes.map((node) => {
    const link = node.sketch?.link
    if (!link) return node
    const source = load(link.doc)
    const content = source ? linkedContent(source, link, node.id) : null
    if (!content) {
      missing.push(node.id)
      return node
    }
    const next: CanvasNode = {
      ...content,
      rect: { ...content.rect, x: node.rect.x, y: node.rect.y },
      sketch: node.sketch,
      space: node.space,
      hidden: node.hidden,
      locked: node.locked,
    }
    if (next.hidden === undefined) delete next.hidden
    if (next.locked === undefined) delete next.locked
    if (next.space === undefined) delete next.space
    if (JSON.stringify(next) === JSON.stringify(node)) return node
    changed = true
    return next
  })
  return { doc: changed ? { ...doc, nodes } : doc, missing }
}

/** Unlink: the placement becomes a local sketch, its copy kept as it is. */
export function unlinkSketch(doc: CanvasDoc, id: NodeId): CanvasDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((node) => {
      if (node.id !== id || !node.sketch?.link) return node
      const { link: _link, ...sketch } = node.sketch
      return { ...node, sketch }
    }),
  }
}

/** Whether a layer is part of a linked placement — the placement itself or a layer inside it. */
export function linkOfLayer(doc: Pick<CanvasDoc, 'nodes'>, id: NodeId): { node: CanvasNode; link: SketchLink } | null {
  for (const node of doc.nodes) {
    if (!node.sketch?.link) continue
    if (node.id === id || id.startsWith(`${node.id}~`)) return { node, link: node.sketch.link }
  }
  return null
}

/** Every layer in a tree, the root included — for tests and lookups. */
export function layersOf(node: CanvasNode): CanvasNode[] {
  return [node, ...childrenOf(node).flatMap(layersOf)]
}
