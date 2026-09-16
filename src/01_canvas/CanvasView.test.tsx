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
      .filter((p) => p.startsWith(`${dir}/`))
      .map((p) => ({ name: p.slice(dir.length + 1), path: p, type: 'file' as const, createdAt: 0 })),
  })),
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
  fireEvent.click(screen.getByTitle('Frame (F)'))
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
  // Everything except board JSON (which now lives in .canvas/.boards/).
  return [...files.keys()].filter((p) => !p.startsWith('.canvas/.boards/') && !p.startsWith('.planning/'))
}

/**
 * Promotes the selected frame.
 *
 * One click, no dialog: the component lands on the board AND its file lands in
 * `.canvas` at a derived path. Waits for the file, since that write is what the
 * board mutation is committed behind.
 */
async function promoteFrame(): Promise<void> {
  const before = componentFiles().length
  fireEvent.click(await screen.findByText('CREATE COMPONENT', { selector: 'button' }))
  await waitFor(() => expect(componentFiles()).toHaveLength(before + 1))
}

function savedDocs() {
  return [...files.entries()]
    .filter(([p]) => p.startsWith('.canvas/.boards/'))
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

  it('creates a board and persists it under .canvas/.boards/', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))

    await waitFor(() => expect(savedDocs()).toHaveLength(1))
    const [path] = [...files.keys()]
    expect(path).toMatch(/^\.canvas\/\.boards\/canvas-.*\.json$/)
    expect([...files.keys()].some((p) => p.startsWith('.planning/'))).toBe(false)
    expect(savedDocs()[0].nodes).toEqual([])
    expect(savedDocs()[0].version).toBe(1)
  })

  it('draws a frame by dragging with the Frame tool, and autosaves it', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    // Pick the Frame tool the way a user does.
    fireEvent.click(screen.getByTitle('Frame (F)'))

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

  it('selects the new frame and shows its geometry in the inspector', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    fireEvent.click(screen.getByTitle('Frame (F)'))
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

    fireEvent.click(screen.getByTitle('Frame (F)'))
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
    for (const hint of ['Select (V)', 'Frame (F)', 'Text (T)']) {
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
    expect(saved.components[0].componentRoot).toBe('.canvas')
    expect(componentFiles()).toEqual(['.canvas/frame/frame.tsx'])
    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.filePath).toBe('.canvas/frame/frame.tsx')
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

    expect(componentFiles().sort()).toEqual(['.canvas/frame-2/frame.tsx', '.canvas/frame/frame.tsx'])
    await waitFor(() => {
      const paths = savedDocs()[0].components.map((c: { filePath?: string }) => c.filePath).sort()
      expect(paths).toEqual(['.canvas/frame-2/frame.tsx', '.canvas/frame/frame.tsx'])
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

    expect(componentFiles()).toEqual(['.canvas/frame/frame.tsx'])

    const source = files.get('.canvas/frame/frame.tsx')!
    expect(source).toContain('export interface FrameProps {}')
    expect(source).toContain('export const Frame = ({}: FrameProps) => {')
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

  it('keeps a component that carries variants when its file is removed', async () => {
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

    fireEvent.click(await screen.findByText('REMOVE FROM WORKSPACE'))
    await waitFor(() => expect(componentFiles()).toEqual([]))

    // Variants and props are work a frame cannot hold, and this runs behind one
    // click with no undo once the board autosaves — so it is kept and flagged
    // rather than dissolved, and FLATTEN TO FRAME is where you say otherwise.
    await waitFor(() => {
      const component = currentDoc().components[0]
      expect(component.sync).toBe('detached')
      expect(component.filePath).toBeUndefined()
    })
    expect(currentDoc().components).toHaveLength(1)
    expect(currentDoc().nodes[0].kind).toBe('instance')
    expect(await screen.findByText(/Its file was deleted/)).toBeInTheDocument()
    expect(screen.queryByText('Not in the workspace yet')).not.toBeInTheDocument()
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
    await waitFor(() => expect(componentFiles()).toEqual(['.canvas/card/card.tsx']))

    // The rename reaches INSIDE the file, not just the board — a file called
    // card.tsx still exporting `Frame` would be the worse half-outcome.
    const source = files.get('.canvas/card/card.tsx')!
    expect(source).toContain('export interface CardProps {}')
    expect(source).toContain('export const Card = ({}: CardProps) => {')
    expect(source).not.toContain('export const Frame')

    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.name).toBe('Card')
      expect(component.filePath).toBe('.canvas/card/card.tsx')
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
    expect(componentFiles()).toEqual(['.canvas/frame/frame.tsx'])
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
    await waitFor(() => expect(componentFiles()).toEqual(['.canvas/widgets/frame.tsx']))

    // Renaming must not drag it back to an auto-derived folder — that choice
    // was made on purpose and outranks the naming convention.
    fireEvent.click(await screen.findByText('RENAME / MOVE…'))
    const second = await findModal()
    fireEvent.change(within(second).getByDisplayValue('Frame'), { target: { value: 'Card' } })
    fireEvent.click(within(second).getByText('SAVE'))

    await waitFor(() => expect(componentFiles()).toEqual(['.canvas/widgets/card.tsx']))
  })

  it('writes a detached component back into the workspace through the modal', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')
    drawFrame()
    await promoteFrame()

    // A variant first, so removing the file leaves the component DETACHED
    // rather than dissolving it — a bare component would be un-promoted back
    // to a frame and there would be nothing left to push.
    fireEvent.click(await screen.findByText('+ ADD VARIANT'))
    const variantField = screen.getByPlaceholderText('variant name')
    fireEvent.change(variantField, { target: { value: 'Hover' } })
    fireEvent.keyDown(variantField, { key: 'Enter' })
    await waitFor(() => expect(currentDoc().components[0].variants).toHaveLength(2))

    // PUSH TO WORKSPACE is for a component with NO file, which after automatic
    // promotion means a detached one. That is the only state the modal still
    // gates, and the only one where it can create rather than collide.
    fireEvent.click(await screen.findByText('REMOVE FROM WORKSPACE'))
    await waitFor(() => expect(componentFiles()).toEqual([]))

    fireEvent.click(await screen.findByText('PUSH TO WORKSPACE'))
    const modal = await findModal()
    fireEvent.change(within(modal).getByDisplayValue('Frame'), { target: { value: 'Card' } })

    // It still shows exactly what will be produced.
    expect(await within(modal).findByText(/export const Card · CardProps/)).toBeInTheDocument()

    fireEvent.click(within(modal).getByText('APPROVE'))

    await waitFor(() => expect(componentFiles()).toEqual(['.canvas/card/card.tsx']))
    const source = files.get('.canvas/card/card.tsx')!
    // The variant added above is a real prop, so it reaches the interface and
    // the signature — the fresh emit carries the component's whole shape.
    expect(source).toContain("state?: 'default' | 'hover'")
    expect(source).toContain("export const Card = ({ state = 'default' }: CardProps) => {")

    await waitFor(() => {
      const component = savedDocs()[0].components[0]
      expect(component.filePath).toBe('.canvas/card/card.tsx')
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

  it('hides the align controls until a selection can use them', async () => {
    render(<CanvasView activeProject={PROJECT} />)
    fireEvent.click(await screen.findByText('CREATE A BOARD'))
    await screen.findByText('EMPTY BOARD')

    expect(document.querySelector('[data-canvas-align-toolbar]')).toBeNull()

    drawFrame()
    await waitFor(() =>
      expect(document.querySelector('[data-canvas-align-toolbar]')).not.toBeNull(),
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
    const flow = await screen.findByDisplayValue('Freeform (absolute children)')
    fireEvent.change(flow, { target: { value: 'vertical' } })
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

    fireEvent.click(screen.getByTitle('Frame (F)'))
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
