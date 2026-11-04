import { describe, it, expect } from 'vitest'
import { buildRegion, extractRegion, hasRegionFor, spliceDeclaration, spliceImports, spliceRegion } from './region'

// A realistic emitted file: human-owned imports, a hook, a handler and a
// trailing helper surrounding the canvas-owned region.
const FILE = `import { Frame } from '../../app/UIKit/Frame/Frame'
import { useCardState } from '../hooks/useCardState'

export interface CardViewProps {
  title: string
}

export const CardView = ({ title }: CardViewProps) => {
  const { expanded, toggle } = useCardState()

  const handleClick = () => {
    toggle()
  }

  // <sleipnir:layout component="cmp_7a3f" hash="k2f9x1">
  return (
    <Frame flow="vertical" gap={8}>
      <Frame h={24}>{title}</Frame>
    </Frame>
  )
  // </sleipnir:layout>
}

export function cardHelper() {
  return 42
}
`

describe('extractRegion', () => {
  it('finds the region and reports its component and hash', () => {
    const region = extractRegion(FILE)!
    expect(region).not.toBeNull()
    expect(region.componentId).toBe('cmp_7a3f')
    expect(region.hash).toBe('k2f9x1')
    expect(region.indent).toBe('  ')
  })

  it('returns the inner content with the region indentation removed', () => {
    const region = extractRegion(FILE)!
    expect(region.inner).toBe(
      ['return (', '  <Frame flow="vertical" gap={8}>', '    <Frame h={24}>{title}</Frame>', '  </Frame>', ')'].join('\n'),
    )
  })

  it('reports offsets that bound exactly the two sentinel lines and their content', () => {
    const region = extractRegion(FILE)!
    const slice = FILE.slice(region.start, region.end)
    expect(slice.startsWith('  // <sleipnir:layout')).toBe(true)
    expect(slice.endsWith('  // </sleipnir:layout>')).toBe(true)
  })

  it('returns null for a file with no region, which is a normal state', () => {
    expect(extractRegion('export const x = 1\n')).toBeNull()
    expect(extractRegion('')).toBeNull()
  })

  it('returns null for a malformed region rather than guessing its bounds', () => {
    // Opening sentinel with no close — splicing here would eat the rest of the file.
    const unclosed = 'const a = 1\n// <sleipnir:layout component="c" hash="h">\nreturn null\n'
    expect(extractRegion(unclosed)).toBeNull()

    // Two openings — we did not create this; refuse.
    const doubled = [
      '// <sleipnir:layout component="a" hash="1">',
      'x',
      '// </sleipnir:layout>',
      '// <sleipnir:layout component="b" hash="2">',
      'y',
      '// </sleipnir:layout>',
    ].join('\n')
    expect(extractRegion(doubled)).toBeNull()
  })

  it('is not fooled by the sentinel text appearing inside a string or mid-line', () => {
    const decoy = [
      'const s = "// <sleipnir:layout component=\\"x\\" hash=\\"y\\">"',
      'const t = 1 // <sleipnir:layout component="z" hash="w">',
    ].join('\n')
    // Neither is a whole sentinel LINE, so neither opens a region.
    expect(extractRegion(decoy)).toBeNull()
  })

  it('tolerates a missing hash attribute (a hand-written or migrated sentinel)', () => {
    const source = ['// <sleipnir:layout component="c">', 'body', '// </sleipnir:layout>'].join('\n')
    const region = extractRegion(source)!
    expect(region.componentId).toBe('c')
    expect(region.hash).toBe('')
    expect(region.inner).toBe('body')
  })
})

