// Drag-to-scrub for the inspector's number fields: press on a field (or its
// label) and drag sideways — right raises the value, left lowers it. A press
// that never moves is a click and focuses the field for typing instead.
//
// The pointer is locked while scrubbing so the drag never runs out of room:
// the real cursor is hidden and a stand-in follows the movement, and when the
// stand-in leaves one side of the window it re-enters from the other, the way
// Blender's and Figma's scrubbers keep going. Without a lock (denied, or not
// granted yet) it degrades to a plain captured drag.
//
//   Shift — 10× per pixel     Alt — 0.1× per pixel     Esc — put it back

import { useCallback, useRef } from 'react'

const THRESHOLD_PX = 3

export interface ScrubOptions {
  value: number | undefined
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Change per pixel of travel. @default 1 */
  step?: number
  disabled?: boolean
  /** The field's input — a press that never drags focuses it. */
  inputRef: React.RefObject<HTMLInputElement | null>
}

export interface ScrubHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onMouseDown: (e: React.MouseEvent<HTMLElement>) => void
}

const decimalsOf = (n: number) => (n >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(n))))

// A ↔ that reads on any canvas: white with a dark outline, like the OS cursor.
// Lives on document.body, outside every theme scope, so no tokens here.
const CURSOR_SVG =
  '<svg width="24" height="14" viewBox="0 0 24 14" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M1 7l6-6v4h10V1l6 6-6 6V9H7v4z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>'

function makeCursor(): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML = CURSOR_SVG
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '24px',
    height: '14px',
    marginLeft: '-12px',
    marginTop: '-7px',
    pointerEvents: 'none',
    zIndex: '100000',
    display: 'none',
  })
  document.body.appendChild(el)
  return el
}

/** A focused field is being typed in — there the mouse selects text instead. */
function canScrub({ disabled, inputRef }: ScrubOptions, el: HTMLElement): boolean {
  return !disabled && !(el === inputRef.current && document.activeElement === el)
}

/** Returns the handlers that make an element a scrub handle for `options.value`. */
export function useScrub(options: ScrubOptions): ScrubHandlers {
  const ref = useRef(options)
  ref.current = options

  // Stops the press from focusing the input or starting a text selection; the
  // release decides (focus on a click, nothing after a drag).
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button === 0 && canScrub(ref.current, e.currentTarget)) e.preventDefault()
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !canScrub(ref.current, e.currentTarget)) return
    e.preventDefault()
    const handle = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX
    const start = ref.current.value ?? 0
    let current = start
    let emitted = start
    let scrubbing = false
    let ending = false
    let cursor: HTMLDivElement | null = null
    let vx = e.clientX
    let vy = e.clientY
    const prevCursor = document.documentElement.style.cursor

    try {
      handle.setPointerCapture(pointerId)
    } catch {
      // the pointer is already gone
    }

    const clamp = (n: number) => {
      const { min, max } = ref.current
      return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    }
    const emit = (n: number) => {
      if (n === emitted) return
      emitted = n
      ref.current.onChange(n)
    }
    const showCursor = () => {
      if (!cursor) return
      const locked = document.pointerLockElement === handle
      cursor.style.display = locked ? 'block' : 'none'
      cursor.style.transform = `translate(${vx}px, ${vy}px)`
    }

    const begin = () => {
      scrubbing = true
      cursor = makeCursor()
      document.documentElement.style.cursor = 'ew-resize'
      try {
        // Newer Chromium returns a promise that rejects when the lock is
        // refused; older returns nothing. Either way the drag still works.
        const p = handle.requestPointerLock() as unknown as Promise<void> | undefined
        p?.catch?.(() => {})
      } catch {
        // no pointer lock — a plain captured drag
      }
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      let dx: number
      if (!scrubbing) {
        if (Math.abs(ev.clientX - startX) < THRESHOLD_PX) return
        begin()
        dx = ev.clientX - startX
        vx = ev.clientX
        vy = ev.clientY
      } else {
        dx = ev.movementX
        vx += ev.movementX
        vy = Math.min(window.innerHeight - 1, Math.max(0, vy + ev.movementY))
        // Off one side, back in from the other — the drag keeps going.
        const w = window.innerWidth
        if (vx >= w) vx -= w
        else if (vx < 0) vx += w
      }
      const base = ref.current.step ?? 1
      const perPx = ev.shiftKey ? base * 10 : ev.altKey ? base / 10 : base
      current = clamp(current + dx * perPx)
      const places = decimalsOf(Math.min(base, perPx))
      emit(Number(current.toFixed(places)))
      showCursor()
    }

    const end = (cancel: boolean) => {
      if (ending) return
      ending = true
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerlockchange', onLockChange)
      try {
        handle.releasePointerCapture(pointerId)
      } catch {
        // already released
      }
      if (cancel) emit(start)
      if (scrubbing) {
        if (document.pointerLockElement === handle) document.exitPointerLock()
        cursor?.remove()
        document.documentElement.style.cursor = prevCursor
      }
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const wasClick = !scrubbing
      end(false)
      if (wasClick) {
        const input = ref.current.inputRef.current
        input?.focus()
        input?.select()
      }
    }
    const onCancel = () => end(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !scrubbing) return
      ev.preventDefault()
      ev.stopPropagation()
      end(true)
    }
    // Esc while locked is taken by the browser to release the lock, and never
    // reaches onKey — losing the lock mid-drag is that same "put it back".
    let wasLocked = false
    const onLockChange = () => {
      const locked = document.pointerLockElement === handle
      if (wasLocked && !locked && scrubbing && !ending) end(true)
      wasLocked = locked
      showCursor()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerlockchange', onLockChange)
  }, [])

  return { onPointerDown, onMouseDown }
}
