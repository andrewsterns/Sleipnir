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

  it('leaves a planned file where it already was', () => {
    const prev = new Map([
      ['step-1', { x: 500, y: -300, vx: 0, vy: 0 }],
      ['file', { x: 1, y: 2, vx: 0, vy: 0 }],
    ])
    const { simNodes } = buildForceLayout(plan, prev)
    expect(simNodes.find((n) => n.id === 'file')).toMatchObject({ x: 1, y: 2 })
  })
})
