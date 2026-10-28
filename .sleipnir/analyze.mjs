// Sleipnir Architecture CLI — standalone, vendored copy.
//
// COPIED into each project as `.sleipnir/analyze.mjs` (with its one sibling,
// `.sleipnir/graphCore.mjs`) by Sleipnir's scaffolder, like plan.mjs and
// canvas.mjs: an AI agent running /optimize, or a teammate without Sleipnir,
// can map the project's imports and get the same numbers Sleipnir's Health
// view shows — with nothing but Node.
//
// This file is the SCANNER: it walks the project, reads source files and
// extracts imports for TypeScript/JavaScript, Python, Go and Rust, resolves
// them to files, and counts git churn. The analysis itself (fan-in/out,
// cycles, layers, hotspots, feature scope, the report) is graphCore.mjs,
// shared with the app.
//
// Usage:
//   node .sleipnir/analyze.mjs report  --root . [--scope <dir>] [--goal "<text>"] [--feature "<words>"] [--limit N] [--json]
//   node .sleipnir/analyze.mjs file    --root . <path>        one file: counts, importers, imports, blast radius
//   node .sleipnir/analyze.mjs feature --root . "<words>"     the files that make up a feature

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { analyzeGraph, blastRadius, dependenciesOf, featureScope, featureTerms, formatReport } from './graphCore.mjs'

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.py', '.go', '.rs'])
const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte']
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'release', 'coverage', 'target', '__pycache__', 'venv', '.venv', 'vendor', 'tmp'])
const MANIFESTS = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'setup.py']
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'url', 'util', 'crypto', 'child_process', 'events', 'stream', 'http', 'https', 'net', 'zlib', 'assert', 'buffer', 'module', 'readline', 'worker_threads', 'perf_hooks', 'timers', 'process', 'tty', 'dns', 'vm'])
const MAX_FILE_BYTES = 1_000_000

const toPosix = (p) => p.split(path.sep).join('/')

// ── Listing ────────────────────────────────────────────────────────────────

/**
 * Every source file under `root`, workspace-relative. Uses git when it can (so
 * .gitignore is honored), else a walk. Nested projects — a subfolder with its
 * own package.json / go.mod / Cargo.toml — are left out: they're their own
 * architecture, and analyzing them as part of this one only adds noise.
 */
export function listSourceFiles(root) {
  let files = null
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    files = out.split('\n').filter(Boolean)
  } catch {
    files = null
  }
  if (!files) {
    files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        const rel = dir ? `${dir}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(rel)
        else files.push(rel)
      }
    }
    walk('')
  }
  const nested = new Set()
  for (const f of files) {
    const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''
    if (dir && MANIFESTS.includes(f.slice(f.lastIndexOf('/') + 1))) nested.add(`${dir}/`)
  }
  return files
    .filter((f) => SOURCE_EXT.has(path.extname(f)))
    .filter((f) => !f.split('/').some((seg) => SKIP_DIRS.has(seg) || (seg.startsWith('.') && seg !== '.')))
    .filter((f) => ![...nested].some((n) => f.startsWith(n)))
    .filter((f) => fs.existsSync(path.join(root, f)))
    .sort()
}

// ── Reading imports ────────────────────────────────────────────────────────

/** Comments removed (strings kept), so commented-out imports don't count. */
function stripComments(src, hash = false) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      out += c
      i += 1
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        if (q !== '`' && src[i] === '\n') break
        out += src[i]
        i += 1
      }
      out += src[i] ?? ''
      i += 1
    } else if (!hash && c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
    } else if (!hash && c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
    } else if (hash && c === '#') {
      while (i < src.length && src[i] !== '\n') i += 1
    } else {
      out += c
      i += 1
    }
  }
  return out
}

// `import { type A, type B } from 'x'` — every name marked type, no default —
// is erased at compile time just like `import type { A, B }`.
function onlyInlineTypes(clause) {
  const named = clause?.trim().match(/^\{([^}]*)\}\s*from$/)
  if (!named) return false
  const names = named[1].split(',').map((n) => n.trim()).filter(Boolean)
  return names.length > 0 && names.every((n) => /^type\s/.test(n))
}