describe('spliceRegion — the corruption guarantee', () => {
  it('preserves every byte outside the region', () => {
    const next = spliceRegion(FILE, 'cmp_7a3f', 'newhash', 'return <Frame />')!
    const before = FILE.slice(0, extractRegion(FILE)!.start)
    const after = FILE.slice(extractRegion(FILE)!.end)

    expect(next.startsWith(before)).toBe(true)
    expect(next.endsWith(after)).toBe(true)

    // Spot-check the things a user would be angriest to lose.
    expect(next).toContain("import { useCardState } from '../hooks/useCardState'")
    expect(next).toContain('const { expanded, toggle } = useCardState()')
    expect(next).toContain('const handleClick = () => {')
    expect(next).toContain('export function cardHelper() {')
    expect(next).toContain('return 42')
  })

  it('reindents the new content to the region indentation', () => {
    const next = spliceRegion(FILE, 'cmp_7a3f', 'h', 'return (\n  <Frame />\n)')!
    expect(next).toContain('  // <sleipnir:layout component="cmp_7a3f" hash="h">')
    expect(next).toContain('  return (')
    expect(next).toContain('    <Frame />')
    expect(next).toContain('  // </sleipnir:layout>')
  })

  it('updates the recorded hash', () => {
    const next = spliceRegion(FILE, 'cmp_7a3f', 'zzz', 'return null')!
    expect(extractRegion(next)!.hash).toBe('zzz')
  })

  it('round-trips: splicing back the extracted content reproduces the file exactly', () => {
    const region = extractRegion(FILE)!
    const same = spliceRegion(FILE, region.componentId, region.hash, region.inner)
    expect(same).toBe(FILE)
  })

  it('is idempotent — splicing the same content twice changes nothing further', () => {
    const once = spliceRegion(FILE, 'cmp_7a3f', 'h1', 'return <Frame />')!
    const twice = spliceRegion(once, 'cmp_7a3f', 'h1', 'return <Frame />')!
    expect(twice).toBe(once)
  })

  it('refuses to invent a region in a file that has none', () => {
    // The anti-corruption case: a detached or hand-written file is left alone.
    expect(spliceRegion('export const x = 1\n', 'c', 'h', 'return null')).toBeNull()
  })

  it('leaves blank lines blank rather than filling them with indentation', () => {
    const next = spliceRegion(FILE, 'cmp_7a3f', 'h', 'return (\n\n  <Frame />\n)')!
    expect(next).not.toMatch(/^[ \t]+$/m)
  })
})

describe('buildRegion', () => {
  it('renders both sentinels around the content', () => {
    expect(buildRegion('c', 'h', 'body')).toBe(
      ['// <sleipnir:layout component="c" hash="h">', 'body', '// </sleipnir:layout>'].join('\n'),
    )
  })

  it('round-trips through extractRegion at any indentation', () => {
    for (const indent of ['', '  ', '    ', '\t']) {
      const built = buildRegion('c', 'h', 'line one\n  nested', indent)
      const region = extractRegion(built)!
      expect(region.componentId).toBe('c')
      expect(region.hash).toBe('h')
      expect(region.indent).toBe(indent)
      expect(region.inner).toBe('line one\n  nested')
    }
  })
})

describe('hasRegionFor', () => {
  it('matches only the owning component', () => {
    expect(hasRegionFor(FILE, 'cmp_7a3f')).toBe(true)
    expect(hasRegionFor(FILE, 'cmp_other')).toBe(false)
    expect(hasRegionFor('no region here', 'cmp_7a3f')).toBe(false)
  })
})

