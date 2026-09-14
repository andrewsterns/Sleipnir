// Component and variant operations — pure and immutable, same contract as
// model/doc.ts (nothing here mutates its input; the undo stack holds references
// to previous docs).
//
// A component is a set of variants discriminated by enum props. That is Figma's
// model, and it is also exactly the shape the code wants: a variant prop becomes
// a union-typed prop, and each variant becomes one branch of a canonical `if`
// chain inside the canvas-owned region. Adding a variant here adds a branch
// there, and vice versa.

import { DEFAULT_COMPONENT_ROOT } from './paths'
import {
  isFrameNode,
  isInstanceNode,
  type CanvasComponent,
  type CanvasDoc,
  type CanvasFrameNode,
  type CanvasInstanceNode,
  type CanvasNode,
  type CanvasProp,
  type CanvasVariant,
  type CanvasTarget,
  type NodeId,
} from './types'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

/** The prop name that discriminates variants on a freshly promoted component. */
export const DEFAULT_VARIANT_PROP = 'state'
export const DEFAULT_VARIANT_NAME = 'Default'

/**
 * A valid identifier in the target language, derived from a display name.
 * 'In Progress' -> 'inProgress'. Used for prop names and variant values, both of
 * which land in real code.
 */
export function toIdentifier(name: string): string {
  const words = name.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (words.length === 0) return 'value'
  const [first, ...rest] = words
  const joined = first.toLowerCase() + rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')
  // An identifier may not lead with a digit.
  return /^[0-9]/.test(joined) ? `v${joined}` : joined
}

// ── Construction ───────────────────────────────────────────────────────────

/**
 * Promotes a frame into a main component.
 *
 * The frame's subtree becomes the component's default variant, and the frame is
 * replaced in place by an instance at the same rect — the operation Figma calls
 * "Create component". Returns the new doc plus the component and the instance
 * that replaced the original.
 */
export function createComponentFromFrame(
  doc: CanvasDoc,
  frame: CanvasFrameNode,
  options: { name?: string; target?: CanvasTarget; componentRoot?: string } = {},
): { doc: CanvasDoc; component: CanvasComponent; instanceId: NodeId } {
  const now = Date.now()
  const component: CanvasComponent = {
    id: nextId('cmp'),
    name: options.name?.trim() || frame.name || 'Component',
    variants: [
      {
        id: nextId('var'),
        name: DEFAULT_VARIANT_NAME,
        values: {},
        // The component's own root always sits at the origin: its placement is
        // the instance's business, not the definition's.
        root: { ...frame, rect: { ...frame.rect, x: 0, y: 0 } },
      },
    ],
    props: [],
    variantPropIds: [],
    target: options.target ?? 'react',
    componentRoot: options.componentRoot ?? DEFAULT_COMPONENT_ROOT,
    sync: 'live',
    createdAt: now,
    updatedAt: now,
  }

  const instance: CanvasInstanceNode = {
    id: nextId('inst'),
    name: component.name,
    kind: 'instance',
    rect: { ...frame.rect },
    style: {},
    componentId: component.id,
    overrides: {},
  }

  const nodes = replaceNode(doc.nodes, frame.id, instance)
  return {
    doc: { ...doc, nodes, components: [...doc.components, component], updatedAt: now },
    component,
    instanceId: instance.id,
  }
}

/** Rebuilds the tree with `id` swapped for `replacement`, preserving position. */
function replaceNode(nodes: CanvasNode[], id: NodeId, replacement: CanvasNode): CanvasNode[] {
  return nodes.map((node) => {
    if (node.id === id) return replacement
    if (isFrameNode(node)) return { ...node, children: replaceNode(node.children, id, replacement) }
    return node
  })
}

// ── Component lookup ───────────────────────────────────────────────────────

export function findComponent(doc: CanvasDoc, componentId: string): CanvasComponent | null {
  return doc.components.find((c) => c.id === componentId) ?? null
}

/** The variant an instance resolves to, falling back to the default. */
export function resolveVariant(
  component: CanvasComponent,
  values: Record<string, string> | undefined,
): CanvasVariant {
  if (!values || Object.keys(values).length === 0) return component.variants[0]
  const match = component.variants.find((variant) =>
    Object.entries(values).every(([key, value]) => variant.values[key] === value),
  )
  return match ?? component.variants[0]
}

export function variantById(component: CanvasComponent, variantId: string): CanvasVariant | null {
  return component.variants.find((v) => v.id === variantId) ?? null
}

// ── Component mutation ─────────────────────────────────────────────────────

