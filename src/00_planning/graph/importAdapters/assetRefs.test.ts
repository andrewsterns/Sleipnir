import { describe, it, expect } from 'vitest'
import { buildReferenceIndex, detectAssetRefs, resolveReference } from './assetRefs'

// Coverage for the non-import half of link detection — the reason an .svg /
// .png / .ttf can join the graph at all (see assetRefs.ts). Pure functions, no
// fs. The workspace shape below mirrors this app's own: assets served from
// public/ and referenced by server-root path, which is the case that used to
// produce zero edges.
const WORKSPACE = [
  'public/Sleipnir.svg',
  'public/avoerock-demo.regular.otf',
  'public/grain.png',
  'index.html',
  'src/00_themes/fonts/fonts.css',
  'src/00_themes/fonts/Local.woff2',
  'src/app/UIKit/Frame/Frame.tsx',
  'src/Hero.tsx',
  'src/assets/hero.png',
]

const index = buildReferenceIndex(WORKSPACE)

describe('resolveReference', () => {
  it('resolves a server-root specifier to the file under the serve directory', () => {
    // '/avoerock-demo.regular.otf' is how the font is actually written in
    // fonts.css — the 'public/' prefix exists on disk but never in the URL.
    expect(resolveReference('src/00_themes/fonts/fonts.css', '/avoerock-demo.regular.otf', index)).toBe(
      'public/avoerock-demo.regular.otf',
    )
    expect(resolveReference('index.html', '/Sleipnir.svg', index)).toBe('public/Sleipnir.svg')
  })

  it('resolves a relative specifier against the referencing file', () => {
    expect(resolveReference('src/Hero.tsx', './assets/hero.png', index)).toBe('src/assets/hero.png')
    expect(resolveReference('src/00_themes/fonts/fonts.css', './Local.woff2', index)).toBe(
      'src/00_themes/fonts/Local.woff2',
    )
  })

  it('strips bundler query and fragment suffixes before resolving', () => {
    expect(resolveReference('src/Hero.tsx', './assets/hero.png?url', index)).toBe('src/assets/hero.png')
    expect(resolveReference('index.html', '/Sleipnir.svg#icon-cart', index)).toBe('public/Sleipnir.svg')
  })

  it('ignores anything pointing outside the workspace', () => {
    expect(resolveReference('src/00_themes/fonts/fonts.css', 'https://fonts.googleapis.com/css2?family=Doto', index)).toBeNull()
    expect(resolveReference('src/Hero.tsx', 'data:image/png;base64,iVBORw0KGgo=', index)).toBeNull()
    expect(resolveReference('index.html', '//cdn.example.com/lib.js', index)).toBeNull()
  })

  it('returns null for a relative path that does not exist rather than searching by name', () => {
    // 'src/typo/hero.png' is wrong, and 'src/assets/hero.png' is a file with
    // that exact basename — a name search here would confidently draw an edge
    // the source code does not actually describe.
    expect(resolveReference('src/Hero.tsx', './typo/hero.png', index)).toBeNull()
  })

  it('refuses an ambiguous name match instead of guessing between duplicates', () => {
    const ambiguous = buildReferenceIndex(['public/logo.svg', 'src/brand/logo.svg', 'index.html'])
    expect(resolveReference('index.html', '/logo.svg', ambiguous)).toBe('public/logo.svg')
    // No serve root matches 'brand/logo.svg', and both files share the
    // basename, so the last-resort search has two candidates and takes neither.
    const twoDeep = buildReferenceIndex(['a/logo.svg', 'b/logo.svg', 'index.html'])
    expect(resolveReference('index.html', '/logo.svg', twoDeep)).toBeNull()
  })
})

describe('detectAssetRefs', () => {
  it('finds a font behind @font-face url() — the reference no adapter can see', () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Doto');\n\n@font-face {\n  font-family: 'Avoerock Demo';\n  src: url('/avoerock-demo.regular.otf') format('opentype');\n}\n`
    expect(detectAssetRefs('src/00_themes/fonts/fonts.css', css, index)).toEqual(['public/avoerock-demo.regular.otf'])
  })

  it('finds an unquoted css url() and a relative one', () => {
    const css = `body { background: url(/grain.png); }\n@font-face { src: url("./Local.woff2"); }\n`
    expect(detectAssetRefs('src/00_themes/fonts/fonts.css', css, index)).toEqual(
      expect.arrayContaining(['public/grain.png', 'src/00_themes/fonts/Local.woff2']),
    )
  })

  it('finds html link/img references', () => {
    const html = `<link rel="icon" type="image/svg+xml" href="/Sleipnir.svg" />\n<img srcset="/grain.png 1x, /Sleipnir.svg 2x" />\n`
    expect(detectAssetRefs('index.html', html, index)).toEqual(
      expect.arrayContaining(['public/Sleipnir.svg', 'public/grain.png']),
    )
  })

  it('finds an asset named by a plain string prop, with no import or attribute at all', () => {
    // The pattern this app itself uses — Frame's fill/effects image props.
    const tsx = `export const Hero = () => <Frame fill={{ image: '/grain.png' }} effects={{ texture: { src: '/Sleipnir.svg' } }} />\n`
    expect(detectAssetRefs('src/app/UIKit/Frame/Frame.tsx', tsx, index)).toEqual(
      expect.arrayContaining(['public/grain.png', 'public/Sleipnir.svg']),
    )
  })

  it("finds Vite's new URL(..., import.meta.url) asset form", () => {
    const tsx = `const heroUrl = new URL('./assets/hero.png', import.meta.url).href\n`
    expect(detectAssetRefs('src/Hero.tsx', tsx, index)).toEqual(['src/assets/hero.png'])
  })

  it('does not turn ordinary code strings into edges', () => {
    // A module specifier, a message mentioning a filename that isn't an
    // asset, and a path to a file that does not exist.
    const tsx = `import { Frame } from './Frame'\nconst msg = 'failed to load config.ts'\nconst missing = '/nope/absent.png'\n`
    expect(detectAssetRefs('src/Hero.tsx', tsx, index)).toEqual([])
  })

  it('never links a file to itself', () => {
    const css = `/* self-referential url */\nbody { background: url(/grain.png); }\n`
    expect(detectAssetRefs('public/grain.png', css, index)).toEqual([])
  })
})
