// Patterns along a path: one item repeated N times down an along-path frame's
// guide (AlongPath.repeat). The first child after the guide is the TEMPLATE;
// the layout keeps N − 1 copies of it right behind it, and pathFlow.ts then
// spaces the whole run along the curve like any other children.
//
// Copies are ordinary nodes in the document — so the board draws them, hit
// tests reach them and the emitter sees them with no special cases — marked
// with `repeatOf` and given DERIVED ids (`<templateId>~<n>`, all the way down
// the subtree). Derived ids are what make syncing cheap and stable: a copy
// keeps the same id forever, and editing the template rebuilds every copy on
// the next change.
//
// What each PIECE owns is where it sits in the run and its own extra turn
// (`pathTurn`): reorder the pieces, or spin one, and the sync keeps that while
// it rebuilds their content from the template. Deleting a piece shortens the
// run (CanvasView.ViewModel's deleteSelected lowers the count). Everything
// else about a copy belongs to the template — edits made with a copy selected
// are redirected there, so changing any piece changes them all.

import { guidePolyline, measurePolyline, pathGuideOf } from './pathFlow'
import { findNode, findParent, groupNodes, replaceNodeById, type MeasuredRects } from './doc'
import { isFrameNode, type CanvasDoc, type CanvasFrameNode, type CanvasNode, type NodeId } from './types'

/** Most copies a pattern will make — a guard against a typo'd 100000. */
export const MAX_PATTERN = 500

/** The derived id of a template's `n`th copy (n ≥ 1). */
export function copyId(id: NodeId, n: number): NodeId {
  return `${id}~${n}`
}

/** True for a node the pattern made — its content always comes from the template. */
export function isPatternCopy(node: CanvasNode): boolean {
  return !!node.repeatOf
}

/** The pattern's template: the first child that is neither the guide nor a copy. */
export function patternTemplateOf(frame: CanvasFrameNode): CanvasNode | null {
  const guide = pathGuideOf(frame)
  return frame.children.find((c) => c !== guide && !c.repeatOf && !c.hidden) ?? null
}

/** A deep copy of `node` with every id derived for copy `n`. */
function cloneAs(node: CanvasNode, n: number): CanvasNode {
  const out = { ...node, id: copyId(node.id, n) } as CanvasNode
  if (isFrameNode(node)) (out as CanvasFrameNode).children = node.children.map((c) => cloneAs(c, n))
  return out
}

/**
 * How many items the run should hold: the fixed count, or — for `fill` —
 * as many as fit along the guide at the template's width plus the gap.
 */
export function patternCount(frame: CanvasFrameNode, template: CanvasNode): number {
  const repeat = frame.style.alongPath?.repeat
  if (repeat === undefined) return 1
  if (repeat === 'fill') {
    const guide = pathGuideOf(frame)
    if (!guide) return 1
    const { points, closed } = guidePolyline(guide)
    const length = measurePolyline(points, closed).length - (frame.style.alongPath?.offset ?? 0)
    const step = template.rect.w + (frame.style.gap ?? 0)
    if (step <= 0 || length <= 0) return 1
    // A closed path's last item would land on the first; an open one fits one more end to end.
    const fit = closed ? Math.floor(length / step) : Math.floor((length + (frame.style.gap ?? 0)) / step)
    return Math.min(MAX_PATTERN, Math.max(1, fit))
  }
  return Math.min(MAX_PATTERN, Math.max(1, Math.round(repeat)))
}

// ── Keeping copies current, cheaply ────────────────────────────────────────
//
// A copy is current when it has the template's shape — everything except where
// the layout put it (x/y, rotation) and its derived ids. That shape is reduced
// to a string KEY, computed once per template object; each copy remembers the
// key it was built from. So deciding "is this copy still right?" is a string
// compare, and a re-flow that only moved things rebuilds nothing.

const templateKeys = new WeakMap<CanvasNode, string>()
const builtKeys = new WeakMap<CanvasNode, string>()

/** A node's shape as a string: layout-written fields and copy suffixes removed. */
function shapeKey(node: CanvasNode): string {
  const strip = (n: CanvasNode): unknown => ({
    ...n,
    id: n.id.replace(/~\d+$/, ''),
    repeatOf: undefined,
    pathTurn: undefined,
    rect: { w: n.rect.w, h: n.rect.h },
    style: { ...n.style, rotate: undefined },
    ...(isFrameNode(n) ? { children: n.children.map(strip) } : {}),
  })
  return JSON.stringify(strip(node))
}

function keyOfTemplate(template: CanvasNode): string {
  let key = templateKeys.get(template)
  if (key === undefined) {
    key = shapeKey(template)
    templateKeys.set(template, key)
  }
  return key
}

/** Whether `copy` matches the template's current shape — remembered on the copy object. */
function isCurrent(copy: CanvasNode, key: string): boolean {
  let built = builtKeys.get(copy)
  if (built === undefined) {
    built = shapeKey(copy)
    builtKeys.set(copy, built)
  }
  return built === key
}

/** Called when the layout replaces a copy with a moved one, so the new object keeps its key. */
export function carryPatternKey(from: CanvasNode, to: CanvasNode): void {
  const key = builtKeys.get(from)
  if (key !== undefined) builtKeys.set(to, key)
}

