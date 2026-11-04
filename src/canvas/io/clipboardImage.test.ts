import { describe, it, expect } from 'vitest'
import { fileFromBase64, imageFileFromClipboard, svgMarkupFrom, svgSize } from './clipboardImage'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80"/></svg>'

// The bits of DataTransfer imageFileFromClipboard reads.
function clipboard({ files = [] as File[], itemFiles = [] as File[], data = {} as Record<string, string> } = {}) {
  return {
    files,
    items: itemFiles.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer
}

describe('imageFileFromClipboard', () => {
  it('takes a pasted PNG, JPEG or SVG file', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/svg+xml']) {
      const file = new File(['x'], 'a', { type })
      expect(imageFileFromClipboard(clipboard({ files: [file] }))).toBe(file)
    }
  })

  it('finds a file that only shows up in items (a file copied in Explorer)', () => {
    const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    expect(imageFileFromClipboard(clipboard({ itemFiles: [jpeg] }))).toBe(jpeg)
  })

  it('turns copied SVG markup into an SVG file', async () => {
    const file = imageFileFromClipboard(clipboard({ data: { 'text/plain': `<?xml version="1.0"?>\n${SVG}\n` } }))!
    expect(file.type).toBe('image/svg+xml')
    // jsdom's File has no .text(); FileReader reads it the same way.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(file)
    })
    expect(text).toBe(`<?xml version="1.0"?>\n${SVG}`)
  })

  it('pulls an inline data: image out of copied HTML', () => {
    const html = '<meta charset="utf-8"><img src="data:image/jpeg;base64,/9j/4AAQ" alt="">'
    const file = imageFileFromClipboard(clipboard({ data: { 'text/html': html } }))!
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('image.jpg')
  })

  it('skips SVG code and HTML when asked for files only', () => {
    const png = new File(['x'], 'a.png', { type: 'image/png' })
    expect(imageFileFromClipboard(clipboard({ data: { 'text/plain': SVG } }), { markup: false })).toBeNull()
    expect(imageFileFromClipboard(clipboard({ files: [png] }), { markup: false })).toBe(png)
  })

  it('ignores plain text and unsupported files', () => {
    expect(imageFileFromClipboard(clipboard({ data: { 'text/plain': 'hello <svg> world' } }))).toBeNull()
    expect(imageFileFromClipboard(clipboard({ files: [new File(['x'], 'a.tiff', { type: 'image/tiff' })] }))).toBeNull()
  })
})

describe('svgMarkupFrom', () => {
  it('accepts an SVG document only', () => {
    expect(svgMarkupFrom(`  ${SVG}  `)).toBe(SVG)
    expect(svgMarkupFrom('<div>' + SVG + '</div>')).toBeNull()
  })
})

describe('svgSize', () => {
  it('reads width/height, then the viewBox', () => {
    expect(svgSize(SVG)).toEqual({ w: 120, h: 80 })
    expect(svgSize('<svg viewBox="0 0 24 16"></svg>')).toEqual({ w: 24, h: 16 })
    expect(svgSize('<svg width="100%" height="100%" viewBox="0 0 50 30"></svg>')).toEqual({ w: 50, h: 30 })
    expect(svgSize('<svg></svg>')).toBeNull()
  })
})

describe('fileFromBase64', () => {
  it('rebuilds the native clipboard read as a File', () => {
    const file = fileFromBase64(btoa('abc'), 'photo.jpg', 'image/jpeg')!
    expect(file.name).toBe('photo.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(file.size).toBe(3)
  })
})
