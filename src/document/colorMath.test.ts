import { describe, expect, it } from 'vitest'
import { hsvToRgb, parseCssRgb, rgbToHsv, toHex } from './colorMath'

describe('colorMath', () => {
  it('round-trips rgb through hsv', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 128, b: 255 },
      { r: 217, g: 217, b: 217 },
      { r: 18, g: 52, b: 86 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb)
    }
  })

  it('reads hue, saturation and value the way the picker draws them', () => {
    expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 1, v: 1 })
    expect(rgbToHsv({ r: 128, g: 128, b: 128 }).s).toBe(0)
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('writes 6-digit hex when opaque and 8-digit when not', () => {
    expect(toHex({ r: 217, g: 217, b: 217 })).toBe('#d9d9d9')
    expect(toHex({ r: 0, g: 0, b: 0 }, 0.5)).toBe('#00000080')
    expect(toHex({ r: 300, g: -4, b: 15.6 })).toBe('#ff0010')
  })

  it('parses computed-style colors', () => {
    expect(parseCssRgb('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 })
    expect(parseCssRgb('rgba(10, 20, 30, 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 })
    expect(parseCssRgb('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseCssRgb('var(--bg-2)')).toBeNull()
  })
})
