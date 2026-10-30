// The graph's visual ladder: every node and line in its tone at rest (status
// combined with git — see nodeTone.ts); a clicked node, its neighbours and the
// lines between them as they are; everything else pushed back.

import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { GraphCanvas } from './GraphCanvas'
import type { GraphData, GraphNode } from './types'
import { TONE_STYLE } from './nodeTone'

const COMMITTED = TONE_STYLE.committed.color

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

  it('draws untouched nodes as committed: faint, all the same', () => {
    const { container } = draw({ selectedId: 'b' })
    const dots = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') !== 'transparent' && c.getAttribute('fill') !== 'none')
    for (const dot of dots) expect(dot.style.fill).toBe(COMMITTED)
  })

  it('rings the selected node, since its color no longer changes', () => {
    const { nodeGroup } = draw({ selectedId: 'b' })
    expect(nodeGroup('b').querySelector('circle[fill="none"]')).not.toBeNull()
    expect(nodeGroup('a').querySelector('circle[fill="none"]')).toBeNull()
  })
})

describe('GraphCanvas tones', () => {
  const paintOf = (g: Element) => {
    // A ring's paint is its stroke; a dot's is its fill.
    const c = [...g.querySelectorAll('circle')].find((el) => el.style.stroke || el.style.fill)!
    return c.style.fill && c.style.fill !== 'none' ? { color: c.style.fill, ring: false, dash: c.getAttribute('stroke-dasharray') } : { color: c.style.stroke, ring: true, dash: c.getAttribute('stroke-dasharray') }
  }

  it('draws each status in its tone: proposed and in progress blue rings, done a white dot', () => {
    const { nodeGroup } = draw({ stages: { a: 'pending', b: 'in_progress', c: 'completed' } })
    expect(paintOf(nodeGroup('a'))).toEqual({ color: TONE_STYLE.proposed.color, ring: true, dash: '3 1' })
    expect(paintOf(nodeGroup('b'))).toEqual({ color: TONE_STYLE.in_progress.color, ring: true, dash: null })
    expect(paintOf(nodeGroup('c'))).toEqual({ color: TONE_STYLE.done.color, ring: false, dash: null })
    expect(paintOf(nodeGroup('d'))).toEqual({ color: COMMITTED, ring: false, dash: null })
  })

  it('lets the tones it is given win over status alone', () => {
    const { nodeGroup } = draw({ stages: { a: 'completed' }, tones: new Map([['a', 'committed' as const]]) })
    expect(paintOf(nodeGroup('a')).color).toBe(COMMITTED)
  })

  it('draws a line in the more active tone of its two ends, dashed while proposed', () => {
    const { lines } = draw({ stages: { a: 'pending', c: 'completed' } })
    // a—b: proposed beats committed; b—c: done beats committed.
    const [ab, bc] = lines
    expect(ab.style.stroke).toBe(TONE_STYLE.proposed.color)
    expect(ab.getAttribute('stroke-dasharray')).toBe('5 4')
    expect(bc.style.stroke).toBe(TONE_STYLE.done.color)
    expect(bc.getAttribute('stroke-dasharray')).toBeNull()
  })

  it('pulses a plan step in progress, and nothing else', () => {
    const step = (id: string): GraphNode => ({ ...node(id), type: 'plan-step' })
    const data: GraphData = { nodes: [step('s1'), step('s2'), node('f')], edges: [] }
    const { container } = render(
      <GraphCanvas
        data={data}
        selectedId={null}
        onSelectNode={() => {}}
        stages={{ s1: 'in_progress', s2: 'pending', f: 'in_progress' }}
      />,
    )
    const pulsing = [...container.querySelectorAll('.graph-step-pulse')].map((c) => c.closest('g')?.textContent)
    expect(pulsing).toHaveLength(1)
    expect(pulsing[0]).toContain('s1')
  })

  it('no longer dims what is outside the plan — the tones say what matters', () => {
    const { nodeGroup } = draw({ overlay: new Set(['a', 'b']) })
    expect(nodeGroup('a').getAttribute('opacity')).toBe('1')
    expect(nodeGroup('d').getAttribute('opacity')).toBe('1')
  })
})
