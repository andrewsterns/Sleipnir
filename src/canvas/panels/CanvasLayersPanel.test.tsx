// The left panel by document kind (src/canvas/LAYOUT.md): an environment lists
// what was built — Parts, then unused Sketches, then Planes — and a Sketch its
// layer tree alone.

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CanvasLayersPanel, type CanvasLayersPanelProps } from './CanvasLayersPanel'
import type { CanvasDoc, CanvasNode } from '../../document/types'
import { setSolidOf } from '../../document/objects'

const layer = (id: string, extra: Partial<CanvasNode> = {}): CanvasNode =>
  ({ id, name: id, kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, children: [], ...extra }) as CanvasNode
const docOf = (nodes: CanvasNode[]): CanvasDoc => ({ version: 1, id: 'b', name: 'b', nodes, components: [], createdAt: 0, updatedAt: 0 })

const props = (doc: CanvasDoc, extra: Partial<CanvasLayersPanelProps> = {}): CanvasLayersPanelProps => ({
  doc,
  selectedIds: new Set(),
  onSelect: vi.fn(),
  onToggleHidden: vi.fn(),
  onToggleLocked: vi.fn(),
  dirtyComponentIds: new Set(),
  onPush: vi.fn(),
  fileStages: new Map(),
  onSetStatus: vi.fn(),
  onDeleteLayer: vi.fn(),
  planNodeLinks: new Map(),
  onAddSketch: vi.fn(),
  ...extra,
})

const environment = () =>
  setSolidOf(
    docOf([
      layer('Base', { sketch: { plane: { kind: 'default', plane: 'top' } } }),
      layer('Floor plan', { sketch: { plane: { kind: 'default', plane: 'top' } } }),
      layer('Card', { sketch: { plane: { kind: 'default', plane: 'front' }, link: { doc: 'checkout' } } }),
    ]),
    'Base',
    { kind: 'extrude', depth: 1 },
    'Desk',
  )

const sections = () => [...document.querySelectorAll('[data-canvas-section]')].map((el) => el.getAttribute('data-canvas-section'))

describe('an environment’s left panel', () => {
  it('lists parts first, then unused sketches with where they stand, then the planes closed', () => {
    render(<CanvasLayersPanel {...props(environment())} planes sketchName={(id) => (id === 'checkout' ? 'Checkout' : undefined)} />)
    expect(sections()).toEqual(['Parts', 'Sketches', 'Planes'])
    expect(screen.getByText('Desk')).toBeTruthy()
    expect(screen.getByText('Top')).toBeTruthy()
    expect(screen.getByText('from Checkout')).toBeTruthy()
    // The part's sketch is under the part, not under Sketches.
    expect(screen.queryByText('Base')).toBeNull()
    expect(screen.queryByText(/· empty/)).toBeNull()
    expect(document.querySelector('[data-canvas-plane]')).toBeNull()
    expect(screen.getByText('Planes (3)')).toBeTruthy()

    fireEvent.click(screen.getByText('Planes (3)'))
    expect([...document.querySelectorAll('[data-canvas-plane]')].map((el) => el.textContent)).toEqual(['Front', 'Top', 'Side'])
  })

  it('says what to do when nothing is built, and says it is filtered in sketch mode', () => {
    const { rerender } = render(<CanvasLayersPanel {...props(docOf([]))} planes />)
    expect(screen.getByText(/Nothing built yet/)).toBeTruthy()
    rerender(<CanvasLayersPanel {...props(docOf([layer('Sketch 1')]))} planes filteredTo="Sketch 1" />)
    expect(screen.getByText(/Showing Sketch 1 only/)).toBeTruthy()
    expect(sections()).toEqual(['Sketches'])
  })
})

describe('what’s broken is flagged, not deleted', () => {
  it('marks a feature whose sketch was deleted, says why, and offers re-pick and delete', () => {
    const doc = environment()
    const feature = doc.objects![0].features[0]
    const broken = { ...doc, nodes: doc.nodes.filter((n) => n.id !== 'Base') }
    const onRepick = vi.fn()
    const onDelete = vi.fn()
    render(
      <CanvasLayersPanel {...props(broken)} planes problems={new Map([[feature.id, 'Its sketch was deleted']])} onRepickFeature={onRepick} onDeleteFeature={onDelete} />,
    )
    // The part stays, with a warning; opened, the feature says why.
    expect(screen.getByText('Desk')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Expand'))
    expect(screen.getByText(/Its sketch was deleted\. Right-click to re-pick/)).toBeTruthy()
    fireEvent.contextMenu(screen.getByText('Extrude 1'))
    fireEvent.click(screen.getByText('Delete Extrude 1'))
    expect(onDelete).toHaveBeenCalledWith(feature.id)
  })

  it('marks a broken sketch in the Sketches list in place of where it stands', () => {
    render(<CanvasLayersPanel {...props(environment())} planes problems={new Map([['Card', 'The sketch it was placed from was deleted']])} />)
    expect(screen.getByText('Broken')).toBeTruthy()
    expect(screen.queryByText(/^from /)).toBeNull()
  })
})

describe('a Sketch’s left panel', () => {
  it('is the layer tree alone — no sections, no planes, no parts', () => {
    render(<CanvasLayersPanel {...props(docOf([layer('Header'), layer('Footer')]))} planes={false} />)
    expect(sections()).toEqual([])
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.getByText('Footer')).toBeTruthy()
  })
})
