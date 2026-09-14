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

import { Frame } from '../../app/UIKit/Frame/Frame'
import { toScreenPoint, type Camera } from '../hooks/panZoomMath'
import { findComponent, resolveVariant } from '../model/variants'
import { CanvasNodeView } from './CanvasNodeView'
import { AlignToolbar } from './AlignToolbar'
import { CanvasToolbar } from './CanvasToolbar'
import { ComponentLabel } from './ComponentLabel'
import { FrameLabel } from './FrameLabel'
import { isFrameNode, isInstanceNode, type CanvasDoc, type CanvasRect, type NodeId } from '../model/types'
import type { AlignMode, DistributeMode, Guide } from '../model/align'
import { ROOT_DROP_TARGET, type CanvasTool, type ResizeHandle } from '../CanvasView.ViewModel'

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

/** The "this frame will receive the child" green, shared by every nesting cue. */
const NEST = '#7fbf7f'

export interface CanvasBoardProps {
  doc: CanvasDoc
  camera: Camera
  /**
   * A node's true board rect — measured from the DOM wherever an auto-layout
   * ancestor owns its position, derived from the model everywhere else. The one
   * source every ring, handle and highlight below is drawn from.
   */
  rectOf: (id: NodeId) => CanvasRect | null
  selectedIds: Set<NodeId>
  previewRect: CanvasRect | null
  previewKind: 'draw' | 'marquee' | null
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
  canAlign: boolean
  canDistribute: boolean
  canGroup: boolean
  canUngroup: boolean
  onAlign: (mode: AlignMode) => void
  onDistribute: (mode: DistributeMode) => void
  onGroup: () => void
  onUngroup: () => void
}

export function CanvasBoard({
  doc,
  camera,
  rectOf,
  selectedIds,
  previewRect,
  previewKind,
  showHandles,
  resizeHandles,
  containerRef,
  viewportRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onStartResize,
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
  canAlign,
  canDistribute,
  canGroup,
  canUngroup,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
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

  const selectionBoxes = [...selectedIds]
    .map((id) => {
      const box = screenBoxOf(id)
      return box ? { id, ...box } : null
    })
    .filter((b): b is { id: NodeId; x: number; y: number; w: number; h: number } => b !== null)

  // The board root has no rect of its own — it is shown by lighting the whole
  // board edge instead, further down.
  const droppingToRoot = dropTargetId === ROOT_DROP_TARGET
  const dropTargetRect = droppingToRoot ? null : screenBoxOf(dropTargetId)
  // The hover ring is redundant once the node carries a selection ring, and
  // would only double the outline weight.
  const hoverRect = hoverId && !selectedIds.has(hoverId) && hoverId !== dropTargetId
    ? screenBoxOf(hoverId)
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
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        background: 'var(--bg-0)',
        // 'move' over a hit node is the affordance that tells you the press will
        // grab THAT node rather than pan or marquee.
        cursor: crosshair ? 'crosshair' : hoverId ? 'move' : undefined,
        // The dotted grid is painted on the container and offset by the camera,
        // so it pans with the board without living in the transformed layer
        // (where it would scale and go blurry).
        backgroundImage: 'radial-gradient(var(--border-1) 1px, transparent 1px)',
        backgroundSize: `${24 * camera.k}px ${24 * camera.k}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
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
            selectedIds={selectedIds}
            components={doc.components}
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
              outline: '1px solid var(--accent, #6fa8dc)',
              outlineOffset: 0,
            }}
          />
        ))}

        {showHandles && selectionBoxes.length === 1 && (
          <>
            {HANDLES.filter((h) => resizeHandles.includes(h.id)).map((handle) => {
              const box = selectionBoxes[0]
              return (
                <div
                  key={handle.id}
                  data-canvas-handle={handle.id}
                  onPointerDown={(e) => onStartResize(handle.id, e)}
                  style={{
                    position: 'absolute',
                    left: box.x + box.w * handle.cx - HANDLE_SIZE / 2,
                    top: box.y + box.h * handle.cy - HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    background: 'var(--bg-1)',
                    border: '1px solid var(--accent, #6fa8dc)',
                    borderRadius: 1,
                    cursor: handle.cursor,
                    pointerEvents: 'auto',
                  }}
                />
              )
            })}
          </>
        )}

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
            Press F and drag to draw a frame · T for text
          </span>
        </Frame>
      )}

      <AlignToolbar
        canAlign={canAlign}
        canDistribute={canDistribute}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onAlign={onAlign}
        onDistribute={onDistribute}
        onGroup={onGroup}
        onUngroup={onUngroup}
      />
      <CanvasToolbar tool={tool} onSelectTool={onSelectTool} />
    </div>
  )
}
