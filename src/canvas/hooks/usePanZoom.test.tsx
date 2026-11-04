// The camera has two representations that must never disagree: the CSS
// transform written to the viewport, and the Camera the screen-space chrome is
// drawn with. When they drift, the frame paints in one place and its selection
// ring in another — with an identical size and a pure offset, which is the
// signature of a camera mismatch rather than a geometry bug.

import { describe, it, expect } from 'vitest'
import { StrictMode, useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { usePanZoom } from './usePanZoom'
import type { Camera } from './panZoomMath'

const RESTORED: Camera = { x: -140, y: 60, k: 2 }

/**
 * Mirrors CanvasView: the board (and so the viewport element usePanZoom writes
 * to) is behind a `loading` gate, so it mounts AFTER the hook does — and after
 * a restored camera has already been pushed in.
 */
function Harness({ show, camera }: { show: boolean; camera: Camera }) {
  const panZoom = usePanZoom()
  useEffect(() => {
    panZoom.setCamera(camera)
    // Once, exactly as openDoc does when it restores a board's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!show) return null
  return (
    <div ref={panZoom.containerRef} data-testid="container">
      <div ref={panZoom.viewportRef} data-testid="viewport" />
    </div>
  )
}

function viewportTransform(): string {
  const el = document.querySelector('[data-testid="viewport"]') as HTMLElement | null
  return el?.style.transform ?? '(no viewport)'
}

describe('usePanZoom camera application', () => {
  it('applies the camera to a viewport that mounts after the hook did', () => {
    // The board is gated behind `loading`, so on the first commit there is no
    // viewport for setCamera to write to.
    const view = render(<Harness show={false} camera={RESTORED} />)
    view.rerender(<Harness show camera={RESTORED} />)

    // Without re-applying on attach, the fresh element keeps NO transform while
    // the chrome is drawn at the restored camera — the board renders at 1:1 and
    // every ring is offset by the camera. Same size, pure translation.
    expect(viewportTransform()).toBe('translate(-140px, 60px) scale(2)')
  })

  it('re-applies when the viewport element is replaced, as a remount does', () => {
    const view = render(<Harness show camera={RESTORED} />)
    expect(viewportTransform()).toBe('translate(-140px, 60px) scale(2)')

    // Unmount the board and bring it back: a hot reload or a board switch hands
    // the hook a brand new element that has never seen a transform.
    view.rerender(<Harness show={false} camera={RESTORED} />)
    view.rerender(<Harness show camera={RESTORED} />)
    expect(viewportTransform()).toBe('translate(-140px, 60px) scale(2)')
  })

  it('keeps an identity camera identity, so the common case is untouched', () => {
    render(<Harness show camera={{ x: 0, y: 0, k: 1 }} />)
    expect(viewportTransform()).toBe('translate(0px, 0px) scale(1)')
  })
})

/**
 * The chrome is drawn from a React mirror of the camera, published through a
 * frame-throttled `notify`. If that stream ever stops, the board keeps moving
 * and every ring stays behind — permanently, and with no way for the user to
 * shake it loose.
 */
describe('the camera mirror the chrome is drawn from', () => {
  function Subscriber({ onCamera }: { onCamera: (c: Camera) => void }) {
    const panZoom = usePanZoom({ onCameraChange: onCamera })
    return (
      <div ref={panZoom.containerRef} data-testid="container">
        <div ref={panZoom.viewportRef} data-testid="viewport" />
      </div>
    )
  }

  /** Lets the throttled publish land. */
  async function frames() {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
  }

  it('keeps publishing after an effect cleanup runs, not just after unmount', async () => {
    const seen: Camera[] = []
    // StrictMode mounts, cleans up, and mounts again — the same sequence a hot
    // reload produces, and the one that used to leave a cancelled frame handle
    // in place and jam the publish gate shut for the rest of the session.
    render(
      <StrictMode>
        <Subscriber onCamera={(c) => seen.push(c)} />
      </StrictMode>,
    )
    await frames()
    seen.length = 0

    const container = document.querySelector('[data-testid="container"]')!
    await act(async () => {
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaX: 0, deltaY: -120, bubbles: true, cancelable: true }),
      )
    })
    await frames()

    // A pan or zoom after that cleanup still has to reach the chrome.
    expect(seen.length).toBeGreaterThan(0)
  })
})
