import { resolveReference, type ReferenceIndex } from './assetRefs'

// Config files as graph nodes.
//
// A config has no imports (JSON/YAML/TOML have no import syntax at all) and
// almost nothing imports it, so left alone it lands in a plan as an isolated
// dot — present, connected to nothing, pure noise. That's the case for
// dropping configs from the graph entirely. But an isolated dot isn't what a
// config actually is: package.json names an entry point and a dozen scripts
// that run real files, tsconfig references sibling tsconfigs, vite.config
// names its html entry and output dir, docker-compose mounts source paths.
// Those are genuine dependencies, written down in the file, and they're the
// answer to "why is this config here" — which is exactly what you want a plan
// to show.
//
// So configs link by what they NAME, never by what they GOVERN. The
// distinction matters and is the whole design:
//
//   named    package.json  ->  electron/main.cjs        (its "main")
//            package.json  ->  tools/sleipnir-plan.mjs  (a script runs it)
//            tsconfig.json ->  tsconfig.app.json        (a project reference)
//            vite.config   ->  index.html               (its build input)
//
//   governed tsconfig.json ->  every .ts file in the repo
//            package.json  ->  every source file, transitively
//            .eslintrc     ->  every file it lints
//
// The governed edges are all technically true and all worthless: they're
// derivable from the file's extension, they're the same for every project,
// and one node wired to 300 others flattens the force layout into a hairball
// that hides the real structure. Nothing here ever generates them.
//
// Detection is deliberately dumb and the guard does the work: tokenize the
// whole file, keep tokens that could be a path, and drop every one that
// doesn't resolve to a file that actually exists (see assetRefs'
// resolveReference). A semver range, a package name, a CLI flag, a git URL —
// none of them resolve, so none of them become edges, and no per-format
// schema knowledge is needed to skip them.

// Well-known config basenames with no `.config.` in the name.
const CONFIG_BASENAMES = new Set([
  'package.json', 'jsconfig.json', 'nx.json', 'components.json',
  'dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.babelrc', '.eslintrc', '.eslintrc.json', '.prettierrc', '.prettierrc.json',
  'electron-builder.json', 'manifest.json', 'now.json', 'vercel.json', 'netlify.toml',
])

// Which files get the token scan below. Kept to things that are actually
// configuration — a plain `.json` under src/ is far more likely to be app data
// (this repo's own plans.json / notes.json) whose every stored file path would
// become an edge from a store nobody thinks of as a dependency.
export function isConfigPath(path: string): boolean {
  const name = (path.split('/').pop() ?? path).toLowerCase()
  if (CONFIG_BASENAMES.has(name)) return true
  // vite.config.ts, tailwind.config.js, vitest.config.mjs, ...
  if (/\.config\.(?:ts|js|mjs|cjs|json)$/.test(name)) return true
  // tsconfig.json, tsconfig.app.json, tsconfig.node.json, ...
  if (/^tsconfig(?:\..+)?\.json$/.test(name)) return true
  // Project-level YAML/TOML is configuration by convention (CI workflows,
  // compose files, pyproject/Cargo manifests) — and unlike .json it's
  // essentially never used as bulk app data.
  if (/\.(?:ya?ml|toml)$/.test(name)) return true
  return false
}

// Every run of characters that could spell a path. Split points are the
// characters that can never appear inside one in these formats: whitespace,
// quotes, and JSON/YAML/TOML punctuation. Deliberately keeps '/', '.', '-',
// '_', '@' and '\' together so 'tools/sleipnir-plan.mjs' survives whole while
// 'node tools/sleipnir-plan.mjs && vite build' splits into its words.
const PATH_TOKEN_RE = /[A-Za-z0-9_@.\-/\\]+/g

// Cheap pre-filter before the (more expensive) pool lookup: a real
// intra-project reference either has a directory separator or is a bare
// filename with an extension. Anything else — a flag, a bare package name, a
// number — can't be one.
function looksLikePath(token: string): boolean {
  if (token.length < 3 || token.length > 200) return false
  if (token.includes('/') || token.includes('\\')) return true
  return /\.[A-Za-z0-9]{1,8}$/.test(token)
}

// Every workspace file this config names. Returns resolved workspace paths,
// de-duplicated, never including `fromPath` itself.
export function detectConfigRefs(fromPath: string, content: string, index: ReferenceIndex): string[] {
  const targets = new Set<string>()
  for (const [token] of content.matchAll(PATH_TOKEN_RE)) {
    if (!looksLikePath(token)) continue
    // Windows-style separators in a compose volume or a script get normalized;
    // every path in the pool is '/'-joined.
    const target = resolveReference(fromPath, token.replace(/\\/g, '/'), index)
    if (target && target !== fromPath) targets.add(target)
  }
  return [...targets]
}
