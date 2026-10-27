import { describe, it, expect } from 'vitest'
import { colorWithAlpha, effectsCss, paintCss, paintOverlays } from './paint'
import { toCss } from './toCss'
import type { Fill } from './types'

const noImages = () => undefined
const images = (src: string) => `blob:${src}`

describe('colorWithAlpha', () => {
  it('turns a hex literal into rgba, and leaves an opaque one alone', () => {
    expect(colorWithAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(colorWithAlpha('#f00', 0.25)).toBe('rgba(255, 0, 0, 0.25)')
    expect(colorWithAlpha('#ff0000', 1)).toBe('#ff0000')
  })

  it('multiplies with alpha already in an 8-digit hex', () => {
    expect(colorWithAlpha('#00000080', 0.5)).toBe('rgba(0, 0, 0, 0.251)')
  })

  // A faded token must still follow the theme, not freeze today's value.
  it('mixes a token with transparent rather than resolving it', () => {
    expect(colorWithAlpha('bg-2', 0.4)).toBe('color-mix(in srgb, var(--bg-2) 40%, transparent)')
    expect(colorWithAlpha('bg-2', 1)).toBe('var(--bg-2)')
  })
})

describe('paintCss', () => {
  it('keeps a single solid fill the plain background it always was', () => {
    expect(paintCss([{ color: 'bg-2' }], noImages)).toEqual({ background: 'var(--bg-2)' })
  })

  // Fill opacity used to become `opacity`, fading the children with the paint.
  it('bakes a solid fill\'s opacity into its color, never into the layer', () => {
    const css = toCss({ fills: [{ color: '#000000', opacity: 0.5 }] })
    expect(css.background).toBe('rgba(0, 0, 0, 0.5)')
    expect(css.opacity).toBeUndefined()
  })

  it('draws a linear gradient with its angle and stops in order', () => {
    const fill: Fill = { type: 'linear', angle: 90, stops: [{ position: 1, color: '#0000ff' }, { position: 0, color: '#ff0000' }] }
    expect(paintCss([fill], noImages).background).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)')
  })

  it('draws a radial gradient as an ellipse at its center', () => {
    const fill: Fill = {
      type: 'radial',
      center: { x: 0.25, y: 0.5 },
      stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000', opacity: 0 }],
    }
    expect(paintCss([fill], noImages).background).toBe(
      'radial-gradient(ellipse 50% 50% at 25% 50%, #ffffff 0%, rgba(0, 0, 0, 0) 100%)',
    )
  })

  it('draws an angular gradient as a conic sweep', () => {
    const fill: Fill = { type: 'angular', angle: 45, stops: [{ position: 0, color: '#ff0000' }, { position: 1, color: '#00ff00' }] }
    expect(paintCss([fill], noImages).background).toBe('conic-gradient(from 45deg at 50% 50%, #ff0000 0%, #00ff00 100%)')
  })

  it('applies the paint\'s opacity to every stop', () => {
    const fill: Fill = { type: 'linear', angle: 180, opacity: 0.5, stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#000000', opacity: 0.5 }] }
    expect(paintCss([fill], noImages).background).toBe(
      'linear-gradient(180deg, rgba(255, 255, 255, 0.5) 0%, rgba(0, 0, 0, 0.25) 100%)',
    )
  })

  it('stacks fills top-first, as CSS wants, from the model\'s bottom-first list', () => {
    const bottom: Fill = { color: '#ff0000' }
    const top: Fill = { type: 'linear', angle: 0, stops: [{ position: 0, color: '#000000' }, { position: 1, color: '#ffffff' }] }
    expect(paintCss([bottom, top], noImages).background).toBe(
      'linear-gradient(0deg, #000000 0%, #ffffff 100%), linear-gradient(#ff0000, #ff0000)',
    )
  })

  it('skips hidden paints, as the eye toggle means', () => {
    expect(paintCss([{ color: '#ff0000', visible: false }], noImages)).toEqual({})
  })

  it('maps each image scale mode onto background sizing', () => {
    const bg = (scaleMode: 'fill' | 'fit' | 'stretch' | 'tile') =>
      paintCss([{ type: 'image', src: 'https://x.test/a.png', scaleMode }], noImages).background
    expect(bg('fill')).toBe('url("https://x.test/a.png") center / cover no-repeat')
    expect(bg('fit')).toBe('url("https://x.test/a.png") center / contain no-repeat')
    expect(bg('stretch')).toBe('url("https://x.test/a.png") 0 0 / 100% 100% no-repeat')
    expect(bg('tile')).toBe('url("https://x.test/a.png") 0 0 / auto repeat')
  })

  it('loads workspace images through the resolver, and skips them until it can', () => {
    const fill: Fill = { type: 'image', src: '.components/assets/hero.png' }
    expect(paintCss([fill], images).background).toBe('url("blob:.components/assets/hero.png") center / cover no-repeat')
    expect(paintCss([fill], noImages)).toEqual({})
  })
})

describe('paintOverlays', () => {
  // An image has no color to fade, so a translucent one is drawn as layers.
  it('splits a stack with a translucent image into ordered layers behind the children', () => {
    const fills: Fill[] = [{ color: '#ff0000' }, { type: 'image', src: 'https://x.test/a.png', opacity: 0.5 }]
    expect(paintCss(fills, noImages)).toEqual({ position: 'relative', isolation: 'isolate' })
    const layers = paintOverlays(fills, noImages)
    expect(layers).toHaveLength(2)
    expect(layers[0]).toMatchObject({ position: 'absolute', inset: 0, zIndex: -1, background: 'linear-gradient(#ff0000, #ff0000)' })
    expect(layers[0].opacity).toBeUndefined()
    expect(layers[1]).toMatchObject({ opacity: 0.5, borderRadius: 'inherit', pointerEvents: 'none' })
  })

  it('is empty for every stack one background can express', () => {
    expect(paintOverlays([{ color: '#ff0000', opacity: 0.2 }, { type: 'image', src: 'https://x.test/a.png' }], noImages)).toEqual([])
  })
})

describe('effectsCss', () => {
  it('writes drop and inner shadows as one box-shadow list', () => {
    const css = effectsCss({
      effects: [
        { type: 'drop-shadow', x: 0, y: 4, blur: 12, color: '#000000', opacity: 0.25 },
        { type: 'inner-shadow', x: 0, y: 1, blur: 0, spread: 1, color: '#ffffff', opacity: 0.1 },
      ],
    })
    expect(css.boxShadow).toBe('0px 4px 12px 0px rgba(0, 0, 0, 0.25), inset 0px 1px 0px 1px rgba(255, 255, 255, 0.1)')
  })

  it('blurs the layer and the backdrop separately', () => {
    const css = effectsCss({ effects: [{ type: 'layer-blur', radius: 4 }, { type: 'background-blur', radius: 20 }] })
    expect(css.filter).toBe('blur(4px)')
    expect(css.backdropFilter).toBe('blur(20px)')
    expect(css.WebkitBackdropFilter).toBe('blur(20px)')
  })

  it('follows the glyphs on text, and drops the inner shadow CSS cannot draw there', () => {
    const css = effectsCss(
      {
        effects: [
          { type: 'drop-shadow', x: 1, y: 2, blur: 3, spread: 9, color: '#000000' },
          { type: 'inner-shadow', x: 0, y: 1, blur: 0, color: '#ffffff' },
        ],
      },
      { text: true },
    )
    expect(css.textShadow).toBe('1px 2px 3px #000000')
    expect(css.boxShadow).toBeUndefined()
  })

  it('reads a board\'s legacy single shadow as a drop shadow', () => {
    expect(effectsCss({ shadow: { x: 0, y: 2, blur: 8, color: 'bg-0' } }).boxShadow).toBe('0px 2px 8px 0px var(--bg-0)')
  })

  it('skips hidden effects', () => {
    expect(effectsCss({ effects: [{ type: 'layer-blur', radius: 4, visible: false }] })).toEqual({})
  })
})
