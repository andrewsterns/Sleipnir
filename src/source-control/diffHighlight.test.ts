import { describe, it, expect } from 'vitest'
import { collapsedByDefault, diffPath, highlightLines } from './diffHighlight'

const colorOf = (tokens: { text: string; style?: { color?: string } }[], text: string) => tokens.find((t) => t.text === text)?.style?.color

describe('diff syntax colors', () => {
  it('colors code by the file’s grammar, with the editor’s palette', async () => {
    const [line] = await highlightLines('src/cart.ts', ['const total = 42 // sum'])
    expect(line.map((t) => t.text).join('')).toBe('const total = 42 // sum')
    expect(colorOf(line, 'const')).toContain('--code-keyword')
    expect(colorOf(line, '42')).toContain('--code-number')
    expect(colorOf(line, '// sum')).toContain('--text-3')
  })

  it('parses a hunk side as one run, so a comment spanning lines stays a comment', async () => {
    const lines = await highlightLines('src/sensor.c', ['/* calibrate', '   twice */', 'int x = 1;'])
    expect(colorOf(lines[1], '   twice */')).toContain('--text-3')
    expect(colorOf(lines[2], 'int')).toBeDefined()
  })

  it('reads Rust, Java and Kotlin too, and leaves unknown files plain', async () => {
    expect(colorOf((await highlightLines('src/main.rs', ['fn main() {}']))[0], 'fn')).toContain('--code-keyword')
    expect(colorOf((await highlightLines('App.java', ['public class App {}']))[0], 'public')).toBeDefined()
    expect(colorOf((await highlightLines('Cart.kt', ['class Cart']))[0], 'class')).toBeDefined()
    expect(await highlightLines('notes.txt', ['plain'])).toEqual([[{ text: 'plain' }]])
  })
})

describe('diff metadata', () => {
  it('reads the file path from the diff headers', () => {
    expect(diffPath('diff --git a/src/a.ts b/src/a.ts\nindex 1..2\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b')).toBe('src/a.ts')
    expect(diffPath('')).toBeNull()
  })

  it('folds lockfiles and build output by default', () => {
    expect(collapsedByDefault('Cargo.lock')).toBe(true)
    expect(collapsedByDefault('web/package-lock.json')).toBe(true)
    expect(collapsedByDefault('build/out.o')).toBe(true)
    expect(collapsedByDefault('src/build.rs')).toBe(false)
    expect(collapsedByDefault(null)).toBe(false)
  })
})
