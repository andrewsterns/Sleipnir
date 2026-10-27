// The infinite board: a clipping container holding one transformed viewport.
//
// The camera is a CSS transform written straight to the DOM by usePanZoom —
// never React state — so panning and zooming never re-render the layer tree.
// Selection chrome is drawn in SCREEN space on top, so handles and rings stay a
// constant size at any zoom instead of scaling into invisibility.
//
// Every box here comes from the `rectOf` prop rather than from the document
// directly. That indirection is the fix for auto-layout: a node inside a
// vertical or horizontal frame is placed by the browser, so its model rect is
// not where it is drawn, and reading the model produced an outline floating
// somewhere off the frame it claimed to select. See model/layout.ts.

import type { OrientedBox } from '../model/rotation'
import { findParent } from '../model/doc'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { toScreenPoint, type Camera } from '../hooks/panZoomMath'
import { findComponent, resolveVariant } from '../model/variants'
import { CanvasNodeView } from './CanvasNodeView'
import type { ImageUrlResolver } from '../model/paint'
import type { LinkedComponents } from '../hooks/useLinkedComponents'
import { CanvasToolbar } from './CanvasToolbar'
import { ComponentLabel } from './ComponentLabel'
import { FrameLabel } from './FrameLabel'
import { isFrameNode, isInstanceNode, type CanvasDoc, type CanvasRect, type NodeId } from '../model/types'
import type { Guide } from '../model/align'
import { useSyncExternalStore } from 'react'
import { ROOT_DROP_TARGET, type CanvasTool, type PenDraft, type ResizeHandle, type ValueStore } from '../CanvasView.ViewModel'
import { pathData } from '../model/vector'
import type { PointPart } from '../model/vectorEdit'
import type { VectorPoint } from '../model/types'

/** A path being point-edited, in board space (see CanvasView.ViewModel's vectorEdit). */
export interface VectorEditView {
  points: VectorPoint[]
  closed: boolean
  /** Selected anchors, by index. */
  selectedPoints: number[]
  /** A handle selected on its own, which Delete removes. */
  selectedHandle: { index: number; part: 'in' | 'out' } | null
}

const HANDLES: { id: ResizeHandle; cx: number; cy: number; cursor: string }[] = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'n', cx: 0.5, cy: 0, cursor: 'ns-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'e', cx: 1, cy: 0.5, cursor: 'ew-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
  { id: 's', cx: 0.5, cy: 1, cursor: 'ns-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'w', cx: 0, cy: 0.5, cursor: 'ew-resize' },
]

const HANDLE_SIZE = 8

/** The square, just outside each corner, where a press rotates instead of resizing. */
const ROTATE_ZONE = 18

/** Each handle's direction, clockwise from straight up — turned with the node to pick its cursor. */
const HANDLE_ANGLE: Record<ResizeHandle, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }
const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']

/** The resize cursor that points the way a handle actually faces once its node is turned. */
function handleCursor(handle: ResizeHandle, angle: number): string {
  const facing = (((HANDLE_ANGLE[handle] + angle) % 180) + 180) % 180
  return RESIZE_CURSORS[Math.round(facing / 45) % 4]
}

/** A curved-arrow cursor for the rotate zones — no built-in cursor says "turn". */
const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M5 13a6 6 0 1 1 6 3" fill="none" stroke="white" stroke-width="3.5"/><path d="M5 13a6 6 0 1 1 6 3" fill="none" stroke="black" stroke-width="1.5"/><path d="M2 10l3 4 3-4z" fill="black" stroke="white" stroke-width=".8"/></svg>',
)}") 10 10, crosshair`

/** The "this frame will receive the child" green, shared by every nesting cue. */
const NEST = '#7fbf7f'

/** A ring on screen: the unrotated box placed about the node's center, and the angle it is turned by. */
interface ScreenRing {
  x: number
  y: number
  w: number
  h: number
  angle: number
}

