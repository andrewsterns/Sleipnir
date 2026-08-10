import type { NodeRole } from '../architectures'
import { typeExportName } from '../naming'
import type { ImportAdapter, ImportSpecifier } from './types'

// Go's one genuinely different case: every role scaffolded in one batch
// lands in the same folder, which by Go convention means the same package —
// referencing a sibling type needs no import at all. buildImportStatement
// correctly returns '' for that case; insertImport/importedIdentifier both
// check it first and short-circuit. Cross-package references fall back to a
// best-effort `import "<workspace-relative-folder>"` — a real Go module's
// import path depends on its go.mod module name, which isn't knowable here,
// so (like rustAdapter's `mod` TODO) this is a placeholder likely needing
// manual correction, not a resolved concern.

function samePackage(fromPath: string, toPath: string): boolean {
  return fromPath.split('/').slice(0, -1).join('/') === toPath.split('/').slice(0, -1).join('/')
}

function packageNameFor(toPath: string): string {
  const dir = toPath.split('/').slice(0, -1).join('/')
  return (dir.split('/').pop() ?? 'pkg').replace(/[-_]/g, '') || 'pkg'
}

// Scoped to import lines (single `import "..."` or inside an `import (...)`
// block) rather than a bare quote-matching regex, which would also catch
// unrelated string literals elsewhere in the file.
function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  const pathRe = /"([^"]+)"/g
  let inBlock = false
  let offset = 0
  for (const line of content.split('\n')) {
    if (/^import\s*\(/.test(line)) {
      inBlock = true
      offset += line.length + 1
      continue
    }
    if (inBlock && /^\)/.test(line)) {
      inBlock = false
      offset += line.length + 1
      continue
    }
    if (inBlock || /^import\s+"/.test(line)) {
      for (const m of line.matchAll(pathRe)) {
        if (m.index === undefined) continue
        specs.push({ raw: m[1], index: offset + m.index, length: m[0].length })
      }
    }
    offset += line.length + 1
  }
  return specs
}

function resolveSpecifier(_fromPath: string, raw: string, candidatePaths: string[]): string | null {
  return candidatePaths.find((p) => p.split('/').slice(0, -1).join('/') === raw) ?? null
}

// The struct/interface name a target file exposes — the shared source of
// truth in graph/naming.ts (PascalCase name + role suffix), same helper
// graph/templates uses to declare it, so this stays in lockstep with the file.
function primaryExportFor(role: NodeRole, label: string): string {
  return typeExportName(role, label)
}

function buildImportStatement(fromPath: string, toPath: string): string {
  if (samePackage(fromPath, toPath)) return ''
  const dir = toPath.split('/').slice(0, -1).join('/')
  return `import "${dir}"`
}

function insertImport(content: string, fromPath: string, toPath: string): string {
  const statement = buildImportStatement(fromPath, toPath)
  if (!statement) return content // same package — nothing to import
  const importLine = statement.match(/"[^"]+"/)?.[0]
  if (!importLine || content.includes(importLine)) return content

  const lines = content.split('\n')

  const blockStart = lines.findIndex((l) => /^import\s*\(/.test(l))
  if (blockStart !== -1) {
    const blockEnd = lines.findIndex((l, i) => i > blockStart && /^\)/.test(l))
    if (blockEnd !== -1) {
      lines.splice(blockEnd, 0, `\t${importLine}`)
      return lines.join('\n')
    }
  }

  const singleIdx = lines.findIndex((l) => /^import\s+"/.test(l))
  if (singleIdx !== -1) {
    const existing = lines[singleIdx].match(/"[^"]+"/)?.[0] ?? ''
    lines.splice(singleIdx, 1, 'import (', `\t${existing}`, `\t${importLine}`, ')')
    return lines.join('\n')
  }

  const pkgIdx = lines.findIndex((l) => /^package\s+\w+/.test(l))
  const insertAt = pkgIdx !== -1 ? pkgIdx + 1 : 0
  lines.splice(insertAt, 0, '', `import ${importLine}`)
  return lines.join('\n')
}

function importedIdentifier(fromPath: string, toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  const typeName = primaryExportFor(targetRole, targetLabel)
  return samePackage(fromPath, toPath) ? typeName : `${packageNameFor(toPath)}.${typeName}`
}

function removeImport(content: string, fromPath: string, toPath: string): string {
  if (samePackage(fromPath, toPath)) return content
  const dir = toPath.split('/').slice(0, -1).join('/')
  const lines = content.split('\n').filter((l) => !l.includes(`"${dir}"`))
  // Collapse a now-empty `import (\n)` block left behind by the filter above.
  const cleaned: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s*\(/.test(lines[i]) && lines[i + 1] !== undefined && /^\)/.test(lines[i + 1])) {
      i++
      continue
    }
    cleaned.push(lines[i])
  }
  return cleaned.join('\n')
}

export const goAdapter: ImportAdapter = {
  id: 'go',
  detectImports,
  resolveSpecifier,
  insertImport,
  importedIdentifier,
  removeImport,
}
