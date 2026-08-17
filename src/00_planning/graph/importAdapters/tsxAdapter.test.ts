import { describe, it, expect } from 'vitest'
import { tsxAdapter } from './tsxAdapter'

// Smoke coverage for the JS/TS import adapter — the core of the graph<->code
// linking feature (scaffold auto-linking, ##token editor, node-card link
// editor all route through this). Pure functions, no fs.
describe('tsxAdapter', () => {
  it('detects both relative and bare-package import specifiers', () => {
    const content = `import { Foo } from './Foo'\nimport React from 'react'\nexport { Bar } from '../Bar'\n`
    const specs = tsxAdapter.detectImports(content).map((s) => s.raw)
    expect(specs).toEqual(expect.arrayContaining(['./Foo', 'react', '../Bar']))
  })

  it('detects side-effect imports (no `from`, e.g. CSS) without swallowing the import after them', () => {
    const content = `import './cards.css'\nimport { CardViewModel } from './CardViewModel'\nimport React from 'react'\n`
    const specs = tsxAdapter.detectImports(content).map((s) => s.raw)
    expect(specs).toEqual(['./cards.css', './CardViewModel', 'react'])
  })

  it('detects a lone side-effect import with no later `from` import in the file at all', () => {
    const content = `import './only-side-effect.css'\nexport function Bar() {}\n`
    expect(tsxAdapter.detectImports(content).map((s) => s.raw)).toEqual(['./only-side-effect.css'])
  })

  it('does not let the word "from" inside a string literal bridge into an unrelated later import', () => {
    const content = `export const greeting = "hello from the app"\nimport { X } from './x'\n`
    expect(tsxAdapter.detectImports(content).map((s) => s.raw)).toEqual(['./x'])
  })

  it('resolves a relative specifier to a real candidate and leaves bare packages null', () => {
    const candidates = ['feature/Foo.tsx', 'feature/Bar.tsx']
    expect(tsxAdapter.resolveSpecifier('feature/Bar.tsx', './Foo', candidates)).toBe('feature/Foo.tsx')
    expect(tsxAdapter.resolveSpecifier('feature/Bar.tsx', 'react', candidates)).toBeNull()
  })

  it('resolves an aliased specifier via a tsconfig-style paths map, and still leaves an unmapped bare package null', () => {
    const candidates = ['feature/Bar.tsx', 'src/molecules/nav-circle/NavCircleView.tsx']
    const aliases = { baseUrl: '', paths: { '@molecules/*': ['src/molecules/*'] } }
    expect(tsxAdapter.resolveSpecifier('feature/Bar.tsx', '@molecules/nav-circle/NavCircleView', candidates, aliases)).toBe(
      'src/molecules/nav-circle/NavCircleView.tsx',
    )
    expect(tsxAdapter.resolveSpecifier('feature/Bar.tsx', 'react', candidates, aliases)).toBeNull()
  })

  it('inserts an import for a target and is idempotent (no duplicate on re-insert)', () => {
    const from = 'feature/ShoppingCart.tsx'
    const to = 'feature/ShoppingCart.ViewModel.tsx'
    const once = tsxAdapter.insertImport('', from, to, 'ShoppingCart', 'view-model')
    expect(once).toContain("from './ShoppingCart.ViewModel'")
    const twice = tsxAdapter.insertImport(once, from, to, 'ShoppingCart', 'view-model')
    expect(twice).toBe(once)
  })

  it('removeImport strips the target import line', () => {
    const from = 'feature/ShoppingCart.tsx'
    const to = 'feature/ShoppingCart.ViewModel.tsx'
    const withImport = tsxAdapter.insertImport('', from, to, 'ShoppingCart', 'view-model')
    const removed = tsxAdapter.removeImport(withImport, from, to)
    expect(removed).not.toContain('./ShoppingCart.ViewModel')
  })
})