export interface CanvasBoardProps {
  doc: CanvasDoc
  /** Loads workspace image fills — see useWorkspaceImages. */
  imageUrl: ImageUrlResolver
  /** Components pasted in from other boards — see useLinkedComponents. */
  linked: LinkedComponents
  camera: Camera
  /**
   * A node's true board rect — measured from the DOM wherever an auto-layout
   * ancestor owns its position, derived from the model everywhere else. The one
   * source every ring, handle and highlight below is drawn from.
   */
  rectOf: (id: NodeId) => CanvasRect | null
  /** A node as drawn — center, size and total rotation — for rings and handles that turn with it. */
  orientedOf: (id: NodeId) => OrientedBox | null
  /** The selected along-path frame's start point and heading, in board space — drawn as a dot and an arrow. */
  pathHint: { x: number; y: number; angle: number } | null
  selectedIds: Set<NodeId>
  previewRect: CanvasRect | null
  previewKind: 'draw' | 'marquee' | null
  /** A pen path being drawn, in board space — drawn here in screen space so it stays crisp at any zoom. */
  pen: PenDraft | null
  /** Where the pen's next anchor would go — read straight from its store, so hovering re-renders only the preview. */
  penCursor: ValueStore<{ x: number; y: number } | null>
  /** The path whose points are being edited, in board space, or null. */
  vectorEdit: VectorEditView | null
  /** A press on one of the edited path's anchors or handles. */
  onPointPointerDown: (index: number, part: PointPart, e: React.PointerEvent) => void
  /** Where Ctrl+click would add an anchor on the edited path, in board space. */
  insertPreview: ValueStore<{ x: number; y: number } | null>
  showHandles: boolean
  /**
   * Which of the eight handles to draw. A node an auto-layout parent positions
   * gets only the three that resize from its pinned corner — the rest could
   * change nothing, and a control that does nothing is worse than no control.
   */
  resizeHandles: ResizeHandle[]
  containerRef: React.RefObject<HTMLDivElement>
  viewportRef: React.RefObject<HTMLDivElement>
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerLeave: () => void
  onStartResize: (handle: ResizeHandle, e: React.PointerEvent) => void
  /** A press in a rotate zone outside the selection's corners. */
  onStartRotate: (e: React.PointerEvent) => void
  /** A press on an along-path frame's start marker — drags the whole run along the curve. */
  onStartPathSlide: (e: React.PointerEvent) => void
  /** Selects a frame and starts moving it — the frame label's press. */
  onStartMove: (id: NodeId, e: React.PointerEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  /** Alignment guides for the live drag, in board space. */
  guides: Guide[]
  /** Frame the current drag or draw would drop into; ROOT_DROP_TARGET = the board. */
  dropTargetId: NodeId | null
  /**
   * Board-space bar showing where a drop lands in an auto-layout frame's flow.
   *
   * Under a flow there is no free position to preview, so this line — between
   * the two children the node would sit between — is the only honest cue for
   * what releasing will do.
   */
  dropIndicator: CanvasRect | null
  /** What a click would select right now, ringed so nesting is never a guess. */
  hoverId: NodeId | null
  crosshair: boolean
  tool: CanvasTool
  onSelectTool: (tool: CanvasTool) => void
  onSelectInstanceVariant: (instanceId: NodeId, variantId: string) => void
  onTriggerNextVariant: (instanceId: NodeId) => void
  onOpenComponent: (componentId: string) => void
}

export function CanvasBoard({
  doc,
  imageUrl,
  linked,
  camera,
  rectOf,
  orientedOf,
  pathHint,
  selectedIds,
  previewRect,
  previewKind,
  pen,
  penCursor,
  vectorEdit,
  onPointPointerDown,
  insertPreview,
  showHandles,
  resizeHandles,
  containerRef,
  viewportRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onStartResize,
  onStartRotate,
  onStartPathSlide,
  onStartMove,
  onDoubleClick,
  guides,
  dropTargetId,
  dropIndicator,
  hoverId,
  crosshair,
  tool,
  onSelectTool,
  onSelectInstanceVariant,
  onTriggerNextVariant,
  onOpenComponent,
}: CanvasBoardProps) {
  /** Board rect → screen box. The single place board space becomes pixels. */
  const toScreenBox = (rect: CanvasRect) => {
    const topLeft = toScreenPoint(camera, rect.x, rect.y)
    return { x: topLeft.x, y: topLeft.y, w: rect.w * camera.k, h: rect.h * camera.k }
  }

  /** A node's screen box, or null when it is gone or unmounted. */
  const screenBoxOf = (id: NodeId | null) => {
    if (!id) return null
    const rect = rectOf(id)
    return rect ? toScreenBox(rect) : null
  }

  /**
   * A node's ring box on screen: its UNROTATED box placed about its real
   * center, plus the angle to turn it by. Upright nodes take the exact
   * rectOf box (angle 0), so nothing about them changes.
   */
  const ringBoxOf = (id: NodeId | null): ScreenRing | null => {
    if (!id) return null
    const o = orientedOf(id)
    if (!o || !o.angle) {
      const box = screenBoxOf(id)
      return box ? { ...box, angle: 0 } : null
    }
    const c = toScreenPoint(camera, o.cx, o.cy)
    const w = o.w * camera.k
    const h = o.h * camera.k
    return { x: c.x - w / 2, y: c.y - h / 2, w, h, angle: o.angle }
  }

  const selectionBoxes = [...selectedIds]
    .map((id) => {
      const box = ringBoxOf(id)
      return box ? { id, ...box } : null
    })
    .filter((b): b is { id: NodeId } & ScreenRing => b !== null)

  // The board root has no rect of its own — it is shown by lighting the whole
  // board edge instead, further down.
  const droppingToRoot = dropTargetId === ROOT_DROP_TARGET
  const dropTargetRect = droppingToRoot ? null : screenBoxOf(dropTargetId)
  // The hover ring is redundant once the node carries a selection ring, and
  // would only double the outline weight.
  const hoverRect = hoverId && !selectedIds.has(hoverId) && hoverId !== dropTargetId
    ? ringBoxOf(hoverId)
    : null

  const previewScreen = previewRect ? toScreenBox(previewRect) : null
  const indicatorScreen = dropIndicator ? toScreenBox(dropIndicator) : null

  return (
    <div
      ref={containerRef}
      // Stable hook for tests and for the selection overlay to locate the
      // board without depending on inline-style matching.
      data-canvas-board=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
      // A press on an already-selected node used to start the browser's native
      // drag-and-drop instead (the red "no drop" cursor), which cancels the
      // pointer stream and leaves the node frozen. Nothing on the board is
      // natively draggable, so refuse it outright.
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        // The first drag swept a text selection across the rendered nodes, and
        // a selection is what the browser drags on the second press.
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: 'var(--bg-0)',
        // 'move' over a hit node is the affordance that tells you the press will
        // grab THAT node rather than pan or marquee.
        cursor: crosshair ? 'crosshair' : hoverId ? 'move' : undefined,
        touchAction: 'none',
      }}
    >
      <div
        ref={viewportRef}
        style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', willChange: 'transform' }}
      >
        {doc.nodes.map((node) => (
          <CanvasNodeView
            key={node.id}
            node={node}
            parentFlow="freeform"
            components={doc.components}
            imageUrl={imageUrl}
            linked={linked}
          />
        ))}
      </div>

