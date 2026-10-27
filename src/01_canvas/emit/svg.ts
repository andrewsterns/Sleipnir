// Vectors → SVG JSX.
//
// Two shapes of output, both from model/vector.ts's element descriptions:
//
//   - a vector inside an ordinary (div) component is its own inline <svg>,
//     positioned like any other child (emitInlineVector);
//   - an SVG component — made with MAKE SVG COMPONENT — is ONE <svg> for the
//     whole component: its root is the canvas, every vector in it a <path>,
//     <rect>, <ellipse> or <polygon> placed where it was drawn
//     (emitSvgVariantReturn).
//
// The second is what a person means by "an SVG component": something that can
// be dropped into markup, recolored, or exported as an .svg, rather than a
// stack of positioned divs that happens to look like an icon.

import type { ImageUrlResolver } from '../model/paint'
import { mergeCss, type CssProps } from '../model/toCss'
import { num, paintedShape, SVG_NS, vectorEffectsCss, vectorShape, vectorSvg, type Box, type SvgEl } from '../model/vector'
import { isFrameNode, isVectorNode, type CanvasNode, type CanvasVariant, type CanvasVectorNode } from '../model/types'
import { INDENT, jsxAttr, styleLiteral } from './shared'

/** A comment inside JSX, for something an SVG component can't hold. */
const COMMENT = '#comment'

/** One element description as JSX, children indented beneath it. */
export function svgElJsx(el: SvgEl, indent: string): string {
  if (el.tag === COMMENT) return `${indent}{/* ${el.attrs.text} */}`
  const parts = Object.entries(el.attrs).map(([name, value]) => jsxAttr(name, value))
  if (el.style && Object.keys(el.style).length > 0) parts.push(`style={${styleLiteral(el.style, indent)}}`)
  const open = `${indent}<${el.tag}${parts.length > 0 ? ` ${parts.join(' ')}` : ''}`
  if (!el.children || el.children.length === 0) return `${open} />`
  return `${open}>\n${el.children.map((child) => svgElJsx(child, indent + INDENT)).join('\n')}\n${indent}</${el.tag}>`
}

/** A vector inside a div component: an inline <svg> carrying the child's position. */
export function emitInlineVector(node: CanvasVectorNode, position: CssProps, imageUrl: ImageUrlResolver, indent: string): string {
  return svgElJsx(vectorSvg(node, node.id, imageUrl, position), indent)
}

/** A node's own box paint (fills, stroke, radius) as a rect — an SVG component's root, or a group inside one. */
function boxPaint(node: CanvasNode, box: Box, imageUrl: ImageUrlResolver, defs: SvgEl[]): SvgEl[] {
  const hasPaint = (node.style.fills ?? []).length > 0 || (node.style.stroke?.width ?? 0) > 0
  if (!hasPaint) return []
  const painted = paintedShape(vectorShape({ shape: 'rectangle', style: node.style }, box), node.style, box, node.id, imageUrl)
  defs.push(...painted.defs)
  return painted.els
}

/** Wraps `els` in a <g> carrying a node's layer opacity and effects, when it has any. */
function withEffects(node: CanvasNode, els: SvgEl[]): SvgEl[] {
  const css = vectorEffectsCss(node.style)
  return Object.keys(css).length > 0 && els.length > 0 ? [{ tag: 'g', attrs: {}, style: css, children: els }] : els
}

/**
 * Wraps `els` in a <g> turning them by the node's rotation about its own
 * center — the same pivot CSS uses on the board, so the SVG matches it.
 */
function withRotation(node: CanvasNode, box: Box, els: SvgEl[]): SvgEl[] {
  const deg = node.style.rotate
  if (!deg || els.length === 0) return els
  const transform = `rotate(${num(deg)} ${num(box.x + box.w / 2)} ${num(box.y + box.h / 2)})`
  return [{ tag: 'g', attrs: { transform }, children: els }]
}

/**
 * Every child of an SVG component's root, flattened into the root's
 * coordinates. Groups contribute their own paint and pass their offset on;
 * anything that isn't vector art is left out with a comment saying so.
 * Positions are as drawn — an SVG component has no layout of its own.
 */
function flatten(nodes: CanvasNode[], ox: number, oy: number, imageUrl: ImageUrlResolver, defs: SvgEl[]): SvgEl[] {
  const out: SvgEl[] = []
  for (const node of nodes) {
    if (node.hidden || node.repeatOf) continue
    const box: Box = { x: ox + node.rect.x, y: oy + node.rect.y, w: node.rect.w, h: node.rect.h }
    // A pattern (model/pathPattern.ts): the item drawn once with an id, and a
    // <use> per copy — moved onto the copy's center and turned to its angle.
    const copies = nodes.filter((c) => c.repeatOf === node.id && !c.hidden)
    if (copies.length > 0) {
      const id = `${node.id.replace(/[^A-Za-z0-9_-]/g, '-')}-item`
      const drawn = flatten([{ ...node, repeatOf: undefined }], ox, oy, imageUrl, defs)
      out.push({ tag: 'g', attrs: { id }, children: drawn })
      const cx = box.x + box.w / 2
      const cy = box.y + box.h / 2
      for (const copy of copies) {
        const dx = num(copy.rect.x - node.rect.x)
        const dy = num(copy.rect.y - node.rect.y)
        const turn = num((copy.style.rotate ?? 0) - (node.style.rotate ?? 0))
        const transform = `translate(${dx} ${dy})${turn ? ` rotate(${turn} ${num(cx)} ${num(cy)})` : ''}`
        out.push({ tag: 'use', attrs: { href: `#${id}`, transform } })
      }
      continue
    }
    if (isVectorNode(node)) {
      const painted = paintedShape(vectorShape(node, box), node.style, box, node.id, imageUrl)
      defs.push(...painted.defs)
      out.push(...withRotation(node, box, withEffects(node, painted.els)))
    } else if (isFrameNode(node)) {
      const inner = [...boxPaint(node, box, imageUrl, defs), ...flatten(node.children, box.x, box.y, imageUrl, defs)]
      out.push(...withRotation(node, box, withEffects(node, inner)))
    } else {
      out.push({ tag: COMMENT, attrs: { text: `${node.name}: only vectors are drawn in an SVG component` } })
    }
  }
  return out
}

/** One variant of an SVG component as a `return (<svg …>)` block. */
export function emitSvgVariantReturn(variant: CanvasVariant, imageUrl: ImageUrlResolver, indent: string): string {
  const root = variant.root
  const box: Box = { x: 0, y: 0, w: root.rect.w, h: root.rect.h }
  const defs: SvgEl[] = []
  const body = [...boxPaint(root, box, imageUrl, defs), ...flatten(root.children, 0, 0, imageUrl, defs)]
  const svg: SvgEl = {
    tag: 'svg',
    attrs: { width: num(box.w), height: num(box.h), viewBox: `0 0 ${num(box.w)} ${num(box.h)}`, fill: 'none', xmlns: SVG_NS },
    style: mergeCss(vectorEffectsCss(root.style)),
    children: [...(defs.length > 0 ? [{ tag: 'defs', attrs: {}, children: defs }] : []), ...body],
  }
  return `${indent}return (\n${svgElJsx(svg, indent + INDENT)}\n${indent})`
}
