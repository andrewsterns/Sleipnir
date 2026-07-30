import { describe, it, expect } from 'vitest'
import { reshapeSpecifier } from './refactor-engine.mjs'

// The correctness-critical part of the Refactor move/rewrite algorithm:
// a rewritten specifier must preserve the ORIGINAL's shape (bare/extensionless
// vs explicit .ts/.tsx vs a bare directory resolving via an index.ts barrel),
// not just emit a fully-resolved path — see refactor-engine.mjs's own
// commentary on why this is the single highest-risk item in the feature.
describe('reshapeSpecifier', () => {
  it('keeps a bare (extensionless) specifier extensionless after strip', () => {
    // e.g. `from './iButton'` resolving to Interfaces/01_atoms/Button/iButton.tsx
    expect(reshapeSpecifier('bare', '../../../Interfaces/01_atoms/Button/iButton.tsx')).toBe(
      '../../../Interfaces/01_atoms/Button/iButton',
    )
  })

  it('keeps an explicit-extension specifier extensioned', () => {
    // e.g. `from './Frame.tsx'` (rare in this codebase, but resolveImport's
    // 'exact' candidate matches it when the specifier already names the file)
    expect(reshapeSpecifier('exact', '../../Views/01_atoms/Frame/Frame.tsx')).toBe(
      '../../Views/01_atoms/Frame/Frame.tsx',
    )
  })

  it('collapses an index-barrel specifier back to a bare directory, never growing "/index"', () => {
    // e.g. `from '../../00_themes'` resolving via 00_themes/index.ts
    expect(reshapeSpecifier('index', '../../../00_themes/index.ts')).toBe('../../../00_themes')
  })

  it('prefixes a same-directory result with "./" when the relative path has no leading dot', () => {
    // path.relative() can return a bare filename with no './' when the
    // target is a direct sibling — the specifier must still read as relative.
    expect(reshapeSpecifier('bare', 'Frame.tsx')).toBe('./Frame')
  })

  it('handles an index-barrel move landing in the same directory (edge: empty remainder)', () => {
    expect(reshapeSpecifier('index', 'index.ts')).toBe('.')
  })
})