      {/* ── Screen-space chrome ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {/* Frame names, on top-level frames only — Figma labels artboards, not
            every nested container. Since a click now reaches into a frame, this
            is how the frame ITSELF is selected and moved when its children cover
            it. Instances get ComponentLabel instead, just below. */}
        {doc.nodes.map((node) => {
          if (!isFrameNode(node)) return null
          const box = screenBoxOf(node.id)
          if (!box) return null
          return (
            <FrameLabel
              key={`frame-label-${node.id}`}
              name={node.name}
              x={box.x}
              y={box.y}
              selected={selectedIds.has(node.id)}
              onPointerDown={(e) => onStartMove(node.id, e)}
            />
          )
        })}

        {/* Component labels sit in screen space so they stay legible at any zoom
            and are never clipped by an ancestor frame's clipContent. */}
        {doc.nodes.map((node) => {
          if (!isInstanceNode(node)) return null
          const component = findComponent(doc, node.componentId)
          if (!component) return null
          const box = screenBoxOf(node.id)
          if (!box) return null
          return (
            <ComponentLabel
              key={`label-${node.id}`}
              component={component}
              activeVariant={resolveVariant(component, node.variantValues)}
              x={box.x}
              y={box.y}
              selected={selectedIds.has(node.id)}
              onSelectVariant={(variantId) => onSelectInstanceVariant(node.id, variantId)}
              onTriggerNext={() => onTriggerNextVariant(node.id)}
              onOpenComponent={() => onOpenComponent(component.id)}
            />
          )
        })}

