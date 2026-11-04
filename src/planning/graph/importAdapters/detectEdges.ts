import { adapterForPath } from './index'
import { loadPathAliases } from './pathAliases'
import { buildReferenceIndex, detectAssetRefs } from './assetRefs'
import { detectConfigRefs, isConfigPath } from './configRefs'

// Extracted from NewWorkspacePlanModal.ViewModel.tsx's own detectEdges, which
// now calls this instead of keeping a private copy — the one place "scan a
// pool of files and connect the ones that import each other" lives, shared by
// plan creation, the live per-view re-scan (graph/resolveAssetPlan.ts), and
// anything else that needs the same best-effort detection later.

function basenameNoExt(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.[^./]+$/, '')
}

// Fallback for any file whose extension has no real ImportAdapter (see
// importAdapters/index.ts's EXT_LANGUAGE — no TSX/Python/Rust/Go match).
// Each pattern captures a raw module/header specifier from one common
// cross-language import syntax; matches are resolved by basename against the
// other paths in the same scan, same coarse heuristic the original
// NewWorkspacePlanModal implementation used for its "no adapter" branch. This
// is deliberately generous rather than precise — a helpful hint, not a
// guarantee, for languages this app has no real adapter for yet (C/C++,
// Java, Kotlin, C#, Ruby, PHP, Swift, ...).
const GENERIC_IMPORT_PATTERNS: RegExp[] = [
  // Python: `from x.y import z` / `import x.y` (kept for non-.py files that
  // embed Python-shaped imports, e.g. .pyi stubs; real .py files go through pythonAdapter)
  /^\s*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/gm,
  // C/C++/Objective-C: #include "foo.h" / #include <foo/bar.h>
  /^\s*#include\s*["<]([^">]+)[">]/gm,
  // Java/Kotlin/Dart/Scala-style: import foo.bar.Baz; / import static foo.Bar.baz;
  /^\s*import\s+(?:static\s+)?["']?([\w./]+)["']?\s*;?/gm,
  // C#: using Foo.Bar;
  /^\s*using\s+([\w.]+)\s*;/gm,
  // Ruby: require 'foo' / require_relative './foo'
  /^\s*require(?:_relative)?\s+["']([^"']+)["']/gm,
  // PHP: require/include(_once) 'foo.php';
  /^\s*(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']\s*\)?\s*;?/gm,
]

function detectGenericTargets(content: string, fromPath: string, candidatePaths: string[]): string[] {
  const targets = new Set<string>()
  for (const pattern of GENERIC_IMPORT_PATTERNS) {
    for (const m of content.matchAll(pattern)) {
      const raw = m[1] ?? m[2] ?? ''
      const mod = raw.split(/[./\\]/).filter(Boolean).pop()
      if (!mod) continue
      const target = candidatePaths.find((p) => p !== fromPath && basenameNoExt(p) === mod)
      if (target) targets.add(target)
    }
  }
  return [...targets]
}

// Best-effort import scan across every supported language/extension in one
// pass: a real ImportAdapter (precise relative-path + tsconfig/jsconfig
// alias resolution) where one exists, the generic pattern fallback above
// otherwise. `readFile` is injected so callers can source content however's
// convenient (Workspace fs reads today; nothing stops an in-memory cache
// later).
//
// `resolvePool` — defaults to `paths` — is the set specifiers may resolve
// *against*; `paths` is the (possibly smaller) set actually scanned for
// import statements. Passing a wider resolvePool (e.g. every file in the
// workspace, not just the ones already in a plan) lets an edge point at a
// real file the scan never read the content of — callers that want that
// file to become a node of its own can do so from the returned edges'
// `target`s, same as any other edge.
export async function detectEdgesForPaths(
  paths: string[],
  readFile: (path: string) => Promise<string>,
  resolvePool: string[] = paths,
): Promise<{ source: string; target: string }[]> {
  const edges: { source: string; target: string }[] = []
  const seen = new Set<string>()
  const addEdge = (source: string, target: string) => {
    if (target === source) return
    const key = `${source}>${target}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target })
  }

  const [contents, aliases] = await Promise.all([
    Promise.all(paths.map((p) => readFile(p).catch(() => ''))),
    loadPathAliases(readFile).catch(() => ({ baseUrl: '', paths: {} })),
  ])

  // Shared across every file rather than rebuilt per file — see
  // buildReferenceIndex; this scan is already the expensive step.
  const referenceIndex = buildReferenceIndex(resolvePool)

  paths.forEach((fromPath, i) => {
    const content = contents[i]
    if (!content) return
    const adapter = adapterForPath(fromPath)

    if (adapter) {
      for (const spec of adapter.detectImports(content)) {
        const target = adapter.resolveSpecifier(fromPath, spec.raw, resolvePool, aliases)
        if (target) addEdge(fromPath, target)
      }
    } else {
      for (const target of detectGenericTargets(content, fromPath, resolvePool)) addEdge(fromPath, target)
    }

    // Non-import references (CSS url()/@import, HTML+JSX src/href, Vite's
    // `new URL(..., import.meta.url)`, and asset paths written as plain
    // string props) — runs for EVERY file, adapter or not. It's additive, not
    // an else-branch: a .tsx both imports modules and points at assets, and
    // the css/html files that carry most asset references have no adapter at
    // all. Assets are the whole reason it exists (see assetRefs.ts) — without
    // it a font or image can never gain an edge in either direction.
    for (const target of detectAssetRefs(fromPath, content, referenceIndex)) addEdge(fromPath, target)

    // Config files additionally link to the files they NAME (an entry point, a
    // script's target, a referenced sibling config) — never to the files they
    // merely govern, which would wire one node to the whole repo. See
    // configRefs.ts for why that line is drawn where it is.
    if (isConfigPath(fromPath)) {
      for (const target of detectConfigRefs(fromPath, content, referenceIndex)) addEdge(fromPath, target)
    }
  })

  return edges
}