/**
 * Brings a path frame's copies in line with its template and count: trims the
 * end of the run, adds pieces at the end, rebuilds any whose template changed —
 * keeping every piece's slot in the run and its own turn. Returns the same
 * frame when nothing needed doing.
 */
export function syncPattern(frame: CanvasFrameNode): CanvasFrameNode {
  const opts = frame.style.alongPath
  const existingCopies = frame.children.filter(isPatternCopy)
  const template = opts ? patternTemplateOf(frame) : null
  if (!opts || !template || opts.repeat === undefined) {
    // Pattern turned off (or no template): drop any copies it left behind.
    return existingCopies.length === 0 ? frame : { ...frame, children: frame.children.filter((c) => !isPatternCopy(c)) }
  }

  const count = patternCount(frame, template)
  const key = keyOfTemplate(template)
  const isRun = (c: CanvasNode) => c === template || c.repeatOf === template.id
  // A copy left over from a previous template (the old one was deleted or
  // moved down) has nothing to do with this one.
  let changed = existingCopies.some((c) => c.repeatOf !== template.id)

  // The run as it stands, in its own order — which the user may have changed.
  let run = frame.children.filter(isRun)
  // Too many: the pieces at the end of the run go.
  while (run.length > count) {
    const last = [...run].reverse().find((c) => c !== template)!
    run = run.filter((c) => c !== last)
    changed = true
  }
  // Stale copies are rebuilt in place, keeping their id, slot and turn.
  run = run.map((c) => {
    if (c === template || isCurrent(c, key)) return c
    changed = true
    const n = Number(/~(\d+)$/.exec(c.id)?.[1] ?? 1)
    const fresh = { ...cloneAs(template, n), repeatOf: template.id, pathTurn: c.pathTurn } as CanvasNode
    if (fresh.pathTurn === undefined) delete fresh.pathTurn
    builtKeys.set(fresh, key)
    return fresh
  })
  // Too few: new pieces join the end, numbered past the highest in use.
  let nextN = Math.max(0, ...run.map((c) => Number(/~(\d+)$/.exec(c.id)?.[1] ?? 0))) + 1
  while (run.length < count) {
    const fresh = { ...cloneAs(template, nextN), repeatOf: template.id } as CanvasNode
    delete fresh.pathTurn // a new piece starts square to the path
    builtKeys.set(fresh, key)
    run.push(fresh)
    nextN += 1
    changed = true
  }

  // Everything that isn't part of the run stays put; the run goes where its
  // first member was.
  const rest = frame.children.filter((c) => !isPatternCopy(c) && c !== template)
  const firstAt = frame.children.findIndex(isRun)
  const restBefore = frame.children.slice(0, firstAt).filter((c) => rest.includes(c)).length
  const children = [...rest.slice(0, restBefore), ...run, ...rest.slice(restBefore)]
  if (!changed && children.every((c, i) => c === frame.children[i])) return frame
  return { ...frame, children }
}

/**
 * Of two selected layers, which is the path and which the piece repeated along
 * it — or null when neither can be a path. A pen path wins; else the only
 * vector; else the bigger vector (a ring around a dot, not the reverse).
 */
export function pathAndPiece(nodes: CanvasNode[]): { path: CanvasNode; piece: CanvasNode } | null {
  if (nodes.length !== 2) return null
  const [a, b] = nodes
  const isPen = (n: CanvasNode) => n.kind === 'vector' && (n as { shape?: string }).shape === 'path'
  if (isPen(a) !== isPen(b)) return isPen(a) ? { path: a, piece: b } : { path: b, piece: a }
  const vectors = nodes.filter((n) => n.kind === 'vector')
  if (vectors.length === 0) return null
  if (vectors.length === 1) return { path: vectors[0], piece: vectors[0] === a ? b : a }
  return a.rect.w * a.rect.h >= b.rect.w * b.rect.h ? { path: a, piece: b } : { path: b, piece: a }
}

/**
 * "Pattern along path": wraps a path and a piece into an along-path frame that
 * repeats the piece down the path, turned to follow it — one gesture instead
 * of knowing that the bottom-most vector is the guide and the first layer
 * after it repeats. The two must share a parent.
 */
export function makePathPattern(
  doc: CanvasDoc,
  ids: NodeId[],
  measured?: MeasuredRects,
): { doc: CanvasDoc; frameId: NodeId | null } {
  const nodes = ids.map((id) => findNode(doc, id)).filter((n): n is CanvasNode => !!n)
  const roles = pathAndPiece(nodes)
  if (!roles || findParent(doc, roles.path.id)?.id !== findParent(doc, roles.piece.id)?.id) return { doc, frameId: null }
  const grouped = groupNodes(doc, [roles.path.id, roles.piece.id], 'Pattern', measured)
  if (!grouped.groupId) return { doc, frameId: null }
  const group = findNode(grouped.doc, grouped.groupId)
  if (!group || !isFrameNode(group)) return { doc, frameId: null }
  // The guide is the frame's bottom-most vector, so the path goes first.
  const path = group.children.find((c) => c.id === roles.path.id)!
  const piece = group.children.find((c) => c.id === roles.piece.id)!
  const pattern: CanvasFrameNode = {
    ...group,
    style: { ...group.style, alongPath: { spacing: 'even', repeat: 8, orient: true } },
    children: [path, piece],
  }
  return { doc: replaceNodeById(grouped.doc, group.id, pattern), frameId: group.id }
}
