import type { NodeRole } from '../architectures'
import { jsExportName } from '../naming'
import type { ImportAdapter, ImportSpecifier } from './types'
import { expandAlias, type PathAliasConfig } from './pathAliases'

// Extracted from NewWorkspacePlanModal.ViewModel.tsx's own detectEdges,
// which now calls this adapter instead of keeping a private copy — same
// real, working relative-import resolution, generalized so it also serves
// scaffold-time auto-linking and the `##token`/node-card link-editor's
// write direction (see AddNodeModal.ViewModel / graphLinkExtension /
// PlanningView's node-card link editor).
//
// Four alternatives, tried in order at each position:
//   1. `import ... from '...'`  (default/named/namespace, optionally `type`)
//   2. `export ... from '...'`  (re-export, optionally `type`)
//   3. `import '...'`           (side-effect only — no bindings, no `from`)
//   4/5. `require('...')` / `import('...')`
// The `[^'";]` middle of 1/2 is deliberate, not just `[\s\S]`: it can only
// cross whitespace/identifiers/braces, never a quote or semicolon — so it
// can't run past the CURRENT statement into a later, unrelated `from`
// clause. Without that guard, a side-effect import with no `from` of its
// own (e.g. `import './Foo.css'`) gets silently swallowed into whichever
// `from`-bearing import happens to follow it in the file — its own target
// never captured, and worse, a stray "from" inside a later string literal
// or comment could make the match span arbitrarily far. Branch 3 exists so
// a side-effect import that DOES stop at its own quote still gets caught.
const JS_IMPORT_RE =
  /import\s+(?:type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]|export\s+(?:type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]|import\s+(?:type\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g

function detectImports(content: string): ImportSpecifier[] {
  const specs: ImportSpecifier[] = []
  for (const m of content.matchAll(JS_IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]
    if (!spec || m.index === undefined) continue
    specs.push({ raw: spec, index: m.index, length: m[0].length })
  }
  return specs
}

// Relative ('./Foo', '../bar/Baz') and tsconfig/jsconfig-aliased
// ('@molecules/Foo') specifiers resolve against the file pool; a genuine
// bare package import (no leading '.', no matching `paths` entry) has no
// file in this project to point a graph edge at, so it's left unresolved
// (null) rather than guessed at.
function resolveSpecifier(fromPath: string, raw: string, candidatePaths: string[], aliases?: PathAliasConfig): string | null {
  const pool = new Set(candidatePaths)
  const resolveBase = (base: string): string | null => {
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`]
    return candidates.find((c) => pool.has(c)) ?? null
  }

  if (raw.startsWith('.')) {
    const fromDir = fromPath.split('/').slice(0, -1)
    const stack = [...fromDir]
    for (const part of raw.split('/')) {
      if (part === '.' || part === '') continue
      if (part === '..') stack.pop()
      else stack.push(part)
    }
    return resolveBase(stack.join('/'))
  }

  if (aliases) {
    for (const base of expandAlias(raw, aliases)) {
      const hit = resolveBase(base)
      if (hit) return hit
    }
  }

  return null
}

// './a/b/C.tsx' relative to 'a/x/Y.tsx' -> '../b/C' (extension stripped —
// TS/JS specifiers never include one). Handles same-folder, deeper, and
// shallower cases uniformly via a shared-prefix walk.
function relativeSpecifier(fromPath: string, toPath: string): string {
  const fromDir = fromPath.split('/').slice(0, -1)
  const toParts = toPath.split('/')
  const toDir = toParts.slice(0, -1)
  const toFile = toParts[toParts.length - 1].replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')
  let shared = 0
  while (shared < fromDir.length && shared < toDir.length && fromDir[shared] === toDir[shared]) shared++
  const ups = fromDir.length - shared
  const downs = toDir.slice(shared)
  const parts = [...Array(ups).fill('..'), ...downs, toFile]
  const rel = parts.join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

// Which named export gets imported for a given target role — the shared
// source of truth in graph/naming.ts (jsExportName: view = `<Name>View`,
// view-model/controller/presenter = `use<Name>…` hooks, interface/node =
// PascalCase), the same helper graph/templates uses to declare it, so the
// import always references the symbol the file actually exports. node and
// interface are type-only imports (they declare interfaces, not values).
function primaryExportFor(role: NodeRole, label: string): { name: string; alias?: string; typeOnly: boolean } {
  return { name: jsExportName(role, label), typeOnly: role === 'node' || role === 'interface' }
}

function buildImportStatement(fromPath: string, toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  const { name, alias, typeOnly } = primaryExportFor(targetRole, targetLabel)
  const imported = alias ? `${name} as ${alias}` : name
  const spec = relativeSpecifier(fromPath, toPath)
  return `import ${typeOnly ? 'type ' : ''}{ ${imported} } from '${spec}'`
}

function insertImport(content: string, fromPath: string, toPath: string, targetLabel: string, targetRole?: NodeRole): string {
  const statement = buildImportStatement(fromPath, toPath, targetLabel, targetRole)
  if (content.includes(statement)) return content
  const lines = content.split('\n')
  let lastImportIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s.*from\s+['"][^'"]+['"]/.test(lines[i])) lastImportIdx = i
  }
  lines.splice(lastImportIdx + 1, 0, statement)
  return lines.join('\n')
}

// fromPath/toPath are unused here — TSX's imported name never depends on
// where either file lives, unlike Go's package-qualification (see
// goAdapter.ts, the reason this interface takes both paths at all).
function importedIdentifier(_fromPath: string, _toPath: string, targetLabel: string, targetRole: NodeRole = 'node'): string {
  const { name, alias } = primaryExportFor(targetRole, targetLabel)
  return alias ?? name
}

function removeImport(content: string, fromPath: string, toPath: string): string {
  const spec = relativeSpecifier(fromPath, toPath)
  return content
    .split('\n')
    .filter((line) => {
      const m = line.match(/from\s+['"]([^'"]+)['"]/)
      return !m || m[1] !== spec
    })
    .join('\n')
}

export const tsxAdapter: ImportAdapter = {
  // Serves the whole JS/TS family (typescript/javascript/react/jquery) — the
  // id is just a label; the ES import syntax it writes is identical for all.
  id: 'typescript',
  detectImports,
  resolveSpecifier,
  insertImport,
  importedIdentifier,
  removeImport,
}