function withComponent(
  doc: CanvasDoc,
  componentId: string,
  fn: (component: CanvasComponent) => CanvasComponent,
): CanvasDoc {
  const existing = findComponent(doc, componentId)
  if (!existing) return doc
  const next = { ...fn(existing), updatedAt: Date.now() }
  return {
    ...doc,
    components: doc.components.map((c) => (c.id === componentId ? next : c)),
    updatedAt: Date.now(),
  }
}

export function updateComponent(
  doc: CanvasDoc,
  componentId: string,
  patch: Partial<Omit<CanvasComponent, 'id' | 'variants'>>,
): CanvasDoc {
  return withComponent(doc, componentId, (component) => ({ ...component, ...patch }))
}

/**
 * Adds a variant, copying the tree of `fromVariantId` (or the default) so the
 * new state starts from something rather than an empty frame.
 *
 * The first variant added to a single-variant component also creates the
 * discriminating prop — you can't have two states without something to select
 * between them, and making the user create the prop first is a pointless step.
 */
export function addVariant(
  doc: CanvasDoc,
  componentId: string,
  name: string,
  fromVariantId?: string,
): CanvasDoc {
  return withComponent(doc, componentId, (component) => {
    const source = (fromVariantId && variantById(component, fromVariantId)) || component.variants[0]
    const trimmed = name.trim() || `Variant ${component.variants.length + 1}`

    let props = component.props
    let variantPropIds = component.variantPropIds
    let variants = component.variants

    if (variantPropIds.length === 0) {
      const prop: CanvasProp = {
        id: nextId('prop'),
        name: DEFAULT_VARIANT_PROP,
        type: 'enum',
        options: [toIdentifier(component.variants[0].name), toIdentifier(trimmed)],
        defaultValue: toIdentifier(component.variants[0].name),
      }
      props = [...props, prop]
      variantPropIds = [prop.id]
      // The existing default variant now needs an explicit value for the new prop.
      variants = variants.map((v, i) =>
        i === 0 ? { ...v, values: { ...v.values, [prop.name]: toIdentifier(v.name) } } : v,
      )
    } else {
      const propId = variantPropIds[0]
      props = props.map((p) =>
        p.id === propId
          ? { ...p, options: [...new Set([...(p.options ?? []), toIdentifier(trimmed)])] }
          : p,
      )
    }

    const discriminator = props.find((p) => p.id === variantPropIds[0])!
    const variant: CanvasVariant = {
      id: nextId('var'),
      name: trimmed,
      values: { [discriminator.name]: toIdentifier(trimmed) },
      root: cloneTree(source.root),
    }

    return { ...component, props, variantPropIds, variants: [...variants, variant] }
  })
}

/**
 * Removes a variant. Refuses to remove the last one — a component always has at
 * least one tree to render, and an empty component is not a state the rest of
 * the code should have to handle.
 */
export function removeVariant(doc: CanvasDoc, componentId: string, variantId: string): CanvasDoc {
  return withComponent(doc, componentId, (component) => {
    if (component.variants.length <= 1) return component
    const removed = variantById(component, variantId)
    if (!removed) return component
    const variants = component.variants.filter((v) => v.id !== variantId)

    // Drop the now-unused option from the discriminating prop so the emitted
    // union type doesn't advertise a variant that no longer exists.
    const propId = component.variantPropIds[0]
    const value = propId ? removed.values[component.props.find((p) => p.id === propId)?.name ?? ''] : undefined
    const props = component.props.map((p) =>
      p.id === propId && value ? { ...p, options: (p.options ?? []).filter((o) => o !== value) } : p,
    )

    return { ...component, variants, props }
  })
}

export function renameVariant(
  doc: CanvasDoc,
  componentId: string,
  variantId: string,
  name: string,
): CanvasDoc {
  return withComponent(doc, componentId, (component) => {
    const trimmed = name.trim()
    if (!trimmed) return component
    const propId = component.variantPropIds[0]
    const propName = component.props.find((p) => p.id === propId)?.name
    const nextValue = toIdentifier(trimmed)

    const variants = component.variants.map((v) =>
      v.id === variantId
        ? { ...v, name: trimmed, values: propName ? { ...v.values, [propName]: nextValue } : v.values }
        : v,
    )
    const old = variantById(component, variantId)
    const oldValue = old && propName ? old.values[propName] : undefined
    const props = component.props.map((p) =>
      p.id === propId && oldValue
        ? { ...p, options: (p.options ?? []).map((o) => (o === oldValue ? nextValue : o)) }
        : p,
    )
    return { ...component, variants, props }
  })
}

