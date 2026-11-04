import { describe, it, expect } from 'vitest'
import { featureLabel, renderStepFiles } from './scaffoldPlan'
import type { GraphEdge, GraphNode } from './types'

const planned = (id: string, stepId: string, filePath: string, role: GraphNode['role'], language: GraphNode['language'] = 'react'): GraphNode => ({
  id,
  label: filePath,
  kind: 'proposed',
  map: 'claude',
  type: 'planned-file',
  planned: true,
  planId: 'plan/p',
  stepId,
  filePath,
  role,
  language,
})

const view = planned('view', 'step-1', 'src/cart/cartView.tsx', 'view')
const viewModel = planned('vm', 'step-1', 'src/cart/cartViewModel.tsx', 'view-model')
const iface = planned('iface', 'step-2', 'src/cart/cartInterface.ts', 'interface', 'typescript')
const edges: GraphEdge[] = [
  { source: 'view', target: 'vm', kind: 'borrows' },
  { source: 'vm', target: 'iface', kind: 'borrows' },
]
const nodes = [view, viewModel, iface]
const byPath = (n: GraphNode) => n.filePath!

describe('featureLabel', () => {
  it('strips the extension and the role suffix', () => {
    expect(featureLabel('src/cart/cartViewModel.tsx', 'view-model')).toBe('cart')
    expect(featureLabel('src/cart/cart.tsx', 'node')).toBe('cart')
    expect(featureLabel('src/View.tsx', 'view')).toBe('View')
  })
})

describe('renderStepFiles', () => {
  it("renders the step's files from templates and imports siblings written with them", () => {
    const { files, importUpdates } = renderStepFiles({ stepId: 'step-1', plannedNodes: nodes, edges, pathFor: byPath, existingPaths: new Set() })
    expect(files.map((f) => f.path)).toEqual(['src/cart/cartView.tsx', 'src/cart/cartViewModel.tsx'])
    const viewFile = files.find((f) => f.nodeId === 'view')!
    expect(viewFile.content).toContain('./cartViewModel')
    expect(viewFile.content).toContain('CartView')
    // The interface belongs to a later step that hasn't been written yet.
    expect(files.find((f) => f.nodeId === 'vm')!.content).not.toContain('cartInterface')
    expect(importUpdates).toEqual([])
  })

  it('imports a file an earlier step already wrote to disk', () => {
    const { files } = renderStepFiles({
      stepId: 'step-1',
      plannedNodes: nodes,
      edges,
      pathFor: byPath,
      existingPaths: new Set(['src/cart/cartInterface.ts']),
    })
    expect(files.find((f) => f.nodeId === 'vm')!.content).toContain('./cartInterface')
  })

  it('lists existing files that should gain an import of the new ones', () => {
    const { importUpdates } = renderStepFiles({
      stepId: 'step-2',
      plannedNodes: nodes,
      edges,
      pathFor: byPath,
      existingPaths: new Set(['src/cart/cartView.tsx', 'src/cart/cartViewModel.tsx']),
    })
    expect(importUpdates).toEqual([
      { path: 'src/cart/cartViewModel.tsx', importPath: 'src/cart/cartInterface.ts', label: 'cart', role: 'interface', language: 'react' },
    ])
  })

  it('uses edited paths for both the files and their imports', () => {
    const moved = (n: GraphNode) => (n.id === 'vm' ? 'src/features/cart/cartViewModel.tsx' : n.filePath!)
    const { files } = renderStepFiles({ stepId: 'step-1', plannedNodes: nodes, edges, pathFor: moved, existingPaths: new Set() })
    expect(files.find((f) => f.nodeId === 'vm')!.path).toBe('src/features/cart/cartViewModel.tsx')
    expect(files.find((f) => f.nodeId === 'view')!.content).toContain('../features/cart/cartViewModel')
  })

  it('renders other languages from their templates', () => {
    const rust = planned('rs', 'step-9', 'src/cart/cart_view.rs', 'view', 'rust')
    const { files } = renderStepFiles({ stepId: 'step-9', plannedNodes: [rust], edges: [], pathFor: byPath, existingPaths: new Set() })
    expect(files[0].content.length).toBeGreaterThan(0)
  })

  it('writes an empty file when no language is known', () => {
    const { language: _omit, ...plain } = planned('txt', 'step-9', 'docs/notes.txt', 'node')
    const { files } = renderStepFiles({ stepId: 'step-9', plannedNodes: [plain], edges: [], pathFor: byPath, existingPaths: new Set() })
    expect(files[0].content).toBe('')
  })
})
