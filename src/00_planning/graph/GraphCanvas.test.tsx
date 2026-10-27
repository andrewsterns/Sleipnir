// The graph's visual ladder: every node and line in the theme's ink at 95% at
// rest; a clicked node, its neighbours and the lines between them at full;
// everything else pushed back; and nodes created since the project opened in
// blue until clicked.

import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'
import type { GraphData, GraphNode } from './types'

beforeAll(() => {
  // jsdom has neither; the canvas only needs them to exist.
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const node = (id: string): GraphNode => ({ id, label: id, kind: 'built', map: 'welcome' })

// a — b — c, plus a loner d: selecting b lights a, b, c and both links.
const DATA: GraphData = {
  nodes: [node('a'), node('b'), node('c'), node('d')],
  edges: [
    { source: 'a', target: 'b', kind: 'borrows' },
    { source: 'b', target: 'c', kind: 'borrows' },
  ],
}

function draw(props: Partial<React.ComponentProps<typeof GraphCanvas>> = {}) {
  const { container } = render(<GraphCanvas data={DATA} selectedId={null} onSelectNode={() => {}} {...props} />)
  // Each node's group is the <g> holding its hit circle; edges are the <line>s.
  const groups = [...container.querySelectorAll('svg > g > g')] as SVGGElement[]
  const nodeGroup = (id: string) => groups.find((g) => g.textContent?.includes(id))!
  const lines = [...container.querySelectorAll('line')] as SVGLineElement[]
  return { nodeGroup, lines, container }
}

describe('GraphCanvas opacity ladder', () => {
  it('draws every node and line at full strength at rest', () => {
    const { nodeGroup, lines } = draw()
    for (const id of ['a', 'b', 'c', 'd']) expect(nodeGroup(id).getAttribute('opacity')).toBe('1')
    for (const line of lines) expect(line.getAttribute('opacity')).toBe('1')
  })

  it('keeps a selected node and its neighbours at full, and pushes the rest back', () => {
    const { nodeGroup, lines } = draw({ selectedId: 'b' })
    for (const id of ['a', 'b', 'c']) expect(nodeGroup(id).getAttribute('opacity')).toBe('1')
    expect(nodeGroup('d').getAttribute('opacity')).toBe('0.3')
    for (const line of lines) expect(line.getAttribute('opacity')).toBe('1')
  })

  it('fades a link that does not touch the selection', () => {
    const { lines } = draw({ selectedId: 'a' })
    // a—b is a's own link; b—c is not.
    expect(lines.map((l) => l.getAttribute('opacity')).sort()).toEqual(['0.15', '1'])
  })

  it('draws every node in the theme ink, not a separate grey per state', () => {
    const { container } = draw({ selectedId: 'b' })
    const dots = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') !== 'transparent' && c.getAttribute('fill') !== 'none')
    for (const dot of dots) expect(dot.style.fill).toBe('var(--graph-node, #ffffff)')
  })

  it('rings the selected node, since its color no longer changes', () => {
    const { nodeGroup } = draw({ selectedId: 'b' })
    expect(nodeGroup('b').querySelector('circle[fill="none"]')).not.toBeNull()
    expect(nodeGroup('a').querySelector('circle[fill="none"]')).toBeNull()
  })
})

describe('GraphCanvas color rules', () => {
  const fills = (container: HTMLElement) =>
    // An outline ring's paint is its stroke; a solid dot's is its fill.
    [...container.querySelectorAll('circle')]
      .map((c) => (c.style.fill && c.style.fill !== 'none' ? c.style.fill : c.style.stroke))
      .filter(Boolean)

  it('draws a stage in the node ink — its shape says the stage, not its color', () => {
    const { container } = draw({ stages: { a: 'completed', b: 'in-progress' } })
    for (const f of fills(container)) expect(f).toBe('var(--graph-node, #ffffff)')
  })

  it("changes a node's shape when its stage changes", () => {
    const dot = (stage: 'completed' | 'in-progress') => {
      const { nodeGroup } = draw({ stages: { a: stage } })
      return [...nodeGroup('a').querySelectorAll('circle')].find((c) => c.style.stroke)!
    }
    expect(dot('completed').style.fill).toBe('var(--graph-node, #ffffff)')
    expect(dot('in-progress').style.fill).toBe('none')
  })

  it('keeps plan members in ink under an overlay, and fades the rest', () => {
    const { container, nodeGroup } = draw({ overlay: new Set(['a', 'b']) })
    for (const f of fills(container)) expect(f).not.toContain('--graph-plan')
    expect(nodeGroup('a').getAttribute('opacity')).toBe('1')
    expect(nodeGroup('d').getAttribute('opacity')).toBe('0.35')
  })
})
