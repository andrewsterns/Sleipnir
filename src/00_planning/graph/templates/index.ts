import type { LanguageId, NodeRole } from '../architectures'
import { jsExportName, scaffoldFileName, toPascalCase, typeExportName } from '../naming'

// Pure string builders — no fs access, called client-side by
// AddNodeModal.ViewModel before scaffoldNodes ever sees the content.
// Deliberately minimal: a header + the right per-language declaration shape,
// not deep feature-complete scaffolding.
//
// One uniform naming rule across every language (see graph/naming.ts): the
// file is `<camelName><Role>.<ext>` and the primary declared symbol is what
// the import adapters reference back — so file name, declaration, and any
// auto-generated import that links siblings always agree. HTML/CSS are the
// exception: architecture-less single files (role is always 'node').

export interface RenderedFile {
  fileName: string
  content: string
}

// ── JS/TS family (react/typescript/javascript/jquery) ──────────────────────
// All four share jsExportName (view = component/const, view-model &c = hooks,
// interface/node = plain PascalCase), differing only in the view's body and
// the file extension.

function renderReact(role: NodeRole, label: string): string {
  const sym = jsExportName(role, label)
  switch (role) {
    case 'node':
      return `export interface ${sym} {}\n`
    case 'interface':
      return `export interface ${sym} {}\n`
    case 'view':
      return `export const ${sym} = () => {\n  return <div />\n}\n`
    default: // view-model / controller / presenter → hook
      return `export function ${sym}() {\n  return {}\n}\n`
  }
}

function renderTypeScript(role: NodeRole, label: string): string {
  const sym = jsExportName(role, label)
  switch (role) {
    case 'node':
      return `export interface ${sym} {}\n`
    case 'interface':
      return `export interface ${sym} {}\n`
    case 'view':
      return `export class ${sym} {}\n`
    default:
      return `export function ${sym}() {\n  return {}\n}\n`
  }
}

function renderJavaScript(role: NodeRole, label: string): string {
  const sym = jsExportName(role, label)
  switch (role) {
    case 'node':
    case 'interface': // JS has no interface keyword — a class placeholder
    case 'view':
      return `export class ${sym} {}\n`
    default:
      return `export function ${sym}() {\n  return {}\n}\n`
  }
}

function renderJQuery(role: NodeRole, label: string): string {
  const sym = jsExportName(role, label)
  switch (role) {
    case 'node':
    case 'interface':
      return `export class ${sym} {}\n`
    case 'view':
      return `export function ${sym}() {\n  $(function () {\n    // ${sym}\n  })\n}\n`
    default:
      return `export function ${sym}() {\n  return {}\n}\n`
  }
}

// ── Type-suffix languages (rust/python/go) ─────────────────────────────────
// Declared symbol is `<Pascal><Role>` (typeExportName).

function renderPython(role: NodeRole, label: string): string {
  return `class ${typeExportName(role, label)}:\n    pass\n`
}

function renderRust(role: NodeRole, label: string): string {
  const sym = typeExportName(role, label)
  return role === 'interface' ? `pub trait ${sym} {}\n` : `pub struct ${sym};\n`
}

function renderGo(role: NodeRole, label: string): string {
  // Every role in one scaffold batch lands in the same folder — one Go package
  // by convention. Package name is a lowercase, separator-free reduction of
  // the label; a reasonable placeholder, not a resolved module.
  const pkg = toPascalCase(label).toLowerCase() || 'pkg'
  const sym = typeExportName(role, label)
  const decl = role === 'interface' ? `type ${sym} interface{}\n` : `type ${sym} struct{}\n`
  return `package ${pkg}\n\n${decl}`
}

// ── Architecture-less single files (html/css) ──────────────────────────────

function renderHtml(label: string): string {
  const title = toPascalCase(label)
  return `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n  </head>\n  <body>\n  </body>\n</html>\n`
}

function renderCss(label: string): string {
  return `/* ${toPascalCase(label)} */\n`
}

function renderContent(language: LanguageId, role: NodeRole, label: string): string {
  switch (language) {
    case 'react':
      return renderReact(role, label)
    case 'typescript':
      return renderTypeScript(role, label)
    case 'javascript':
      return renderJavaScript(role, label)
    case 'jquery':
      return renderJQuery(role, label)
    case 'python':
      return renderPython(role, label)
    case 'rust':
      return renderRust(role, label)
    case 'go':
      return renderGo(role, label)
    case 'html':
      return renderHtml(label)
    case 'css':
      return renderCss(label)
  }
}

export function renderTemplate(language: LanguageId, role: NodeRole, label: string): RenderedFile {
  return {
    fileName: scaffoldFileName(language, role, label),
    content: renderContent(language, role, label),
  }
}
