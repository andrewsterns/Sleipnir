import { describe, it, expect } from 'vitest'
import {
  addVariant,
  cloneTree,
  createComponentFromFrame,
  deleteComponent,
  findComponent,
  instancesOf,
  removeVariant,
  renameVariant,
  resolveVariant,
  setVariantRoot,
  toIdentifier,
  updateComponent,
} from './variants'
import { createDoc, createFrameNode, findNode, insertNode } from './doc'
import { DEFAULT_COMPONENT_ROOT } from './paths'
import { isInstanceNode, type CanvasDoc, type CanvasFrameNode } from './types'

function boardWithFrame() {
  const frame = createFrameNode({ x: 40, y: 60, w: 200, h: 120 }, 'Card')
  const child = createFrameNode({ x: 8, y: 8, w: 100, h: 24 }, 'Title')
  let doc = createDoc('board')
  doc = insertNode(doc, frame, null)
  doc = insertNode(doc, child, frame.id)
  return { doc, frame: findNode(doc, frame.id) as CanvasFrameNode }
}

function promote(doc: CanvasDoc, frame: CanvasFrameNode) {
  return createComponentFromFrame(doc, frame)
}

describe('toIdentifier', () => {
  it('produces a valid code identifier from a display name', () => {
    expect(toIdentifier('Default')).toBe('default')
    expect(toIdentifier('In Progress')).toBe('inProgress')
    expect(toIdentifier('hover-state')).toBe('hoverState')
    expect(toIdentifier('  Disabled  ')).toBe('disabled')
  })

  it('never emits something that cannot be an identifier', () => {
    expect(toIdentifier('2xl')).toBe('v2xl') // may not lead with a digit
    expect(toIdentifier('')).toBe('value')
    expect(toIdentifier('!!!')).toBe('value')
  })
})

describe('createComponentFromFrame', () => {
  it('replaces the frame with an instance at the same rect', () => {
    const { doc, frame } = boardWithFrame()
    const result = promote(doc, frame)

    const replacement = result.doc.nodes.find((n) => n.id === result.instanceId)!
    expect(isInstanceNode(replacement)).toBe(true)
    expect(replacement.rect).toEqual(frame.rect)
    expect(findNode(result.doc, frame.id)).toBeNull()
  })

  it('keeps the frame subtree as the default variant, normalized to the origin', () => {
    const { doc, frame } = boardWithFrame()
    const { component } = promote(doc, frame)

    expect(component.variants).toHaveLength(1)
    expect(component.variants[0].name).toBe('Default')
    expect(component.variants[0].root.rect.x).toBe(0)
    expect(component.variants[0].root.rect.y).toBe(0)
    // The child came along.
    expect(component.variants[0].root.children).toHaveLength(1)
    expect(component.variants[0].root.children[0].name).toBe('Title')
  })

  it('defaults to the sandboxed component root and live sync', () => {
    const { doc, frame } = boardWithFrame()
    const { component } = promote(doc, frame)
    expect(component.componentRoot).toBe(DEFAULT_COMPONENT_ROOT)
    expect(component.sync).toBe('live')
    expect(component.target).toBe('react')
    expect(component.filePath).toBeUndefined()
  })

  it('does not mutate the input doc', () => {
    const { doc, frame } = boardWithFrame()
    const snapshot = JSON.stringify(doc)
    promote(doc, frame)
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('promotes a nested frame in place, leaving it inside its parent', () => {
    const { doc, frame } = boardWithFrame()
    const child = frame.children[0] as CanvasFrameNode
    const result = createComponentFromFrame(doc, child)

    const parent = findNode(result.doc, frame.id) as CanvasFrameNode
    expect(parent.children).toHaveLength(1)
    expect(parent.children[0].id).toBe(result.instanceId)
  })
})

describe('addVariant', () => {
  it('creates the discriminating prop on the first added variant', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!

    expect(component.variants).toHaveLength(2)
    expect(component.variantPropIds).toHaveLength(1)

    const prop = component.props.find((p) => p.id === component.variantPropIds[0])!
    expect(prop.name).toBe('state')
    expect(prop.type).toBe('enum')
    expect(prop.options).toEqual(['default', 'hover'])
    expect(prop.defaultValue).toBe('default')
  })

  it('gives the pre-existing default variant an explicit value for the new prop', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!

    expect(component.variants[0].values).toEqual({ state: 'default' })
    expect(component.variants[1].values).toEqual({ state: 'hover' })
  })

  it('extends the existing prop rather than creating a second one', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    let next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    next = addVariant(next, promoted.component.id, 'Disabled')
    const component = findComponent(next, promoted.component.id)!

    expect(component.variants).toHaveLength(3)
    expect(component.variantPropIds).toHaveLength(1)
    expect(component.props).toHaveLength(1)
    expect(component.props[0].options).toEqual(['default', 'hover', 'disabled'])
  })

  it('copies a tree so a new variant starts from something, with independent ids', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!

    const [base, hover] = component.variants
    expect(hover.root.children).toHaveLength(1)
    expect(hover.root.id).not.toBe(base.root.id)
    expect(hover.root.children[0].id).not.toBe(base.root.children[0].id)
  })
})

