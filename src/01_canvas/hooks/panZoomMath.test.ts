import { describe, it, expect } from 'vitest'
import {
  cameraToFit,
  cameraTransform,
  clampScale,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  toBoardPoint,
  toScreenPoint,
  zoomAt,
  type Camera,
} from './panZoomMath'

const IDENTITY: Camera = { x: 0, y: 0, k: 1 }

describe('coordinate conversion', () => {
  it('round-trips board → screen → board at any camera', () => {
    const camera: Camera = { x: -320, y: 47.5, k: 2.35 }
    for (const point of [
      { x: 0, y: 0 },
      { x: 100, y: -250 },
      { x: -1e4, y: 1e4 },
    ]) {
      const screen = toScreenPoint(camera, point.x, point.y)
      const back = toBoardPoint(camera, screen.x, screen.y)
      expect(back.x).toBeCloseTo(point.x, 8)
      expect(back.y).toBeCloseTo(point.y, 8)
    }
  })

  it('is the identity at the identity camera', () => {
    expect(toBoardPoint(IDENTITY, 42, 17)).toEqual({ x: 42, y: 17 })
  })
})

describe('zoomAt', () => {
  it('keeps the board point under the cursor pinned — the whole point of anchored zoom', () => {
    const camera: Camera = { x: 120, y: -60, k: 1.4 }
    const cursor = { px: 512, py: 288 }
    const before = toBoardPoint(camera, cursor.px, cursor.py)

    const zoomed = zoomAt(camera, cursor.px, cursor.py, camera.k * 1.1)
    const after = toBoardPoint(zoomed, cursor.px, cursor.py)

    expect(after.x).toBeCloseTo(before.x, 8)
    expect(after.y).toBeCloseTo(before.y, 8)
  })

  it('stays pinned across a long zoom-in/zoom-out sequence', () => {
    let camera: Camera = { x: 0, y: 0, k: 1 }
    const cursor = { px: 300, py: 200 }
    const anchor = toBoardPoint(camera, cursor.px, cursor.py)

    for (let i = 0; i < 25; i += 1) camera = zoomAt(camera, cursor.px, cursor.py, camera.k * 1.1)
    for (let i = 0; i < 25; i += 1) camera = zoomAt(camera, cursor.px, cursor.py, camera.k * 0.9)

    const after = toBoardPoint(camera, cursor.px, cursor.py)
    expect(after.x).toBeCloseTo(anchor.x, 6)
    expect(after.y).toBeCloseTo(anchor.y, 6)
  })

  it('clamps to the scale bounds without breaking the anchor', () => {
    const cursor = { px: 400, py: 400 }
    const zoomedOut = zoomAt(IDENTITY, cursor.px, cursor.py, 0.0001)
    expect(zoomedOut.k).toBe(MIN_SCALE)

    const zoomedIn = zoomAt(IDENTITY, cursor.px, cursor.py, 9999)
    expect(zoomedIn.k).toBe(MAX_SCALE)

    const anchor = toBoardPoint(IDENTITY, cursor.px, cursor.py)
    for (const cam of [zoomedOut, zoomedIn]) {
      const after = toBoardPoint(cam, cursor.px, cursor.py)
      expect(after.x).toBeCloseTo(anchor.x, 6)
      expect(after.y).toBeCloseTo(anchor.y, 6)
    }
  })
})

describe('clampScale', () => {
  it('bounds the scale on both ends and passes valid values through', () => {
    expect(clampScale(0)).toBe(MIN_SCALE)
    expect(clampScale(1e6)).toBe(MAX_SCALE)
    expect(clampScale(1.5)).toBe(1.5)
  })
})

describe('panBy', () => {
  it('translates in screen px and never touches the scale', () => {
    const camera: Camera = { x: 10, y: 20, k: 2 }
    expect(panBy(camera, 5, -5)).toEqual({ x: 15, y: 15, k: 2 })
  })
})

describe('cameraToFit', () => {
  it('centers the box in the viewport', () => {
    const box = { x: 0, y: 0, w: 400, h: 400 }
    const viewport = { width: 1000, height: 800 }
    const camera = cameraToFit(box, viewport)

    const center = toScreenPoint(camera, box.x + box.w / 2, box.y + box.h / 2)
    expect(center.x).toBeCloseTo(viewport.width / 2, 6)
    expect(center.y).toBeCloseTo(viewport.height / 2, 6)
  })

  it('never zooms past 1:1 — blowing up a tiny box would read as a bug', () => {
    const camera = cameraToFit({ x: 0, y: 0, w: 10, h: 10 }, { width: 1000, height: 1000 })
    expect(camera.k).toBe(1)
  })

  it('scales down to fit a box larger than the viewport, honoring padding', () => {
    const camera = cameraToFit({ x: 0, y: 0, w: 2000, h: 1000 }, { width: 1000, height: 1000 }, 50)
    expect(camera.k).toBeCloseTo((1000 - 100) / 2000, 8)
  })

  it('degrades to the identity camera on an empty box or an unmeasured viewport', () => {
    expect(cameraToFit({ x: 0, y: 0, w: 0, h: 0 }, { width: 100, height: 100 })).toEqual(IDENTITY)
    expect(cameraToFit({ x: 0, y: 0, w: 10, h: 10 }, { width: 0, height: 0 })).toEqual(IDENTITY)
  })
})

describe('cameraTransform', () => {
  it('translates before scaling, matching the board renderer', () => {
    expect(cameraTransform({ x: 12, y: -4, k: 1.5 })).toBe('translate(12px, -4px) scale(1.5)')
  })
})
