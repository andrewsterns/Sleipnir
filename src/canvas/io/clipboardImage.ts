// Turning whatever an image paste put on the clipboard into a File the canvas
// can import (CanvasView.ViewModel's pasteImage). Sources differ wildly:
//   - a screenshot / "Copy image" in a browser → an image/png file
//   - a file copied in Explorer/Finder → a file, but often only in `items`
//     rather than `files`, and sometimes not exposed to the page at all (the
//     Electron fallback, electron/main.cjs's readClipboardImage, covers that)
//   - an SVG copied from Figma, an editor or a web page → its markup as text
//   - an image copied from some web pages → only HTML with <img src="data:…">

/** The image types a paste may bring onto the board. */
export const PASTEABLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif', 'image/webp']

const isPasteableImage = (type: string) => PASTEABLE_IMAGE_TYPES.includes(type.toLowerCase())

/** SVG markup, if `text` is (only) an SVG document — an XML prolog or comments before it are fine. */
export function svgMarkupFrom(text: string): string | null {
  const trimmed = text.trim()
  if (!/^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) return null
  if (!/<\/svg>\s*$/i.test(trimmed)) return null
  return trimmed
}

function dataUrlToFile(dataUrl: string, name: string): File | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match || !isPasteableImage(match[1])) return null
  const [, type, isBase64, payload] = match
  let bytes: Uint8Array
  if (isBase64) {
    const binary = atob(payload)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload))
  }
  return new File([bytes], name, { type })
}

const extFor = (type: string) => (type === 'image/svg+xml' ? 'svg' : type === 'image/jpeg' ? 'jpg' : type.split('/')[1])

/**
 * The first pasteable image on the clipboard, or null. Order matters: a real
 * file beats markup, since a browser "Copy image" also puts HTML alongside.
 * `markup: false` takes real image files only — for when a text field has
 * focus, where pasted SVG code or HTML is meant as text.
 */
export function imageFileFromClipboard(data: DataTransfer, { markup = true } = {}): File | null {
  const file = [...data.files].find((f) => isPasteableImage(f.type))
  if (file) return file
  for (const item of [...data.items]) {
    if (item.kind === 'file' && isPasteableImage(item.type)) {
      const f = item.getAsFile()
      if (f) return f
    }
  }
  if (!markup) return null
  const svg = svgMarkupFrom(data.getData('text/plain')) ?? svgMarkupFrom(data.getData('image/svg+xml'))
  if (svg) return new File([svg], 'image.svg', { type: 'image/svg+xml' })
  const html = data.getData('text/html')
  if (html) {
    const inlineSvg = /<svg[\s>][\s\S]*?<\/svg>/i.exec(html)?.[0]
    const src = /<img[^>]+src\s*=\s*["'](data:[^"']+)["']/i.exec(html)?.[1]
    if (src) {
      const fromData = dataUrlToFile(src, 'image')
      if (fromData) return new File([fromData], `image.${extFor(fromData.type)}`, { type: fromData.type })
    }
    if (inlineSvg && svgMarkupFrom(inlineSvg)) {
      const markup = /xmlns=/.test(inlineSvg) ? inlineSvg : inlineSvg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
      return new File([markup], 'image.svg', { type: 'image/svg+xml' })
    }
  }
  return null
}

/** A File from the Electron fallback's { name, mime, base64 }. */
export function fileFromBase64(base64: string, name: string, type: string): File | null {
  if (!isPasteableImage(type)) return null
  return dataUrlToFile(`data:${type};base64,${base64}`, name)
}

/**
 * An SVG's intended size from its width/height (unitless or px) or else its
 * viewBox — browsers can't createImageBitmap() an SVG file to measure it.
 */
export function svgSize(markup: string): { w: number; h: number } | null {
  const tag = /<svg[^>]*>/i.exec(markup)?.[0]
  if (!tag) return null
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1]
  const px = (v?: string) => (v && /^\s*[\d.]+\s*(px)?\s*$/i.test(v) ? parseFloat(v) : NaN)
  const w = px(attr('width'))
  const h = px(attr('height'))
  if (w > 0 && h > 0) return { w, h }
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] }
  return null
}