        {/* Hover: what a click would take. Thin and unsaturated so it reads as a
            preview of the selection ring rather than a second selection. */}
        {hoverRect && (
          <div
            data-canvas-hover=""
            style={{
              position: 'absolute',
              left: hoverRect.x,
              top: hoverRect.y,
              width: hoverRect.w,
              height: hoverRect.h,
              transform: hoverRect.angle ? `rotate(${hoverRect.angle}deg)` : undefined,
              outline: '1px solid rgba(111,168,220,0.55)',
            }}
          />
        )}

        {/* Drop target: the frame a dragged — or freshly drawn — node will land
            INSIDE. Ringed on the outside and tinted, so the parent that is about
            to adopt a child is unmistakable while the cursor is still moving. */}
        {dropTargetRect && (
          <div
            data-canvas-drop-target=""
            style={{
              position: 'absolute',
              left: dropTargetRect.x,
              top: dropTargetRect.y,
              width: dropTargetRect.w,
              height: dropTargetRect.h,
              outline: `2px solid ${NEST}`,
              outlineOffset: 1,
              boxShadow: '0 0 0 4px rgba(127,191,127,0.18)',
              background: 'rgba(127,191,127,0.10)',
            }}
          />
        )}

        {/* Dropping on empty canvas un-nests. The root has no box to ring, so
            the board's own edge lights up instead. */}
        {droppingToRoot && (
          <div
            data-canvas-drop-root=""
            style={{
              position: 'absolute',
              inset: 2,
              outline: `2px solid ${NEST}`,
              outlineOffset: -2,
              opacity: 0.7,
            }}
          />
        )}

        {/* Where the drop lands in an auto-layout frame's flow.
            A node a flow positions has no free position to preview, so this bar
            between its would-be neighbours is the whole answer to "what does
            releasing do" — and the cue that makes such a child movable at all.
            Floored to 2px on screen so it never thins away at low zoom. */}
        {indicatorScreen && (
          <div
            data-canvas-drop-indicator=""
            style={{
              position: 'absolute',
              left: indicatorScreen.x,
              top: indicatorScreen.y,
              width: Math.max(2, indicatorScreen.w),
              height: Math.max(2, indicatorScreen.h),
              background: NEST,
              boxShadow: `0 0 0 2px rgba(127,191,127,0.25)`,
              borderRadius: 1,
            }}
          />
        )}

        {/* Alignment guides, drawn in screen space so they stay hairline-thin. */}
        {guides.map((guide, i) => {
          const from = toScreenPoint(camera, guide.axis === 'x' ? guide.position : guide.start, guide.axis === 'x' ? guide.start : guide.position)
          const length = (guide.end - guide.start) * camera.k
          return (
            <div
              key={`guide-${i}`}
              style={{
                position: 'absolute',
                left: from.x,
                top: from.y,
                width: guide.axis === 'x' ? 1 : length,
                height: guide.axis === 'x' ? length : 1,
                background: '#e0559b',
              }}
            />
          )
        })}

