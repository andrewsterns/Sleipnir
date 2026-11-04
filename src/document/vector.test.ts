import { describe, it, expect } from 'vitest'
import { createVectorNode } from './doc'
import { cornerRadii, paintedShape, pathData, pointsBounds, polygonPoints, rectanglePoints, vectorEffectsCss, vectorShape, vectorSvg } from './vector'

const box = { x: 0, y: 0, w: 100, h: 50 }
const noImages = () => undefined

describe('vector geometry', () => {
  it('stretches a triangle to its box: apex top center, base along the bottom', () => {
    expect(polygonPoints(3, box)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ])
  })

  it('draws a rectangle as a rect, rounding its corners from radius but never past half a side', () => {
    const rect = createVectorNode({ ...box }, 'rectangle')
    expect(vectorShape(rect, box)).toEqual({ tag: 'rect', attrs: { x: 0, y: 0, width: 100, height: 50 } })
    expect(vectorShape({ ...rect, style: { radius: 80 } }, box).attrs.rx).toBe(25)
  })

  it('draws an ellipse filling its box', () => {
    expect(vectorShape(createVectorNode({ ...box }, 'ellipse'), box)).toEqual({ tag: 'ellipse', attrs: { cx: 50, cy: 25, rx: 50, ry: 25 } })
  })

  it('writes straight segments between sharp anchors and curves wherever a handle exists', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0, in: { x: 5, y: -5 } }, { x: 10, y: 10 }]
    expect(pathData(points, false, { x: 0, y: 0, w: 10, h: 10 }, { w: 10, h: 10 })).toBe('M 0 0 C 0 0 5 -5 10 0 L 10 10')
    expect(pathData(points, true, { x: 0, y: 0, w: 10, h: 10 }, { w: 10, h: 10 })).toBe('M 0 0 C 0 0 5 -5 10 0 L 10 10 Z')
  })

  // A resized path scales, the same way a resized shape does.
  it('scales a path from the space it was drawn in to its current box', () => {
    expect(pathData([{ x: 0, y: 0 }, { x: 10, y: 10 }], false, { x: 5, y: 5, w: 20, h: 40 }, { w: 10, h: 10 })).toBe('M 5 5 L 25 45')
  })

  it('bounds anchors and their handles together', () => {
    expect(pointsBounds([{ x: 0, y: 0, out: { x: -4, y: 2 } }, { x: 10, y: 6 }])).toEqual({ x: -4, y: 0, w: 14, h: 6 })
  })
})

