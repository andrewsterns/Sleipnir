import { describe, it, expect } from 'vitest'
import { createDoc, createFrameNode, createVectorNode, groupNodes, insertNode } from '../model/doc'
import { createComponentFromFrame } from '../model/variants'
import type { CanvasDoc, CanvasFrameNode } from '../model/types'
import { collectImports, emitComponentFile, emitRegionBody } from './react'

const ctxFor = (doc: CanvasDoc) => ({ filePath: '.components/icon/icon.tsx', components: doc.components })

describe('vectors inside a div component', () => {
  it('emit as an inline svg positioned like any child', () => {
    let doc = createDoc('b')
    const frame = createFrameNode({ x: 0, y: 0, w: 200, h: 100 }, 'Card')
    doc = insertNode(doc, frame, null)
    doc = insertNode(doc, createVectorNode({ x: 10, y: 20, w: 30, h: 30 }, 'ellipse'), frame.id)
    const { doc: next, component } = createComponentFromFrame(doc, doc.nodes[0] as CanvasFrameNode)
    const body = emitRegionBody(component, ctxFor(next))
    expect(body).toContain('<svg width={30} height={30} viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" style={{')
    expect(body).toContain("position: 'absolute',")
    expect(body).toContain('<ellipse cx={15} cy={15} rx={15} ry={15} fill="#d9d9d9" />')
    // Still a div component: the card itself is a div.
    expect(body).toContain('<div style={{')
  })
})

describe('SVG components', () => {
  /** Two shapes grouped and promoted as an SVG component. */
  function svgComponent() {
    let doc = createDoc('b')
    const tri = createVectorNode({ x: 100, y: 100, w: 40, h: 40 }, 'polygon', { sides: 3 })
    const pen = createVectorNode({ x: 150, y: 110, w: 20, h: 20 }, 'path', {
      points: [{ x: 0, y: 0 }, { x: 20, y: 20, in: { x: 20, y: 0 } }],
      viewBox: { w: 20, h: 20 },
    })
    doc = insertNode(insertNode(doc, tri, null), pen, null)
    const grouped = groupNodes(doc, [tri.id, pen.id], 'Icon')
    const group = grouped.doc.nodes.find((n) => n.id === grouped.groupId) as CanvasFrameNode
    return createComponentFromFrame(grouped.doc, group, { name: 'Icon', format: 'svg' })
  }

  it('emit one svg whose children are shapes placed where they were drawn — no divs', () => {
    const { doc, component } = svgComponent()
    const body = emitRegionBody(component, ctxFor(doc))
    expect(body).not.toContain('<div')
    expect(body).toContain('<svg width={70} height={40} viewBox="0 0 70 40" fill="none" xmlns="http://www.w3.org/2000/svg">')
    expect(body).toContain('<polygon points="20,0 40,40 0,40" fill="#d9d9d9" />')
    expect(body).toContain('<path d="M 50 10 C 50 10 70 10 70 30" fill="none" stroke="#d9d9d9" strokeWidth={2} />')
  })

  it('write a complete, compilable-shaped file with the same props machinery', () => {
    const { doc, component } = svgComponent()
    const file = emitComponentFile(component, ctxFor(doc), 'h')
    expect(file.content).toContain('export type IconProps = Record<string, never>')
    expect(file.content).toContain('export const Icon = () => {')
    expect(file.content).toContain('  // <sleipnir:layout component=')
  })

  it('carry gradients in defs and image fills as imports, like any component', () => {
    const { doc, component } = svgComponent()
    const tri = component.variants[0].root.children[0]
    tri.style = {
      fills: [
        { type: 'linear', angle: 180, stops: [{ position: 0, color: '#ff0080' }, { position: 1, color: '#7928ca' }] },
        { type: 'image', src: '.components/assets/texture.png' },
      ],
    }
    const body = emitRegionBody(component, ctxFor(doc))
    expect(body).toContain('<defs>')
    expect(body).toContain(`<linearGradient id="${tri.id}-fill-0"`)
    expect(body).toContain('<image href={textureImage} width={40} height={40} preserveAspectRatio="xMidYMid slice" />')
    expect(collectImports(component, ctxFor(doc))).toEqual(["import textureImage from '../assets/texture.png'"])
  })

  it('turn a rotated shape about its own center, like the board does', () => {
    const { doc, component } = svgComponent()
    component.variants[0].root.children[0].style.rotate = 45
    expect(emitRegionBody(component, ctxFor(doc))).toContain('<g transform="rotate(45 20 20)">')
  })

  it("draw a pattern's item once and reuse it for every copy", () => {
    const { doc, component } = svgComponent()
    const root = component.variants[0].root
    const tri = root.children[0]
    const copy = { ...tri, id: `${tri.id}~1`, repeatOf: tri.id, rect: { ...tri.rect, x: tri.rect.x + 30 }, style: { ...tri.style, rotate: 90 } }
    root.children = [tri, copy, ...root.children.slice(1)]
    const body = emitRegionBody(component, ctxFor(doc))
    expect(body.match(/<polygon/g)).toHaveLength(1)
    expect(body).toContain(`<use href="#${tri.id}-item" transform="translate(30 0) rotate(90 20 20)" />`)
  })

  it('wrap a shape carrying effects in a group that holds them', () => {
    const { doc, component } = svgComponent()
    component.variants[0].root.children[0].style.effects = [{ type: 'drop-shadow', x: 0, y: 2, blur: 4, color: '#000000', opacity: 0.5 }]
    expect(emitRegionBody(component, ctxFor(doc))).toContain("filter: 'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.5))',")
  })

  it('leave out what isn\'t vector art, and say so', () => {
    const { doc, component } = svgComponent()
    component.variants[0].root.children.push({ id: 't', name: 'Label', kind: 'text', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, text: 'x' })
    expect(emitRegionBody(component, ctxFor(doc))).toContain('{/* Label: only vectors are drawn in an SVG component */}')
  })
})
