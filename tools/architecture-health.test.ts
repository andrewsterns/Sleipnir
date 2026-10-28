// @vitest-environment node
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { analyzeArchitecture, architectureHealth } from './architecture-health.mjs'

const shop = path.join(__dirname, 'optimizeLab', 'react-shop')

describe('architecture health payload', () => {
  it('marks every import that closes a loop, in both directions of a two-file loop', () => {
    const h = architectureHealth(shop)
    const keys = h.cycleEdges.map(([s, t]: [string, string]) => `${s}>${t}`)
    expect(keys).toEqual(
      expect.arrayContaining([
        'src/store/cartStore.ts>src/api/cartApi.ts',
        'src/api/cartApi.ts>src/store/cartStore.ts',
        'src/utils/format.ts>src/components/PriceTag.tsx',
      ]),
    )
    // An import between two files in different loops (or none) is not a loop edge.
    expect(keys).not.toContain('src/App.tsx>src/pages/ProductPage.tsx')
  })

  it('carries counts and findings but no file contents', () => {
    const h = architectureHealth(shop)
    expect(h.perFile['src/pages/ProductPage.tsx']).toMatchObject({ role: 'page', fanIn: 4, fanOut: 6 })
    expect(h.dead).toEqual(['src/components/OldBanner.tsx', 'src/utils/legacyMath.ts'])
    expect(h.report).toContain('ProductPage')
    expect(JSON.stringify(h)).not.toContain('export function')
  })

  it('runs the same analysis in a worker thread', async () => {
    const h = await analyzeArchitecture(shop)
    expect(h.summary.cycles).toBe(3)
  })
})
