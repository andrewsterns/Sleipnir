// Copy/paste of canvas nodes — within a board and between boards.
//
// The payload is the copied subtrees plus every component they use, as JSON on
// the system clipboard, so pasting works into any board (or another window)
// with no shared in-memory state.
//
// The hard part is components. A component belongs to exactly one board: that
// board claims its file (see stagedFiles.ts — a component on a board ⇔ its
// file in `.canvas`), and deleting it there deletes the file. So pasting an
// instance into a board that doesn't own its component must NOT copy the
// definition in, or two boards would claim one file and either could delete it
// out from under the other. Instead the instance becomes an external node: a
// reference to the component's file in the workspace, which emits as a real
// import + call site and renders live from the owning board (see
// useLinkedComponents). Edit the component on its own board and every pasted
// use follows — the connection to the workspace component is kept, not copied.

import { componentSymbol } from '../emit/react'
import { boardRectOf, findNode, isDescendant, type MeasuredRects } from './doc'
import { cloneTree, resolveVariant } from './variants'
import {
  isFrameNode,
  isInstanceNode,
  type CanvasComponent,
  type CanvasDoc,
  type CanvasExternalNode,
  type CanvasInstanceNode,
  type CanvasNode,
  type CanvasPropValue,
  type CanvasRect,
  type NodeId,
} from './types'

const MARKER = 'sleipnir-canvas-clipboard/v1'

export interface CanvasClipboard {
  marker: typeof MARKER
  /** The board copied from — pasting back into it offsets rather than stacking exactly on top. */
  sourceDocId: string
  /** Topmost copied nodes, each with its rect in BOARD space. */
  nodes: CanvasNode[]
  /** Every component the copied nodes use, directly or through other components. */
  components: CanvasComponent[]
}

/** The ids that are selected and have no selected ancestor — copying a frame already carries its children. */
export function topmostIds(doc: CanvasDoc, ids: Iterable<NodeId>): NodeId[] {
  const all = [...ids].filter((id) => findNode(doc, id))
  return all.filter((id) => !all.some((other) => other !== id && isDescendant(doc, other, id)))
}

function instancesIn(node: CanvasNode, out: CanvasInstanceNode[] = []): CanvasInstanceNode[] {
  if (isInstanceNode(node)) out.push(node)
  if (isFrameNode(node)) for (const child of node.children) instancesIn(child, out)
  return out
}

/** `ids`' components, plus the components those components' variants use, and so on. */
function componentsUsedBy(doc: CanvasDoc, roots: CanvasNode[]): CanvasComponent[] {
  const found = new Map<string, CanvasComponent>()
  const queue = roots.flatMap((n) => instancesIn(n))
  while (queue.length > 0) {
    const inst = queue.pop()!
    if (found.has(inst.componentId)) continue
    const component = doc.components.find((c) => c.id === inst.componentId)
    if (!component) continue
    found.set(component.id, component)
    for (const variant of component.variants) queue.push(...instancesIn(variant.root))
  }
  return [...found.values()]
}

export function copyPayload(doc: CanvasDoc, ids: Iterable<NodeId>, measured?: MeasuredRects): CanvasClipboard | null {
  const nodes: CanvasNode[] = []
  for (const id of topmostIds(doc, ids)) {
    const node = findNode(doc, id)
    const rect = boardRectOf(doc, id, measured)
    if (node && rect) nodes.push({ ...node, rect: { ...node.rect, x: rect.x, y: rect.y } })
  }
  if (nodes.length === 0) return null
  return { marker: MARKER, sourceDocId: doc.id, nodes, components: componentsUsedBy(doc, nodes) }
}

export function serializeClipboard(payload: CanvasClipboard): string {
  return JSON.stringify(payload)
}

/** The payload, or null for any text that isn't one (pasting ordinary text is not a canvas paste). */
export function parseClipboard(text: string): CanvasClipboard | null {
  if (!text.includes(MARKER)) return null
  try {
    const parsed = JSON.parse(text) as CanvasClipboard
    if (parsed?.marker !== MARKER || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.components)) return null
    return parsed
  } catch {
    return null
  }
}

