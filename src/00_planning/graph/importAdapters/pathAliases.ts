// TS/JS path-alias resolution (tsconfig.json / jsconfig.json's
// `compilerOptions.paths`) — the piece tsxAdapter's relative-only
// resolveSpecifier was missing, which silently dropped edges for any
// aliased internal import ('@molecules/Foo', '@atoms/Bar', ...): it was
// treated identically to a bare npm package and left unresolved. See
// detectEdges.ts (the only caller that loads this) for how it's threaded
// through to resolveSpecifier.

export interface PathAliasConfig {
  /** Workspace-relative, no trailing slash ('' means the workspace root itself). */
  baseUrl: string
  /** Raw compilerOptions.paths, e.g. { '@atoms/*': ['src/atoms/*'] }. */
  paths: Record<string, string[]>
}

// tsconfig files routinely carry comments/trailing commas that JSON.parse
// rejects outright — strip just enough to parse without pulling in a real
// JSONC parser for what's a best-effort feature.
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1')
}

function joinRel(dir: string, file: string): string {
  const stack = dir ? dir.split('/') : []
  for (const part of file.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

// Merges baseUrl/paths from `configPath` (workspace-relative) into `into`,
// then recurses into `extends` and project `references` — the shape most
// Vite/TS projects actually use: a root tsconfig.json with no paths of its
// own, referencing tsconfig.app.json/tsconfig.node.json for the real
// compilerOptions (see this repo's own tsconfig split). Best-effort: a
// missing/unparseable config anywhere in the chain is just skipped, never
// thrown — one bad reference shouldn't blank out aliases found elsewhere.
// Loose shape of a tsconfig/jsconfig JSON file — untyped at the JSON.parse
// boundary since it's arbitrary user-project input, narrowed field-by-field
// below rather than trusted wholesale.
interface RawTsconfig {
  compilerOptions?: { baseUrl?: unknown; paths?: unknown }
  extends?: unknown
  references?: unknown
}

async function mergeConfig(
  configPath: string,
  readFile: (path: string) => Promise<string>,
  into: PathAliasConfig,
  seen: Set<string>,
): Promise<void> {
  if (seen.has(configPath)) return
  seen.add(configPath)

  let text: string
  try {
    text = await readFile(configPath)
  } catch {
    return
  }

  let json: RawTsconfig
  try {
    json = JSON.parse(stripJsonComments(text)) as RawTsconfig
  } catch {
    return
  }

  const dir = dirOf(configPath)
  const opts = json.compilerOptions ?? {}
  if (typeof opts.baseUrl === 'string') into.baseUrl = joinRel(dir, opts.baseUrl)
  if (opts.paths && typeof opts.paths === 'object') {
    for (const [key, val] of Object.entries(opts.paths)) {
      if (Array.isArray(val)) into.paths[key] = val as string[]
    }
  }

  if (typeof json.extends === 'string') {
    await mergeConfig(joinRel(dir, json.extends), readFile, into, seen)
  }
  if (Array.isArray(json.references)) {
    for (const ref of json.references as unknown[]) {
      const refPathValue = ref && typeof ref === 'object' ? (ref as { path?: unknown }).path : undefined
      if (typeof refPathValue !== 'string') continue
      const refPath = joinRel(dir, refPathValue)
      await mergeConfig(refPath.endsWith('.json') ? refPath : `${refPath}/tsconfig.json`, readFile, into, seen)
    }
  }
}

// Loads the effective alias config for a workspace. `readFile` is injected
// (same convention as detectEdgesForPaths) so callers can source it from
// whatever filesystem transport applies. Falls back to jsconfig.json only if
// tsconfig.json produced no paths at all.
export async function loadPathAliases(readFile: (path: string) => Promise<string>): Promise<PathAliasConfig> {
  const config: PathAliasConfig = { baseUrl: '', paths: {} }
  await mergeConfig('tsconfig.json', readFile, config, new Set())
  if (Object.keys(config.paths).length === 0) {
    await mergeConfig('jsconfig.json', readFile, config, new Set())
  }
  return config
}

// Expands an alias specifier ('@molecules/nav-circle/NavCircleView') into
// candidate workspace-relative, extensionless base paths to try against the
// file pool. Longest pattern first, matching TS's own most-specific-wins
// tie-break when more than one `paths` entry could apply.
export function expandAlias(raw: string, config: PathAliasConfig): string[] {
  const entries = Object.entries(config.paths).sort((a, b) => b[0].length - a[0].length)
  for (const [pattern, targets] of entries) {
    const star = pattern.indexOf('*')
    if (star === -1) {
      if (raw !== pattern) continue
      return targets.map((t) => joinRel(config.baseUrl, t))
    }
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)
    if (!raw.startsWith(prefix) || !raw.endsWith(suffix)) continue
    const matched = raw.slice(prefix.length, raw.length - suffix.length)
    return targets.map((t) => joinRel(config.baseUrl, t.replace('*', matched)))
  }
  return []
}
