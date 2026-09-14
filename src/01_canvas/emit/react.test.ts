import { describe, it, expect } from 'vitest'
import {
  collectImports,
  componentFileName,
  componentSymbol,
  emitComponentFile,
  emitPropsInterface,
  emitRegionBody,
  propsInterfaceName,
  type EmitContext,
} from './react'
import { extractRegion } from './region'
import { addVariant, createComponentFromFrame, findComponent } from '../model/variants'
import { createDoc, createFrameNode, insertNode } from '../model/doc'
import type { CanvasComponent, CanvasDoc, CanvasFrameNode } from '../model/types'

const FILE_PATH = 'src/components/card/card.tsx'

function ctxFor(doc: CanvasDoc, filePath = FILE_PATH): EmitContext {
  return { filePath, components: doc.components }
}

/** A component whose root is a vertical stack containing one text node. */
function cardComponent(): { doc: CanvasDoc; component: CanvasComponent } {
  let doc = createDoc('board')
  const frame = createFrameNode({ x: 20, y: 30, w: 240, h: 120 }, 'Card')
  doc = insertNode(doc, frame, null)
  const promoted = createComponentFromFrame(doc, frame)
  return { doc: promoted.doc, component: promoted.component }
}

describe('naming', () => {
  it('exports the component name without an MVVM role suffix', () => {
    expect(componentSymbol('Card')).toBe('Card')
    expect(componentSymbol('primary button')).toBe('PrimaryButton')
    expect(propsInterfaceName('Card')).toBe('CardProps')
    expect(componentFileName('primary button')).toBe('primaryButton.tsx')
  })
})

describe('emitPropsInterface', () => {
  it('emits an empty interface for a component with no props', () => {
    const { component } = cardComponent()
    expect(emitPropsInterface(component)).toBe('export interface CardProps {}')
  })

  it('emits a union type for an enum prop, which is what makes variants self-documenting', () => {
    const { doc, component } = cardComponent()
    const next = addVariant(doc, component.id, 'Hover')
    const withVariants = findComponent(next, component.id)!
    const output = emitPropsInterface(withVariants)
    expect(output).toContain("state?: 'default' | 'hover'")
  })

  it('marks required props as required and carries the description as a doc comment', () => {
    const { component } = cardComponent()
    const withProps: CanvasComponent = {
      ...component,
      props: [
        { id: 'p1', name: 'title', type: 'string', required: true, description: 'Heading text' },
        { id: 'p2', name: 'count', type: 'number' },
        { id: 'p3', name: 'open', type: 'boolean' },
      ],
    }
    const output = emitPropsInterface(withProps)
    expect(output).toContain('/** Heading text */')
    expect(output).toContain('title: string')
    expect(output).toContain('count?: number')
    expect(output).toContain('open?: boolean')
  })
})

