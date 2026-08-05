// Stage 1 of the deeper architecture-conversion design (see the plan this
// was built from): read-only static analysis, no file mutations. Today's
// Refactor engine (refactor-engine.mjs) only ever moves files and rewrites
// import paths — MVVM/MVC/MVP produce an IDENTICAL dependency graph, just
// reshelved, since it never changes which file imports which other file.
// This module is the first, safe step toward actually checking (not yet
// fixing) whether the code's real control flow matches the architecture it
// claims to be in.
//
// The one rule checkable from the import graph alone, shared by every
// non-atomic architecture's intended direction of control: a component's
// "logic" file (ViewModel under MVVM, Controller under MVC, Presenter under
// MVP) should never import its own View. MVVM's ViewModel binds one-way;
// MVC's Controller shouldn't need the concrete View; MVP's Presenter should
// see only the View's interface. Deeper rules — an MVC Model actually being
// an observable store, an MVP Presenter genuinely calling through the
// interface rather than merely avoiding one import — need real AST/semantic
// inspection (Stage 2/3), not built here.
import fs from 'node:fs'
import path from 'node:path'
import { walk, toId, extractImportSpecifiers, resolveImport, ROOT, SRC } from './generate-graph.mjs'
import { getLibrary } from './library-registry.mjs'

const SKIP_RE = /\.(stories|test|spec)\.tsx?$/

const LOGIC_ROLE_LABEL = {
  mvvm: 'ViewModel',
  mvc: 'Controller',
  mvp: 'Presenter',
}

// Mirrors refactor-engine.mjs's roleForFile's naming convention (ViewModel$
// suffix, i{folder} prefix) without importing that module — this stays a
// peer of generate-graph.mjs/refactor-engine.mjs, not another dependency of
// either, so nothing here can accidentally create a require cycle.
function isLogicFile(id) {
  const base = id.split('/').pop() ?? id
  return /ViewModel$/.test(base)
}

export function lintArchitectureViolations(libraryId, architecture) {
  if (architecture === 'atomic') return []
  const library = getLibrary(libraryId)
  if (!library) return []

  const roleLabel = LOGIC_ROLE_LABEL[architecture] ?? 'ViewModel'
  const files = walk(path.join(SRC, library.root)).filter((f) => !SKIP_RE.test(f))

  const violations = []
  for (const f of files) {
    const id = toId(f)
    if (!isLogicFile(id)) continue
    const viewId = id.replace(/ViewModel$/, '')
    const content = fs.readFileSync(f, 'utf8')
    for (const spec of extractImportSpecifiers(content)) {
      const resolved = resolveImport(f, spec)
      if (!resolved) continue
      if (toId(resolved) !== viewId) continue
      violations.push({
        file: path.relative(ROOT, f).replace(/\\/g, '/'),
        rule: 'no-view-import-in-logic-file',
        message: `${roleLabel} imports its own View ("${viewId}") — breaks ${architecture.toUpperCase()}'s intended one-way control.`,
      })
    }
  }
  return violations
}
