// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { analyzeGraph, blastRadius, dependenciesOf, featureTerms, formatReport, roleOf } from './graphCore.mjs'

const g = (edges: [string, string, string?][], extra: Record<string, unknown> = {}) => {
  const files = [...new Set(edges.flatMap(([a, b]) => [a, b]))]
  return { files, edges: edges.map(([source, target, kind]) => ({ source, target, kind: kind ?? 'static' })), ...extra }
}

describe('roleOf', () => {
  it('reads roles from paths across languages and conventions', () => {
    expect(roleOf('src/main.tsx')).toBe('entry')
    expect(roleOf('src/App.tsx')).toBe('entry')
    expect(roleOf('src/pages/CartPage.tsx')).toBe('page')
    expect(roleOf('src/app/shop/page.tsx')).toBe('page')
    expect(roleOf('src/canvas/CanvasView.ViewModel.tsx')).toBe('logic')
    expect(roleOf('src/hooks/useCart.ts')).toBe('logic')
    expect(roleOf('src/store/cartStore.ts')).toBe('data')
    expect(roleOf('src/utils/format.ts')).toBe('util')
    expect(roleOf('src/components/Badge.tsx')).toBe('component')
    // MVVM: a View is a component, not a page.
    expect(roleOf('src/app/SettingsView/SettingsView.tsx')).toBe('component')
    expect(roleOf('src/types.ts')).toBe('types')
    expect(roleOf('src/app/UIKit/Frame/iFrame.tsx')).toBe('types')
    expect(roleOf('src/a.test.ts')).toBe('test')
    expect(roleOf('internal/store/store_test.go')).toBe('test')
    expect(roleOf('cmd/server/main.go')).toBe('entry')
    // Unknown files get no layer rather than a wrong one.
    expect(roleOf('electron/chat.cjs')).toBe('module')
  })
})

describe('analyzeGraph', () => {
  it('counts fan-in and fan-out, and instability', () => {
    const a = analyzeGraph(g([['src/a.ts', 'src/lib/x.ts'], ['src/b.ts', 'src/lib/x.ts'], ['src/lib/x.ts', 'src/lib/y.ts']]))
    expect(a.perFile['src/lib/x.ts']).toMatchObject({ fanIn: 2, fanOut: 1, instability: 0.33 })
  })

  it('finds cycles at runtime only — a type-only loop is erased', () => {
    const runtime = analyzeGraph(g([['src/a.ts', 'src/b.ts'], ['src/b.ts', 'src/a.ts']]))
    expect(runtime.cycles).toHaveLength(1)
    expect(runtime.cycles[0].loop).toEqual(['src/a.ts', 'src/b.ts', 'src/a.ts'])
    const typeOnly = analyzeGraph(g([['src/a.ts', 'src/b.ts'], ['src/b.ts', 'src/a.ts', 'type']]))
    expect(typeOnly.cycles).toHaveLength(0)
  })

  it('lists separate loops hiding in one tangle', () => {
    const a = analyzeGraph(g([['p/a.ts', 'p/b.ts'], ['p/b.ts', 'p/a.ts'], ['p/b.ts', 'p/c.ts'], ['p/c.ts', 'p/d.ts'], ['p/d.ts', 'p/b.ts']]))
    expect(a.cycles).toHaveLength(1)
    expect(a.cycles[0].loops.length).toBeGreaterThanOrEqual(2)
  })

  it('calls a file dead only when nothing reaches it and it is no entry point', () => {
    const a = analyzeGraph(g([['src/main.tsx', 'src/used.ts']], { files: ['src/main.tsx', 'src/used.ts', 'src/orphan.ts', 'tools/cli.mjs'], entries: ['tools/cli.mjs'] }))
    expect(a.dead).toEqual(['src/orphan.ts'])
  })

  it('flags imports pointing up the layers, but not type-only ones', () => {
    const a = analyzeGraph(g([['src/utils/format.ts', 'src/components/Price.tsx'], ['src/utils/types2.ts', 'src/pages/HomePage.tsx', 'type']]))
    expect(a.violations.map((v: { source: string }) => v.source)).toEqual(['src/utils/format.ts'])
  })

  it('marks heavy packages reachable statically from an entry, but not behind a dynamic import', () => {
    const graph = g([['src/main.tsx', 'src/eager.ts'], ['src/main.tsx', 'src/lazy.ts', 'dynamic']], {
      external: { 'src/eager.ts': ['three'], 'src/lazy.ts': ['three'] },
    })
    const a = analyzeGraph(graph)
    expect(a.heavy.map((h: { path: string }) => h.path)).toEqual(['src/eager.ts'])
  })
})

describe('blast radius', () => {
  it('lists everything that depends on a file, nearest first', () => {
    const graph = g([['src/a.ts', 'src/b.ts'], ['src/b.ts', 'src/c.ts'], ['src/d.ts', 'src/c.ts']])
    expect(blastRadius(graph, 'src/c.ts')).toEqual([
      { path: 'src/b.ts', distance: 1 },
      { path: 'src/d.ts', distance: 1 },
      { path: 'src/a.ts', distance: 2 },
    ])
    expect(dependenciesOf(graph, 'src/a.ts').map((d: { path: string }) => d.path)).toEqual(['src/b.ts', 'src/c.ts'])
  })
})

describe('feature terms', () => {
  it('turns a request into searchable words, phrases and synonyms', () => {
    expect(featureTerms('/optimize my right click menu')).toEqual(expect.arrayContaining(['menu', 'contextmenu', 'rightclick']))
    expect(featureTerms('make the login faster')).toEqual(expect.arrayContaining(['login', 'auth']))
  })
})

describe('formatReport', () => {
  it('caps each section so the report stays small on any project', () => {
    const edges: [string, string][] = Array.from({ length: 60 }, (_, i) => [`src/f${i}.ts`, 'src/hub.ts'])
    const report = formatReport(analyzeGraph(g(edges)), { limit: 5 })
    expect(report).toContain('src/hub.ts (in 60')
    expect(report).toMatch(/…and 5\d more/)
    expect(report.length).toBeLessThan(4000)
  })

  it('limits listed files to a scope while counting importers from anywhere', () => {
    const a = analyzeGraph(g([['other/x.ts', 'src/lib/a.ts'], ['other/y.ts', 'src/lib/a.ts'], ['other/z.ts', 'src/lib/a.ts'], ['other/w.ts', 'src/lib/a.ts'], ['other/v.ts', 'src/lib/a.ts']]))
    const report = formatReport(a, { scope: 'src' })
    expect(report).toContain('src/lib/a.ts (in 5')
    expect(report).not.toContain('other/x.ts (in')
  })
})