/** Replaces one variant's tree — how an edit on the board reaches the definition. */
export function setVariantRoot(
  doc: CanvasDoc,
  componentId: string,
  variantId: string,
  root: CanvasFrameNode,
): CanvasDoc {
  return withComponent(doc, componentId, (component) => ({
    ...component,
    variants: component.variants.map((v) => (v.id === variantId ? { ...v, root } : v)),
  }))
}

/**
 * True when dissolving this component back into a frame would lose nothing.
 *
 * The three things a component holds that a frame cannot are variants, props,
 * and the link between several instances. With one variant, no props, and a
 * single instance, a component is structurally identical to the frame it was
 * promoted from — so turning it back is a rename of the abstraction, not a
 * deletion of anything.
 *
 * Deliberately strict. This gates an automatic, undo-across-reload-proof
 * action, so "probably fine" is not good enough: anything richer is kept and
 * flagged for a human to decide about (see flattenComponent's own doc).
 */
export function isLosslessDowngrade(doc: CanvasDoc, componentId: string): boolean {
  const component = doc.components.find((c) => c.id === componentId)
  if (!component) return false
  if (component.variants.length !== 1) return false
  if (component.props.length > 0) return false
  return instancesOf(doc, componentId).length === 1
}

/**
 * Dissolves a component back into a plain frame, in place.
 *
 * The inverse of createComponentFromFrame: the sole instance is replaced by a
 * frame carrying the component's tree, keeping the instance's own position and
 * size so nothing jumps on the board. The component definition then goes.
 *
 * Only the single-instance case is meaningful — with several instances there is
 * no single "in place" to dissolve into, and each copy would silently stop
 * tracking the others. Callers gate on isLosslessDowngrade; this returns the
 * doc untouched rather than guessing when they don't.
 */
export function flattenComponent(doc: CanvasDoc, componentId: string): CanvasDoc {
  const component = doc.components.find((c) => c.id === componentId)
  if (!component) return doc
  const instances = instancesOf(doc, componentId)
  if (instances.length !== 1) return doc

  const instance = instances[0]
  const variantRoot = component.variants[0].root
  const frame: CanvasFrameNode = {
    ...variantRoot,
    id: instance.id,
    name: component.name,
    kind: 'frame',
    // The instance's placement wins: the component's own root always sits at
    // the origin (see createComponentFromFrame), so taking its rect would
    // teleport the frame to the top-left corner of the board.
    rect: { ...instance.rect },
    children: cloneTree(variantRoot).children,
  }

  const replace = (nodes: CanvasNode[]): CanvasNode[] =>
    nodes.map((node) => {
      if (isInstanceNode(node) && node.id === instance.id) return frame
      return isFrameNode(node) ? { ...node, children: replace(node.children) } : node
    })

  return {
    ...doc,
    nodes: replace(doc.nodes),
    components: doc.components.filter((c) => c.id !== componentId),
    updatedAt: Date.now(),
  }
}

/**
 * Deletes a component and every instance of it.
 *
 * Instances are removed rather than converted back into frames: an instance
 * carries no copy of the tree, so there is nothing to convert it into once the
 * definition is gone. Callers that want the tree back should detach first.
 */
export function deleteComponent(doc: CanvasDoc, componentId: string): CanvasDoc {
  const strip = (nodes: CanvasNode[]): CanvasNode[] =>
    nodes
      .filter((node) => !(isInstanceNode(node) && node.componentId === componentId))
      .map((node) => (isFrameNode(node) ? { ...node, children: strip(node.children) } : node))

  return {
    ...doc,
    nodes: strip(doc.nodes),
    components: doc.components.filter((c) => c.id !== componentId),
    updatedAt: Date.now(),
  }
}

/** Every instance node pointing at a component, anywhere in the board. */
export function instancesOf(doc: CanvasDoc, componentId: string): CanvasNode[] {
  const found: CanvasNode[] = []
  const step = (nodes: CanvasNode[]) => {
    for (const node of nodes) {
      if (isInstanceNode(node) && node.componentId === componentId) found.push(node)
      if (isFrameNode(node)) step(node.children)
    }
  }
  step(doc.nodes)
  return found
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deep copy with fresh ids, so a duplicated variant's nodes are independent. */
export function cloneTree<T extends CanvasNode>(node: T): T {
  if (isFrameNode(node)) {
    return { ...node, id: nextId('frame'), children: node.children.map((child) => cloneTree(child)) } as T
  }
  return { ...node, id: nextId(node.kind) }
}
