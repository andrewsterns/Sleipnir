// The other half of "what connects to what": file references that aren't
// import statements.
//
// Every ImportAdapter here answers one question — "what does this file
// `import`?" — which is the whole story for code, and none of the story for
// assets. An .svg/.png/.ttf is only ever a reference TARGET (it has no syntax
// of its own to scan; see resolveAssetPlan's NON_SOURCE_EXTS), so the only way
// it ever joins the graph is by finding the files that point AT it. Those
// pointers are usually not imports:
//
//   fonts.css      @font-face { src: url('/avoerock-demo.regular.otf') }
//   index.html     <link rel="icon" href="/Sleipnir.svg" />
//   Frame.tsx      fill={{ image: '/grain.png' }}
//   anywhere       new URL('./sprite.png', import.meta.url)
//   Hero.tsx       import hero from './hero.png?url'
//
// Only the last one is an import at all, and even that one used to miss (the
// `?url` suffix made the path unresolvable). CSS and HTML map to a null
// adapter on purpose — they have no import model to write back into — so
// before this module every font and image in the app was a permanently
// disconnected dot no matter how many files referenced it.
//
// This is detection-only, deliberately: no insertImport/removeImport
// counterpart, so it stays out of the write-side paths (the `##token` editor
// extension, the node-card link editor) that ImportAdapter exists to serve.
// You cannot "add an import" to a .png, and a graph edge to one shouldn't
// imply you can.
//
// False positives are held down by one rule rather than by clever patterns:
// EVERY candidate below is resolved against the real workspace file pool and
// dropped unless it lands on a file that actually exists. A string that merely
// looks like a path costs nothing.

// Extensions that make a bare quoted string worth treating as a file
// reference (rule 5 below). Deliberately assets only — matching every ".ts"
// inside a string literal would turn error messages and doc comments into
// edges. Mirrors resolveAssetPlan's NON_SOURCE_EXTS (the files that can only
// ever be a target), minus the archive/binary formats nothing references by
// path, plus the media formats a UI genuinely points at.
const ASSET_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov',
  'pdf', 'wasm',
])

// Anything with a scheme (http:, https:, data:, blob:, mailto:) or a
// protocol-relative '//cdn...' prefix points outside the workspace entirely —
// a Google Fonts @import, a data: URI, a CDN script. No local file to link.
const REMOTE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