describe('spliceImports', () => {
  it('replaces the import block and leaves everything else byte for byte', () => {
    const next = spliceImports(FILE, [`import { Frame } from '../../../app/UIKit/Frame/Frame'`])

    expect(next).toContain(`import { Frame } from '../../../app/UIKit/Frame/Frame'`)
    expect(next).not.toContain(`from '../../app/UIKit/Frame/Frame'`)
    // The human-owned import is gone because the canvas owns the whole block —
    // but nothing below it moved.
    expect(next).toContain('export interface CardViewProps {')
    expect(next).toContain('const { expanded, toggle } = useCardState()')
    expect(next).toContain('// <sleipnir:layout component="cmp_7a3f" hash="k2f9x1">')
    expect(next).toContain('export function cardHelper() {')
  })

  it('preserves exactly one blank line after the block', () => {
    const next = spliceImports(FILE, [`import { A } from './a'`])
    expect(next.startsWith(`import { A } from './a'\n\nexport interface CardViewProps {`)).toBe(true)
  })

  it('collapses cleanly when replacing many imports with one', () => {
    const many = `import { A } from './a'\nimport { B } from './b'\nimport { C } from './c'\n\nexport const X = 1\n`
    expect(spliceImports(many, [`import { A } from './a'`])).toBe(`import { A } from './a'\n\nexport const X = 1\n`)
  })

  it('removes the block entirely when a component no longer imports anything', () => {
    const before = `import { A } from './a'\n\nexport const X = 1\n`
    expect(spliceImports(before, [])).toBe(`export const X = 1\n`)
  })

  it('inserts a block into a file that had none', () => {
    const before = `export const X = 1\n`
    expect(spliceImports(before, [`import { A } from './a'`])).toBe(`import { A } from './a'\n\nexport const X = 1\n`)
  })

  it('leaves a file with no imports and nothing to add completely untouched', () => {
    const before = `export const X = 1\n`
    expect(spliceImports(before, [])).toBe(before)
  })

  it('keeps a leading license/doc header above the block', () => {
    const before = `// Copyright someone\n// Second header line\n\nimport { A } from './a'\n\nexport const X = 1\n`
    expect(spliceImports(before, [`import { B } from './b'`])).toBe(
      `// Copyright someone\n// Second header line\n\nimport { B } from './b'\n\nexport const X = 1\n`,
    )
  })

  it('stops at the first non-import, so a later import-like line is not swallowed', () => {
    const before = `import { A } from './a'\n\nexport const X = 1\nimport { Late } from './late'\n`
    const next = spliceImports(before, [`import { A } from './a'`])
    expect(next).toContain(`import { Late } from './late'`)
  })

  it('refuses to eat a multi-line import a human reformatted', () => {
    // The canvas only ever writes single-line imports. A wrapped one means the
    // file is hand-owned there; the run must end rather than mangle it.
    const before = `import {\n  A,\n  B,\n} from './ab'\n\nexport const X = 1\n`
    const next = spliceImports(before, [`import { C } from './c'`])
    expect(next).toContain(`import {\n  A,\n  B,\n} from './ab'`)
    expect(next.startsWith(`import { C } from './c'`)).toBe(true)
  })

  it('handles a trailing semicolon, which prettier configs commonly add', () => {
    const before = `import { A } from './a';\n\nexport const X = 1\n`
    expect(spliceImports(before, [`import { B } from './b'`])).toBe(
      `import { B } from './b'\n\nexport const X = 1\n`,
    )
  })
})