function jsImports(src) {
  const code = stripComments(src)
  const found = []
  let reexports = 0
  const add = (spec, kind) => spec && found.push({ spec, kind })
  for (const m of code.matchAll(/(?:^|[;\n}])\s*import\s+(type\s+)?([\w*${}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g)) {
    add(m[3], m[1] || onlyInlineTypes(m[2]) ? 'type' : 'static')
  }
  for (const m of code.matchAll(/(?:^|[;\n}])\s*export\s+(type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s+['"]([^'"\n]+)['"]/g)) {
    add(m[2], m[1] ? 'type' : 'static')
    reexports += 1
  }
  for (const m of code.matchAll(/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g)) add(m[1], 'static')
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g)) add(m[1], 'dynamic')
  return { found, reexports }
}

function pyImports(src) {
  const code = stripComments(src, true)
  const found = []
  // Names are either parenthesized (may span lines) or the rest of ONE line —
  // a pattern allowing newlines there swallowed the next import statement.
  for (const m of code.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(?:\(([^)]*)\)|([^\n]*))/gm)) {
    const names = (m[3] ?? m[4] ?? '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter((x) => x && x !== '*')
    found.push({ dots: m[1].length, module: m[2], names, kind: 'static' })
  }
  for (const m of code.matchAll(/^[ 	]*import[ 	]+([\w.]+(?:[ 	]+as[ 	]+\w+)?(?:[ 	]*,[ 	]*[\w.]+(?:[ 	]+as[ 	]+\w+)?)*)/gm)) {
    for (const part of m[1].split(',')) found.push({ dots: 0, module: part.trim().split(/\s+/)[0], names: [], kind: 'static' })
  }
  return found
}

function goImports(src) {
  const code = stripComments(src)
  const specs = []
  for (const m of code.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) specs.push(m[1])
  for (const block of code.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
    for (const m of block[1].matchAll(/(?:[\w.]+\s+)?"([^"]+)"/g)) specs.push(m[1])
  }
  return specs
}

function rustImports(src) {
  const code = stripComments(src)
  const mods = [...code.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)].map((m) => m[1])
  const uses = []
  for (const m of code.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm)) {
    const text = m[1].replace(/\s+/g, '')
    const brace = text.indexOf('{')
    if (brace === -1) uses.push(text.split('::'))
    else {
      const prefix = text.slice(0, brace).replace(/::$/, '').split('::')
      for (const item of text.slice(brace + 1, text.lastIndexOf('}')).split(',')) if (item) uses.push([...prefix, ...item.split('::')])
    }
  }
  return { mods, uses }
}

// ── Resolving to files ─────────────────────────────────────────────────────

/** JSON with comments and trailing commas — tsconfig's dialect. */
function readJsonc(file) {
  try {
    const text = stripComments(fs.readFileSync(file, 'utf8')).replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(text)
  } catch {
    return null
  }
}

function aliasRules(root) {
  const rules = []
  for (const name of ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json']) {
    const config = readJsonc(path.join(root, name))
    const opts = config?.compilerOptions
    if (!opts?.paths) continue
    const base = opts.baseUrl ?? '.'
    for (const [pattern, targets] of Object.entries(opts.paths)) {
      const prefix = pattern.replace(/\*$/, '')
      for (const t of targets) rules.push({ prefix, wildcard: pattern.endsWith('*'), target: toPosix(path.posix.join(base, t.replace(/\*$/, ''))) })
    }
  }
  // Vite's common '@' → src convention, when nothing declared it.
  if (!rules.some((r) => r.prefix === '@/') && fs.existsSync(path.join(root, 'src'))) rules.push({ prefix: '@/', wildcard: true, target: 'src/' })
  return rules
}

function packageName(spec) {
  if (spec.startsWith('node:')) return null
  const parts = spec.split('/')
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  return NODE_BUILTINS.has(name) ? null : name
}