// Bundler query/fragment suffixes are part of the specifier but not part of
// the filename: Vite's '?url' / '?raw' / '?inline' / '?worker', svgr's
// '?react', and SVG fragment ids ('sprite.svg#icon-cart').
function cleanSpecifier(raw: string): string {
  return raw.trim().replace(/[?#].*$/, '')
}

// './a/../b/c.png' relative to 'src/x/Y.tsx' -> 'src/b/c.png'. Same walk
// tsxAdapter.resolveSpecifier does, kept separate because that one also
// appends extension candidates ('.ts', '/index.tsx', ...) — an asset
// reference always names its file exactly, extension included.
function joinRelative(fromPath: string, spec: string): string {
  const stack = fromPath.split('/').slice(0, -1)
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

// Where a server-root specifier ('/fonts/x.woff2' — how every asset in this
// app is actually written) can live on disk. Vite/CRA/Next all serve one
// directory at '/', so the leading slash maps to that directory's name, which
// isn't in the URL. Bare (no-prefix) is last so a project that serves its repo
// root still resolves.
const SERVE_ROOTS = ['public', 'static', 'assets', '']

export interface ReferenceIndex {
  pool: Set<string>
  /** Basename -> every workspace path ending in it, for the last-resort suffix match. */
  byName: Map<string, string[]>
}

// Built once per scan and shared across every file (see detectEdgesForPaths) —
// rebuilding it per file would make the whole-project scan quadratic on a
// workspace where it's already the expensive step.
export function buildReferenceIndex(paths: string[]): ReferenceIndex {
  const byName = new Map<string, string[]>()
  for (const p of paths) {
    const name = p.split('/').pop() ?? p
    const list = byName.get(name)
    if (list) list.push(p)
    else byName.set(name, [p])
  }
  return { pool: new Set(paths), byName }
}

// The one place a raw reference becomes a real workspace path, or nothing.
//
// A relative specifier is resolved and then required to hit exactly — it
// already says precisely where it points, so falling back to a name search
// would only ever turn a genuinely broken path into a confident wrong edge.
// Root-absolute and bare specifiers get the search, because they're written
// against a serve root this code can't know for certain, and the search is
// required to be UNAMBIGUOUS: two files named logo.svg mean no edge rather
// than a coin flip.
export function resolveReference(fromPath: string, raw: string, index: ReferenceIndex): string | null {
  const clean = cleanSpecifier(raw)
  if (!clean || REMOTE_RE.test(clean)) return null

  if (clean.startsWith('.')) {
    const joined = joinRelative(fromPath, clean)
    return index.pool.has(joined) ? joined : null
  }

  const bare = clean.replace(/^\/+/, '')
  if (!bare) return null

  if (clean.startsWith('/')) {
    for (const root of SERVE_ROOTS) {
      const candidate = root ? `${root}/${bare}` : bare
      if (index.pool.has(candidate)) return candidate
    }
  } else {
    // A specifier with no leading marker at all ('fonts/x.woff2' in a
    // stylesheet) is relative to the referencing file first — that's what a
    // browser resolves it as — before it's treated as a name to search for.
    const joined = joinRelative(fromPath, bare)
    if (index.pool.has(joined)) return joined
  }

  const matches = (index.byName.get(bare.split('/').pop() ?? bare) ?? []).filter(
    (p) => p === bare || p.endsWith(`/${bare}`),
  )
  return matches.length === 1 ? matches[0] : null
}

// Each pattern captures one reference syntax. Alternation over the three quote
// styles (rather than a backreference) keeps every capture group static, so a
// match's value is always "whichever group is defined".
const REFERENCE_PATTERNS: RegExp[] = [
  // CSS url(...) — quoted or bare. Carries every @font-face src and every
  // background image; the single highest-value pattern here, since a font
  // file is essentially never referenced any other way.
  /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s]+))\s*\)/g,
  // CSS @import "x.css" (the url() form is already covered above).
  /@import\s+(?:'([^'\n]*)'|"([^"\n]*)")/g,
  // HTML and JSX attributes that name a file: <link href>, <img src>,
  // <video poster>, <script src>, and the same attributes written as JSX
  // string props. srcset's comma/descriptor list is split below.
  /\b(?:src|href|poster|srcset)\s*=\s*(?:'([^'\n]*)'|"([^"\n]*)")/g,
  // Vite's asset-URL form — an expression, not an import, so no adapter sees it.
  /new\s+URL\(\s*(?:'([^'\n]*)'|"([^"\n]*)")\s*,\s*import\.meta\.url\s*\)/g,
]

// Rule 5, kept separate because it's the only one filtered by extension: any
// quoted literal naming an asset file, wherever it appears. This is what
// catches the runtime-prop style this app itself uses — `fill={{ image:
// '/grain.png' }}`, `effects={{ texture: { src: '/noise.png' } }}` — which is
// a real dependency with no import and no attribute to key off of.
const ASSET_LITERAL_RE = /'([^'\n]*\.[A-Za-z0-9]+)'|"([^"\n]*\.[A-Za-z0-9]+)"|`([^`\n]*\.[A-Za-z0-9]+)`/g

function hasAssetExtension(spec: string): boolean {
  const ext = cleanSpecifier(spec).split('.').pop()?.toLowerCase() ?? ''
  return ASSET_EXTS.has(ext)
}

// srcset is a comma-separated list of "url descriptor" pairs
// ("a.png 1x, b.png 2x"); every other pattern yields a single specifier.
function splitCandidates(raw: string): string[] {
  return raw.includes(',')
    ? raw.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean)
    : [raw]
}

// Every workspace file `content` references by something other than an import
// statement. Returns resolved workspace paths (never raw specifiers), already
// de-duplicated and never including `fromPath` itself.
export function detectAssetRefs(fromPath: string, content: string, index: ReferenceIndex): string[] {
  const targets = new Set<string>()
  const consider = (spec: string | undefined, assetOnly: boolean) => {
    if (!spec) return
    for (const candidate of splitCandidates(spec)) {
      if (assetOnly && !hasAssetExtension(candidate)) continue
      const target = resolveReference(fromPath, candidate, index)
      if (target && target !== fromPath) targets.add(target)
    }
  }

  for (const pattern of REFERENCE_PATTERNS) {
    for (const m of content.matchAll(pattern)) consider(m[1] ?? m[2] ?? m[3], false)
  }
  for (const m of content.matchAll(ASSET_LITERAL_RE)) consider(m[1] ?? m[2] ?? m[3], true)

  return [...targets]
}
