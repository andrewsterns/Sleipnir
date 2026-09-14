// CanvasComponent → TSX.
//
// Pure string builders, no fs — the same contract as
// 00_planning/graph/templates/index.ts, which is already per-language string
// builders behind a switch. This is that seam with a much richer input.
//
// Output is dependency-free: plain <div>s carrying the style object that
// model/toCss.ts derives, which is the SAME function the board renders with. So
// the pixel you designed and the pixel the code produces come from one
// derivation, and the emitted file imports nothing from Sleipnir.
//
// Everything here is written in a canonical shape, because parse/fromTsx.ts has
// to be able to read it back. Deviating from the shape below (attribute order,
// quoting, indentation) will break the round-trip property tests.

import { toCamelCase, toPascalCase } from '../../00_planning/graph/naming'
import { mergeCss, positionCss, textCss, toCss, type CssProps } from '../model/toCss'
import { resolveVariant } from '../model/variants'
import {
  childrenOf,
  isExternalNode,
  isFrameNode,
  isInstanceNode,
  isTextNode,
  type CanvasComponent,
  type CanvasNode,
  type CanvasProp,
  type CanvasPropValue,
  type CanvasStyle,
  type CanvasVariant,
} from '../model/types'

export interface RenderedFile {
  fileName: string
  content: string
}

/** Resolution context so instances and externals can emit real imports. */
export interface EmitContext {
  /** Workspace-relative path of the file being emitted, for relative imports. */
  filePath: string
  /** Every component on the board, for resolving instance references. */
  components: CanvasComponent[]
  /** Maps a componentId to its file path, when it has one. */
  filePathFor?: (componentId: string) => string | undefined
}

const INDENT = '  '

// ── Identifiers ────────────────────────────────────────────────────────────

/**
 * The exported symbol for a component. Uses naming.ts's PascalCase rule but not
 * its role suffix: a canvas component has no MVVM role, so "Card" should export
 * `Card`, not `CardView`.
 */
export function componentSymbol(name: string): string {
  return toPascalCase(name)
}

export function propsInterfaceName(name: string): string {
  return `${componentSymbol(name)}Props`
}

/** `<camelName>.tsx`, matching naming.ts's file-name convention minus the role. */
export function componentFileName(name: string): string {
  return `${toCamelCase(name)}.tsx`
}

// ── Value literals ─────────────────────────────────────────────────────────

function quote(value: string): string {
  // Single quotes to match the repo's own style; escape only what must be.
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function cssValueLiteral(value: string | number): string {
  return typeof value === 'number' ? String(value) : quote(value)
}

/** A style object literal, canonically formatted on one line per property. */
function styleLiteral(css: CssProps, indent: string): string {
  const keys = Object.keys(css).sort()
  if (keys.length === 0) return '{}'
  const inner = keys.map((key) => `${indent}${INDENT}${key}: ${cssValueLiteral(css[key])},`).join('\n')
  return `{\n${inner}\n${indent}}`
}

function propValueLiteral(value: CanvasPropValue): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  return String(value)
}

// ── Props interface ────────────────────────────────────────────────────────

function propType(prop: CanvasProp): string {
  switch (prop.type) {
    case 'string':
    case 'color':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'node':
      return 'React.ReactNode'
    case 'enum':
      // A union of the declared options — this is what makes a variant prop
      // self-documenting at the call site.
      return (prop.options ?? []).length > 0 ? (prop.options ?? []).map(quote).join(' | ') : 'string'
  }
}

export function emitPropsInterface(component: CanvasComponent): string {
  const name = propsInterfaceName(component.name)
  if (component.props.length === 0) return `export interface ${name} {}`
  const lines = component.props.map((prop) => {
    const optional = prop.required ? '' : '?'
    const doc = prop.description ? `${INDENT}/** ${prop.description} */\n` : ''
    return `${doc}${INDENT}${prop.name}${optional}: ${propType(prop)}`
  })
  return `export interface ${name} {\n${lines.join('\n')}\n}`
}

/**
 * The component's signature line, exactly as emitComponentFile writes it.
 *
 * Exported so a push can refresh it in place: it derives from the component's
 * props, so adding one makes whatever is already on disk wrong (see
 * emit/region.ts's spliceDeclaration).
 */
