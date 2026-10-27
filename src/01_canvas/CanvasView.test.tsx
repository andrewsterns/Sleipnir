// Drives the real Canvas view the way a user does: pick the Frame tool, drag
// on the board, and assert a frame node actually lands in the persisted doc.
//
// The workspace file API is the only thing stubbed — everything else (the
// ViewModel, usePanZoom, the hit-testing, the <Frame> renderer) is the real
// code path.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// ── Stub the workspace transport with an in-memory filesystem ──
const files = new Map<string, string>()

vi.mock('../00_planning/api/sleipnirApi', () => ({
  listWorkspaceDir: vi.fn(async (dir: string) => ({
    tree: [...files.keys()]
      .filter((p) => dir === '' || p.startsWith(`${dir}/`))
      .map((p) => ({ name: dir === '' ? p : p.slice(dir.length + 1), path: p, type: 'file' as const, createdAt: 0 })),
  })),
  // Binary files for image fills, stored as base64 in the same map.
  readWorkspaceImageDataUrl: vi.fn(async (p: string) => {
    if (!files.has(p)) throw new Error(`ENOENT ${p}`)
    return { dataUrl: `data:image/png;base64,${files.get(p)}` }
  }),
  createWorkspaceBinaryFile: vi.fn(async (p: string, base64: string) => {
    if (files.has(p)) throw new Error(`${p} already exists`)
    files.set(p, base64)
  }),
  readWorkspaceFile: vi.fn(async (p: string) => {
    if (!files.has(p)) throw new Error(`ENOENT ${p}`)
    return { content: files.get(p)! }
  }),
  writeWorkspaceFile: vi.fn(async (p: string, content: string) => {
    files.set(p, content)
  }),
  deleteWorkspacePath: vi.fn(async (p: string) => {
    files.delete(p)
  }),
  // Mirrors the backend: refuses to overwrite, so approving can never silently
  // clobber an existing file.
  createWorkspaceFile: vi.fn(async (p: string, content: string) => {
    if (files.has(p)) throw new Error(`${p} already exists`)
    files.set(p, content ?? '')
  }),
  createWorkspaceDir: vi.fn(async () => {}),
  // Case-insensitive line search, the backend's searchDir in miniature — what
  // finds a component file moved outside Sleipnir by its sentinel.
  searchWorkspace: vi.fn(async (query: string) => ({
    matches: [...files.entries()].flatMap(([path, content]) =>
      content.split('\n').flatMap((lineText, i) =>
        lineText.toLowerCase().includes(query.toLowerCase()) ? [{ path, line: i + 1, column: 1, lineText }] : [],
      ),
    ),
    truncated: false,
  })),
  // Planning-side reads reached indirectly: CanvasView's layer delete cascade
  // (deleteNote / planNodesUnderPath) and the stage overlay useFileStages and
  // stagesStore pull in. Empty results — this suite is about canvas behavior,
  // and a project with no planning data is a perfectly real case.
  getNotes: vi.fn(async () => ({ nodes: [], edges: [] })),
  getNodeStages: vi.fn(async () => ({ stages: {} })),
  setNodeStage: vi.fn(async () => ({ stages: {} })),
  deleteNote: vi.fn(async () => {}),
  planNodesUnderPath: vi.fn(async () => []),
}))

import { CanvasView } from './CanvasView'
import { reconcileDelete } from './model/store'

const PROJECT = { path: 'C:/proj', name: 'proj' }
const BOARD_W = 1000
const BOARD_H = 800

// jsdom implements no PointerEvent at all, so fireEvent.pointerDown would
// otherwise deliver an event with button/clientX undefined — and the board's
// `e.button !== 0` guard would correctly reject it. MouseEvent already carries
// everything the canvas reads, so subclassing it is enough.
class JsdomPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

/**
 * Where the stubbed layout puts specific nodes, keyed by node id.
 *
 * jsdom runs no flexbox, so an auto-layout frame would place its children
 * nowhere at all. These entries stand in for the boxes a real browser would
 * produce, which is exactly what the canvas now measures for a laid-out child —
 * see hooks/useMeasuredRects.ts. With the camera at identity and the board at
 * the origin, a screen box here is also the board box.
 */
const layoutBoxes = new Map<string, { left: number; top: number; width: number; height: number }>()

function stubLayout() {
  if (!('PointerEvent' in globalThis)) {
    ;(globalThis as unknown as { PointerEvent: unknown }).PointerEvent = JsdomPointerEvent
  }

  // jsdom gives every element a zero-size rect, which would collapse all the
  // screen→board math to a single point.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const isBoard = this.hasAttribute?.('data-canvas-board')
    const nodeId = this.getAttribute?.('data-canvas-node')
    const placed = nodeId ? layoutBoxes.get(nodeId) : undefined
    if (placed) {
      return {
        x: placed.left, y: placed.top, left: placed.left, top: placed.top,
        width: placed.width, height: placed.height,
        right: placed.left + placed.width, bottom: placed.top + placed.height,
        toJSON: () => ({}),
      } as DOMRect
    }
    return {
      x: 0, y: 0, left: 0, top: 0,
      width: isBoard ? BOARD_W : 100,
      height: isBoard ? BOARD_H : 100,
      right: isBoard ? BOARD_W : 100,
      bottom: isBoard ? BOARD_H : 100,
      toJSON: () => ({}),
    } as DOMRect
  }
  // Not implemented in jsdom; the pan/drag handlers call both.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
}

/** The board is the container usePanZoom attaches its containerRef to. */
function getBoard(): HTMLElement {
  const el = document.querySelector('[data-canvas-board]')
  if (!el) throw new Error('board container not found')
  return el as HTMLElement
}

