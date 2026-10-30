import type { LanguageId, NodeRole } from '../architectures'
import { typeExportName } from '../naming'
import type { ImportAdapter, ImportSpecifier } from './types'

// C and C++: `#include "x.h"` (and `<x.h>` for a project header found through
// an include folder). A quoted include is looked up beside the including file
// first, the way the preprocessor does; failing that — and for angle-bracket
// includes — any project file whose path ends with the include is a match,
// preferring include/ and src/ folders, then the shortest path. System headers
// (<stdio.h>) match nothing and resolve to null.
//
// Nothing ever includes a source file, so linking to one (a View using its
// ViewModel) includes the source's header instead — the same-named .h/.hpp
// that the scaffold writes beside it.

const INCLUDE_RE = /^[ \t]*#[ \t]*include[ \t]*([<"])([^>"\n]+)[>"]/gm
const HEADER_EXT: Record<string, string> = { c: 'h', cc: 'hpp', cpp: 'hpp', cxx: 'hpp' }

function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  for (const m of content.matchAll(INCLUDE_RE)) {
    if (m.index === undefined) continue
    const offset = m[0].indexOf(m[2])
    specs.push({ raw: m[2], index: m.index + offset, length: m[2].length })
  }
  return specs
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

// Collapses "." and ".." segments; null when the path climbs above the root.
function normalize(path: string): string | null {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(seg)
  }
  return out.join('/')
}

function resolveSpecifier(fromPath: string, raw: string, candidatePaths: string[]): string | null {
  const pool = new Set(candidatePaths)
  const beside = normalize([dirOf(fromPath), raw].filter(Boolean).join('/'))
  if (beside && pool.has(beside)) return beside
  const suffix = `/${raw.replace(/^\.\//, '')}`
  const matches = candidatePaths.filter((p) => p === raw || p.endsWith(suffix))
  if (!matches.length) return null
  const rank = (p: string) => (/(^|\/)include\//.test(p) ? 0 : /(^|\/)src\//.test(p) ? 1 : 2)
  return [...matches].sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))[0]
}

/** The header to include for `path`: itself when it's a header, else its same-named sibling header. */
export function headerFor(path: string): string {
  const m = path.match(/^(.*)\.([A-Za-z0-9]+)$/)
  if (!m) return path
  const headerExt = HEADER_EXT[m[2].toLowerCase()]
  return headerExt ? `${m[1]}.${headerExt}` : path
}

// The include path from one file to another, relative to the including file's folder.
function relativeInclude(fromPath: string, toPath: string): string {
  const from = dirOf(fromPath).split('/').filter(Boolean)
  const to = toPath.split('/')
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/')
}

function includeLine(fromPath: string, toPath: string): string {
  return `#include "${relativeInclude(fromPath, headerFor(toPath))}"`
}

function insertImport(content: string, fromPath: string, toPath: string): string {
  const line = includeLine(fromPath, toPath)
  if (content.split('\n').some((l) => l.trim() === line)) return content
  const lines = content.split('\n')
  // After the last include; else after a header's guard or #pragma once; else at the top.
  let at = -1
  lines.forEach((l, i) => {
    if (/^\s*#\s*include\b/.test(l)) at = i
  })
  if (at < 0) {
    const guard = lines.findIndex((l) => /^\s*#\s*(define\b|pragma\s+once\b)/.test(l))
    if (guard >= 0) {
      lines.splice(guard + 1, 0, '', line)
      return lines.join('\n')
    }
    return `${line}\n${content}`
  }
  lines.splice(at + 1, 0, line)
  return lines.join('\n')
}

function importedIdentifier(_fromPath: string, _toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  return typeExportName(targetRole, targetLabel)
}

function removeImport(content: string, fromPath: string, toPath: string): string {
  const line = includeLine(fromPath, toPath)
  return content
    .split('\n')
    .filter((l) => l.trim() !== line)
    .join('\n')
}

const make = (id: LanguageId): ImportAdapter => ({
  id,
  detectImports,
  resolveSpecifier: (fromPath, raw, candidatePaths) => resolveSpecifier(fromPath, raw, candidatePaths),
  insertImport: (content, fromPath, toPath) => insertImport(content, fromPath, toPath),
  importedIdentifier,
  removeImport,
})

export const cAdapter = make('c')
export const cppAdapter = make('cpp')