        {selectionBoxes.map((box) => (
          <div
            key={box.id}
            // Names which node the ring belongs to, so "the outline is on the
            // wrong box" is assertable rather than only visible.
            data-canvas-selection={box.id}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              transform: box.angle ? `rotate(${box.angle}deg)` : undefined,
              outline: '1px solid var(--accent, #6fa8dc)',
              outlineOffset: 0,
            }}
          />
        ))}

        {/* A selected pattern template's copies, outlined faintly — each turned
            to its own angle — so the whole run reads as one selection. */}
        {[...selectedIds].flatMap((id) => {
          const parent = findParent(doc, id)
          const copies = parent ? parent.children.filter((c) => c.repeatOf === id) : []
          return copies.map((copy) => {
            const ring = ringBoxOf(copy.id)
            if (!ring) return null
            return (
              <div
                key={`copy-${copy.id}`}
                data-canvas-pattern-copy={copy.id}
                style={{
                  position: 'absolute',
                  left: ring.x,
                  top: ring.y,
                  width: ring.w,
                  height: ring.h,
                  transform: ring.angle ? `rotate(${ring.angle}deg)` : undefined,
                  outline: '1px dashed rgba(111,168,220,0.6)',
                }}
              />
            )
          })
        })}

        {/* Where an along-path run starts, and which way it goes. */}
        {pathHint && (() => {
          const at = toScreenPoint(camera, pathHint.x, pathHint.y)
          return (
            <svg
              data-canvas-path-start=""
              width={40}
              height={40}
              viewBox="-20 -20 40 40"
              style={{ position: 'absolute', left: at.x - 20, top: at.y - 20, overflow: 'visible' }}
            >
              {/* Lifted off the curve (on its outside, square to it) so it never
                  sits on top of the first piece and steal its drag. */}
              <g transform={`rotate(${pathHint.angle}) translate(0 -18)`}>
                <line x1={0} y1={4} x2={0} y2={18} stroke="var(--accent, #6fa8dc)" strokeWidth={1} strokeDasharray="2 2" />
                {/* Grab it to slide the whole run along the path. */}
                <circle
                  r={7}
                  fill="transparent"
                  style={{ pointerEvents: 'auto', cursor: 'grab' }}
                  onPointerDown={onStartPathSlide}
                >
                  <title>Drag to slide every piece along the path</title>
                </circle>
                <circle r={4} fill="var(--accent, #6fa8dc)" stroke="var(--bg-1)" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
                <path d="M 8 -4 L 15 0 L 8 4" fill="none" stroke="var(--accent, #6fa8dc)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </svg>
          )
        })()}

        {/* Handles live in a box turned with the node, so they sit on its real
            corners and edges. Rotate zones sit just outside the corners, under
            the handles — Figma's "hover past the corner to turn". */}
        {showHandles && selectionBoxes.length === 1 && (() => {
          const box = selectionBoxes[0]
          return (
            <div
              style={{
                position: 'absolute',
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                transform: box.angle ? `rotate(${box.angle}deg)` : undefined,
              }}
            >
              {(['nw', 'ne', 'se', 'sw'] as const).map((corner) => (
                <div
                  key={`rotate-${corner}`}
                  data-canvas-rotate={corner}
                  onPointerDown={onStartRotate}
                  style={{
                    position: 'absolute',
                    left: (corner.includes('e') ? box.w : 0) - (corner.includes('e') ? 2 : ROTATE_ZONE - 2),
                    top: (corner.includes('s') ? box.h : 0) - (corner.includes('s') ? 2 : ROTATE_ZONE - 2),
                    width: ROTATE_ZONE,
                    height: ROTATE_ZONE,
                    cursor: ROTATE_CURSOR,
                    pointerEvents: 'auto',
                  }}
                />
              ))}
              {HANDLES.filter((h) => resizeHandles.includes(h.id)).map((handle) => (
                <div
                  key={handle.id}
                  data-canvas-handle={handle.id}
                  onPointerDown={(e) => onStartResize(handle.id, e)}
                  style={{
                    position: 'absolute',
                    left: box.w * handle.cx - HANDLE_SIZE / 2,
                    top: box.h * handle.cy - HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    background: 'var(--bg-1)',
                    border: '1px solid var(--accent, #6fa8dc)',
                    borderRadius: 1,
                    cursor: box.angle ? handleCursor(handle.id, box.angle) : handle.cursor,
                    pointerEvents: 'auto',
                  }}
                />
              ))}
            </div>
          )
        })()}

        {pen && pen.points.length > 0 && <PenPreview pen={pen} camera={camera} cursorStore={penCursor} />}
        {vectorEdit && <VectorEditOverlay edit={vectorEdit} camera={camera} onPointPointerDown={onPointPointerDown} />}
        {vectorEdit && <InsertPreviewDot store={insertPreview} camera={camera} />}

        {previewScreen && (
          <div
            style={{
              position: 'absolute',
              left: previewScreen.x,
              top: previewScreen.y,
              width: previewScreen.w,
              height: previewScreen.h,
              border:
                previewKind === 'marquee'
                  ? '1px solid var(--accent, #6fa8dc)'
                  : '1px dashed var(--text-2)',
              background: previewKind === 'marquee' ? 'rgba(111,168,220,0.08)' : 'transparent',
            }}
          />
        )}
      </div>

      {doc.nodes.length === 0 && (
        <Frame
          flow="vertical"
          align="center"
          justify="center"
          gap={8}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
            EMPTY BOARD
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            Press F and drag to draw a frame · R / O for shapes · P for the pen · T for text
          </span>
        </Frame>
      )}

      <CanvasToolbar tool={tool} onSelectTool={onSelectTool} />
    </div>
  )
}

