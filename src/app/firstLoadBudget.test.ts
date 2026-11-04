import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The first paint parses everything main.tsx reaches through static imports.
// Heavy packages (the 3D renderer, the code editor, the terminal) belong
// behind a dynamic import() — see app/lazyViews.ts — so the app opens at the
// same speed however much modeling, rendering or editing grows. This walks
// the static import graph from main.tsx and fails if one of them is on it.
const HEAVY = [/^three(\/|$)/, /^@react-three\//, /^@xterm\//, /^codemirror$/, /^@codemirror\//, /^@lezer\//]

const SRC = path.resolve(__dirname, '..')
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']

// Static `import … from 'x'`, `import 'x'` and `export … from 'x'`; never
// `import type`/`export type` (erased) or `import('x')` (a separate chunk).
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolve(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec)
  for (const ext of EXTS) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

function eagerHeavyImports(entry: string): string[] {
  const seen = new Set<string>()
  const found: string[] = []
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(tsx?|m?js)$/.test(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const [, spec] of text.matchAll(STATIC_IMPORT)) {
      if (spec.startsWith('.')) {
        const next = resolve(file, spec)
        if (next) stack.push(next)
      } else if (HEAVY.some((re) => re.test(spec))) {
        found.push(`${path.relative(SRC, file).replace(/\\/g, '/')} imports ${spec}`)
      }
    }
  }
  return found.sort()
}

describe('first load', () => {
  it('keeps the 3D renderer, code editor and terminal off the first paint', () => {
    expect(eagerHeavyImports(path.join(SRC, 'main.tsx'))).toEqual([])
  })

  // Guards the walk itself: a lazy view's own graph must turn its package up.
  it('finds a heavy package behind a lazy view', () => {
    expect(eagerHeavyImports(path.join(SRC, 'app/Terminal/Terminal.tsx'))).toContainEqual(expect.stringContaining('@xterm/xterm'))
  })
})
