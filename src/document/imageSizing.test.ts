import { describe, it, expect } from 'vitest'
import { createFrameNode, createTextNode } from './doc'
import { imageFillOf, isImageLayer, keepsProportions, rectAtImageRatio, rectAtScale, scalePercent } from './imageSizing'
import type { CanvasFrameNode } from './types'

function image(): CanvasFrameNode {
  const f = createFrameNode({ x: 0, y: 0, w: 200, h: 100 }, 'Photo')
  return { ...f, style: { fills: [{ type: 'image', src: '.components/assets/photo.jpg', natural: { w: 400, h: 200 } }] } }
}

describe('image layers', () => {
  it('recognises an empty frame showing a picture, not a container with an image background', () => {
    expect(isImageLayer(image())).toBe(true)
    const container = { ...image(), children: [createTextNode({ x: 0, y: 0, w: 10, h: 10 })] }
    expect(isImageLayer(container)).toBe(false)
    expect(isImageLayer(createFrameNode({ x: 0, y: 0, w: 10, h: 10 }))).toBe(false)
  })

  it('ignores a hidden image fill', () => {
    const hidden = image()
    hidden.style.fills = [{ type: 'image', src: 'a.png', visible: false }]
    expect(imageFillOf(hidden)).toBeNull()
  })

  it('keeps proportions by default for images, and only with Shift for everything else', () => {
    expect(keepsProportions(image(), false)).toBe(true)
    expect(keepsProportions(image(), true)).toBe(false)
    expect(keepsProportions(createFrameNode({ x: 0, y: 0, w: 10, h: 10 }), false)).toBe(false)
    expect(keepsProportions(createFrameNode({ x: 0, y: 0, w: 10, h: 10 }), true)).toBe(true)
  })
})

describe('scaling', () => {
  it('reports scale against the picture’s own size', () => {
    expect(scalePercent(image().rect, { w: 400, h: 200 })).toBe(50)
    expect(scalePercent(image().rect, undefined)).toBeNull()
  })

  it('scales about the center, so a rotated image grows in place', () => {
    expect(rectAtScale({ x: 0, y: 0, w: 200, h: 100 }, { w: 400, h: 200 }, 100)).toEqual({ x: -100, y: -50, w: 400, h: 200 })
  })

  it('reshapes a stretched image back to the picture’s proportions', () => {
    expect(rectAtImageRatio({ x: 0, y: 0, w: 200, h: 300 }, { w: 400, h: 200 })).toEqual({ x: 0, y: 100, w: 200, h: 100 })
  })
})