/**
 * The pen's draft: the path placed so far, a dashed rubber band showing the
 * segment the next click would add, every anchor, and the handles of the
 * anchor being placed. The first anchor is drawn larger — clicking it closes
 * the shape.
 */
function PenPreview({
  pen,
  camera,
  cursorStore,
}: {
  pen: PenDraft
  camera: Camera
  cursorStore: ValueStore<{ x: number; y: number } | null>
}) {
  const boardCursor = useSyncExternalStore(cursorStore.subscribe, cursorStore.get)
  const toScreen = (p: { x: number; y: number }) => toScreenPoint(camera, p.x, p.y)
  const screenPoints = pen.points.map((p) => ({
    ...toScreen(p),
    ...(p.in ? { in: toScreen(p.in) } : {}),
    ...(p.out ? { out: toScreen(p.out) } : {}),
  }))
  const d = pathData(screenPoints, false, { x: 0, y: 0, w: 1, h: 1 }, { w: 1, h: 1 })
  const last = screenPoints[screenPoints.length - 1]
  const from = last.out ?? last
  const cursor = boardCursor ? toScreen(boardCursor) : null
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke="var(--accent, #6fa8dc)" strokeWidth={1.5} />
      {cursor && <line x1={from.x} y1={from.y} x2={cursor.x} y2={cursor.y} stroke="var(--accent, #6fa8dc)" strokeWidth={1} strokeDasharray="4 3" />}
      {(last.in || last.out) && (
        <g stroke="var(--accent, #6fa8dc)" strokeWidth={1}>
          {last.in && <line x1={last.x} y1={last.y} x2={last.in.x} y2={last.in.y} />}
          {last.out && <line x1={last.x} y1={last.y} x2={last.out.x} y2={last.out.y} />}
          {last.in && <circle cx={last.in.x} cy={last.in.y} r={2.5} fill="var(--bg-1)" />}
          {last.out && <circle cx={last.out.x} cy={last.out.y} r={2.5} fill="var(--bg-1)" />}
        </g>
      )}
      {screenPoints.map((p, i) => {
        const r = i === 0 ? 4.5 : 3
        return <rect key={i} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} fill="var(--bg-1)" stroke="var(--accent, #6fa8dc)" strokeWidth={1} />
      })}
    </svg>
  )
}