/** An instance as a reference to its component's file — see the header. */
export function externalFromInstance(inst: CanvasInstanceNode, component: CanvasComponent): CanvasExternalNode {
  // Variant choices and prop overrides both become plain props at the call
  // site, exactly as emit/react.ts writes an instance.
  const propValues: Record<string, CanvasPropValue> = { ...(inst.variantValues ?? {}) }
  for (const [propId, value] of Object.entries(inst.overrides ?? {})) {
    const prop = component.props.find((p) => p.id === propId)
    if (prop) propValues[prop.name] = value
  }
  const external: CanvasExternalNode = {
    id: inst.id,
    name: inst.name,
    kind: 'external',
    rect: inst.rect,
    style: inst.style,
    filePath: component.filePath!,
    exportName: componentSymbol(component.name),
    knownProps: component.props,
  }
  if (inst.hidden) external.hidden = true
  if (inst.locked) external.locked = true
  if (Object.keys(propValues).length > 0) external.propValues = propValues
  return external
}

export interface PasteResult {
  /** The pasted nodes, fresh ids, rects still in board space — the caller places them. */
  nodes: CanvasNode[]
  /** Components the target board didn't have and that have no file to link to, so they come along as definitions. */
  components: CanvasComponent[]
}

/**
 * Adapts a payload to the board it's being pasted into. An instance whose
 * component the target already holds stays an instance (same board, or a
 * component pasted earlier). One whose component lives elsewhere becomes an
 * external node pointing at that component's file. Only a component that was
 * never written — no file to point at — is copied in as a definition, which
 * can't collide with anyone's file because it has none.
 */
export function adaptForTarget(target: CanvasDoc, payload: CanvasClipboard): PasteResult {
  const byId = new Map(payload.components.map((c) => [c.id, c]))
  const owned = new Set(target.components.map((c) => c.id))
  const brought = new Map<string, CanvasComponent>()

  const adapt = (node: CanvasNode): CanvasNode => {
    if (isInstanceNode(node)) {
      if (owned.has(node.componentId) || brought.has(node.componentId)) return node
      const component = byId.get(node.componentId)
      if (!component) return node // renders as "Missing component", as it would have at the source
      if (component.filePath) return externalFromInstance(node, component)
      // Reserve the id before walking the variants, so a component that uses
      // itself can't recurse forever.
      brought.set(component.id, component)
      brought.set(component.id, {
        ...component,
        variants: component.variants.map((v) => ({ ...v, root: adapt(v.root) as typeof v.root })),
      })
      return node
    }
    if (isFrameNode(node)) {
      const children = node.children.map(adapt)
      return children.some((c, i) => c !== node.children[i]) ? { ...node, children } : node
    }
    return node
  }

  const nodes = payload.nodes.map((n) => cloneTree(adapt(n)))
  return { nodes, components: [...brought.values()] }
}

/** The variant choices among an external node's prop values — the ones that pick which variant it shows. */
export function variantValuesOf(component: CanvasComponent, propValues: CanvasExternalNode['propValues']): Record<string, string> {
  const names = new Set(component.props.filter((p) => component.variantPropIds.includes(p.id)).map((p) => p.name))
  const values: Record<string, string> = {}
  for (const [name, value] of Object.entries(propValues ?? {})) {
    if (names.has(name) && typeof value === 'string') values[name] = value
  }
  return values
}

/**
 * Figma's "Detach instance" for a linked component: its current tree, copied
 * onto this board as plain local layers that can be edited freely — at the
 * cost of no longer following the component. Instances inside it go through
 * the same adaptation a paste does, so they stay linked where they can.
 */
export function detachedCopy(
  target: CanvasDoc,
  node: CanvasExternalNode,
  component: CanvasComponent,
  components: CanvasComponent[],
): PasteResult {
  const variant = resolveVariant(component, variantValuesOf(component, node.propValues))
  const root: CanvasNode = { ...variant.root, name: node.name, rect: { ...node.rect } }
  return adaptForTarget(target, { marker: MARKER, sourceDocId: '', nodes: [root], components })
}

/** The union of `rects`. */
export function unionRect(rects: CanvasRect[]): CanvasRect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return { x, y, w: right - x, h: bottom - y }
}
