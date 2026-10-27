import { describe, it, expect } from 'vitest'
import { buildForceLayout } from './layout'
import type { GraphData, GraphNode } from './types'

const node = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({ id, label: id, kind: 'proposed', map: 'm', ...extra })

const plan: GraphData = {
  nodes: [
    node('step-1', { type: 'plan-step', order: 1 }),
    node('step-2', { type: 'plan-step', order: 2 }),
    node('file', { type: 'planned-file', planned: true, stepId: 'step-1', filePath: 'src/a.tsx' }),
  ],
  edges: [
    { source: 'step-1', target: 'step-2', kind: 'sequence' },
    { source: 'step-1', target: 'file', kind: 'plan-step' },
  ],
}

describe('buildForceLayout', () => {
  it('keeps every link, with its kind, for drawing', () => {
    const { simLinks } = buildForceLayout(plan)
    expect(simLinks.map((l) => l.kind)).toEqual(['sequence', 'plan-step'])
  })

  it('keeps sequence links out of the force simulation', () => {
    const { simulation } = buildForceLayout(plan)
    const linkForce = simulation.force('link') as unknown as { links: () => Array<{ kind: string }> }
    expect(linkForce.links().map((l) => l.kind)).toEqual(['plan-step'])
  })

  it('still treats sequence-linked steps as neighbors for selection highlighting', () => {
    const { neighbors } = buildForceLayout(plan)
    expect(neighbors.get('step-1')?.has('step-2')).toBe(true)
  })

  it('seeds a newly appearing planned file beside its step', () => {
    const prev = new Map([['step-1', { x: 500, y: -300, vx: 0, vy: 0 }]])
    const { simNodes } = buildForceLayout(plan, prev)
    const file = simNodes.find((n) => n.id === 'file')!
    expect(Math.hypot(file.x! - 500, file.y! + 300)).toBeCloseTo(60, 5)
  })

  it('resolves sequence links to their nodes up front, since forceLink never sees them', () => {
    const { simLinks, simNodes } = buildForceLayout(plan)
    const seq = simLinks.find((l) => l.kind === 'sequence')!
    expect(seq.source).toBe(simNodes.find((n) => n.id === 'step-1'))
    expect(seq.target).toBe(simNodes.find((n) => n.id === 'step-2'))
  })

  describe('a node added to a settled graph', () => {
    const grown: GraphData = {
      nodes: [node('a', { kind: 'built' }), node('b', { kind: 'built' }), node('new', { kind: 'built' })],
      edges: [
        { source: 'a', target: 'b', kind: 'borrows' },
        { source: 'new', target: 'a', kind: 'borrows' },
      ],
    }
    const prev = new Map([
      ['a', { x: 1000, y: 1000, vx: 0, vy: 0 }],
      ['b', { x: 1140, y: 1000, vx: 0, vy: 0 }],
    ])

    it('starts beside what it links to, not out on the rim', () => {
      const { simNodes } = buildForceLayout(grown, prev)
      const added = simNodes.find((n) => n.id === 'new')!
      expect(Math.hypot(added.x! - 1000, added.y! - 1000)).toBeCloseTo(70, 5)
    })

    it('reports how much of the graph is new, so the canvas can reheat to match', () => {
      expect(buildForceLayout(grown, prev)).toMatchObject({ carriedCount: 2, addedCount: 1 })
      expect(buildForceLayout(grown)).toMatchObject({ carriedCount: 0, addedCount: 3 })
    })
  })

  it('leaves a planned file where it already was', () => {
    const prev = new Map([
      ['step-1', { x: 500, y: -300, vx: 0, vy: 0 }],
      ['file', { x: 1, y: 2, vx: 0, vy: 0 }],
    ])
    const { simNodes } = buildForceLayout(plan, prev)
    expect(simNodes.find((n) => n.id === 'file')).toMatchObject({ x: 1, y: 2 })
  })
})