describe('emitRegionBody', () => {
  it('emits a single bare return for a one-variant component', () => {
    const { doc, component } = cardComponent()
    const body = emitRegionBody(component, ctxFor(doc))
    expect(body.startsWith('return (')).toBe(true)
    expect(body).not.toContain('if (')
    expect(body).toContain('<div style={')
  })

  it('emits an if-chain over the variant prop, defaulting to the bare return', () => {
    const { doc, component } = cardComponent()
    const next = addVariant(doc, component.id, 'Hover')
    const withVariants = findComponent(next, component.id)!
    const body = emitRegionBody(withVariants, ctxFor(next))

    expect(body).toContain("if (state === 'hover') {")
    // The default variant is the fall-through, so it comes last and unguarded.
    const lastReturn = body.lastIndexOf('return (')
    expect(body.slice(lastReturn - 2, lastReturn)).not.toContain('if')
  })

  it('drops x/y for children of an auto-layout parent, so no absolute soup is emitted', () => {
    let doc = createDoc('board')
    const parent = createFrameNode({ x: 0, y: 0, w: 200, h: 100 }, 'Stack')
    doc = insertNode(doc, parent, null)
    doc = insertNode(doc, createFrameNode({ x: 17, y: 43, w: 50, h: 20 }, 'Child'), parent.id)

    // Give the parent a flow, which hands placement to the layout.
    const stacked = doc.nodes[0] as CanvasFrameNode
    const withFlow: CanvasFrameNode = { ...stacked, style: { ...stacked.style, flow: 'vertical', gap: 8 } }
    let next = { ...doc, nodes: [withFlow] }
    const promoted = createComponentFromFrame(next, withFlow)
    next = promoted.doc

    const body = emitRegionBody(promoted.component, ctxFor(next))
    expect(body).toContain("flexDirection: 'column'")
    expect(body).toContain("gap: '8px'")
    // The child's own coordinates never reach the output.
    expect(body).not.toContain('left: 17')
    expect(body).not.toContain('top: 43')
    expect(body).not.toContain("position: 'absolute'")
  })

  it('keeps absolute placement for children of a freeform parent', () => {
    let doc = createDoc('board')
    const parent = createFrameNode({ x: 0, y: 0, w: 200, h: 100 }, 'Free')
    doc = insertNode(doc, parent, null)
    doc = insertNode(doc, createFrameNode({ x: 17, y: 43, w: 50, h: 20 }, 'Child'), parent.id)
    const promoted = createComponentFromFrame(doc, doc.nodes[0] as CanvasFrameNode)

    const body = emitRegionBody(promoted.component, ctxFor(promoted.doc))
    expect(body).toContain('left: 17')
    expect(body).toContain('top: 43')
  })

  it('emits an instance as a real call site rather than an inlined copy', () => {
    // Two components; the second contains an instance of the first.
    const first = cardComponent()
    let doc = first.doc
    const outer = createFrameNode({ x: 300, y: 0, w: 400, h: 300 }, 'Page')
    doc = insertNode(doc, outer, null)
    // Move the existing instance of Card inside the new frame.
    const instance = doc.nodes.find((n) => n.kind === 'instance')!
    doc = {
      ...doc,
      nodes: doc.nodes
        .filter((n) => n.id !== instance.id)
        .map((n) => (n.id === outer.id ? { ...(n as CanvasFrameNode), children: [instance] } : n)),
    }
    const page = createComponentFromFrame(doc, doc.nodes.find((n) => n.id === outer.id) as CanvasFrameNode)

    const body = emitRegionBody(page.component, ctxFor(page.doc))
    expect(body).toContain('<Card />')
    // The card's own div tree is NOT inlined into the page.
    expect(body.match(/<div/g)!.length).toBe(1)
  })

  it('passes variant values through as props on an instance call site', () => {
    const first = cardComponent()
    const withVariant = addVariant(first.doc, first.component.id, 'Hover')
    const component = findComponent(withVariant, first.component.id)!

    const instance = withVariant.nodes.find((n) => n.kind === 'instance')!
    const doc: CanvasDoc = {
      ...withVariant,
      nodes: withVariant.nodes.map((n) =>
        n.id === instance.id ? { ...n, variantValues: { state: 'hover' } } : n,
      ),
    }
    const outer = createFrameNode({ x: 0, y: 0, w: 100, h: 100 }, 'Wrap')
    const wrapped: CanvasDoc = {
      ...doc,
      nodes: [{ ...outer, children: [doc.nodes.find((n) => n.id === instance.id)!] } as CanvasFrameNode],
    }
    const page = createComponentFromFrame(wrapped, wrapped.nodes[0] as CanvasFrameNode)

    const body = emitRegionBody(page.component, {
      filePath: FILE_PATH,
      components: [...page.doc.components, component],
    })
    expect(body).toContain(`<Card state='hover' />`)
  })
})

describe('collectImports', () => {
  it('imports nothing for a self-contained component — the output has no dependencies', () => {
    const { doc, component } = cardComponent()
    expect(collectImports(component, ctxFor(doc))).toEqual([])
  })

  it('imports a dropped-in workspace component with a correct relative path', () => {
    const { doc, component } = cardComponent()
    const withExternal: CanvasComponent = {
      ...component,
      variants: [
        {
          ...component.variants[0],
          root: {
            ...component.variants[0].root,
            children: [
              {
                id: 'ext1',
                name: 'Button',
                kind: 'external',
                rect: { x: 0, y: 0, w: 80, h: 24 },
                style: {},
                filePath: 'src/app/UIKit/Button/Button.tsx',
                exportName: 'Button',
              },
            ],
          },
        },
      ],
    }
    const imports = collectImports(withExternal, ctxFor(doc))
    expect(imports).toEqual([`import { Button } from '../../app/UIKit/Button/Button'`])
  })
})

describe('emitComponentFile', () => {
  it('produces a complete, region-delimited file', () => {
    const { doc, component } = cardComponent()
    const file = emitComponentFile(component, ctxFor(doc), 'h1')

    expect(file.fileName).toBe('card.tsx')
    expect(file.content).toContain('export interface CardProps {}')
    expect(file.content).toContain('export const Card = ({}: CardProps) => {')
    expect(file.content).toContain(`// <sleipnir:layout component="${component.id}" hash="h1">`)
    expect(file.content).toContain('// </sleipnir:layout>')
    expect(file.content.endsWith('}\n')).toBe(true)
  })

  it('emits a region the splicer can find and read back', () => {
    const { doc, component } = cardComponent()
    const file = emitComponentFile(component, ctxFor(doc), 'h1')
    const region = extractRegion(file.content)!

    expect(region).not.toBeNull()
    expect(region.componentId).toBe(component.id)
    expect(region.hash).toBe('h1')
    // The extracted inner content is exactly what the emitter produced.
    expect(region.inner).toBe(emitRegionBody(component, ctxFor(doc)))
  })

  it('gives variant props defaults in the destructured parameter list', () => {
    const { doc, component } = cardComponent()
    const next = addVariant(doc, component.id, 'Hover')
    const withVariants = findComponent(next, component.id)!
    const file = emitComponentFile(withVariants, ctxFor(next), 'h')
    expect(file.content).toContain(`export const Card = ({ state = 'default' }: CardProps) => {`)
  })

  it('is deterministic — the same component emits byte-identical output', () => {
    const { doc, component } = cardComponent()
    const a = emitComponentFile(component, ctxFor(doc), 'h')
    const b = emitComponentFile(component, ctxFor(doc), 'h')
    expect(a.content).toBe(b.content)
  })
})
