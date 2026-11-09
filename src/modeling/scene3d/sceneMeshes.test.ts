import { describe, it, expect } from 'vitest'
import { createFrameNode } from '../../document/doc'
import { surfaceOf } from './sceneMeshes'

describe('what a layer is drawn in, in 3D', () => {
  it('draws a solid frame still in its default fill as clay, and keeps a chosen colour', () => {
    const frame = createFrameNode({ x: 0, y: 0, w: 100, h: 100 })
    // Flat, a UI frame looks as designed; as a part, the panel colour would read as a black hole.
    expect(surfaceOf(frame)?.css).toContain('bg-2')
    expect(surfaceOf(frame, true)?.css).toBe('#b9bcc4')
    const painted = { ...frame, style: { ...frame.style, fills: [{ color: '#ff0000' }] } }
    expect(surfaceOf(painted, true)?.css).toBe('#ff0000')
  })
})
