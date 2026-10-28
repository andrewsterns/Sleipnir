import { describe, it, expect } from 'vitest'
import type { ArchitectureHealth } from '../api/PlatformAPI'
import { buildHealthLens, describeNodeHealth, edgeKey, healthRadius, heatOf, impactOf } from './healthLens'
import { composePlanView } from './composePlanView'

const file = (role: string, fanIn: number, fanOut: number, cycle: number | null = null) => ({
  role,
  fanIn,
  fanOut,
  instability: fanIn + fanOut ? fanOut / (fanIn + fanOut) : 0,
  lines: 100,
  cycle,
  eager: true,
  churn: 1,
})

const health: ArchitectureHealth = {
  analyzedAt: 0,
  durationMs: 1,
  summary: { files: 4, edges: 4, cycles: 1, filesInCycles: 2, dead: 1, violations: 1, hubs: 1, entries: 1 },
  perFile: {
    'src/a.ts': file('module', 1, 1, 0),
    'src/b.ts': file('module', 2, 1, 0),
    'src/utils/fmt.ts': file('util', 0, 1),
    'src/components/Tag.tsx': file('component', 9, 0),
  },
  entries: [],
  cycles: [{ files: ['src/a.ts', 'src/b.ts'], loops: [['src/a.ts', 'src/b.ts', 'src/a.ts']] }],
  cycleEdges: [
    ['src/a.ts', 'src/b.ts'],
    ['src/b.ts', 'src/a.ts'],
  ],
  hubs: ['src/components/Tag.tsx'],
  orchestrators: [],
  godFiles: [],
  dead: ['src/utils/fmt.ts'],
  reusedPages: [],
  violations: [{ source: 'src/utils/fmt.ts', target: 'src/components/Tag.tsx', fromRole: 'util', toRole: 'component' }],
  barrels: [],
  misplaced: [],
  heavy: [{ path: 'src/b.ts', package: 'three', eager: true }],
  hotspots: [],
  report: '',
}

describe('buildHealthLens', () => {
  it('keys the numbers by architecture node id', () => {
    const lens = buildHealthLens(health)
    expect(lens.nodes.get('arch/src/a.ts')).toMatchObject({ inCycle: true, unused: false })
    expect(lens.nodes.get('arch/src/utils/fmt.ts')).toMatchObject({ unused: true, upward: true })
    expect(lens.nodes.get('arch/src/components/Tag.tsx')).toMatchObject({ hub: true, fanIn: 9 })
    expect(lens.nodes.get('arch/src/b.ts')?.heavy).toEqual(['three'])
  })

  it('marks loop links and upward links by their drawn ids', () => {
    const lens = buildHealthLens(health)
    expect(lens.cycleEdges.has(edgeKey('arch/src/b.ts', 'arch/src/a.ts'))).toBe(true)
    expect(lens.upwardEdges.has(edgeKey('arch/src/utils/fmt.ts', 'arch/src/components/Tag.tsx'))).toBe(true)
    expect(lens.cycleEdges.has(edgeKey('arch/src/utils/fmt.ts', 'arch/src/components/Tag.tsx'))).toBe(false)
  })

  it('says what is wrong with a node in one line', () => {
    expect(describeNodeHealth(buildHealthLens(health).nodes.get('arch/src/b.ts')!)).toBe('in 2 · out 1 · module · in an import loop · loads three on first launch')
  })
})

describe('heatOf', () => {
  it('ranks by changes × importers × size, hottest = 1, tests and config cold', () => {
    const h: ArchitectureHealth = {
      ...health,
      perFile: {
        'src/hot.ts': { ...file('module', 20, 1), churn: 12, lines: 900 },
        'src/warm.ts': { ...file('module', 2, 1), churn: 3, lines: 100 },
        'src/still.ts': { ...file('module', 5, 1), churn: 0 },
        'src/hot.test.ts': { ...file('test', 0, 1), churn: 40 },
      },
    }
    const heat = heatOf(h)
    expect(heat.get('src/hot.ts')).toBe(1)
    expect(heat.get('src/warm.ts')).toBeGreaterThan(0)
    expect(heat.get('src/warm.ts')).toBeLessThan(0.5)
    expect(heat.has('src/still.ts')).toBe(false)
    expect(heat.has('src/hot.test.ts')).toBe(false)
    expect(buildHealthLens(h).nodes.get('arch/src/hot.ts')?.heat).toBe(1)
  })
})

describe('healthRadius', () => {
  it('grows with importers but stays capped', () => {
    expect(healthRadius(4, 0)).toBe(4)
    expect(healthRadius(4, 9)).toBeGreaterThan(healthRadius(4, 1))
    expect(healthRadius(4, 10_000)).toBe(11)
  })
})

describe('impactOf', () => {
  it('walks importers transitively for the blast radius', () => {
    const scan = { files: ['a', 'b', 'c'], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] }
    expect(impactOf(scan, 'c').dependents).toEqual([
      { path: 'b', distance: 1 },
      { path: 'a', distance: 2 },
    ])
    expect(impactOf(null, 'c')).toEqual({ dependents: [], dependencies: [] })
  })
})

describe('composePlanView under the Health lens', () => {
  it('draws the code alone, with nothing dimmed', () => {
    const plan = { nodes: [{ id: 'plan/x/step-1', label: 'Step', kind: 'proposed' as const, map: 'plan/x', type: 'plan-step', editsPaths: ['src/a.ts'] }], edges: [] }
    const scan = { files: ['src/a.ts', 'src/b.ts'], edges: [{ source: 'src/a.ts', target: 'src/b.ts' }] }
    expect(composePlanView(plan, 'plan/x', scan, 'architecture').overlay.size).toBeGreaterThan(0)
    const lensed = composePlanView(plan, 'plan/x', scan, 'health')
    expect(lensed.overlay.size).toBe(0)
    expect(lensed.data.nodes.map((n) => n.id)).toEqual(['arch/src/a.ts', 'arch/src/b.ts'])
    expect(lensed.data.edges).toEqual([{ source: 'arch/src/a.ts', target: 'arch/src/b.ts', kind: 'borrows' }])
  })
})
