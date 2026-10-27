// Literal-writing helpers shared by the two React emitters: emit/react.ts
// (components as divs) and emit/svg.ts (vectors as SVG). Kept apart so the two
// write values — quoting, style objects, image interpolation — identically.

import { toCamelCase } from '../../00_planning/graph/naming'
import { isAbsoluteImageSrc, type ImageUrlResolver } from '../model/paint'
import type { CssProps } from '../model/toCss'
import { childrenOf, type CanvasComponent, type CanvasNode } from '../model/types'

export const INDENT = '  '

// ── Value literals ─────────────────────────────────────────────────────────

export function quote(value: string): string {
  // Single quotes to match the repo's own style; escape only what must be.
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// ── Image fills ────────────────────────────────────────────────────────────
//
// A workspace image is IMPORTED, the way a person would write it
// (`import heroImage from '../assets/hero.png'`), so the user's bundler
// fingerprints, inlines or copies it like any other asset. Its value then has
// to be an expression — `url("${heroImage}")`, `href={heroImage}` — not a
// string. The paint derivations are shared with the board and deal only in
// strings, so they are handed a resolver that returns a marker; the literal
// writers below turn any value carrying one into an expression.

export const EXPR_OPEN = ''
export const EXPR_CLOSE = ''

const imageIdentsCache = new WeakMap<CanvasComponent, Map<string, string>>()

/**
 * src → import identifier for every workspace image the component paints, in
 * first-use order. One identifier per src even when several nodes use it.
 */
export function imageImportsOf(component: CanvasComponent): Map<string, string> {
  const cached = imageIdentsCache.get(component)
  if (cached) return cached
  const idents = new Map<string, string>()
  const taken = new Set<string>()
  const visit = (node: CanvasNode) => {
    for (const fill of node.style.fills ?? []) {
      if (fill.type !== 'image') continue
      const src = fill.src.trim()
      if (!src || isAbsoluteImageSrc(src) || idents.has(src)) continue
      const stem = src.slice(src.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
      let base = /[a-z0-9]/i.test(stem) ? toCamelCase(stem) : 'image'
      if (/^[0-9]/.test(base)) base = `image${base}`
      if (!/image$/i.test(base)) base = `${base}Image`
      let ident = base
      for (let n = 2; taken.has(ident); n += 1) ident = `${base}${n}`
      taken.add(ident)
      idents.set(src, ident)
    }
    for (const child of childrenOf(node)) visit(child)
  }
  for (const variant of component.variants) visit(variant.root)
  imageIdentsCache.set(component, idents)
  return idents
}

export function emitImageUrl(component: CanvasComponent): ImageUrlResolver {
  const idents = imageImportsOf(component)
  return (src) => {
    const ident = idents.get(src.trim())
    return ident ? `${EXPR_OPEN}${ident}${EXPR_CLOSE}` : undefined
  }
}

/** A string carrying a marker as a template literal; `undefined` when it has none. */
function templateLiteral(value: string): string | undefined {
  if (!value.includes(EXPR_OPEN)) return undefined
  // Escape what a backtick string would interpret, then open each marker as
  // an interpolation.
  const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return '`' + escaped.split(EXPR_OPEN).join('${').split(EXPR_CLOSE).join('}') + '`'
}

export function cssValueLiteral(value: string | number): string {
  if (typeof value === 'number') return String(value)
  return templateLiteral(value) ?? quote(value)
}

/** A style object literal, canonically formatted on one line per property. */
export function styleLiteral(css: CssProps, indent: string): string {
  const keys = Object.keys(css).sort()
  if (keys.length === 0) return '{}'
  const inner = keys.map((key) => `${indent}${INDENT}${key}: ${cssValueLiteral(css[key])},`).join('\n')
  return `{\n${inner}\n${indent}}`
}

/**
 * A JSX attribute: `name="text"` for plain strings, `name={42}` for numbers,
 * and an expression for a value carrying an image marker — `{heroImage}` when
 * it is nothing else, a template literal when it is part of a string.
 */
export function jsxAttr(name: string, value: string | number): string {
  if (typeof value === 'number') return `${name}={${value}}`
  if (value.startsWith(EXPR_OPEN) && value.endsWith(EXPR_CLOSE) && value.indexOf(EXPR_OPEN, 1) === -1) {
    return `${name}={${value.slice(EXPR_OPEN.length, -EXPR_CLOSE.length)}}`
  }
  const template = templateLiteral(value)
  if (template) return `${name}={${template}}`
  return `${name}="${value.replace(/"/g, '&quot;')}"`
}
