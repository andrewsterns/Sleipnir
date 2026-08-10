import type { NodeRole } from '../architectures'
import { typeExportName } from '../naming'
import type { ImportAdapter, ImportSpecifier } from './types'

// `from .module import Name` / `from ..pkg.module import Name` / `import
// pkg.module` — dotted relative imports, mirroring tsxAdapter's shared-
// prefix directory walk but with Python's leading-dots-count-levels-up
// syntax instead of `../`. Assumes the target folder is a real importable
// package (i.e. has an `__init__.py`) — this adapter doesn't create one;
// that's a known, pragmatic limitation, not a resolved concern.
const PY_IMPORT_RE = /^[ \t]*from\s+([.\w]+)\s+import\s+[^\n]+|^[ \t]*import\s+([.\w]+)/gm

function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  for (const m of content.matchAll(PY_IMPORT_RE)) {
    const spec = m[1] ?? m[2]
    if (!spec || m.index === undefined) continue
    specs.push({ raw: spec, index: m.index, length: m[0].length })
  }
  return specs
}

// './a/b/C.py' relative to 'a/x/Y.py' -> { dots: '..', parts: ['b','C'] },
// stringified by buildImportStatement as '..b.C'. Same shared-prefix walk as
// tsxAdapter's relativeSpecifier — Python's dot-count-as-levels-up syntax is
// just a different rendering of the identical relationship.
function relativeModulePath(fromPath: string, toPath: string): string {
  const fromDir = fromPath.split('/').slice(0, -1)
  const toParts = toPath.split('/')
  const toDir = toParts.slice(0, -1)
  const toFile = toParts[toParts.length - 1].replace(/\.py$/, '')
  let shared = 0
  while (shared < fromDir.length && shared < toDir.length && fromDir[shared] === toDir[shared]) shared++
  const ups = fromDir.length - shared
  const downs = toDir.slice(shared)
  const dots = '.'.repeat(ups + 1)
  return dots + [...downs, toFile].join('.')
}

function resolveSpecifier(fromPath: string, raw: string, candidatePaths: string[]): string | null {
  if (!raw.startsWith('.')) return null
  const m = raw.match(/^(\.+)(.*)$/)
  if (!m) return null
  const ups = m[1].length - 1
  const rest = m[2]
  const fromDir = fromPath.split('/').slice(0, -1)
  const stack = fromDir.slice(0, Math.max(0, fromDir.length - ups))
  if (rest) stack.push(...rest.split('.'))
  const candidate = `${stack.join('/')}.py`
  const pool = new Set(candidatePaths)
  return pool.has(candidate) ? candidate : null
}

// The class name a target file exposes — the shared source of truth in
// graph/naming.ts (PascalCase name + role suffix), same helper
// graph/templates uses to declare it, so the `from … import Name` this writes
// always matches the file's actual class.
function primaryExportFor(role: NodeRole, label: string): string {
  return typeExportName(role, label)
}

function buildImportStatement(fromPath: string, toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  const className = primaryExportFor(targetRole, targetLabel)
  const spec = relativeModulePath(fromPath, toPath)
  return `from ${spec} import ${className}`
}

function insertImport(content: string, fromPath: string, toPath: string, targetLabel: string, targetRole?: NodeRole): string {
  const statement = buildImportStatement(fromPath, toPath, targetLabel, targetRole)
  if (content.includes(statement)) return content
  const lines = content.split('\n')
  let lastImportIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(from\s+[.\w]+\s+import\s+|import\s+[.\w]+)/.test(lines[i])) lastImportIdx = i
  }
  lines.splice(lastImportIdx + 1, 0, statement)
  return lines.join('\n')
}

function importedIdentifier(_fromPath: string, _toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  return primaryExportFor(targetRole, targetLabel)
}

function removeImport(content: string, fromPath: string, toPath: string): string {
  const spec = relativeModulePath(fromPath, toPath)
  return content
    .split('\n')
    .filter((line) => {
      const m = line.match(/^\s*from\s+([.\w]+)\s+import/)
      return !m || m[1] !== spec
    })
    .join('\n')
}

export const pythonAdapter: ImportAdapter = {
  id: 'python',
  detectImports,
  resolveSpecifier,
  insertImport,
  importedIdentifier,
  removeImport,
}
