// Camera control for the canvas board.
//
// The camera lives in a ref and is applied by writing a CSS transform straight
// to the DOM — never React state. Same reasoning as GraphCanvas: a state update
// per pointermove would re-render the whole layer tree at 60Hz and make
// dragging feel awful. Consumers that need to *display* the zoom level
// subscribe via `onCameraChange`, which is throttled to animation frames.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  CLICK_DRAG_THRESHOLD,
  cameraTransform,
  clampScale,
  panBy,
  toBoardPoint,
  zoomAt,
  type Camera,
} from './panZoomMath'

export interface UsePanZoomOptions {
  /** Applied on mount and after a `setCamera`. */
  initial?: Camera
  /**
   * `zoom`     — plain wheel zooms (GraphCanvas's behavior).
   * `pan-zoom` — plain wheel/trackpad scrolls the board, ctrl/cmd+wheel zooms.
   *              Figma's behavior, and the right default for a design surface.
   */
  wheelMode?: 'zoom' | 'pan-zoom'
  onCameraChange?: (camera: Camera) => void
  /** True while another interaction (dragging a node, drawing a marquee) owns the pointer. */
  isBusy?: () => boolean
}

export interface PanZoomHandle {
  /** Attach to the clipping container; the transform goes on its first child. */
  containerRef: React.RefObject<HTMLDivElement>
  /** The element the camera transform is written to. */
  viewportRef: React.RefObject<HTMLDivElement>
  getCamera: () => Camera
  setCamera: (camera: Camera) => void
  /** Client (page) coordinates → board coordinates. */
  toBoard: (clientX: number, clientY: number) => { x: number; y: number }
  /** True while a space-bar or middle-button pan is in progress. */
  isPanning: () => boolean
  /** Bind to the container. */
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
}

const DEFAULT_CAMERA: Camera = { x: 0, y: 0, k: 1 }