export function emitSignature(component: CanvasComponent): string {
  return `export const ${componentSymbol(component.name)} = (${emitParams(component)}) => {`
}

/** The destructured parameter list, with defaults for props that declare one. */
function emitParams(component: CanvasComponent): string {
  if (component.props.length === 0) return `{}: ${propsInterfaceName(component.name)}`
  const parts = component.props.map((prop) =>
    prop.defaultValue !== undefined && prop.defaultValue !== null
      ? `${prop.name} = ${propValueLiteral(prop.defaultValue)}`
      : prop.name,
  )
  return `{ ${parts.join(', ')} }: ${propsInterfaceName(component.name)}`
}

// ── JSX ────────────────────────────────────────────────────────────────────

function textContent(node: CanvasNode, component: CanvasComponent): string {
  if (!isTextNode(node)) return ''
  if (node.boundPropId) {
    const prop = component.props.find((p) => p.id === node.boundPropId)
    if (prop) return `{${prop.name}}`
  }
  return escapeJsxText(node.text)
}

/** JSX text may not contain a bare `{`, `}` or `<`. */
function escapeJsxText(text: string): string {
  return text.replace(/[{}<>]/g, (ch) => `{${quote(ch)}}`)
}

function emitNode(
  node: CanvasNode,
  parentFlow: CanvasStyle['flow'],
  component: CanvasComponent,
  ctx: EmitContext,
  indent: string,
  /**
   * The component's own root. A root sizes itself but must NOT position itself:
   * where the component sits is the consumer's business, and emitting
   * `position: absolute; left: …` on it would make the component unusable
   * anywhere except the coordinates it happened to be drawn at.
   */
  isRoot = false,
): string {
  if (node.hidden) return ''

  let position: CssProps
  if (isRoot) {
    // Size only, and only where the style doesn't already declare one. Keys are
    // added conditionally rather than set to undefined, which would serialize
    // into the emitted style object as a literal `undefined`.
    position = {}
    if (node.style.w === undefined) position.width = node.rect.w
    if (node.style.h === undefined) position.height = node.rect.h
  } else {
    position = positionCss(node.rect, parentFlow, node.style)
  }
  const css = mergeCss(toCss(node.style), position)

  // An instance emits a real call site, not a copy of the component's tree —
  // which is the whole point of instancing surviving into the code.
  if (isInstanceNode(node)) {
    const target = ctx.components.find((c) => c.id === node.componentId)
    if (!target) return `${indent}{/* missing component ${node.componentId} */}`
    const attrs: string[] = []
    for (const [name, value] of Object.entries(node.variantValues ?? {})) {
      attrs.push(`${name}=${quote(value)}`)
    }
    for (const [propId, value] of Object.entries(node.overrides ?? {})) {
      const prop = target.props.find((p) => p.id === propId)
      if (!prop || value === undefined) continue
      attrs.push(
        typeof value === 'string' ? `${prop.name}=${quote(value)}` : `${prop.name}={${propValueLiteral(value)}}`,
      )
    }
    const attrText = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
    return `${indent}<${componentSymbol(target.name)}${attrText} />`
  }

  // A component that already exists on disk in the workspace.
  if (isExternalNode(node)) {
    const attrs = Object.entries(node.propValues ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) =>
        typeof value === 'string' ? `${name}=${quote(value)}` : `${name}={${propValueLiteral(value)}}`,
      )
    const attrText = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
    return `${indent}<${node.exportName}${attrText} />`
  }

  if (isTextNode(node)) {
    const style = styleLiteral(mergeCss(css, textCss(node.font)), indent)
    return `${indent}<div style={${style}}>${textContent(node, component)}</div>`
  }

  const style = styleLiteral(css, indent)
  const children = isFrameNode(node) ? childrenOf(node) : []
  if (children.length === 0) return `${indent}<div style={${style}} />`

  const flow = node.style.flow ?? 'freeform'
  const inner = children
    .map((child) => emitNode(child, flow, component, ctx, indent + INDENT))
    .filter(Boolean)
    .join('\n')
  return `${indent}<div style={${style}}>\n${inner}\n${indent}</div>`
}