/** Picks the Frame tool and drags a frame between two screen points. */
function drawFrame(x1 = 100, y1 = 120, x2 = 340, y2 = 300) {
  fireEvent.click(screen.getByTitle(/^Frame \(F\)/))
  const board = getBoard()
  fireEvent.pointerDown(board, { clientX: x1, clientY: y1, button: 0, pointerId: 1 })
  fireEvent.pointerMove(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
  fireEvent.pointerUp(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
}

/** Clicks (press + release with no movement) at a board point. */
function clickAt(x: number, y: number, init: Record<string, unknown> = {}) {
  const board = getBoard()
  fireEvent.pointerDown(board, { clientX: x, clientY: y, button: 0, pointerId: 1, ...init })
  fireEvent.pointerUp(board, { clientX: x, clientY: y, button: 0, pointerId: 1, ...init })
}

/** The inspector's number field under a label. */
function numberInput(label: string) {
  return screen.getByText(label).parentElement!.querySelector('input') as HTMLInputElement
}

/** Drags the current selection from one point to another. */
function dragFrom(x1: number, y1: number, x2: number, y2: number) {
  const board = getBoard()
  fireEvent.pointerDown(board, { clientX: x1, clientY: y1, button: 0, pointerId: 1 })
  fireEvent.pointerMove(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
  fireEvent.pointerUp(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
}

/** The board doc currently persisted. */
function currentDoc() {
  return savedDocs()[0]
}

/**
 * The Create Component dialog. Scoped so its NAME field is unambiguous, and
 * matched on the title SPAN so it never picks up the inspector's identically
 * labelled "Create component" button.
 *
 * No longer reachable from promotion — promoting writes its own file. This is
 * the rename/retarget dialog, opened from the inspector over a component that
 * already exists.
 */
async function findModal(): Promise<HTMLElement> {
  // Titled CREATE or EDIT depending on whether the component already has a
  // file — matched on either so callers don't have to care which mode they
  // opened it in.
  const title = await screen.findByText(/^(CREATE|EDIT) COMPONENT$/, { selector: 'span' })
  return title.parentElement as HTMLElement
}

/** Real component code — everything written outside the board store. */
function componentFiles(): string[] {
  // Everything except board JSON (which now lives in .components/.boards/) and the
  // staging tier's editor tsconfig, which is config, not a component.
  return [...files.keys()].filter(
    (p) => !p.startsWith('.components/.boards/') && !p.startsWith('.planning/') && p !== '.components/tsconfig.json',
  )
}

/**
 * Promotes the selected frame.
 *
 * One click, no dialog: the component lands on the board AND its file lands in
 * `.components` at a derived path. Waits for the file, since that write is what the
 * board mutation is committed behind.
 */
async function promoteFrame(): Promise<void> {
  const before = componentFiles().length
  fireEvent.click(await screen.findByText('CREATE COMPONENT', { selector: 'button' }))
  await waitFor(() => expect(componentFiles()).toHaveLength(before + 1))
}

function savedDocs() {
  return [...files.entries()]
    .filter(([p]) => p.startsWith('.components/.boards/'))
    .map(([, content]) => JSON.parse(content))
}

beforeEach(() => {
  files.clear()
  layoutBoxes.clear()
  stubLayout()
})

describe('CanvasView', () => {
  it('shows the no-project empty state instead of an unusable board', () => {
    render(<CanvasView activeProject={null} />)
    expect(screen.getByText('No project open')).toBeInTheDocument()
  })

  it('offers to create the first board when the project has none', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    expect(await screen.findByText('NO BOARDS YET')).toBeInTheDocument()
  })

  it('creates a board and persists it under .components/.boards/', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))

    await waitFor(() => expect(savedDocs()).toHaveLength(1))
    const [path] = [...files.keys()]
    expect(path).toMatch(/^\.components\/\.boards\/canvas-.*\.json$/)
    expect([...files.keys()].some((p) => p.startsWith('.planning/'))).toBe(false)
    expect(savedDocs()[0].nodes).toEqual([])
    expect(savedDocs()[0].version).toBe(1)
  })

  it('draws a frame by dragging with the Frame tool, and autosaves it', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    // Pick the Frame tool the way a user does.
    fireEvent.click(screen.getByTitle(/^Frame \(F\)/))

    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: 100, clientY: 120, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 340, clientY: 300, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 340, clientY: 300, button: 0, pointerId: 1 })

    // The board is no longer empty, and the new frame is named in both the
    // layers panel and its own board label.
    await waitFor(() => expect(screen.queryByText('EMPTY BOARD')).not.toBeInTheDocument())
    expect(screen.getAllByText('Frame').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-canvas-frame-label="Frame"]')).not.toBeNull()

    await waitFor(() => expect(savedDocs()[0]?.nodes).toHaveLength(1))
    const node = savedDocs()[0].nodes[0]
    expect(node.kind).toBe('frame')
    // Camera is identity at 100%, so board coords equal the drag rect.
    expect(node.rect).toEqual({ x: 100, y: 120, w: 240, h: 180 })
  })

  // The camera is one person's view, and boards are committed: carrying it in
  // the board put a pan into every diff. It is remembered per machine instead.
  it('saves boards without the camera', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()

    await waitFor(() => expect(savedDocs()[0]?.nodes).toHaveLength(1))
    expect(savedDocs()[0]).not.toHaveProperty('camera')
    await waitFor(() =>
      expect(Object.keys(localStorage).some((k) => k.startsWith('sleipnir.canvas.camera:C:/proj:'))).toBe(true),
    )
  })

  it('selects the new frame and shows its geometry in the inspector', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    fireEvent.click(screen.getByTitle(/^Frame \(F\)/))
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: 50, clientY: 60, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 250, clientY: 160, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 250, clientY: 160, button: 0, pointerId: 1 })

    // Drawing selects, so the inspector leaves the "Nothing selected" state.
    await waitFor(() => expect(screen.queryByText('Nothing selected')).not.toBeInTheDocument())

    // The name field is populated from the selected node.
    expect(screen.getByDisplayValue('Frame')).toBeInTheDocument()
    // Geometry reflects the drag: x=50 y=60 w=200 h=100.
    expect(screen.getAllByDisplayValue('200').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('100').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('50').length).toBeGreaterThan(0)
    expect(screen.getAllByDisplayValue('60').length).toBeGreaterThan(0)
  })

  it('reloads a persisted board on remount, so boards survive leaving the tab', async () => {
    const first = render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    fireEvent.click(screen.getByTitle(/^Frame \(F\)/))
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: 10, clientY: 10, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 110, clientY: 110, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 110, clientY: 110, button: 0, pointerId: 1 })
    await waitFor(() => expect(savedDocs()[0]?.nodes).toHaveLength(1))

    first.unmount()

    render(<CanvasView activeProject={PROJECT} />)
    // The frame comes back from disk, not from memory.
    expect(await screen.findByText('Frame')).toBeInTheDocument()
    expect(screen.queryByText('EMPTY BOARD')).not.toBeInTheDocument()
  })

  it('puts the tool picker in a floating toolbar over the board, not the top bar', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    const toolbar = document.querySelector('[data-canvas-toolbar]')
    expect(toolbar).not.toBeNull()
    // It lives inside the board container, so it floats over the canvas area.
    expect(getBoard().contains(toolbar)).toBe(true)
    // Matched by prefix: tooltips go on to list the tool's modifier keys.
    for (const hint of [/^Select \(V\)/, /^Frame \(F\)/, /^Text \(T\)/]) {
      expect(screen.getByTitle(hint)).toBeInTheDocument()
    }
  })

  it('promotes a frame into a component, replacing it with a labelled instance', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()

    await promoteFrame()

    // The frame is gone from the doc; an instance stands in its place.
    await waitFor(() => {
      const nodes = savedDocs()[0]?.nodes ?? []
      expect(nodes).toHaveLength(1)
      expect(nodes[0].kind).toBe('instance')
    })
    const saved = savedDocs()[0]
    expect(saved.components).toHaveLength(1)
    expect(saved.components[0].variants).toHaveLength(1)

    // Promotion is the write. The file lands in the staging tier at a derived
    // path with no dialog, and the component records it — the two-step
    // "promote, then approve somewhere" flow is gone.
    expect(saved.components[0].componentRoot).toBe('.components')
    expect(componentFiles()).toEqual(['.components/frame/frame.tsx'])
    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.filePath).toBe('.components/frame/frame.tsx')
      expect(component.sync).toBe('live')
      expect(component.lastWrittenHash).toBeTruthy()
    })

    // The on-canvas label names it.
    expect(screen.getAllByText('Frame').length).toBeGreaterThan(0)
  })

  it('de-conflicts the derived path so two same-named frames both land', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    // Both frames keep the default name "Frame", which is what happens the
    // moment promotion stops asking for one. The second must not fail with
    // "already exists" — the collision that used to swallow the write.
    drawFrame(100, 120, 240, 220)
    await promoteFrame()
    drawFrame(300, 320, 440, 420)
    await promoteFrame()

    expect(componentFiles().sort()).toEqual(['.components/frame-2/frame.tsx', '.components/frame/frame.tsx'])
    await waitFor(() => {
      const paths = savedDocs()[0].components.map((c: { filePath?: string }) => c.filePath).sort()
      expect(paths).toEqual(['.components/frame-2/frame.tsx', '.components/frame/frame.tsx'])
    })
  })

  it('adds a variant, which creates the discriminating prop and the on-canvas dropdown', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const input = screen.getByPlaceholderText('variant name')
    fireEvent.change(input, { target: { value: 'Hover' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.variants).toHaveLength(2)
      expect(component.props).toHaveLength(1)
      expect(component.props[0].name).toBe('state')
      expect(component.props[0].options).toEqual(['default', 'hover'])
    })

    // The variant dropdown appears on the board label once there is a choice.
    expect(await screen.findByTitle('Switch variant')).toBeInTheDocument()
    expect(screen.getByTitle('Preview next variant')).toBeInTheDocument()
  })

  it('switches the instance variant from the board label trigger', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const input = screen.getByPlaceholderText('variant name')
    fireEvent.change(input, { target: { value: 'Hover' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const trigger = await screen.findByTitle('Preview next variant')
    fireEvent.click(trigger)

    await waitFor(() => {
      const instance = savedDocs()[0].nodes[0]
      expect(instance.variantValues).toEqual({ state: 'hover' })
    })
  })

  it('promoting is not cancellable, because there is nothing left to approve', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()

    fireEvent.click(await screen.findByText('CREATE COMPONENT', { selector: 'button' }))

    // No dialog stands between the frame and its file. The old flow opened one
    // here and only wrote on APPROVE, which is what made "I promoted it and
    // nothing appeared" possible: COMPONENT ONLY sat beside APPROVE and looked
    // like a peer.
    await waitFor(() => expect(componentFiles()).toHaveLength(1))
    expect(screen.queryByText('CREATE COMPONENT', { selector: 'span' })).not.toBeInTheDocument()
    await waitFor(() => expect(currentDoc().components).toHaveLength(1))
    expect(currentDoc().nodes[0].kind).toBe('instance')
  })

  it('writes real code on promote, only inside the sandboxed component root', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    expect(componentFiles()).toEqual(['.components/frame/frame.tsx'])

    const source = files.get('.components/frame/frame.tsx')!
    expect(source).toContain('export type FrameProps = Record<string, never>')
    expect(source).toContain('export const Frame = () => {')
    expect(source).toContain('// <sleipnir:layout component=')
    expect(source).toContain('// </sleipnir:layout>')
    // Dependency-free: nothing imported from Sleipnir's own UIKit.
    expect(source).not.toContain('UIKit')
    expect(source).toContain('<div style={{')
  })

  it('removes a component file without leaving its folder behind', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('REMOVE FROM WORKSPACE'))

    // The file goes, and so does the folder promotion made for it — a hollow
    // directory reads as "something was supposed to be here", and under
    // automatic promotion they would accumulate one per discarded experiment.
    await waitFor(() => expect(componentFiles()).toEqual([]))

    // And because promotion always writes a file, a component with no file is
    // no longer a rung on the ladder — it is what a frame is. This one carried
    // one variant, no props and one instance, so dissolving it back loses
    // nothing, and un-promoting is what deleting its only file means.
    //
    // Waited on the NODE, not the component count: the board autosaves on a
    // debounce, so a freshly created board (nodes: [], components: []) already
    // satisfies "no components" and would let this pass against state from
    // before the frame was even drawn.
    await waitFor(() => {
      expect(currentDoc().nodes).toHaveLength(1)
      expect(currentDoc().nodes[0].kind).toBe('frame')
    })
    expect(currentDoc().components).toHaveLength(0)
  })

  it('flattens a staged component that carries variants when its file is removed, and undo brings both back', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const input = screen.getByPlaceholderText('variant name')
    fireEvent.change(input, { target: { value: 'Hover' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(currentDoc().components[0].variants).toHaveLength(2))
    const written = files.get('.components/frame/frame.tsx')

    fireEvent.click(await screen.findByText('REMOVE FROM WORKSPACE'))

    // In `.components` the file and the component are one thing, so a component
    // with no file there is a state that must not exist: it goes back to
    // being a frame, rather than lingering detached.
    await waitFor(() => expect(componentFiles()).toEqual([]))
    await waitFor(() => {
      expect(currentDoc().components).toHaveLength(0)
      expect(currentDoc().nodes[0].kind).toBe('frame')
    })

    // What made the old one-click detach necessary was that this lost the
    // variants for good. Undo now restores the component AND its file, byte
    // for byte.
    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(files.get('.components/frame/frame.tsx')).toBe(written))
    await waitFor(() => expect(currentDoc().components[0]?.variants).toHaveLength(2))
  })

  it('deletes the staged file with the last instance, and undo restores it', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    const written = files.get('.components/frame/frame.tsx')

    // The instance is selected after promotion; Delete is the board's own key.
    fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => expect(componentFiles()).toEqual([]))
    await waitFor(() => {
      expect(currentDoc().nodes).toHaveLength(0)
      expect(currentDoc().components).toHaveLength(0)
    })

    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(files.get('.components/frame/frame.tsx')).toBe(written))
    await waitFor(() => expect(currentDoc().components).toHaveLength(1))
  })

  it('takes the staged file away when the promotion is undone, and back on redo', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(componentFiles()).toEqual([]))
    await waitFor(() => expect(currentDoc().nodes[0]?.kind).toBe('frame'))

    fireEvent.click(screen.getByText('REDO'))
    await waitFor(() => expect(componentFiles()).toEqual(['.components/frame/frame.tsx']))
    await waitFor(() => expect(currentDoc().components).toHaveLength(1))
  })

  it("gives staged components an editor tsconfig that inherits the project's app config", async () => {
    files.set('tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.app.json" }] }')
    files.set('tsconfig.node.json', '{ "compilerOptions": { "module": "ESNext" } }')
    files.set('tsconfig.app.json', '{\n  // comments are fine\n  "compilerOptions": { "jsx": "react-jsx" }\n}')

    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    await waitFor(() => expect(files.get('.components/tsconfig.json')).toContain('"extends": "../tsconfig.app.json"'))
  })

  it('never overwrites an editor tsconfig that is already there', async () => {
    files.set('.components/tsconfig.json', '{ "mine": true }')
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    await waitFor(() => expect(currentDoc().components).toHaveLength(1))

    expect(files.get('.components/tsconfig.json')).toBe('{ "mine": true }')
  })

  it('relinks a component whose folder was moved outside Sleipnir, by its sentinel', async () => {
    const first = render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    await waitFor(() => expect(currentDoc().components[0]?.filePath).toBe('.components/frame/frame.tsx'))
    first.unmount()

    // Moved in VS Code: Sleipnir never saw it, so nothing reconciled the board.
    files.set('src/ui/frame/frame.tsx', files.get('.components/frame/frame.tsx')!)
    files.delete('.components/frame/frame.tsx')

    render(<CanvasView activeProject={PROJECT} />)

    await waitFor(() => {
      const component = currentDoc().components[0]
      expect(component.filePath).toBe('src/ui/frame/frame.tsx')
      // Carried by its folder, so the sandbox is the folder's new parent.
      expect(component.componentRoot).toBe('src/ui')
      expect(component.sync).toBe('live')
    })
  })

  it('leaves a moved component flagged when two files claim it', async () => {
    const first = render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    await waitFor(() => expect(currentDoc().components[0]?.filePath).toBe('.components/frame/frame.tsx'))
    first.unmount()

    const source = files.get('.components/frame/frame.tsx')!
    files.delete('.components/frame/frame.tsx')
    files.set('src/a/frame.tsx', source)
    files.set('src/b/frame.tsx', source)

    render(<CanvasView activeProject={PROJECT} />)
    await screen.findAllByText('Frame')
    clickAt(200, 200)

    // Picking one of two copies would be a guess; it says what happened instead.
    expect(await screen.findByText(/is gone — it was moved or deleted outside Sleipnir/)).toBeInTheDocument()
    expect(currentDoc().components[0].filePath).toBe('.components/frame/frame.tsx')
  })

  it('removes the staged file when a component is flattened to a frame', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('FLATTEN TO FRAME'))

    await waitFor(() => expect(componentFiles()).toEqual([]))
    await waitFor(() => expect(currentDoc().components).toHaveLength(0))
  })

  it('deletes a board together with its staged files', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()
    await waitFor(() => expect(currentDoc().components[0]?.filePath).toBe('.components/frame/frame.tsx'))

    fireEvent.click(screen.getByTitle('Delete this board'))

    await waitFor(() => expect(savedDocs()).toHaveLength(0))
    await waitFor(() => expect(componentFiles()).toEqual([]))
  })

  it('sweeps staged files no board owns when the project opens, and nothing else', async () => {
    const sentinel = (id: string) =>
      `export const X = () => {\n  // <sleipnir:layout component="${id}" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    files.set('.components/.boards/canvas-1.json', JSON.stringify({ id: 'canvas-1', name: 'B', nodes: [], components: [], createdAt: 1, updatedAt: 1 }))
    files.set('.components/ghost/ghost.tsx', sentinel('cmp_gone'))
    // Hand-written: no sentinel, so never the canvas's to delete.
    files.set('.components/notes/mine.tsx', 'export const Mine = 1\n')

    render(<CanvasView activeProject={PROJECT} />)

    await waitFor(() => expect(files.has('.components/ghost/ghost.tsx')).toBe(false))
    expect(files.get('.components/notes/mine.tsx')).toBe('export const Mine = 1\n')
  })

  it('sweeps nothing when a board cannot be read, since it might own any of them', async () => {
    files.set('.components/.boards/broken.json', '{ not json')
    files.set('.components/ghost/ghost.tsx', '  // <sleipnir:layout component="cmp_gone" hash="h">\n  // </sleipnir:layout>\n')

    render(<CanvasView activeProject={PROJECT} />)
    await screen.findByText('NO BOARDS YET')

    expect(files.has('.components/ghost/ghost.tsx')).toBe(true)
  })

  it('flattens a variant-carrying component to a frame on request', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const input = screen.getByPlaceholderText('variant name')
    fireEvent.change(input, { target: { value: 'Hover' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(currentDoc().components[0].variants).toHaveLength(2))

    fireEvent.click(await screen.findByText('FLATTEN TO FRAME'))

    await waitFor(() => expect(currentDoc().components).toHaveLength(0))
    expect(currentDoc().nodes[0].kind).toBe('frame')
  })

  it('renames a live component, carrying its file and its exported symbol along', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    // Naming used to happen in the dialog that gated promotion. Promotion no
    // longer opens one, so this is the path that has to keep working — it was
    // reachable-but-disabled before, which would have left components stuck
    // with whatever the frame happened to be called.
    fireEvent.click(await screen.findByText('RENAME / MOVE…'))
    const modal = await findModal()
    expect(within(modal).getByText('EDIT COMPONENT')).toBeInTheDocument()
    fireEvent.change(within(modal).getByDisplayValue('Frame'), { target: { value: 'Card' } })
    fireEvent.click(within(modal).getByText('SAVE'))

    // The file moves, and the old one (plus its now-empty folder) goes.
    await waitFor(() => expect(componentFiles()).toEqual(['.components/card/card.tsx']))

    // The rename reaches INSIDE the file, not just the board — a file called
    // card.tsx still exporting `Frame` would be the worse half-outcome.
    const source = files.get('.components/card/card.tsx')!
    expect(source).toContain('export type CardProps = Record<string, never>')
    expect(source).toContain('export const Card = () => {')
    expect(source).not.toContain('export const Frame')

    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.name).toBe('Card')
      expect(component.filePath).toBe('.components/card/card.tsx')
    })
  })

  it('saving the rename dialog unchanged relocates nothing', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('RENAME / MOVE…'))
    fireEvent.click(within(await findModal()).getByText('SAVE'))

    // The folder field is seeded from where the file actually is, so a no-op
    // save is a no-op — not a move to a freshly derived path.
    await waitFor(() => {
      expect(screen.queryByText('EDIT COMPONENT')).not.toBeInTheDocument()
    })
    expect(componentFiles()).toEqual(['.components/frame/frame.tsx'])
  })

  it('keeps a deliberately filed component where it was put across a rename', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    // File it somewhere of our own choosing first.
    fireEvent.click(await screen.findByText('RENAME / MOVE…'))
    const first = await findModal()
    // The FOLDER field's placeholder is the auto-derived folder it would use.
    fireEvent.change(within(first).getByPlaceholderText('frame'), { target: { value: 'widgets' } })
    fireEvent.click(within(first).getByText('SAVE'))
    await waitFor(() => expect(componentFiles()).toEqual(['.components/widgets/frame.tsx']))

    // Renaming must not drag it back to an auto-derived folder — that choice
    // was made on purpose and outranks the naming convention.
    fireEvent.click(await screen.findByText('RENAME / MOVE…'))
    const second = await findModal()
    fireEvent.change(within(second).getByDisplayValue('Frame'), { target: { value: 'Card' } })
    fireEvent.click(within(second).getByText('SAVE'))

    await waitFor(() => expect(componentFiles()).toEqual(['.components/widgets/card.tsx']))
  })

  it('writes a detached component back into the workspace through the modal', async () => {
    const first = render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    // A variant first, so deleting the file leaves the component DETACHED
    // rather than dissolving it — a bare component would be un-promoted back
    // to a frame and there would be nothing left to push.
    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const variantField = screen.getByPlaceholderText('variant name')
    fireEvent.change(variantField, { target: { value: 'Hover' } })
    fireEvent.keyDown(variantField, { key: 'Enter' })
    await waitFor(() => expect(currentDoc().components[0].variants).toHaveLength(2))

    // Detached is now only reachable from OUTSIDE the canvas — the file deleted
    // in the Workspace tree, where there is no undo to bring the variants back
    // (inside the canvas, removing a staged file flattens instead). PUSH TO
    // WORKSPACE is the way back from it.
    first.unmount()
    files.delete('.components/frame/frame.tsx')
    await reconcileDelete('.components/frame/frame.tsx')
    render(<CanvasView activeProject={PROJECT} />)
    await screen.findAllByText('Frame')
    clickAt(200, 200)

    fireEvent.click(await screen.findByText('PUSH TO WORKSPACE'))
    const modal = await findModal()
    fireEvent.change(within(modal).getByDisplayValue('Frame'), { target: { value: 'Card' } })

    // It still shows exactly what will be produced.
    expect(await within(modal).findByText(/export const Card · CardProps/)).toBeInTheDocument()

    fireEvent.click(within(modal).getByText('APPROVE'))

    await waitFor(() => expect(componentFiles()).toEqual(['.components/card/card.tsx']))
    const source = files.get('.components/card/card.tsx')!
    // The variant added above is a real prop, so it reaches the interface and
    // the signature — the fresh emit carries the component's whole shape.
    expect(source).toContain("state?: 'default' | 'hover'")
    expect(source).toContain("export const Card = ({ state = 'default' }: CardProps) => {")

    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.filePath).toBe('.components/card/card.tsx')
      expect(component.sync).toBe('live')
      expect(component.lastWrittenHash).toBeTruthy()
    })
  })

  it('emits one branch per variant so states survive into the code', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const variantField = screen.getByPlaceholderText('variant name')
    fireEvent.change(variantField, { target: { value: 'Hover' } })
    fireEvent.keyDown(variantField, { key: 'Enter' })

    // The file already exists from promotion, so the new variant reaches it via
    // a push (which splices the region) rather than a first write.
    // Matched loosely: the button carries a ● dirty marker once the canvas has
    // drifted from the file, which is exactly the state we're in here.
    fireEvent.click(await screen.findByText(/UPDATE COMPONENT/))

    const path = componentFiles()[0]
    await waitFor(() => {
      expect(files.get(path)).toContain("if (state === 'hover') {")
    })
    const source = files.get(path)!

    expect(source).toContain("state?: 'default' | 'hover'")
    expect(source).toContain("({ state = 'default' }: FrameProps)")
  })

  // A top-level frame is an artboard: its contents are directly clickable, and
  // the frame itself is what you get when nothing deeper is under the cursor.
  // Requiring a double-click to touch anything inside a frame is what made
  // nested work miserable, and made every drag move the container instead.
  it('selects the child under the cursor on a SINGLE click, as Figma does', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400) // the frame — 300x300
    drawFrame(150, 150, 250, 250) // a child inside it — 100x100

    await waitFor(() => {
      const nodes = currentDoc().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].children).toHaveLength(1)
    })

    // Clear the selection first, so no drilled-in depth can explain the result.
    clickAt(800, 700)

    clickAt(200, 200)
    // The inspector shows the CHILD's 100x100, and nothing of the frame's 300.
    await waitFor(() => expect(screen.getAllByDisplayValue('100').length).toBeGreaterThan(0))
    expect(screen.queryAllByDisplayValue('300')).toHaveLength(0)
  })

  it('selects the frame itself when the click lands on its own background', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400)
    drawFrame(150, 150, 250, 250)
    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))
    clickAt(800, 700)

    // 370,370 is inside the frame but clear of its child — the way an artboard
    // is grabbed without reaching for its label.
    clickAt(370, 370)
    await waitFor(() => expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0))
  })

  it('drags a selected frame from anywhere inside it, children and all', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400)
    drawFrame(150, 150, 250, 250)
    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))
    clickAt(800, 700)

    // Select the frame by its background, then drag starting ON THE CHILD.
    clickAt(370, 370)
    await waitFor(() => expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0))
    dragFrom(200, 200, 260, 240)

    // The frame moved by the drag delta; the child rode along untouched, since
    // its rect is relative to the parent.
    await waitFor(() => expect(currentDoc().nodes[0].rect).toMatchObject({ x: 160, y: 140 }))
    expect(currentDoc().nodes[0].children[0].rect).toMatchObject({ x: 50, y: 50 })
  })

  it('grabs a frame by its label when its children leave no background to click', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 300, 300) // the frame — 200x200
    // A child covering it corner to corner, so no background is left over.
    drawFrame(100, 100, 300, 300)
    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))
    clickAt(800, 700)

    const label = document.querySelector('[data-canvas-frame-label]') as HTMLElement
    expect(label).not.toBeNull()

    // Pressing the label selects the frame, and dragging it moves the frame with
    // its child aboard — Figma's way of moving an artboard.
    fireEvent.pointerDown(label, { clientX: 100, clientY: 84, button: 0, pointerId: 1 })
    fireEvent.pointerMove(getBoard(), { clientX: 150, clientY: 134, button: 0, pointerId: 1 })
    fireEvent.pointerUp(getBoard(), { clientX: 150, clientY: 134, button: 0, pointerId: 1 })

    await waitFor(() => expect(currentDoc().nodes[0].rect).toMatchObject({ x: 150, y: 150 }))
    // The child came along and was not reparented out.
    expect(currentDoc().nodes).toHaveLength(1)
    expect(currentDoc().nodes[0].children).toHaveLength(1)
  })

  it('reaches into a selected frame on a click that never moved', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400)
    drawFrame(150, 150, 250, 250)
    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))
    clickAt(800, 700)

    clickAt(370, 370)
    await waitFor(() => expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0))

    // Same press point as the drag above, but released without moving: grabbing
    // the container must not cost you the ability to select what is inside it.
    clickAt(200, 200)
    await waitFor(() => expect(screen.getAllByDisplayValue('100').length).toBeGreaterThan(0))
    expect(screen.queryAllByDisplayValue('300')).toHaveLength(0)
  })

  it('stays at the depth you are working in, so children stay one click away', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400) // outer
    drawFrame(150, 150, 250, 250) // child A — 100x100, drawn inside outer
    drawFrame(280, 150, 380, 250) // child B — 100x100, also inside outer

    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(2))

    // B is selected from the draw, which puts the working depth inside `outer`.
    // A plain click on its sibling A therefore selects A, not the container —
    // re-drilling for every child is what made nested frames unusable.
    clickAt(200, 200)

    // A sits at 50,50 in the outer's space and is 100x100; the container would
    // show 100,100 / 300x300. No 300 anywhere means the container is not it.
    await waitFor(() => expect(screen.getAllByDisplayValue('50').length).toBeGreaterThan(0))
    expect(screen.queryAllByDisplayValue('300')).toHaveLength(0)
  })

  // Deeper than one level, a container still behaves like a container: a click
  // takes the outermost one below the current depth, and a double-click steps in.
  it('drills past the click depth on double-click', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame(100, 100, 400, 400) // frame  — 300x300
    drawFrame(150, 150, 350, 350) // card   — 200x200, inside the frame
    drawFrame(180, 180, 240, 240) // label  — 60x60, inside the card
    await waitFor(() =>
      expect(currentDoc().nodes[0].children[0].children).toHaveLength(1),
    )
    clickAt(800, 700)

    // One click over the label takes the CARD: one container per click.
    clickAt(200, 200)
    await waitFor(() => expect(screen.getAllByDisplayValue('200').length).toBeGreaterThan(0))
    expect(screen.queryAllByDisplayValue('60')).toHaveLength(0)

    // Double-click steps one level further, onto the label itself.
    fireEvent.doubleClick(getBoard(), { clientX: 200, clientY: 200 })
    await waitFor(() => expect(screen.getAllByDisplayValue('60').length).toBeGreaterThan(0))
  })

  it('un-nests a child by dragging it out onto empty board', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 400, 400) // parent
    drawFrame(150, 150, 250, 250) // child, nested by the draw

    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))

    // The child is selected from the draw, so this grabs the child, not the
    // parent. Dropping it on empty canvas has to actually take it out of the
    // parent — leaving it a child with a rect outside the parent's box is how
    // nodes used to become unreachable.
    dragFrom(200, 200, 800, 650)

    await waitFor(() => {
      const nodes = currentDoc().nodes
      expect(nodes).toHaveLength(2)
      expect(nodes.every((n: { children?: unknown[] }) => (n.children ?? []).length === 0)).toBe(true)
    })
    // Un-nesting preserves the board position: the child lands where it was let go.
    const moved = currentDoc().nodes.find((n: { rect: { x: number } }) => n.rect.x > 400)
    expect(moved.rect).toMatchObject({ x: 750, y: 600 })
  })

  it('treats a shaky click as a click, not a one-pixel drag', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 300, 300)
    await waitFor(() => expect(currentDoc().nodes).toHaveLength(1))

    // Two pixels of wobble between press and release — under the threshold.
    // Read live state through the inspector rather than the autosaved file, so
    // a nudge is caught immediately instead of 400ms later.
    dragFrom(200, 200, 202, 201)

    expect(screen.getAllByDisplayValue('100').length).toBeGreaterThan(0)
    expect(screen.queryAllByDisplayValue('102')).toHaveLength(0)
  })

  it('reparents a frame by dragging it into another', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 300, 300) // target
    drawFrame(500, 100, 600, 200) // loose frame, drawn outside the target

    await waitFor(() => expect(currentDoc().nodes).toHaveLength(2))

    // Grab the loose frame and drop it inside the first.
    clickAt(550, 150)
    dragFrom(550, 150, 200, 200)

    await waitFor(() => {
      const nodes = currentDoc().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].children).toHaveLength(1)
    })
  })

  it('groups a multi-selection into a new parent frame without moving anything', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 200, 200)
    drawFrame(400, 100, 500, 200)
    await waitFor(() => expect(currentDoc().nodes).toHaveLength(2))

    // Marquee-select both, then group.
    fireEvent.click(screen.getByTitle('Select (V)'))
    dragFrom(50, 50, 600, 300)

    fireEvent.click(await screen.findByTitle('Group (Ctrl+G)'))

    await waitFor(() => {
      const nodes = currentDoc().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].children).toHaveLength(2)
      // The group spans both members exactly.
      expect(nodes[0].rect).toEqual({ x: 100, y: 100, w: 400, h: 100 })
    })
  })

  it('aligns a multi-selection from the align toolbar', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 200, 200)
    drawFrame(400, 300, 500, 400)
    await waitFor(() => expect(currentDoc().nodes).toHaveLength(2))

    fireEvent.click(screen.getByTitle('Select (V)'))
    dragFrom(50, 50, 600, 500)

    fireEvent.click(await screen.findByTitle('Align left'))

    await waitFor(() => {
      const xs = currentDoc().nodes.map((n: { rect: { x: number } }) => n.rect.x)
      expect(new Set(xs).size).toBe(1)
      expect(xs[0]).toBe(100)
    })
  })

  it('shows the arrange controls in the inspector only once a selection can use them', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    expect(document.querySelector('[data-canvas-arrange]')).toBeNull()

    drawFrame()
    await waitFor(() =>
      expect(document.querySelector('[data-canvas-arrange]')).not.toBeNull(),
    )
  })

  // ── Children of an auto-layout frame ────────────────────────────────────
  //
  // Under a vertical or horizontal flow the renderer DROPS a child's x/y and
  // lets the browser place it (see toCss's positionCss). Everything on screen
  // used to be drawn from those dropped coordinates anyway, so the outline sat
  // somewhere off the frame it claimed to select, clicking a child selected its
  // parent, and dragging one wrote a position nothing would ever render — the
  // node was simply immovable. These drive the real UI through that case.

  /** Builds a stack frame holding two children, and reports where flex put them. */
  async function buildStack() {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    drawFrame(100, 100, 500, 400) // the stack: board 100,100 400x300
    drawFrame(150, 150, 250, 200) // child A: 100x50, nested by the draw
    drawFrame(300, 250, 440, 310) // child B: 140x60, also nested

    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(2))
    const [a, b] = currentDoc().nodes[0].children

    // What a real vertical stack does with them: flush to the frame's origin,
    // in order, and nowhere near the 150,150 / 300,250 the model still records.
    layoutBoxes.set(a.id, { left: 100, top: 100, width: 100, height: 50 })
    layoutBoxes.set(b.id, { left: 100, top: 150, width: 140, height: 60 })

    // Select the stack (a click over empty space inside it) and give it a flow.
    clickAt(460, 380)
    fireEvent.click(await screen.findByTitle('Vertical stack'))
    await waitFor(() => expect(currentDoc().nodes[0].style.flow).toBe('vertical'))

    return { stackId: currentDoc().nodes[0].id, aId: a.id, bId: b.id }
  }

  it('selects the child under the cursor, and rings it where the layout actually put it', async () => {
    const { aId } = await buildStack()

    // Drill in at A's REAL position. Its model rect still says 150,150, so
    // before the fix this point resolved to the stack — or to nothing.
    clickAt(110, 110)

    await waitFor(() => {
      const ring = document.querySelector('[data-canvas-selection]') as HTMLElement | null
      expect(ring?.getAttribute('data-canvas-selection')).toBe(aId)
    })

    // The outline is on the frame, not on the coordinates the model kept.
    const ring = document.querySelector('[data-canvas-selection]') as HTMLElement
    expect(ring.style.left).toBe('100px')
    expect(ring.style.top).toBe('100px')
    expect(ring.style.width).toBe('100px')
    expect(ring.style.height).toBe('50px')
  })

  it('reorders a child by dragging it down the stack, since a flow owns position', async () => {
    const { aId, bId } = await buildStack()

    // Grab A where it is drawn and drop it past B's midpoint.
    clickAt(110, 110)
    dragFrom(110, 110, 150, 200)

    await waitFor(() => {
      const order = currentDoc().nodes[0].children.map((c: { id: string }) => c.id)
      expect(order).toEqual([bId, aId])
    })
    // Reordering is the whole edit: the child stays in the stack.
    expect(currentDoc().nodes[0].children).toHaveLength(2)
    expect(currentDoc().nodes).toHaveLength(1)
  })

  it('shows an insertion bar while dragging, since there is no free position to preview', async () => {
    await buildStack()

    clickAt(110, 110)
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: 110, clientY: 110, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 150, clientY: 200, button: 0, pointerId: 1 })

    const bar = await waitFor(() => {
      const el = document.querySelector('[data-canvas-drop-indicator]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    // A horizontal bar below B, spanning the stack — "it lands here".
    expect(bar.style.top).toBe('209px')
    expect(bar.style.width).toBe('400px')

    fireEvent.pointerUp(board, { clientX: 150, clientY: 200, button: 0, pointerId: 1 })
  })

  it('drags a child out of the stack to where it was let go', async () => {
    const { aId } = await buildStack()

    clickAt(110, 110)
    // Out onto empty board, well clear of the stack.
    dragFrom(110, 110, 800, 650)

    await waitFor(() => expect(currentDoc().nodes).toHaveLength(2))
    const lifted = currentDoc().nodes.find((n: { id: string }) => n.id === aId)
    // Its board position comes from where the layout had it, not from the stale
    // 150,150 the model was still carrying.
    expect(lifted.rect).toMatchObject({ x: 100, y: 100 })
    expect(currentDoc().nodes[0].children).toHaveLength(1)
  })

  it('offers only the handles that can resize from the corner the flow pins', async () => {
    await buildStack()

    // The stack itself is a root node: it owns its own position, so all eight.
    clickAt(460, 380)
    await waitFor(() =>
      expect(document.querySelectorAll('[data-canvas-handle]')).toHaveLength(8),
    )

    // Its child is pinned top-left by the flow, so the north and west handles
    // could only resize a box that cannot move — they are not offered.
    clickAt(110, 110)
    await waitFor(() =>
      expect(document.querySelectorAll('[data-canvas-handle]')).toHaveLength(3),
    )
    const offered = [...document.querySelectorAll('[data-canvas-handle]')].map((el) =>
      el.getAttribute('data-canvas-handle'),
    )
    expect(new Set(offered)).toEqual(new Set(['e', 'se', 's']))
  })

  it('refuses to nudge a child a flow positions, rather than burning an undo step', async () => {
    await buildStack()

    clickAt(110, 110)
    await waitFor(() => expect(document.querySelector('[data-canvas-selection]')).not.toBeNull())

    const before = JSON.stringify(currentDoc().nodes[0].children)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })

    // X/Y are the layout's to decide, so an arrow key must change nothing at
    // all — a silent write would dirty the board and add an undo step for a
    // move the renderer would never show.
    expect(JSON.stringify(currentDoc().nodes[0].children)).toBe(before)
    expect(screen.getByText(/Position is set by the parent's vertical layout/)).toBeInTheDocument()
  })

  it('lists every language target, offering only the ones that can really emit a box', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    fireEvent.click(screen.getByTitle(/^Frame \(F\)/))
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: 20, clientY: 20, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 220, clientY: 220, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 220, clientY: 220, button: 0, pointerId: 1 })

    const react = (await screen.findByText('React (TSX)')) as HTMLOptionElement
    expect(react.disabled).toBe(false)

    // Rust is listed but disabled, with the reason visible rather than hidden.
    const rust = screen.getByText(/^Rust —/) as HTMLOptionElement
    expect(rust.disabled).toBe(true)
    expect(rust.textContent).toMatch(/UI framework/)
  })
})

describe('CanvasView paint', () => {
  /** A board with one selected frame, ready for the inspector. */
  async function frameOnBoard() {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await waitFor(() => expect(savedDocs()[0]?.nodes).toHaveLength(1))
  }

  /** The FILL section — scoped so a field there is never confused with LAYER's. */
  const fillSection = () => screen.getByText('FILL').parentElement!.parentElement as HTMLElement
  /** The fills as saved; a new frame starts with a `bg-2` fill, so an added one is the last (top). */
  const savedFills = () => savedDocs()[0].nodes[0].style.fills ?? []

  /** Opens the topmost fill's editor from its swatch and picks `type` from its tabs. */
  const setTopFillType = (type: 'Linear' | 'Radial' | 'Image') => {
    fireEvent.click(screen.getAllByTitle('Edit fill')[0])
    fireEvent.click(screen.getByRole('button', { name: type }))
  }

  it('adds a fill, and turns it into a linear gradient that the board saves', async () => {
    await frameOnBoard()
    fireEvent.click(screen.getByTitle('Add fill'))
    await waitFor(() => expect(savedFills()).toEqual([{ color: 'bg-2' }, { type: 'solid', color: '#d9d9d9' }]))

    setTopFillType('Linear')
    await waitFor(() => {
      const fill = savedFills()[1]
      expect(fill.type).toBe('linear')
      expect(fill.angle).toBe(180)
      // A solid seeds the gradient: its color, opaque to clear.
      expect(fill.stops).toEqual([
        { position: 0, color: '#d9d9d9' },
        { position: 1, color: '#d9d9d9', opacity: 0 },
      ])
    })
    expect(screen.getByText('STOPS')).toBeInTheDocument()
  })

  it('writes the gradient into the component file', async () => {
    await frameOnBoard()
    fireEvent.click(screen.getByTitle('Add fill'))
    setTopFillType('Radial')
    await waitFor(() => expect(savedFills()[1]?.type).toBe('radial'))

    await promoteFrame()
    // Top layer first, over the frame's own bg-2 fill as a layer of its own.
    expect(files.get('.components/frame/frame.tsx')).toContain(
      "background: 'radial-gradient(ellipse 50% 50% at 50% 50%, #d9d9d9 0%, rgba(217, 217, 217, 0) 100%), linear-gradient(var(--bg-2), var(--bg-2))',",
    )
  })

  it('imports an image into .components/assets and paints it as a fill', async () => {
    await frameOnBoard()
    fireEvent.click(screen.getByTitle('Add fill'))
    setTopFillType('Image')
    await screen.findByText('IMPORT FILE…')

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'My Hero.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(savedFills()[1]).toMatchObject({ type: 'image', src: '.components/assets/My-Hero.png' }))
    expect(files.get('.components/assets/My-Hero.png')).toBe('iVBORw==')

    await promoteFrame()
    const source = files.get('.components/frame/frame.tsx')!
    expect(source).toContain("import myHeroImage from '../assets/My-Hero.png'")
    expect(source).toContain('background: `url("${myHeroImage}") center / cover no-repeat, linear-gradient(var(--bg-2), var(--bg-2))`,')
  })

  it('adds a drop shadow with Figma\'s defaults', async () => {
    await frameOnBoard()
    fireEvent.click(screen.getByTitle('Add effect'))
    await waitFor(() =>
      expect(savedDocs()[0].nodes[0].style.effects).toEqual([
        { type: 'drop-shadow', x: 0, y: 4, blur: 4, spread: 0, color: '#000000', opacity: 0.25 },
      ]),
    )
  })

  // After promotion the selection is an instance, whose own style never reaches
  // its call site — so the paint panels edit the main component, and UPDATE
  // COMPONENT carries the change into the file.
  it('paints the main component from an instance, and pushes it to the file', async () => {
    await frameOnBoard()
    await promoteFrame()
    expect(await screen.findByText(/Paint below edits the main component/)).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Add effect'))
    await waitFor(() => {
      const root = savedDocs()[0].components[0].variants[0].root
      expect(root.style.effects).toHaveLength(1)
    })
    // The instance itself stays unpainted.
    expect(savedDocs()[0].nodes[0].style.effects).toBeUndefined()

    fireEvent.click(await screen.findByText('● UPDATE COMPONENT'))
    await waitFor(() =>
      expect(files.get('.components/frame/frame.tsx')).toContain("boxShadow: '0px 4px 4px 0px rgba(0, 0, 0, 0.25)',"),
    )
  })

  // One control, one undo step — however many times it reported a change.
  it('folds a run of edits from one control into one undo step', async () => {
    await frameOnBoard()
    fireEvent.click(screen.getByTitle('Add fill'))
    await waitFor(() => expect(savedFills()).toHaveLength(2))

    // The topmost row's opacity field, listed first.
    const opacity = within(fillSection()).getAllByDisplayValue('100')[0] as HTMLInputElement
    for (const value of ['90', '70', '50']) fireEvent.change(opacity, { target: { value } })
    await waitFor(() => expect(savedFills()[1].opacity).toBe(0.5))

    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(savedFills()[1]?.opacity).toBeUndefined())
    // Back to before the drag, not before the fill.
    expect(savedFills()).toHaveLength(2)
  })
})

describe('CanvasView shapes, pen and SVG components', () => {
  async function emptyBoard() {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
  }

  /** Drags a rect with whatever tool is active. */
  function drag(x1: number, y1: number, x2: number, y2: number) {
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: x1, clientY: y1, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1 })
  }

  /** Picks a shape from the toolbar's shape menu. */
  function pickShape(name: 'Rectangle' | 'Ellipse' | 'Triangle') {
    fireEvent.click(screen.getByTitle('Shapes'))
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(name) }))
  }

  const savedNodes = () => savedDocs()[0]?.nodes ?? []

  it('draws each shape from the toolbar menu as a vector, rendered as SVG', async () => {
    await emptyBoard()
    pickShape('Ellipse')
    drag(100, 100, 200, 160)
    pickShape('Triangle')
    drag(300, 100, 380, 180)

    await waitFor(() => expect(savedNodes()).toHaveLength(2))
    expect(savedNodes().map((n: { kind: string; shape: string; sides?: number }) => [n.kind, n.shape, n.sides])).toEqual([
      ['vector', 'ellipse', undefined],
      ['vector', 'polygon', 3],
    ])
    expect(savedNodes()[0].rect).toEqual({ x: 100, y: 100, w: 100, h: 60 })
    // On the board they are SVG, not boxes.
    expect(document.querySelector('svg[data-canvas-node] ellipse')).not.toBeNull()
    expect(document.querySelector('svg[data-canvas-node] polygon')?.getAttribute('points')).toBe('40,0 80,80 0,80')
  })

  it('keeps the last shape used on the toolbar button, and R picks a rectangle', async () => {
    await emptyBoard()
    pickShape('Ellipse')
    expect(screen.getByTitle(/^Ellipse \(O\)/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'r' })
    drag(50, 50, 150, 100)
    await waitFor(() => expect(savedNodes()[0]?.shape).toBe('rectangle'))
  })

  it('draws a pen path: clicks for corners, a drag for a curve, Enter to finish open', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'p' })
    const board = getBoard()
    const click = (x: number, y: number) => {
      fireEvent.pointerDown(board, { clientX: x, clientY: y, button: 0, pointerId: 1 })
      fireEvent.pointerUp(board, { clientX: x, clientY: y, button: 0, pointerId: 1 })
    }
    click(100, 100)
    // Click-and-drag pulls handles out of the second anchor.
    fireEvent.pointerDown(board, { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(board, { clientX: 240, clientY: 140, button: 0, pointerId: 1 })
    fireEvent.pointerUp(board, { clientX: 240, clientY: 140, button: 0, pointerId: 1 })
    click(200, 200)
    fireEvent.keyDown(window, { key: 'Enter' })

    await waitFor(() => expect(savedNodes()).toHaveLength(1))
    const path = savedNodes()[0]
    expect(path).toMatchObject({ kind: 'vector', shape: 'path', closed: false })
    expect(path.points).toHaveLength(3)
    expect(path.points[1]).toMatchObject({ out: expect.any(Object), in: expect.any(Object) })
    // Sized to its own bounds, handles included (the incoming one reaches x=160).
    expect(path.rect.x).toBe(100)
    // Into the curved anchor and out of it: two cubic segments.
    expect(document.querySelector('svg[data-canvas-node] path')?.getAttribute('d')).toMatch(/^M 0 40 C .+ C .+$/)
  })

  it('closes a pen path by clicking its first point', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'p' })
    const board = getBoard()
    for (const [x, y] of [[100, 100], [200, 100], [150, 180], [101, 101]]) {
      fireEvent.pointerDown(board, { clientX: x, clientY: y, button: 0, pointerId: 1 })
      fireEvent.pointerUp(board, { clientX: x, clientY: y, button: 0, pointerId: 1 })
    }
    await waitFor(() => expect(savedNodes()[0]).toMatchObject({ shape: 'path', closed: true }))
    expect(savedNodes()[0].points).toHaveLength(3)
  })

  it('makes an SVG component whose file is one svg of shapes, not divs', async () => {
    await emptyBoard()
    pickShape('Ellipse')
    drag(100, 100, 160, 160)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))

    fireEvent.click(await screen.findByText('MAKE SVG COMPONENT'))

    await waitFor(() => expect(componentFiles()).toEqual(['.components/ellipse/ellipse.tsx']))
    const source = files.get('.components/ellipse/ellipse.tsx')!
    expect(source).toContain('export const Ellipse = () => {')
    expect(source).toContain('<svg width={60} height={60} viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">')
    expect(source).toContain('<ellipse cx={30} cy={30} rx={30} ry={30} fill="#d9d9d9" />')
    expect(source).not.toContain('<div')
    await waitFor(() => expect(savedDocs()[0].components[0].format).toBe('svg'))
  })

  it('groups several selected vectors into one SVG component', async () => {
    await emptyBoard()
    pickShape('Rectangle')
    drag(100, 100, 150, 150)
    pickShape('Triangle')
    drag(200, 100, 250, 150)
    await waitFor(() => expect(savedNodes()).toHaveLength(2))
    // Marquee both.
    drag(80, 80, 270, 170)
    expect(await screen.findByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByText('MAKE SVG COMPONENT'))
    await waitFor(() => expect(componentFiles()).toHaveLength(1))
    const source = files.get(componentFiles()[0])!
    expect(source).toContain('<svg width={150} height={50} viewBox="0 0 150 50"')
    expect(source).toContain('<rect x={0} y={0} width={50} height={50} fill="#d9d9d9" />')
    expect(source).toContain('<polygon points="125,0 150,50 100,50" fill="#d9d9d9" />')
  })

  it('gives an SVG component variants, each branch its own svg', async () => {
    await emptyBoard()
    pickShape('Ellipse')
    drag(100, 100, 140, 140)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))
    fireEvent.click(await screen.findByText('MAKE SVG COMPONENT'))
    await waitFor(() => expect(componentFiles()).toHaveLength(1))

    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const field = screen.getByPlaceholderText('variant name')
    fireEvent.change(field, { target: { value: 'Active' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.click(await screen.findByText(/UPDATE COMPONENT/))

    await waitFor(() => expect(files.get(componentFiles()[0])).toContain("if (state === 'active') {"))
    expect(files.get(componentFiles()[0])!.match(/<svg /g)).toHaveLength(2)
  })
})

describe('CanvasView fluid vector editing', () => {
  async function emptyBoard() {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
  }
  function drag(x1: number, y1: number, x2: number, y2: number, init: Record<string, unknown> = {}) {
    const board = getBoard()
    fireEvent.pointerDown(board, { clientX: x1, clientY: y1, button: 0, pointerId: 1, ...init })
    fireEvent.pointerMove(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1, ...init })
    fireEvent.pointerUp(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1, ...init })
  }
  const savedNodes = () => savedDocs()[0]?.nodes ?? []

  it('draws a square with Shift held', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'r' })
    drag(100, 100, 220, 160, { shiftKey: true })
    await waitFor(() => expect(savedNodes()[0]?.rect).toEqual({ x: 100, y: 100, w: 120, h: 120 }))
  })

  // Selection follows the shape: a triangle's empty corner isn't the triangle.
  it('selects a triangle inside its outline, but not from its empty box corner', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'v' })
    fireEvent.click(screen.getByTitle('Shapes'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Triangle/ }))
    drag(100, 100, 200, 200)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))

    clickAt(105, 105) // top-left corner of its box: outside the triangle
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument()
    clickAt(150, 170)
    expect(await screen.findByText('POLYGON')).toBeInTheDocument()
  })

  it('edits a shape point by point: double-click, drag an anchor, Enter', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'r' })
    drag(100, 100, 200, 200)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))

    fireEvent.doubleClick(getBoard(), { clientX: 150, clientY: 150 })
    // A rectangle becomes a 4-anchor path the moment it's edited.
    await waitFor(() => expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(4))
    await waitFor(() => expect(savedNodes()[0]).toMatchObject({ shape: 'path', closed: true }))
    expect(screen.getByText('DONE (ENTER)')).toBeInTheDocument()

    // Drag the bottom-right corner out; the box refits to the new shape.
    const corner = document.querySelector('[data-point-anchor="2"]')!
    fireEvent.pointerDown(corner, { clientX: 200, clientY: 200, button: 0, pointerId: 1 })
    fireEvent.pointerMove(getBoard(), { clientX: 260, clientY: 240, button: 0, pointerId: 1 })
    fireEvent.pointerUp(getBoard(), { clientX: 260, clientY: 240, button: 0, pointerId: 1 })
    await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 100, y: 100, w: 160, h: 140 }))
    expect(savedNodes()[0].points[2]).toEqual({ x: 160, y: 140 })

    // The whole drag is one undo step.
    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 100, y: 100, w: 100, h: 100 }))
    expect(savedNodes()[0].shape).toBe('path')

    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(0))
  })

  it('adds an anchor where the outline is clicked, and Delete removes the selected one', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'r' })
    drag(100, 100, 200, 200)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))
    fireEvent.click(await screen.findByText('EDIT POINTS'))
    await waitFor(() => expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(4))

    // A plain click on the outline is a box-select: no new point.
    clickAt(150, 100)
    expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(4)

    // Ctrl+click on the top edge, between the first two corners.
    clickAt(150, 100, { ctrlKey: true })
    await waitFor(() => expect(savedNodes()[0].points).toHaveLength(5))
    expect(savedNodes()[0].points[1]).toEqual({ x: 50, y: 0 })

    // The new anchor is selected; Delete takes it out again (not the whole path).
    fireEvent.keyDown(window, { key: 'Delete' })
    await waitFor(() => expect(savedNodes()[0].points).toHaveLength(4))
    expect(savedNodes()).toHaveLength(1)
  })
})

describe('CanvasView modifier keys', () => {
  async function emptyBoard() {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
  }
  function drag(target: Element, x1: number, y1: number, x2: number, y2: number, init: Record<string, unknown> = {}) {
    const board = getBoard()
    fireEvent.pointerDown(target, { clientX: x1, clientY: y1, button: 0, pointerId: 1, ...init })
    fireEvent.pointerMove(board, { clientX: (x1 + x2) / 2, clientY: (y1 + y2) / 2, button: 0, pointerId: 1, ...init })
    fireEvent.pointerMove(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1, ...init })
    fireEvent.pointerUp(board, { clientX: x2, clientY: y2, button: 0, pointerId: 1, ...init })
  }
  const savedNodes = () => savedDocs()[0]?.nodes ?? []
  async function rectangleAt(x1: number, y1: number, x2: number, y2: number) {
    const before = savedNodes().length
    fireEvent.keyDown(window, { key: 'r' })
    drag(getBoard(), x1, y1, x2, y2)
    await waitFor(() => expect(savedNodes()).toHaveLength(before + 1))
  }

  // Undoing a move used to undo the edit before it too: the drag's first
  // frame was folded into the previous undo step.
  it('undoes a move on its own, leaving the edit before it alone', async () => {
    await emptyBoard()
    await rectangleAt(100, 100, 200, 200)
    await rectangleAt(300, 100, 400, 200)
    drag(getBoard(), 350, 150, 450, 250)
    await waitFor(() => expect(savedNodes()[1].rect).toMatchObject({ x: 400, y: 200 }))

    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(savedNodes()[1]?.rect).toMatchObject({ x: 300, y: 100 }))
    expect(savedNodes()).toHaveLength(2)
  })

  it('locks a move to one axis with Shift', async () => {
    await emptyBoard()
    await rectangleAt(100, 100, 200, 200)
    drag(getBoard(), 150, 150, 260, 170, { shiftKey: true })
    await waitFor(() => expect(savedNodes()[0].rect).toMatchObject({ x: 210, y: 100 }))
  })

  it('duplicates with Alt-drag, leaving the original where it was', async () => {
    await emptyBoard()
    await rectangleAt(100, 100, 200, 200)
    drag(getBoard(), 150, 150, 350, 150, { altKey: true })
    await waitFor(() => expect(savedNodes()).toHaveLength(2))
    expect(savedNodes().map((n: { rect: { x: number } }) => n.rect.x).sort((a: number, b: number) => a - b)).toEqual([100, 300])
    // The copy and the move are one undo step.
    fireEvent.click(screen.getByText('UNDO'))
    await waitFor(() => expect(savedNodes()).toHaveLength(1))
    expect(savedNodes()[0].rect.x).toBe(100)
  })

  it('keeps proportions when resizing with Shift, and resizes from the center with Alt', async () => {
    await emptyBoard()
    await rectangleAt(100, 100, 300, 200)
    clickAt(200, 150)
    const corner = await waitFor(() => {
      const el = document.querySelector('[data-canvas-handle="se"]')
      expect(el).not.toBeNull()
      return el!
    })
    drag(corner, 300, 200, 400, 210, { shiftKey: true })
    await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 100, y: 100, w: 300, h: 150 }))

    const east = document.querySelector('[data-canvas-handle="e"]')!
    drag(east, 400, 175, 420, 175, { altKey: true })
    await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 80, y: 100, w: 340, h: 150 }))
  })

  it('draws from the center with Alt', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'o' })
    drag(getBoard(), 200, 200, 250, 230, { altKey: true })
    await waitFor(() => expect(savedNodes()[0]?.rect).toEqual({ x: 150, y: 170, w: 100, h: 60 }))
  })

  it('takes back the last pen point with Backspace', async () => {
    await emptyBoard()
    fireEvent.keyDown(window, { key: 'p' })
    for (const [x, y] of [[100, 100], [200, 100], [300, 200]]) clickAt(x, y)
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(savedNodes()[0]?.points).toHaveLength(2))
  })

  describe('while editing points', () => {
    async function editRectangle() {
      await emptyBoard()
      await rectangleAt(100, 100, 200, 200)
      fireEvent.doubleClick(getBoard(), { clientX: 150, clientY: 150 })
      await waitFor(() => expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(4))
    }
    const anchor = (i: number) => document.querySelector(`[data-point-anchor="${i}"]`)!
    // Filtered in JS: jsdom's selector engine trips on the parenthesis in `var(`.
    const selectedAnchors = () =>
      [...document.querySelectorAll('[data-point-anchor]')].filter((el) => el.getAttribute('fill')?.startsWith('var(--accent'))

    it('Shift-clicks several anchors and drags them together', async () => {
      await editRectangle()
      fireEvent.pointerDown(anchor(0), { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
      fireEvent.pointerUp(getBoard(), { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
      // The top-right corner joins the selection; dragging it moves both.
      drag(anchor(1), 200, 100, 200, 60, { shiftKey: true })
      await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 100, y: 60, w: 100, h: 140 }))
      expect(savedNodes()[0].points.slice(0, 2)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
      expect(savedNodes()[0].points[2]).toEqual({ x: 100, y: 140 })
    })

    it('box-selects anchors, then nudges them with the arrows', async () => {
      await editRectangle()
      // A box around the bottom two corners.
      drag(getBoard(), 80, 180, 220, 220)
      await waitFor(() => expect(selectedAnchors()).toHaveLength(2))
      fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
      await waitFor(() => expect(savedNodes()[0].rect).toEqual({ x: 100, y: 100, w: 100, h: 110 }))
    })

    it('toggles an anchor sharp and smooth with Ctrl-click', async () => {
      await editRectangle()
      fireEvent.pointerDown(anchor(1), { clientX: 200, clientY: 100, button: 0, pointerId: 1, ctrlKey: true })
      fireEvent.pointerUp(getBoard(), { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
      await waitFor(() => expect(savedNodes()[0].points[1].in).toBeDefined())
      expect(savedNodes()[0].points[1].out).toBeDefined()

      fireEvent.pointerDown(anchor(1), { clientX: 200, clientY: 100, button: 0, pointerId: 1, ctrlKey: true })
      fireEvent.pointerUp(getBoard(), { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
      await waitFor(() => expect(savedNodes()[0].points[1].in).toBeUndefined())
    })

    it('shows a dot on the outline while Ctrl is held, and hides it when Ctrl is let go', async () => {
      await editRectangle()
      const dot = () => document.querySelector('[data-insert-preview]')
      fireEvent.pointerMove(getBoard(), { clientX: 150, clientY: 102, button: 0, pointerId: 1 })
      expect(dot()).toBeNull()
      fireEvent.pointerMove(getBoard(), { clientX: 150, clientY: 102, button: 0, pointerId: 1, ctrlKey: true })
      // Snapped onto the line, not the cursor.
      await waitFor(() => expect(dot()?.getAttribute('cy')).toBe('100'))
      expect(dot()?.getAttribute('cx')).toBe('150')
      fireEvent.keyUp(window, { key: 'Control', ctrlKey: false })
      await waitFor(() => expect(dot()).toBeNull())
    })

    it('makes selected anchors smooth or sharp from the Point section, and rounds a sharp one', async () => {
      await editRectangle()
      fireEvent.pointerDown(anchor(1), { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
      fireEvent.pointerUp(getBoard(), { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
      await screen.findByText('POINT')

      fireEvent.click(screen.getByText('SMOOTH'))
      await waitFor(() => expect(savedNodes()[0].points[1].out).toBeDefined())
      expect(screen.getByText('SMOOTH').getAttribute('aria-pressed')).toBe('true')
      expect(numberInput('CORNER RADIUS').disabled).toBe(true)

      fireEvent.click(screen.getByText('SHARP'))
      await waitFor(() => expect(savedNodes()[0].points[1].out).toBeUndefined())
      fireEvent.change(numberInput('CORNER RADIUS'), { target: { value: '12' } })
      await waitFor(() => expect(savedNodes()[0].points[1]).toEqual({ x: 100, y: 0, radius: 12 }))
    })

    it('deletes a selected handle, making that side of its anchor sharp', async () => {
      await editRectangle()
      fireEvent.pointerDown(anchor(1), { clientX: 200, clientY: 100, button: 0, pointerId: 1, ctrlKey: true })
      fireEvent.pointerUp(getBoard(), { clientX: 200, clientY: 100, button: 0, pointerId: 1 })
      await waitFor(() => expect(document.querySelector('[data-point-handle="1:out"]')).not.toBeNull())

      fireEvent.pointerDown(document.querySelector('[data-point-handle="1:out"]')!, { button: 0, pointerId: 1 })
      fireEvent.pointerUp(getBoard(), { button: 0, pointerId: 1 })
      fireEvent.keyDown(window, { key: 'Delete' })
      await waitFor(() => expect(savedNodes()[0].points[1].out).toBeUndefined())
      // The anchor and its other handle stay.
      expect(savedNodes()[0].points).toHaveLength(4)
      expect(savedNodes()[0].points[1].in).toBeDefined()
    })

    it('selects every anchor with Ctrl+A, and Esc lets go of them before it finishes', async () => {
      await editRectangle()
      fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
      await waitFor(() => expect(selectedAnchors()).toHaveLength(4))
      fireEvent.keyDown(window, { key: 'Escape' })
      await waitFor(() => expect(selectedAnchors()).toHaveLength(0))
      expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(4)
      fireEvent.keyDown(window, { key: 'Escape' })
      await waitFor(() => expect(document.querySelectorAll('[data-point-anchor]')).toHaveLength(0))
    })
  })

  it('gives each corner of a frame its own radius', async () => {
    await emptyBoard()
    drawFrame(100, 100, 300, 250)
    await waitFor(() => expect(savedNodes()).toHaveLength(1))
    fireEvent.change(numberInput('RADIUS'), { target: { value: '8' } })
    await waitFor(() => expect(savedNodes()[0].style.radius).toBe(8))

    fireEvent.click(screen.getByTitle('A radius for each corner'))
    await waitFor(() => expect(savedNodes()[0].style.radius).toEqual({ tl: 8, tr: 8, br: 8, bl: 8 }))
    fireEvent.change(numberInput('↘'), { target: { value: '24' } })
    await waitFor(() => expect(savedNodes()[0].style.radius).toEqual({ tl: 8, tr: 8, br: 24, bl: 8 }))
    // Corners that differ have no one value to show.
    expect(numberInput('RADIUS').value).toBe('')

    // Joining keeps the largest, so nothing visibly shrinks.
    fireEvent.click(screen.getByTitle('One radius for all corners'))
    await waitFor(() => expect(savedNodes()[0].style.radius).toBe(24))
  })

  it('gives a rectangle differing corners, drawn as a path', async () => {
    await emptyBoard()
    await rectangleAt(100, 100, 200, 200)
    fireEvent.click(screen.getByTitle('A radius for each corner'))
    fireEvent.change(numberInput('↖'), { target: { value: '20' } })
    await waitFor(() => expect(savedNodes()[0].style.radius).toMatchObject({ tl: 20 }))
    const shape = getBoard().querySelector('svg path[d*=" A "]')
    expect(shape).not.toBeNull()
  })
})

describe('layout controls in the inspector', () => {
  it('sets a frame’s flow, alignment and padding with buttons', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame(100, 100, 500, 400)
    drawFrame(150, 150, 250, 200)
    await waitFor(() => expect(currentDoc().nodes[0].children).toHaveLength(1))

    clickAt(460, 380)
    fireEvent.click(await screen.findByTitle('Horizontal stack'))
    fireEvent.click(await screen.findByTitle('Align children: Center'))
    fireEvent.click(await screen.findByTitle('Space between'))
    await waitFor(() => expect(currentDoc().nodes[0].style).toMatchObject({ flow: 'horizontal', align: 'center', justify: 'between' }))

    // Padding per side.
    fireEvent.click(await screen.findByTitle('Padding per side'))
    await waitFor(() => expect(currentDoc().nodes[0].style.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 }))
  })
})