export function usePanZoom(options: UsePanZoomOptions = {}): PanZoomHandle {
  const { initial, wheelMode = 'pan-zoom', onCameraChange, isBusy } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const camera = useRef<Camera>(initial ?? DEFAULT_CAMERA)
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null)
  const spaceHeld = useRef(false)
  const notifyRaf = useRef(0)

  // Latest-value refs so the imperative listeners never close over a stale prop.
  const onCameraChangeRef = useRef(onCameraChange)
  onCameraChangeRef.current = onCameraChange
  const isBusyRef = useRef(isBusy)
  isBusyRef.current = isBusy

  const notify = useCallback(() => {
    if (!onCameraChangeRef.current || notifyRaf.current) return
    notifyRaf.current = requestAnimationFrame(() => {
      notifyRaf.current = 0
      onCameraChangeRef.current?.(camera.current)
    })
  }, [])

  /**
   * Writes the camera to the viewport, and re-asserts it after every commit.
   *
   * Running once on mount was not enough, and the gap was invisible until it
   * wasn't. The board is gated behind `loading` in CanvasView, so on the hook's
   * own mount there is no viewport element to write to; a board switch, a tab
   * revisit and a hot reload each hand us a brand new element that has never
   * seen a transform. In every one of those cases the layer tree kept rendering
   * at 1:1 while the screen-space chrome was drawn at the real camera — so every
   * selection ring, handle and label sat at a fixed offset from the frame it
   * named, at the same size, forever.
   *
   * A layout effect with no dependency array is the honest fix: it costs one
   * string compare per commit and makes "the DOM shows camera.current" true by
   * construction rather than by lucky ordering.
   */
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const next = cameraTransform(camera.current)
    if (el.style.transform !== next) el.style.transform = next
  })

  const apply = useCallback(() => {
    const el = viewportRef.current
    if (el) el.style.transform = cameraTransform(camera.current)
    notify()
  }, [notify])

  const setCamera = useCallback(
    (next: Camera) => {
      camera.current = { ...next, k: clampScale(next.k) }
      apply()
      // Published synchronously, unlike the rAF-throttled stream a pan or wheel
      // produces: a jump (open a board, zoom to fit, reset) is one discrete
      // event, and letting subscribers lag it by a frame paints the screen-space
      // chrome at the OLD camera for that frame — a visible flick of every
      // selection ring and label.
      onCameraChangeRef.current?.(camera.current)
    },
    [apply],
  )

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return toBoardPoint(camera.current, clientX - rect.left, clientY - rect.top)
  }, [])

  // Apply the initial transform once mounted. The layout effect above keeps it
  // true from there on; this one also opens the onCameraChange stream.
  useEffect(() => {
    apply()
    return () => {
      if (notifyRaf.current) {
        cancelAnimationFrame(notifyRaf.current)
        // Clearing the handle is the whole point. `notify` treats a non-zero
        // value as "a publish is already queued", so a cancelled frame left in
        // place jams the gate shut permanently: the transform kept tracking the
        // camera while the React mirror the chrome reads froze at whatever it
        // last saw. Every pan after that moved the board and left the selection
        // ring behind — the same size, at a fixed offset. Effect cleanups run on
        // far more than unmount (a hot reload, StrictMode's double-invoke), so
        // this path is hit in ordinary development.
        notifyRaf.current = 0
      }
    }
  }, [apply])

  // Space-to-pan. Tracked on window (not the container) so holding space still
  // arms panning when focus sits in a panel, and released on blur so
  // alt-tabbing away mid-hold doesn't leave the board stuck in pan mode.
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return
      spaceHeld.current = true
      if (containerRef.current) containerRef.current.style.cursor = 'grab'
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeld.current = false
      if (containerRef.current) containerRef.current.style.cursor = ''
    }
    const blur = () => {
      spaceHeld.current = false
      if (containerRef.current) containerRef.current.style.cursor = ''
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // Wheel is bound imperatively rather than via the JSX prop because React
  // attaches wheel listeners passively, and a passive listener cannot
  // preventDefault — which would let ctrl+wheel trigger the browser's own page
  // zoom right through the canvas.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      const el = e.currentTarget as HTMLElement
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      const zooming = wheelMode === 'zoom' || e.ctrlKey || e.metaKey
      if (zooming) {
        // Exponential in the delta so a trackpad pinch (many small events) and
        // a mouse wheel (few large ones) feel like the same gesture.
        camera.current = zoomAt(camera.current, px, py, camera.current.k * Math.exp(-e.deltaY * 0.002))
      } else {
        // Shift+wheel scrolls sideways on a mouse with no horizontal wheel.
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY
        camera.current = panBy(camera.current, -dx, -dy)
      }
      apply()
    },
    [wheelMode, apply],
  )

  // Bound to whichever element the container ref holds NOW, re-checked after
  // every commit — the same reason as the transform effect above. A one-shot
  // effect on mount found no element (the board renders only once a board has
  // loaded) and never ran again, so the wheel did nothing at all: no scroll,
  // no ctrl+wheel zoom.
  const wheelBinding = useRef<{ el: HTMLDivElement; listener: (e: WheelEvent) => void } | null>(null)
  useLayoutEffect(() => {
    const el = containerRef.current
    const bound = wheelBinding.current
    if (bound?.el === el && bound?.listener === onWheel) return
    bound?.el.removeEventListener('wheel', bound.listener)
    wheelBinding.current = null
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    wheelBinding.current = { el, listener: onWheel }
  })
  useEffect(
    () => () => {
      const bound = wheelBinding.current
      bound?.el.removeEventListener('wheel', bound.listener)
      wheelBinding.current = null
    },
    [],
  )

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Middle button or space+drag pans from anywhere, including over a node —
    // that's what makes panning reachable without hunting for empty board.
    const wantsPan = e.button === 1 || (e.button === 0 && spaceHeld.current)
    if (!wantsPan) return
    if (isBusyRef.current?.()) return
    e.preventDefault()
    pan.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: camera.current.x,
      originY: camera.current.y,
      moved: false,
    }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing'
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pan.current) return
      const dx = e.clientX - pan.current.startX
      const dy = e.clientY - pan.current.startY
      if (!pan.current.moved && Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) pan.current.moved = true
      camera.current = { ...camera.current, x: pan.current.originX + dx, y: pan.current.originY + dy }
      apply()
    },
    [apply],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!pan.current) return
    pan.current = null
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      // capture already released (pointercancel, element unmounted mid-drag)
    }
    if (containerRef.current) containerRef.current.style.cursor = spaceHeld.current ? 'grab' : ''
  }, [])

  return {
    containerRef,
    viewportRef,
    getCamera: () => camera.current,
    setCamera,
    toBoard,
    isPanning: () => pan.current !== null,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