describe('spliceDeclaration', () => {
  const PROPS = `export interface CardViewProps {\n  state?: 'default' | 'hover'\n}`
  const SIG = `export const CardView = ({ state = 'default' }: CardViewProps) => {`

  it('replaces both the props interface and the signature', () => {
    const next = spliceDeclaration(FILE, PROPS, SIG)
    expect(next).toContain(`  state?: 'default' | 'hover'`)
    expect(next).toContain(SIG)
    expect(next).not.toContain('({ title }: CardViewProps)')
    expect(next).not.toContain('  title: string')
  })

  it('preserves human code between the signature and the region', () => {
    // The whole point: hooks and handlers a person wrote live in that gap.
    const next = spliceDeclaration(FILE, PROPS, SIG)
    expect(next).toContain('const { expanded, toggle } = useCardState()')
    expect(next).toContain('const handleClick = () => {')
  })

  it('leaves imports, the region and trailing helpers untouched', () => {
    const next = spliceDeclaration(FILE, PROPS, SIG)
    expect(next).toContain(`import { useCardState } from '../hooks/useCardState'`)
    expect(next).toContain('// <sleipnir:layout component="cmp_7a3f" hash="k2f9x1">')
    expect(next).toContain('<Frame h={24}>{title}</Frame>')
    expect(next).toContain('export function cardHelper() {')
  })

  it('handles the empty one-line interface promotion writes first', () => {
    const before = `export interface CardProps {}\n\nexport const Card = ({}: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export interface CardProps {\n  a?: string\n}`, `export const Card = ({ a }: CardProps) => {`)
    expect(next).toBe(
      `export interface CardProps {\n  a?: string\n}\n\nexport const Card = ({ a }: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`,
    )
  })

  // The lint-clean empty form emitPropsInterface writes now: no `{}` interface,
  // no `({})` pattern. It must grow into a real interface and back.
  it('grows the empty Record alias into an interface when the first prop arrives', () => {
    const before = `export type CardProps = Record<string, never>\n\nexport const Card = () => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export interface CardProps {\n  a?: string\n}`, `export const Card = ({ a }: CardProps) => {`)
    expect(next).toBe(
      `export interface CardProps {\n  a?: string\n}\n\nexport const Card = ({ a }: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`,
    )
  })

  it('moves an older file from `interface X {}` to the lint-clean empty form', () => {
    const before = `export interface CardProps {}\n\nexport const Card = ({}: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export type CardProps = Record<string, never>`, `export const Card = () => {`)
    expect(next).toBe(
      `export type CardProps = Record<string, never>\n\nexport const Card = () => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`,
    )
  })

  it('collapses a multi-line interface back to the empty form', () => {
    const before = `export interface CardProps {\n  a?: string\n}\n\nexport const Card = ({ a }: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export interface CardProps {}`, `export const Card = ({}: CardProps) => {`)
    expect(next).toContain('export interface CardProps {}')
    expect(next).not.toContain('a?: string')
  })

  it('updates the signature alone when the file has no props interface', () => {
    const before = `export const Card = ({}: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export interface CardProps {}`, `export const Card = ({ a }: CardProps) => {`)
    expect(next).toContain('export const Card = ({ a }: CardProps) => {')
  })

  it('refuses a file with no region rather than guessing at its shape', () => {
    const before = `export interface CardProps {}\n\nexport const Card = ({}: CardProps) => {\n  return null\n}\n`
    expect(spliceDeclaration(before, `export interface CardProps { a?: string }`, `x`)).toBe(before)
  })

  it('refuses when the signature is not in the shape we write', () => {
    // A human reformatted it onto several lines; anchoring anyway would splice
    // over half a declaration.
    const before = `export const Card = (\n  { a }: CardProps,\n) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    expect(spliceDeclaration(before, `export interface CardProps {}`, `export const Card = ({}: CardProps) => {`)).toBe(before)
  })

  it('refuses an interface whose closing brace it cannot find', () => {
    const before = `export interface CardProps {\n  a?: string\n\nexport const Card = ({}: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    expect(spliceDeclaration(before, `export interface CardProps {}`, `export const Card = ({}: CardProps) => {`)).toBe(before)
  })

  it('anchors on the LAST signature above the region, not an earlier one', () => {
    // A helper component declared above in the same file must not be captured.
    const before = `export const Helper = ({}: HelperProps) => {\n  return null\n}\n\nexport interface CardProps {}\n\nexport const Card = ({}: CardProps) => {\n  // <sleipnir:layout component="c" hash="h">\n  return null\n  // </sleipnir:layout>\n}\n`
    const next = spliceDeclaration(before, `export interface CardProps {}`, `export const Card = ({ a }: CardProps) => {`)
    expect(next).toContain('export const Helper = ({}: HelperProps) => {')
    expect(next).toContain('export const Card = ({ a }: CardProps) => {')
  })
})