/**
 * The edited path's anchors and handles, in screen space so they stay a
 * constant size at any zoom. Every anchor is grabbable; handles show for the
 * selected anchor and its two neighbours, as in Figma, so a dense path isn't
 * buried under them. These are the only interactive bits of the chrome layer.
 */
function VectorEditOverlay({
  edit,
  camera,
  onPointPointerDown,
}: {
  edit: VectorEditView
  camera: Camera
  onPointPointerDown: (index: number, part: PointPart, e: React.PointerEvent) => void
}) {
  const toScreen = (p: { x: number; y: number }) => toScreenPoint(camera, p.x, p.y)
  const pts = edit.points.map((p) => ({
    ...toScreen(p),
    ...(p.in ? { in: toScreen(p.in) } : {}),
    ...(p.out ? { out: toScreen(p.out) } : {}),
  }))
  const n = pts.length
  const selected = new Set(edit.selectedPoints)
  // A selected anchor's handles, and its neighbours' — the ones its segments use.
  const showsHandles = (i: number) => selected.has(i) || selected.has((i + 1) % n) || selected.has((i - 1 + n) % n)
  const d = pathData(pts, edit.closed, { x: 0, y: 0, w: 1, h: 1 }, { w: 1, h: 1 })
  const ACCENT = 'var(--accent, #6fa8dc)'
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke={ACCENT} strokeWidth={1} />
      {pts.map((p, i) =>
        showsHandles(i) ? (
          <g key={`h${i}`}>
            {(['in', 'out'] as const).map((part) => {
              const h = p[part]
              if (!h) return null
              return (
                <g key={part}>
                  <line x1={p.x} y1={p.y} x2={h.x} y2={h.y} stroke={ACCENT} strokeWidth={1} />
                  <circle
                    data-point-handle={`${i}:${part}`}
                    cx={h.x}
                    cy={h.y}
                    r={3.5}
                    fill={edit.selectedHandle?.index === i && edit.selectedHandle.part === part ? ACCENT : 'var(--bg-1)'}
                    stroke={ACCENT}
                    strokeWidth={1}
                    style={{ pointerEvents: 'all', cursor: 'grab' }}
                    onPointerDown={(e) => onPointPointerDown(i, part, e)}
                  />
                </g>
              )
            })}
          </g>
        ) : null,
      )}
      {pts.map((p, i) => (
        <rect
          key={`a${i}`}
          data-point-anchor={i}
          x={p.x - 3.5}
          y={p.y - 3.5}
          width={7}
          height={7}
          fill={selected.has(i) ? ACCENT : 'var(--bg-1)'}
          stroke={ACCENT}
          strokeWidth={1}
          style={{ pointerEvents: 'all', cursor: 'move' }}
          onPointerDown={(e) => onPointPointerDown(i, 'anchor', e)}
        />
      ))}
    </svg>
  )
}

/**
 * The dot that rides the outline while Ctrl is held in point editing — where
 * a Ctrl+click would put the new anchor. Subscribes to its own store, so it
 * follows the cursor without re-rendering the board.
 */
function InsertPreviewDot({ store, camera }: { store: ValueStore<{ x: number; y: number } | null>; camera: Camera }) {
  const at = useSyncExternalStore(store.subscribe, store.get)
  if (!at) return null
  const p = toScreenPoint(camera, at.x, at.y)
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <circle data-insert-preview="" cx={p.x} cy={p.y} r={4} fill="var(--accent, #6fa8dc)" stroke="var(--bg-1)" strokeWidth={1.5} />
    </svg>
  )
}
