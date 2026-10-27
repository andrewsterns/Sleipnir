// Conversions behind the inspector's color picker: the picker edits in HSV
// (a saturation/value square plus a hue strip, as Figma's does) and writes
// hex, the only form a ColorRef stores a literal color in.

export interface Rgba {
  /** 0–255 */
  r: number
  g: number
  b: number
  /** 0–1 */
  a: number
}

export interface Hsv {
  /** 0–360 */
  h: number
  /** 0–1 */
  s: number
  v: number
}

export function rgbToHsv({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Pick<Rgba, 'r' | 'g' | 'b'> {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = v - c
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) }
}

const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** `#rrggbb`, or `#rrggbbaa` when not fully opaque. */
export function toHex({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>, a = 1): string {
  const base = `#${byte(r)}${byte(g)}${byte(b)}`
  return a >= 1 ? base : `${base}${byte(a * 255)}`
}

/** A computed-style color (`rgb(…)`/`rgba(…)`) — how a token's live value comes back from the DOM. */
export function parseCssRgb(value: string): Rgba | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value.trim())
  if (!m) return null
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha }
}
