import type { NodeRole } from '../architectures'
import { typeExportName } from '../naming'
import type { ImportAdapter, ImportSpecifier } from './types'

// `use crate::path::to::Name;` — crate-root-relative, matching the
// scaffolded folder structure directly (hyphens in a scaffold's target
// folder, e.g. "shopping-cart", aren't valid Rust identifiers, so they're
// normalized to underscores here). A regex adapter can't safely rewrite
// `mod.rs`/`lib.rs` to declare the new module without real risk of
// corrupting unrelated code, so insertImport always pairs the `use` line
// with a TODO comment reminding the human to do that part themselves,
// instead of silently producing a non-compiling crate.
const RUST_USE_RE = /^\s*use\s+([\w:]+);/gm

function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  for (const m of content.matchAll(RUST_USE_RE)) {
    if (m.index === undefined) continue
    specs.push({ raw: m[1], index: m.index, length: m[0].length })
  }
  return specs
}

function resolveSpecifier(_fromPath: string, raw: string, candidatePaths: string[]): string | null {
  if (!raw.startsWith('crate::')) return null
  const segments = raw.slice('crate::'.length).split('::')
  // Module path segments are snake_case by convention; a trailing
  // PascalCase segment is the imported type/trait name, not part of the
  // path to the file.
  const last = segments[segments.length - 1]
  const modSegments = last && /^[A-Z]/.test(last) ? segments.slice(0, -1) : segments
  const candidate = `${modSegments.join('/')}.rs`
  const pool = new Set(candidatePaths)
  return pool.has(candidate) ? candidate : null
}

// The struct/trait name a target file exposes — the shared source of truth in
// graph/naming.ts (PascalCase name + role suffix), the same helper
// graph/templates uses to *declare* it, so the `use …::Name;` this writes
// always matches what the file actually defines.
function primaryExportFor(role: NodeRole, label: string): string {
  return typeExportName(role, label)
}

function crateModulePath(toPath: string): string {
  return toPath.replace(/\.rs$/, '').split('/').map((p) => p.replace(/-/g, '_')).join('::')
}

function buildImportStatement(toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  const typeName = primaryExportFor(targetRole, targetLabel)
  return `use crate::${crateModulePath(toPath)}::${typeName};`
}

function insertImport(content: string, _fromPath: string, toPath: string, targetLabel: string, targetRole?: NodeRole): string {
  const statement = buildImportStatement(toPath, targetLabel, targetRole)
  if (content.includes(statement)) return content
  const moduleName = crateModulePath(toPath).split('::').pop()
  const todoComment = `// TODO(sleipnir): declare \`mod ${moduleName};\` in this crate's module tree if you haven't already`
  const lines = content.split('\n')
  let lastUseIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^use\s+.+;/.test(lines[i])) lastUseIdx = i
  }
  lines.splice(lastUseIdx + 1, 0, todoComment, statement)
  return lines.join('\n')
}

function importedIdentifier(_fromPath: string, _toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  return primaryExportFor(targetRole, targetLabel)
}

function removeImport(content: string, _fromPath: string, toPath: string): string {
  const useSpecPrefix = `use crate::${crateModulePath(toPath)}::`
  const lines = content.split('\n')
  const result: string[] = []
  for (const line of lines) {
    if (line.trimStart().startsWith(useSpecPrefix)) {
      // Also drop the TODO comment insertImport paired with this use line, if present.
      if (result.length > 0 && result[result.length - 1].includes('TODO(sleipnir)')) result.pop()
      continue
    }
    result.push(line)
  }
  return result.join('\n')
}

export const rustAdapter: ImportAdapter = {
  id: 'rust',
  detectImports,
  resolveSpecifier,
  insertImport,
  importedIdentifier,
  removeImport,
}
