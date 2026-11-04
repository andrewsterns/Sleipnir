import { describe, it, expect } from 'vitest'
import {
  DEFAULT_COMPONENT_ROOT,
  PathEscapeError,
  deconflictComponentPath,
  deriveComponentPath,
  isAbsoluteLike,
  isContained,
  normalizeRelPath,
  parentDir,
  relativeImportPath,
  relativeToRoot,
  resolveComponentPath,
} from './paths'

const ROOT = 'src/components'

describe('normalizeRelPath', () => {
  it('normalizes separators and strips empty and "." segments', () => {
    expect(normalizeRelPath('src\\components\\card')).toBe('src/components/card')
    expect(normalizeRelPath('/src//components/./card/')).toBe('src/components/card')
    expect(normalizeRelPath('')).toBe('')
    expect(normalizeRelPath('.')).toBe('')
  })
})

describe('isAbsoluteLike', () => {
  it('catches POSIX, Windows, UNC, and scheme-prefixed paths', () => {
    expect(isAbsoluteLike('/etc/passwd')).toBe(true)
    expect(isAbsoluteLike('C:\\Windows\\System32')).toBe(true)
    expect(isAbsoluteLike('c:/windows')).toBe(true)
    expect(isAbsoluteLike('\\\\server\\share')).toBe(true)
    expect(isAbsoluteLike('file:///etc/passwd')).toBe(true)
    expect(isAbsoluteLike('http://example.com')).toBe(true)
  })

  it('passes ordinary relative paths through', () => {
    expect(isAbsoluteLike('src/components/card.tsx')).toBe(false)
    expect(isAbsoluteLike('card.tsx')).toBe(false)
    expect(isAbsoluteLike('../escape')).toBe(false) // relative, but rejected elsewhere
  })
})

describe('isContained', () => {
  it('accepts the root itself and anything beneath it', () => {
    expect(isContained(ROOT, 'src/components')).toBe(true)
    expect(isContained(ROOT, 'src/components/card/cardView.tsx')).toBe(true)
    expect(isContained(ROOT, 'src/components/a/b/c/deep.tsx')).toBe(true)
  })

  it('rejects siblings that merely share a name prefix', () => {
    // The classic prefix bug: "src/components-evil" starts with "src/components".
    expect(isContained(ROOT, 'src/components-evil/x.tsx')).toBe(false)
    expect(isContained(ROOT, 'src/componentsX')).toBe(false)
  })

  it('rejects traversal, absolute paths, and empty input', () => {
    expect(isContained(ROOT, 'src/components/../../etc/passwd')).toBe(false)
    expect(isContained(ROOT, '../outside.tsx')).toBe(false)
    expect(isContained(ROOT, '/etc/passwd')).toBe(false)
    expect(isContained(ROOT, 'C:\\Windows\\evil.tsx')).toBe(false)
    expect(isContained(ROOT, '')).toBe(false)
    expect(isContained(ROOT, '   '.trim())).toBe(false)
  })

  it('rejects anything outside the root entirely', () => {
    expect(isContained(ROOT, 'src/app/UIKit/Frame/Frame.tsx')).toBe(false)
    expect(isContained(ROOT, 'package.json')).toBe(false)
    expect(isContained(ROOT, '.planning/notes.json')).toBe(false)
  })
})

describe('resolveComponentPath', () => {
  it('accepts a path already rooted at the component root', () => {
    expect(resolveComponentPath(ROOT, 'src/components/card/cardView.tsx')).toBe(
      'src/components/card/cardView.tsx',
    )
  })

  it('prefixes a path given relative to the root', () => {
    expect(resolveComponentPath(ROOT, 'card/cardView.tsx')).toBe('src/components/card/cardView.tsx')
    expect(resolveComponentPath(ROOT, 'cardView.tsx')).toBe('src/components/cardView.tsx')
  })

  it('normalizes separators on the way through', () => {
    expect(resolveComponentPath(ROOT, 'card\\cardView.tsx')).toBe('src/components/card/cardView.tsx')
  })

  it('THROWS rather than silently correcting an escaping path', () => {
    // This is the anti-corruption guarantee: refuse, never coerce.
    expect(() => resolveComponentPath(ROOT, '../../../etc/passwd')).toThrow(PathEscapeError)
    expect(() => resolveComponentPath(ROOT, 'src/components/../../app/App.tsx')).toThrow(PathEscapeError)
    expect(() => resolveComponentPath(ROOT, '/etc/passwd')).toThrow(PathEscapeError)
    expect(() => resolveComponentPath(ROOT, 'C:\\Windows\\evil.tsx')).toThrow(PathEscapeError)
    expect(() => resolveComponentPath(ROOT, '')).toThrow(PathEscapeError)
    expect(() => resolveComponentPath(ROOT, '   ')).toThrow(PathEscapeError)
  })

  it('reports what was attempted, so the UI can explain the refusal', () => {
    try {
      resolveComponentPath(ROOT, '../evil.tsx')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PathEscapeError)
      expect((e as PathEscapeError).attempted).toBe('../evil.tsx')
      expect((e as PathEscapeError).root).toBe(ROOT)
    }
  })

  it('never escapes for any traversal depth', () => {
    for (let depth = 1; depth <= 10; depth += 1) {
      const attack = `${'../'.repeat(depth)}evil.tsx`
      expect(() => resolveComponentPath(ROOT, attack)).toThrow(PathEscapeError)
    }
  })

  it('honors a custom root, including a dot-folder if that is what you want', () => {
    expect(resolveComponentPath('.components', 'card/cardView.tsx')).toBe('.components/card/cardView.tsx')
    expect(() => resolveComponentPath('.components', '../outside.tsx')).toThrow(PathEscapeError)
  })
})