/** One variant's `return (…)` block. */
function emitVariantReturn(
  variant: CanvasVariant,
  component: CanvasComponent,
  ctx: EmitContext,
  indent: string,
): string {
  const body = emitNode(variant.root, 'freeform', component, ctx, `${indent}${INDENT}`, true)
  return `${indent}return (\n${body}\n${indent})`
}

/**
 * The canvas-owned region's content: a canonical `if` chain over the variant
 * prop, ending in a bare `return` for the default variant.
 *
 * This shape is exactly what parse/fromTsx.ts reads back, so adding a variant on
 * the canvas adds a branch here, and adding a branch here adds a variant there.
 */
export function emitRegionBody(component: CanvasComponent, ctx: EmitContext): string {
  const [defaultVariant, ...rest] = component.variants
  const discriminator = component.props.find((p) => p.id === component.variantPropIds[0])

  if (rest.length === 0 || !discriminator) {
    return emitVariantReturn(defaultVariant, component, ctx, '')
  }

  const branches = rest.map((variant) => {
    const value = variant.values[discriminator.name]
    const block = emitVariantReturn(variant, component, ctx, INDENT)
    return `if (${discriminator.name} === ${quote(value)}) {\n${block}\n}`
  })

  return [...branches, emitVariantReturn(defaultVariant, component, ctx, '')].join('\n')
}

// ── Imports ────────────────────────────────────────────────────────────────

/**
 * Imports the emitted file needs: instanced canvas components and dropped-in
 * workspace components. No UIKit import — the output is dependency-free by
 * design (see model/toCss.ts).
 */
export function collectImports(component: CanvasComponent, ctx: EmitContext): string[] {
  const imports = new Map<string, Set<string>>()
  const add = (from: string, symbol: string) => {
    if (!imports.has(from)) imports.set(from, new Set())
    imports.get(from)!.add(symbol)
  }

  const visit = (node: CanvasNode) => {
    if (isInstanceNode(node)) {
      const target = ctx.components.find((c) => c.id === node.componentId)
      const targetPath = target && ctx.filePathFor?.(target.id)
      if (target && targetPath) {
        add(relativeSpecifier(ctx.filePath, targetPath), componentSymbol(target.name))
      }
    }
    if (isExternalNode(node)) add(relativeSpecifier(ctx.filePath, node.filePath), node.exportName)
    for (const child of childrenOf(node)) visit(child)
  }
  for (const variant of component.variants) visit(variant.root)

  const needsReactTypes = component.props.some((p) => p.type === 'node')
  const lines = [...imports.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, symbols]) => `import { ${[...symbols].sort().join(', ')} } from ${quote(from)}`)
  if (needsReactTypes) lines.unshift(`import type React from 'react'`)
  return lines
}

/** Extension-less, always-relative import specifier between two workspace paths. */
function relativeSpecifier(fromFile: string, toFile: string): string {
  const from = fromFile.split('/').slice(0, -1)
  const to = toFile.split('/')
  const name = to.pop()!.replace(/\.(tsx|ts|jsx|js)$/, '')
  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1
  const segments = [...from.slice(shared).map(() => '..'), ...to.slice(shared), name]
  const joined = segments.join('/')
  return joined.startsWith('.') ? joined : `./${joined}`
}

// ── Whole file ─────────────────────────────────────────────────────────────

/**
 * A complete new component file. Used only on first write; every later write
 * splices just the region (see emit/region.ts) so human-owned code survives.
 */
export function emitComponentFile(
  component: CanvasComponent,
  ctx: EmitContext,
  regionHash: string,
): RenderedFile {
  const imports = collectImports(component, ctx)
  const body = emitRegionBody(component, ctx)
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : INDENT + line))
    .join('\n')

  const parts = [
    ...(imports.length > 0 ? [imports.join('\n'), ''] : []),
    emitPropsInterface(component),
    '',
    emitSignature(component),
    `${INDENT}// <sleipnir:layout component="${component.id}" hash="${regionHash}">`,
    body,
    `${INDENT}// </sleipnir:layout>`,
    '}',
    '',
  ]
  return { fileName: componentFileName(component.name), content: parts.join('\n') }
}

/** Convenience for the emit → hash → splice pipeline. */
export function emitForComponent(component: CanvasComponent, ctx: EmitContext) {
  const regionBody = emitRegionBody(component, ctx)
  return { regionBody, resolveVariantForPreview: resolveVariant }
}