function makeJsResolver(fileSet, rules) {
  const tryPath = (p) => {
    const clean = path.posix.normalize(p).replace(/^\.\//, '')
    if (fileSet.has(clean)) return clean
    for (const ext of JS_EXT) if (fileSet.has(clean + ext)) return clean + ext
    for (const ext of JS_EXT) if (fileSet.has(`${clean}/index${ext}`)) return `${clean}/index${ext}`
    // TS ESM writes './x.js' for './x.ts'.
    const m = clean.match(/^(.*)\.(js|mjs|cjs|jsx)$/)
    if (m) for (const ext of ['.ts', '.tsx', '.mts', '.cts']) if (fileSet.has(m[1] + ext)) return m[1] + ext
    return null
  }
  return (fromFile, spec) => {
    if (spec.startsWith('.')) return { file: tryPath(path.posix.join(path.posix.dirname(fromFile), spec)) }
    for (const r of rules) {
      if (r.wildcard ? spec.startsWith(r.prefix) : spec === r.prefix) {
        const hit = tryPath(r.target + spec.slice(r.prefix.length))
        if (hit) return { file: hit }
      }
    }
    if (spec.startsWith('/')) return { file: tryPath(spec.slice(1)) }
    return { pkg: packageName(spec) }
  }
}

// ── The scan ───────────────────────────────────────────────────────────────

/**
 * Files something outside the import graph starts: HTML <script src>,
 * package.json main/module/bin and `node <file>` in its scripts, and any file
 * with a `#!` line (a CLI). Without these, every CLI and page script looked
 * unreferenced.
 */
function entryPoints(root, files, fileSet, contents) {
  const entries = new Set()
  const clean = (p) => p.replace(/^\.\//, '')
  let htmlFiles = []
  try {
    htmlFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.html'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
  } catch {
    htmlFiles = []
  }
  if (!htmlFiles.length && fs.existsSync(path.join(root, 'index.html'))) htmlFiles = ['index.html']
  for (const html of htmlFiles) {
    let text = ''
    try {
      text = fs.readFileSync(path.join(root, html), 'utf8')
    } catch {
      continue
    }
    for (const m of text.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue
      const target = m[1].startsWith('/') ? m[1].slice(1) : path.posix.join(path.posix.dirname(html), m[1])
      if (fileSet.has(target)) entries.add(target)
    }
  }
  const pkg = readJsonc(path.join(root, 'package.json'))
  const declared = [pkg?.main, pkg?.module, ...(typeof pkg?.bin === 'string' ? [pkg.bin] : Object.values(pkg?.bin ?? {}))]
  for (const d of declared) if (typeof d === 'string' && fileSet.has(clean(d))) entries.add(clean(d))
  for (const script of Object.values(pkg?.scripts ?? {})) {
    for (const m of String(script).matchAll(/(?:node|tsx|ts-node|bun|deno run)\s+([\w./-]+\.[cm]?[jt]s)/g)) if (fileSet.has(clean(m[1]))) entries.add(clean(m[1]))
  }
  for (const f of files) if (contents[f]?.startsWith('#!') || runsItself(f, contents[f] ?? '')) entries.add(f)
  return [...entries]
}

// A script run by hand (`node tools/gen.mjs`, `python manage.py`) has no
// importer and is listed nowhere, but it isn't dead: it runs itself.
const NODE_BUILTIN_IMPORT = /\bfrom\s+['"](?:node:|fs['"]|path['"]|child_process['"])|\brequire\(\s*['"](?:node:|fs['"]|path['"]|child_process['"])/
function runsItself(file, src) {
  if (/\.[cm]?js$/.test(file)) {
    if (/\bprocess\.argv\b|\brequire\.main\s*===\s*module\b|\bimport\.meta\.main\b/.test(src)) return true
    // Top-level work in a Node script: an `await` or a call at column 0.
    return NODE_BUILTIN_IMPORT.test(src) && /^(?:await\s|[A-Za-z_$][\w$.]*\()/m.test(stripComments(src))
  }
  if (file.endsWith('.py')) return /^if\s+__name__\s*==\s*['"]__main__['"]/m.test(src)
  if (file.endsWith('.go')) return /^package\s+main\b/m.test(src) && /\bfunc\s+main\s*\(\s*\)/.test(src)
  if (file.endsWith('.rs')) return /\bfn\s+main\s*\(\s*\)/.test(src)
  return false
}

// Code nobody imports on purpose (parked, or copied out elsewhere) says so with
// a comment line `sleipnir-keep: <why>`, and isn't reported as unused.
const KEEP_MARKER = /^\s*(?:\/\/|#|\*|\/\*)\s*sleipnir-keep\b/m

/** The project's import graph, ready for graphCore's analyzeGraph. */
export function scanProject(root) {
  const files = listSourceFiles(root)
  const fileSet = new Set(files)
  const resolveJs = makeJsResolver(fileSet, aliasRules(root))
  const goModule = (() => {
    try {
      return fs.readFileSync(path.join(root, 'go.mod'), 'utf8').match(/^module\s+(\S+)/m)?.[1] ?? null
    } catch {
      return null
    }
  })()
  const goPackages = new Map()
  for (const f of files) {
    if (!f.endsWith('.go') || f.endsWith('_test.go')) continue
    const dir = path.posix.dirname(f)
    if (!goPackages.has(dir)) goPackages.set(dir, [])
    goPackages.get(dir).push(f)
  }

  const edges = []
  const lines = {}
  const external = {}
  const reexports = {}
  const contents = {}
  const seen = new Set()
  const edge = (source, target, kind) => {
    if (!target || target === source) return
    const key = `${source}>${target}>${kind}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ source, target, kind })
  }
  const ext = (f, pkg) => {
    if (!pkg) return
    if (!external[f]) external[f] = []
    if (!external[f].includes(pkg)) external[f].push(pkg)
  }

  for (const f of files) {
    let src
    try {
      const stat = fs.statSync(path.join(root, f))
      if (stat.size > MAX_FILE_BYTES) continue
      src = fs.readFileSync(path.join(root, f), 'utf8')
    } catch {
      continue
    }
    contents[f] = src
    lines[f] = src.split('\n').length
    const e = path.extname(f)
    if (JS_EXT.includes(e)) {
      const { found, reexports: re } = jsImports(src)
      if (re) reexports[f] = re
      for (const { spec, kind } of found) {
        const r = resolveJs(f, spec)
        if (r.file) edge(f, r.file, kind)
        else ext(f, r.pkg)
      }
    } else if (e === '.py') {
      for (const imp of pyImports(src)) {
        const baseDir = imp.dots ? path.posix.dirname(f).split('/').slice(0, Math.max(0, path.posix.dirname(f).split('/').length - (imp.dots - 1))).join('/') : ''
        const roots = imp.dots ? [baseDir] : ['', 'src', path.posix.dirname(f)]
        const modPath = imp.module.replace(/\./g, '/')
        let hit = null
        for (const r of roots) {
          const base = [r, modPath].filter(Boolean).join('/')
          const candidates = [`${base}.py`, `${base}/__init__.py`]
          hit = candidates.find((c) => fileSet.has(c)) ?? null
          // `from pkg import module` — the names may be submodules.
          for (const name of imp.names) {
            const sub = [base, name].filter(Boolean).join('/')
            const subHit = [`${sub}.py`, `${sub}/__init__.py`].find((c) => fileSet.has(c))
            if (subHit) {
              edge(f, subHit, 'static')
              if (!hit) hit = 'sub'
            }
          }
          if (hit) break
        }
        if (hit && hit !== 'sub') edge(f, hit, 'static')
        else if (!hit && !imp.dots) ext(f, imp.module.split('.')[0])
      }
    } else if (e === '.go') {
      for (const spec of goImports(src)) {
        if (goModule && (spec === goModule || spec.startsWith(`${goModule}/`))) {
          const dir = spec.slice(goModule.length).replace(/^\//, '') || '.'
          for (const target of goPackages.get(dir) ?? []) edge(f, target, 'static')
        } else if (spec.split('/')[0].includes('.')) ext(f, spec.split('/').slice(0, 3).join('/'))
      }
    } else if (e === '.rs') {
      const { mods, uses } = rustImports(src)
      const dir = path.posix.dirname(f)
      const stem = path.posix.basename(f, '.rs')
      const modDir = ['main', 'lib', 'mod'].includes(stem) ? dir : `${dir}/${stem}`
      const findMod = (base, name) => [`${base}/${name}.rs`, `${base}/${name}/mod.rs`].map((p) => p.replace(/^\.\//, '')).find((p) => fileSet.has(p))
      for (const m of mods) edge(f, findMod(modDir, m), 'static')
      const crateRoot = (() => {
        const parts = f.split('/')
        const i = parts.lastIndexOf('src')
        return i >= 0 ? parts.slice(0, i + 1).join('/') : dir
      })()
      for (const segs of uses) {
        let base
        let rest
        if (segs[0] === 'crate') [base, rest] = [crateRoot, segs.slice(1)]
        else if (segs[0] === 'super') [base, rest] = [path.posix.dirname(modDir), segs.slice(1)]
        else if (segs[0] === 'self') [base, rest] = [modDir, segs.slice(1)]
        else {
          if (!['std', 'core', 'alloc'].includes(segs[0])) ext(f, segs[0])
          continue
        }
        // Longest module path that exists; trailing segments are items.
        let target = null
        for (let n = rest.length; n > 0 && !target; n -= 1) {
          const modPath = [base, ...rest.slice(0, n - 1)].join('/')
          target = findMod(modPath, rest[n - 1])
        }
        edge(f, target, 'static')
      }
    }
  }

  const keep = files.filter((f) => KEEP_MARKER.test(contents[f] ?? ''))
  return { files, edges, lines, external, reexports, entries: entryPoints(root, files, fileSet, contents), keep, contents }
}

/** Commits touching each file in the last `days` days. Empty outside a git repo. */
export function gitChurn(root, days = 90) {
  try {
    // --relative: paths relative to `root`, and only its own files — a project
    // inside a bigger repository must not inherit the parent's history.
    const out = execFileSync('git', ['log', '--relative', `--since=${days} days ago`, '--name-only', '--pretty=format:'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
    const churn = {}
    for (const line of out.split('\n')) if (line.trim()) churn[line.trim()] = (churn[line.trim()] ?? 0) + 1
    return churn
  } catch {
    return {}
  }
}

/** How often a feature's terms appear inside each file — feeds featureScope. */
export function contentHits(scan, query) {
  const terms = featureTerms(query)
  const hits = {}
  for (const [f, src] of Object.entries(scan.contents)) {
    const lower = src.toLowerCase().replace(/[\s_-]+/g, '')
    let n = 0
    for (const t of terms) {
      if (t.length < 4) continue
      let at = lower.indexOf(t)
      while (at !== -1 && n < 50) {
        n += 1
        at = lower.indexOf(t, at + t.length)
      }
    }
    if (n) hits[f] = n
  }
  return hits
}

/**
 * The whole pipeline: scan, churn, analyze, and the report text. What the
 * in-app agent's analyze_architecture tool and the CLI both call.
 */
export function analyzeProject(root, { scope = '', goal = '', feature = '', limit = 20, churnDays = 90 } = {}) {
  const scan = scanProject(root)
  const churn = gitChurn(root, churnDays)
  const analysis = analyzeGraph(scan, { churn })
  const featureResult = feature ? { query: feature, ...featureScope(scan, feature, { contentHits: contentHits(scan, feature) }) } : null
  const report = formatReport(analysis, { scope, goal, limit, feature: featureResult })
  return { scan, analysis, feature: featureResult, report }
}

/** One file's details, for an agent drilling in. */
export function describeFile(root, file) {
  const scan = scanProject(root)
  const target = toPosix(file).replace(/^\.\//, '')
  if (!scan.files.includes(target)) throw new Error(`Not a scanned source file: ${target}`)
  const analysis = analyzeGraph(scan, { churn: gitChurn(root) })
  return {
    ...analysis.perFile[target],
    imports: scan.edges.filter((e) => e.source === target).map((e) => ({ path: e.target, kind: e.kind })),
    importedBy: scan.edges.filter((e) => e.target === target).map((e) => ({ path: e.source, kind: e.kind })),
    packages: scan.external[target] ?? [],
    blastRadius: blastRadius(scan, target),
    pullsIn: dependenciesOf(scan, target).length,
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
      else {
        out[a.slice(2)] = next
        i += 1
      }
    } else out._.push(a)
  }
  return out
}

const HELP = `Sleipnir Architecture CLI

  node .sleipnir/analyze.mjs report  --root . [--scope <dir>] [--goal "<text>"] [--feature "<words>"] [--limit N] [--json]
  node .sleipnir/analyze.mjs file    --root . <path>
  node .sleipnir/analyze.mjs feature --root . "<words>"

report: the project's import graph as numbers — fan-in ("in": files importing it),
fan-out ("out": files it imports), cycles, upward imports, hubs, hotspots,
unreferenced files. --feature also finds the files that make up a feature.`

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const [command, arg] = args._
  const root = path.resolve(typeof args.root === 'string' ? args.root : '.')
  try {
    if (command === 'report') {
      const result = analyzeProject(root, {
        scope: typeof args.scope === 'string' ? args.scope : '',
        goal: typeof args.goal === 'string' ? args.goal : '',
        feature: typeof args.feature === 'string' ? args.feature : '',
        limit: Number(args.limit) || 20,
      })
      process.stdout.write(args.json ? JSON.stringify({ summary: result.analysis.summary, analysis: result.analysis, feature: result.feature }, null, 2) + '\n' : result.report)
    } else if (command === 'file' && arg) {
      process.stdout.write(JSON.stringify(describeFile(root, arg), null, 2) + '\n')
    } else if (command === 'feature' && arg) {
      const scan = scanProject(root)
      process.stdout.write(JSON.stringify(featureScope(scan, arg, { contentHits: contentHits(scan, arg) }), null, 2) + '\n')
    } else {
      process.stdout.write(HELP + '\n')
      if (command) process.exitCode = 1
    }
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : e}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