describe('removeVariant', () => {
  it('refuses to remove the last variant — a component always renders something', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const variantId = promoted.component.variants[0].id
    const next = removeVariant(promoted.doc, promoted.component.id, variantId)
    expect(findComponent(next, promoted.component.id)!.variants).toHaveLength(1)
  })

  it('removes a variant and retires its option from the union type', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    let next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!
    next = removeVariant(next, component.id, component.variants[1].id)

    const after = findComponent(next, component.id)!
    expect(after.variants).toHaveLength(1)
    expect(after.props[0].options).toEqual(['default'])
  })
})

describe('renameVariant', () => {
  it('renames the variant and keeps its prop value and option in step', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    let next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!
    next = renameVariant(next, component.id, component.variants[1].id, 'Pressed')

    const after = findComponent(next, component.id)!
    expect(after.variants[1].name).toBe('Pressed')
    expect(after.variants[1].values).toEqual({ state: 'pressed' })
    expect(after.props[0].options).toEqual(['default', 'pressed'])
  })

  it('ignores an empty name rather than producing an unnamed variant', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const id = promoted.component.variants[0].id
    const next = renameVariant(promoted.doc, promoted.component.id, id, '   ')
    expect(findComponent(next, promoted.component.id)!.variants[0].name).toBe('Default')
  })
})

describe('resolveVariant', () => {
  it('falls back to the default for no values or an unknown combination', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!

    expect(resolveVariant(component, undefined).name).toBe('Default')
    expect(resolveVariant(component, {}).name).toBe('Default')
    expect(resolveVariant(component, { state: 'nonsense' }).name).toBe('Default')
  })

  it('selects the matching variant', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!
    expect(resolveVariant(component, { state: 'hover' }).name).toBe('Hover')
  })
})

describe('setVariantRoot / updateComponent', () => {
  it('replaces one variant tree without touching the others', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    let next = addVariant(promoted.doc, promoted.component.id, 'Hover')
    const component = findComponent(next, promoted.component.id)!

    const replacement = createFrameNode({ x: 0, y: 0, w: 10, h: 10 }, 'Replaced')
    next = setVariantRoot(next, component.id, component.variants[1].id, replacement)

    const after = findComponent(next, component.id)!
    expect(after.variants[1].root.name).toBe('Replaced')
    expect(after.variants[0].root.name).toBe('Card')
  })

  it('patches component fields such as sync state and file path', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    const next = updateComponent(promoted.doc, promoted.component.id, {
      sync: 'ejected',
      ejectReason: 'Found a .map() in the layout region',
      filePath: 'src/components/card/cardView.tsx',
    })
    const after = findComponent(next, promoted.component.id)!
    expect(after.sync).toBe('ejected')
    expect(after.ejectReason).toContain('.map()')
    expect(after.filePath).toBe('src/components/card/cardView.tsx')
  })
})

describe('deleteComponent', () => {
  it('removes the definition and every instance of it', () => {
    const { doc, frame } = boardWithFrame()
    const promoted = promote(doc, frame)
    expect(instancesOf(promoted.doc, promoted.component.id)).toHaveLength(1)

    const next = deleteComponent(promoted.doc, promoted.component.id)
    expect(findComponent(next, promoted.component.id)).toBeNull()
    expect(instancesOf(next, promoted.component.id)).toHaveLength(0)
    expect(next.nodes).toHaveLength(0)
  })
})

describe('cloneTree', () => {
  it('deep-copies with fresh ids and no shared references', () => {
    const { frame } = boardWithFrame()
    const copy = cloneTree(frame)
    expect(copy.id).not.toBe(frame.id)
    expect(copy.children[0].id).not.toBe(frame.children[0].id)
    expect(copy.children).not.toBe(frame.children)
    expect(copy.name).toBe(frame.name)
  })
})