describe('vector paint', () => {
  const rect = vectorShape(createVectorNode({ ...box }, 'rectangle'), box)

  it('paints each fill as its own copy of the shape, then the stroke on top', () => {
    const { els } = paintedShape(rect, { fills: [{ color: '#ff0000' }, { color: '#00ff00', opacity: 0.5 }], stroke: { color: '#000000', width: 2 } }, box, 'n', noImages)
    expect(els.map((e) => e.attrs.fill)).toEqual(['#ff0000', '#00ff00', 'none'])
    expect(els[1].attrs.fillOpacity).toBe(0.5)
    expect(els[2].attrs).toMatchObject({ stroke: '#000000', strokeWidth: 2 })
  })

  // Presentation attributes don't resolve CSS variables.
  it('puts a token color in style, where var() works', () => {
    const { els } = paintedShape(rect, { fills: [{ color: 'bg-2' }] }, box, 'n', noImages)
    expect(els[0].attrs.fill).toBeUndefined()
    expect(els[0].style).toEqual({ fill: 'var(--bg-2)' })
  })

  it('turns a linear gradient into a linearGradient along the CSS angle', () => {
    const { defs, els } = paintedShape(rect, { fills: [{ type: 'linear', angle: 90, stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff', opacity: 0.5 }] }] }, box, 'n', noImages)
    expect(els[0].attrs.fill).toBe('url(#n-fill-0)')
    expect(defs[0]).toMatchObject({ tag: 'linearGradient', attrs: { id: 'n-fill-0', x1: 0, y1: 0.5, x2: 1, y2: 0.5 } })
    expect(defs[0].children?.map((s) => s.attrs)).toEqual([
      { offset: '0%', stopColor: '#ff0000' },
      { offset: '100%', stopColor: '#0000ff', stopOpacity: 0.5 },
    ])
  })

  it('stretches an oval radial gradient with a transform', () => {
    const { defs } = paintedShape(rect, { fills: [{ type: 'radial', radius: { x: 0.5, y: 0.25 }, stops: [{ position: 0, color: '#fff' }, { position: 1, color: '#000' }] }] }, box, 'n', noImages)
    expect(defs[0].attrs.gradientTransform).toBe('translate(0.5 0.5) scale(0.5 0.25) translate(-0.5 -0.5)')
  })

  it('degrades an angular gradient, which SVG cannot draw, to its first stop', () => {
    const { defs, els } = paintedShape(rect, { fills: [{ type: 'angular', stops: [{ position: 1, color: '#0000ff' }, { position: 0, color: '#ff0000' }] }] }, box, 'n', noImages)
    expect(defs).toEqual([])
    expect(els[0].attrs.fill).toBe('#ff0000')
  })

  it('fills with an image through a pattern sized to the shape', () => {
    const { defs, els } = paintedShape(rect, { fills: [{ type: 'image', src: 'https://x.test/a.png', scaleMode: 'fit' }] }, box, 'n', noImages)
    expect(els[0].attrs.fill).toBe('url(#n-fill-0)')
    expect(defs[0].children?.[0].attrs).toEqual({ href: 'https://x.test/a.png', width: 100, height: 50, preserveAspectRatio: 'xMidYMid meet' })
  })

  it('keeps an unpainted shape present, so it can still be selected', () => {
    expect(paintedShape(rect, {}, box, 'n', noImages).els).toEqual([{ tag: 'rect', attrs: { ...rect.attrs, fill: 'none' } }])
  })
})

describe('vector effects', () => {
  it('shadows the shape itself with drop-shadow, and blurs it with blur', () => {
    const css = vectorEffectsCss({
      effects: [
        { type: 'drop-shadow', x: 0, y: 4, blur: 8, color: '#000000', opacity: 0.25 },
        { type: 'layer-blur', radius: 2 },
        { type: 'inner-shadow', x: 0, y: 1, blur: 0, color: '#ffffff' },
      ],
      opacity: 0.8,
    })
    expect(css).toEqual({ filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.25)) blur(2px)', opacity: 0.8 })
  })

  it('draws a vector as its own svg sized to its box, letting its stroke overflow', () => {
    const svg = vectorSvg(createVectorNode({ x: 10, y: 20, w: 40, h: 30 }, 'ellipse'), 'v', noImages, { position: 'absolute' })
    expect(svg).toMatchObject({ tag: 'svg', attrs: { width: 40, height: 30, viewBox: '0 0 40 30' }, style: { position: 'absolute', overflow: 'visible' } })
  })
})

describe('rounded corners', () => {
  const square = { x: 0, y: 0, w: 100, h: 100 }
  const view = { w: 100, h: 100 }

  it('rounds a sharp anchor between straight lines into an arc tangent to both', () => {
    const d = pathData([{ x: 0, y: 0 }, { x: 100, y: 0, radius: 10 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true, square, view)
    expect(d).toBe('M 0 0 L 90 0 A 10 10 0 0 1 100 10 L 100 100 L 0 100 Z')
  })

  it('rounds the starting anchor too, closing through its arc', () => {
    const d = pathData([{ x: 0, y: 0, radius: 10 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true, square, view)
    expect(d).toBe('M 10 0 L 100 0 L 100 100 L 0 100 L 0 10 A 10 10 0 0 1 10 0 Z')
  })

  it('shrinks a radius too big for its sides to half the shorter one, as border-radius does', () => {
    const d = pathData([{ x: 0, y: 0 }, { x: 100, y: 0, radius: 80 }, { x: 100, y: 100 }], false, square, view)
    expect(d).toBe('M 0 0 L 50 0 A 50 50 0 0 1 100 50 L 100 100')
  })

  it('leaves alone a radius on an open end, or next to a curve', () => {
    expect(pathData([{ x: 0, y: 0, radius: 10 }, { x: 100, y: 0 }], false, square, view)).toBe('M 0 0 L 100 0')
    const curved = pathData([{ x: 0, y: 0, out: { x: 50, y: -40 } }, { x: 100, y: 0, radius: 10 }, { x: 100, y: 100 }], false, square, view)
    expect(curved).not.toContain('A ')
  })

  it("reads a rectangle's corners from a uniform radius or one per corner", () => {
    expect(cornerRadii({})).toEqual([0, 0, 0, 0])
    expect(cornerRadii({ radius: 6 })).toEqual([6, 6, 6, 6])
    expect(cornerRadii({ radius: { tl: 4, br: 8 } })).toEqual([4, 0, 8, 0])
    expect(rectanglePoints({ radius: { tl: 4, br: 8 } }, 40, 20)).toEqual([
      { x: 0, y: 0, radius: 4 },
      { x: 40, y: 0 },
      { x: 40, y: 20, radius: 8 },
      { x: 0, y: 20 },
    ])
  })

  it('draws a rectangle with differing corners as a path, and equal ones as a rect', () => {
    const rect = createVectorNode({ ...box }, 'rectangle')
    expect(vectorShape({ ...rect, style: { radius: { tl: 5, tr: 5, br: 5, bl: 5 } } }, box)).toMatchObject({ tag: 'rect', attrs: { rx: 5 } })
    const mixed = vectorShape({ ...rect, style: { radius: { tl: 10, tr: 0, br: 0, bl: 0 } } }, box)
    expect(mixed.tag).toBe('path')
    expect(mixed.attrs.d).toBe('M 10 0 L 100 0 L 100 50 L 0 50 L 0 10 A 10 10 0 0 1 10 0 Z')
  })
})