describe('relativeToRoot', () => {
  it('strips the root for display', () => {
    expect(relativeToRoot(ROOT, 'src/components/card/cardView.tsx')).toBe('card/cardView.tsx')
    expect(relativeToRoot(ROOT, 'src/components')).toBe('')
  })
})

describe('relativeImportPath', () => {
  it('builds a sibling import', () => {
    expect(relativeImportPath('src/components/card/cardView.tsx', 'src/components/card/badgeView.tsx')).toBe(
      './badgeView',
    )
  })

  it('climbs out to a cousin directory', () => {
    expect(relativeImportPath('src/components/card/cardView.tsx', 'src/components/badge/badgeView.tsx')).toBe(
      '../badge/badgeView',
    )
  })

  it('reaches outside the component root, which instances legitimately need', () => {
    expect(relativeImportPath('src/components/card/cardView.tsx', 'src/app/UIKit/Frame/Frame.tsx')).toBe(
      '../../app/UIKit/Frame/Frame',
    )
  })

  it('drops the extension and always yields a relative specifier', () => {
    expect(relativeImportPath('a/b.tsx', 'a/c.ts')).toBe('./c')
    expect(relativeImportPath('a/b.tsx', 'a/c.jsx')).toBe('./c')
  })
})

describe('DEFAULT_COMPONENT_ROOT', () => {
  it('is a dot-folder, because new components are staged rather than built', () => {
    // Deliberately the opposite of what a source directory would want. A
    // leading-dot root sits outside tsconfig `include` and ESLint's default
    // ignore, so staged experiments are neither typechecked nor linted —
    // correct for code that is not part of the app yet. A component earns
    // tooling coverage by being MOVED out of here (see relink.ts), which
    // rewrites its componentRoot to wherever it landed.
    expect(DEFAULT_COMPONENT_ROOT).toBe('.components')
    expect(DEFAULT_COMPONENT_ROOT.startsWith('.')).toBe(true)
  })

  it('contains paths exactly as any other root would', () => {
    expect(deriveComponentPath(DEFAULT_COMPONENT_ROOT, 'Card')).toBe('.components/card/card.tsx')
    expect(() => resolveComponentPath(DEFAULT_COMPONENT_ROOT, '../escape.tsx')).toThrow(PathEscapeError)
  })
})

describe('parentDir', () => {
  it('drops the last segment', () => {
    expect(parentDir('src/components/card/card.tsx')).toBe('src/components/card')
    expect(parentDir('src/components/card')).toBe('src/components')
    expect(parentDir('card.tsx')).toBe('')
  })

  it('normalizes on the way through', () => {
    expect(parentDir('src\\components\\card.tsx')).toBe('src/components')
    expect(parentDir('/src//components/card.tsx')).toBe('src/components')
  })
})

describe('deriveComponentPath', () => {
  it('gives a component its own folder holding one same-named file', () => {
    expect(deriveComponentPath(ROOT, 'Card')).toBe('src/components/card/card.tsx')
    expect(deriveComponentPath(ROOT, 'Frame Item')).toBe('src/components/frameItem/frameItem.tsx')
  })

  it('falls back to a real name when the label slugs to nothing', () => {
    // naming.ts's toPascalCase returns 'Unnamed' for a label with no
    // alphanumerics, so a junk name still yields a usable path rather than
    // throwing — promotion is automatic now and must not fail on a stray name.
    expect(deriveComponentPath(ROOT, '---')).toBe('src/components/unnamed/unnamed.tsx')
    expect(deriveComponentPath(ROOT, '')).toBe('src/components/unnamed/unnamed.tsx')
  })

  it('de-conflicts that fallback like any other name', () => {
    expect(deconflictComponentPath(ROOT, '---', ['src/components/unnamed/unnamed.tsx'])).toBe(
      'src/components/unnamed-2/unnamed.tsx',
    )
  })
})

describe('deconflictComponentPath', () => {
  it('returns the plain derived path when nothing is in the way', () => {
    expect(deconflictComponentPath(ROOT, 'Card', [])).toBe('src/components/card/card.tsx')
  })

  it('steps the FOLDER past a collision, keeping the file name matching the symbol', () => {
    // Promotion is automatic, so two frames both left as "Frame" is routine.
    const taken = ['src/components/frame/frame.tsx']
    expect(deconflictComponentPath(ROOT, 'Frame', taken)).toBe('src/components/frame-2/frame.tsx')
  })

  it('keeps stepping past a run of collisions', () => {
    const taken = [
      'src/components/frame/frame.tsx',
      'src/components/frame-2/frame.tsx',
      'src/components/frame-3/frame.tsx',
    ]
    expect(deconflictComponentPath(ROOT, 'Frame', taken)).toBe('src/components/frame-4/frame.tsx')
  })

  it('ignores taken paths belonging to other components', () => {
    expect(deconflictComponentPath(ROOT, 'Card', ['src/components/badge/badge.tsx'])).toBe(
      'src/components/card/card.tsx',
    )
  })
})
