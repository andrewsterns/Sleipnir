import type { LanguageId } from '../architectures'
import type { ImportAdapter, ImportSpecifier } from './types'

// Java and Kotlin: `import com.shop.cart.CartView` names a class by package,
// and a package is a folder under a source root (src/main/java,
// src/main/kotlin, or any …/java/ or …/kotlin/ folder). A class in the same
// package needs no import at all — like Go — so linking two files in one
// folder writes nothing. Wildcard imports (`com.shop.*`) name a package, not
// a file, and resolve to null; a static import names a member, so its last
// segment is dropped until a class matches.

const IMPORT_RE = /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)(?:\.\*)?[ \t]*;?[ \t]*$/gm
const SOURCE_EXT = ['java', 'kt']

function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  for (const m of content.matchAll(IMPORT_RE)) {
    if (m.index === undefined || /\.\*/.test(m[0])) continue
    specs.push({ raw: m[1], index: m.index + m[0].indexOf(m[1]), length: m[1].length })
  }
  return specs
}

// "com/shop/cart/CartView" for a file under a java/ or kotlin/ source root.
function qualifiedPath(path: string): string | null {
  const m = path.match(/(?:^|\/)(?:java|kotlin)\/(.+)\.(java|kt)$/)
  return m ? m[1] : null
}

function resolveSpecifier(_fromPath: string, raw: string, candidatePaths: string[]): string | null {
  const byQualified = new Map<string, string>()
  for (const p of candidatePaths) {
    if (!SOURCE_EXT.some((e) => p.endsWith(`.${e}`))) continue
    const q = qualifiedPath(p)
    if (q && !byQualified.has(q)) byQualified.set(q, p)
  }
  const segs = raw.split('.')
  // Drop members (lowercase tails of a static import) until a class matches.
  for (let n = segs.length; n > 0; n -= 1) {
    const hit = byQualified.get(segs.slice(0, n).join('/'))
    if (hit) return hit
  }
  return null
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

// "com.shop.cart.CartView" for a file under a source root; null outside one.
function qualifiedName(path: string): string | null {
  return qualifiedPath(path)?.replace(/\//g, '.') ?? null
}

function className(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
}

function make(id: LanguageId, semicolon: boolean): ImportAdapter {
  const statementFor = (fromPath: string, toPath: string): string | null => {
    if (dirOf(fromPath) === dirOf(toPath)) return null // same package: no import needed
    const q = qualifiedName(toPath)
    return q ? `import ${q}${semicolon ? ';' : ''}` : null
  }
  return {
    id,
    detectImports,
    resolveSpecifier: (fromPath, raw, candidatePaths) => resolveSpecifier(fromPath, raw, candidatePaths),
    insertImport(content, fromPath, toPath) {
      const statement = statementFor(fromPath, toPath)
      if (!statement || content.split('\n').some((l) => l.trim() === statement)) return content
      const lines = content.split('\n')
      let at = -1
      lines.forEach((l, i) => {
        if (/^\s*(import|package)\b/.test(l)) at = i
      })
      // A blank line between the package line and the first import.
      if (at >= 0 && /^\s*package\b/.test(lines[at])) lines.splice(at + 1, 0, '', statement)
      else if (at >= 0) lines.splice(at + 1, 0, statement)
      else lines.unshift(statement, '')
      return lines.join('\n')
    },
    importedIdentifier: (_fromPath, toPath) => className(toPath),
    removeImport(content, fromPath, toPath) {
      const statement = statementFor(fromPath, toPath)
      if (!statement) return content
      return content
        .split('\n')
        .filter((l) => l.trim() !== statement)
        .join('\n')
    },
  }
}

export const javaAdapter = make('java', true)
export const kotlinAdapter = make('kotlin', false)
