// Sleipnir graph core — pure dependency-graph analysis. No imports at all, so
// it runs anywhere: in the app's renderer (the Planning graph's Health view),
// in Electron's main process (the in-app agent's analyze_architecture tool),
// and vendored into projects as `.sleipnir/graphCore.mjs` beside
// `.sleipnir/analyze.mjs` (the CLI terminal agents run for /optimize).
//
// One implementation on purpose: the numbers the human sees on the graph and
// the numbers the AI reasons over must be the same numbers, and the AI never
// estimates them.
//
// Input is a plain graph — files plus "source imports target" edges — with
// optional extras the scanner can fill in (line counts, edge kinds, external
// packages, git churn). Every analysis degrades gracefully without them.

// ── Roles and layers ───────────────────────────────────────────────────────
//
// A file's role is guessed from its path and name, across languages. Roles
// are ranked into layers, low to high; an import from a LOWER layer into a
// HIGHER one (a util importing a page, a store importing a component) points
// the wrong way — the low layer now depends on everything the high one does.

const ROLE_RANK = { types: 0, util: 1, data: 2, logic: 3, component: 4, page: 5, entry: 6 }

/** Path tokens: directories and file name split on separators and camelCase, lowercased. */
export function tokensOf(path) {
  return path
    .replace(/\.[^./]+$/, '')
    .split(/[/\\._\-\s]+/)
    .flatMap((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' '))
    .map((t) => t.toLowerCase())
    .filter(Boolean)
}

export function roleOf(path) {
  const p = path.replace(/\\/g, '/')
  const lower = p.toLowerCase()
  const name = p.slice(p.lastIndexOf('/') + 1)
  const base = name.replace(/\.[^.]+$/, '')
  if (/(^|\/)(__tests__|tests?|spec|e2e)\//.test(lower) || /\.(test|spec|bench)\.[^.]+$/.test(lower) || /_test\.go$/.test(lower) || /(^|\/)test_[^/]+\.py$/.test(lower)) return 'test'
  if (/\.config\.[^.]+$/.test(lower) || /(^|\/)(setup|conftest)\.[^.]+$/.test(lower) || /^(tsconfig|vite|vitest|eslint|webpack|rollup|babel|jest|tailwind|postcss)/.test(name.toLowerCase())) return 'config'
  if (/\.d\.[mc]?ts$/.test(lower) || /(^|\/)types?(\.|\/)/.test(lower) || /(^|\/)(interfaces?|models?\/types)\//.test(lower) || /^i[A-Z]\w*\.[jt]sx?$/.test(name)) return 'types'
  // The app's own start file: main/index at the project root or directly in src/.
  if (/^(src\/)?(main|index)\.(tsx?|jsx?|mjs|cjs)$/.test(lower)) return 'entry'
  if (/(^|\/)(main\.(go|rs|py)|lib\.rs|__main__\.py|app\.py|manage\.py|wsgi\.py|asgi\.py)$/.test(lower) || /(^|\/)cmd\/[^/]+\/main\.go$/.test(lower) || /^electron\/(main|preload)\.c?js$/.test(lower)) return 'entry'
  // The app shell and route tables sit above every page.
  if (/^(src\/)?App\.(tsx|jsx|vue|svelte)$/.test(p) || /(^|\/)(router|routes)\.[jt]sx?$/.test(p)) return 'entry'
  // Pages: a pages/routes/screens folder, Next's app/**/page.tsx, or a Page/Screen name.
  // Not "View": in MVVM codebases a View is an ordinary component.
  if (/(^|\/)(pages|routes|screens)\//.test(lower) && /\.(tsx|jsx|vue|svelte)$/.test(lower)) return 'page'
  if (/(^|\/)app\/(.+\/)?page\.(tsx|jsx)$/.test(lower)) return 'page'
  if (/(Page|Screen)$/.test(base) && /\.(tsx|jsx|vue|svelte)$/.test(lower)) return 'page'
  if (/(ViewModel|Controller|Presenter|Handler|Resolver)$/.test(base) || /^use[A-Z]/.test(base) || /(^|\/)(hooks?|controllers?|handlers?|viewmodels?|resolvers?)\//.test(lower)) return 'logic'
  if (/(^|\/)(api|services?|db|database|repositor(y|ies)|stores?|state|models?|data|dal|clients?)\//.test(lower) || /(Store|Service|Repository|Client|Api|Model|Slice)$/.test(base)) return 'data'
  if (/(^|\/)(utils?|lib|libs|helpers?|shared|common|core|internal\/pkg)\//.test(lower) || /(utils?|helpers?)$/i.test(base)) return 'util'
  // Components are JSX/SFC files; a plain .ts beside them is a helper.
  if (/\.(tsx|jsx|vue|svelte)$/.test(lower)) return 'component'
  // Unknown: no layer. Guessing one (it used to default to "util", the lowest)
  // turned every import such a file made into a false "upward import".
  return 'module'
}

export function layerOf(role) {
  return ROLE_RANK[role] ?? null
}

// ── Building blocks ────────────────────────────────────────────────────────

/** Edges that exist at runtime — type-only imports are erased and can't form a real cycle or pull in code. */
function isRuntime(e) {
  return e.kind !== 'type'
}

function adjacency(files, edges, keep = () => true) {
  const out = new Map(files.map((f) => [f, new Set()]))
  const inn = new Map(files.map((f) => [f, new Set()]))
  for (const e of edges) {
    if (e.source === e.target || !keep(e) || !out.has(e.source) || !out.has(e.target)) continue
    out.get(e.source).add(e.target)
    inn.get(e.target).add(e.source)
  }
  return { out, inn }
}

/** Tarjan's strongly connected components, iteratively (deep graphs would overflow recursion). */
function stronglyConnected(files, out) {
  let index = 0
  const idx = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const sccs = []
  for (const start of files) {
    if (idx.has(start)) continue
    const work = [[start, [...out.get(start)], 0]]
    idx.set(start, index)
    low.set(start, index)
    index += 1
    stack.push(start)
    onStack.add(start)
    while (work.length) {
      const frame = work[work.length - 1]
      const [v, next] = frame
      if (frame[2] < next.length) {
        const w = next[frame[2]]
        frame[2] += 1
        if (!idx.has(w)) {
          idx.set(w, index)
          low.set(w, index)
          index += 1
          stack.push(w)
          onStack.add(w)
          work.push([w, [...out.get(w)], 0])
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), idx.get(w)))
        }
      } else {
        work.pop()
        if (work.length) {
          const parent = work[work.length - 1][0]
          low.set(parent, Math.min(low.get(parent), low.get(v)))
        }
        if (low.get(v) === idx.get(v)) {
          const comp = []
          let w
          do {
            w = stack.pop()
            onStack.delete(w)
            comp.push(w)
          } while (w !== v)
          if (comp.length > 1) sccs.push(comp)
        }
      }
    }
  }
  return sccs
}

/** The shortest loop through `start` inside a strongly connected component, as "a → b → c → a". */
function sampleCycle(comp, out, start = [...comp].sort()[0]) {
  const inComp = new Set(comp)
  const prev = new Map([[start, null]])
  const queue = [start]
  while (queue.length) {
    const v = queue.shift()
    for (const w of out.get(v)) {
      if (!inComp.has(w)) continue
      if (w === start) {
        const path = [start]
        for (let x = v; x !== start; x = prev.get(x)) path.splice(1, 0, x)
        return [...path, start]
      }
      if (!prev.has(w)) {
        prev.set(w, v)
        queue.push(w)
      }
    }
  }
  return [...comp, comp[0]]
}

function reach(startNodes, next) {
  const seen = new Map()
  const queue = startNodes.map((s) => [s, 0])
  for (const s of startNodes) seen.set(s, 0)
  while (queue.length) {
    const [v, d] = queue.shift()
    for (const w of next.get(v) ?? []) {
      if (seen.has(w)) continue
      seen.set(w, d + 1)
      queue.push([w, d + 1])
    }
  }
  return seen
}

// Packages that weigh enough to matter on a page's first load. A static import
// of one on the path from an entry point is worth a second look.
// Packages large enough (roughly 100 KB+ minified, or a native runtime) that
// loading one before it's needed shows in startup time. Small single-purpose
// packages — d3-force-3d is 12 KB — don't belong here.
const HEAVY_PACKAGES = [
  'three', '@react-three/fiber', '@react-three/drei', 'monaco-editor', '@monaco-editor/react', 'd3',
  'lodash', 'moment', 'chart.js', 'recharts', 'echarts', 'plotly.js', 'xlsx', 'pdfjs-dist', '@tensorflow/tfjs',
  'firebase', 'aws-sdk', 'mapbox-gl', 'leaflet', 'highlight.js', 'katex', 'mermaid', 'codemirror', '@codemirror/view',
  'pandas', 'numpy', 'tensorflow', 'torch', 'matplotlib',
]

// ── The analysis ───────────────────────────────────────────────────────────

/**
 * Everything the Health view, the Health panel and /optimize read.
 *
 * graph: {
 *   files: string[]
 *   edges: { source, target, kind?: 'static' | 'dynamic' | 'type' }[]
 *   lines?: { [path]: number }
 *   external?: { [path]: string[] }       packages a file imports
 *   reexports?: { [path]: number }        `export … from` count (barrels)
 *   entries?: string[]                    known entry points (index.html, package.json)
 * }
 * options: { churn?: { [path]: number } }  commits touching each file, recent window
 */
export function analyzeGraph(graph, { churn = null } = {}) {
  const files = graph.files
  const edges = graph.edges
  const lines = graph.lines ?? {}
  const all = adjacency(files, edges)
  const runtime = adjacency(files, edges, isRuntime)
  const roles = Object.fromEntries(files.map((f) => [f, roleOf(f)]))

  // Cycles: runtime only — a type-only loop is erased at compile time.
  const sccs = stronglyConnected(files, runtime.out)
  const cycleOf = new Map()
  sccs.forEach((comp, i) => comp.forEach((f) => cycleOf.set(f, i)))
  // A tangle of 3+ files usually hides several separate loops (a short one
  // nested in a long one); each needs its own fix, so up to 3 are listed.
  const cycles = sccs
    .map((comp) => {
      const sorted = comp.sort()
      const loops = []
      const seenLoops = new Set()
      for (const start of [...sorted].sort((a, b) => sampleCycle(comp, runtime.out, a).length - sampleCycle(comp, runtime.out, b).length)) {
        const loop = sampleCycle(comp, runtime.out, start)
        const key = [...new Set(loop)].sort().join('|')
        if (seenLoops.has(key)) continue
        seenLoops.add(key)
        loops.push(loop)
        if (loops.length === 3) break
      }
      return { files: sorted, loop: loops[0], loops }
    })
    .sort((a, b) => b.files.length - a.files.length)

  // Entry points: declared ones, plus files whose role says so.
  const entries = new Set((graph.entries ?? []).filter((f) => all.out.has(f)))
  for (const f of files) if (roles[f] === 'entry') entries.add(f)

  // What is loaded eagerly from an entry: static edges only. A dynamic import
  // is a split point; everything only behind one loads on demand.
  const staticOut = adjacency(files, edges, (e) => e.kind !== 'type' && e.kind !== 'dynamic').out
  const eager = reach([...entries], staticOut)

  const perFile = {}
  for (const f of files) {
    const fanIn = all.inn.get(f).size
    const fanOut = all.out.get(f).size
    perFile[f] = {
      path: f,
      role: roles[f],
      fanIn,
      fanOut,
      // Martin's instability: 0 = everything depends on it (keep it stable),
      // 1 = it depends on everything and nothing on it (free to change).
      instability: fanIn + fanOut === 0 ? 0 : Math.round((fanOut / (fanIn + fanOut)) * 100) / 100,
      lines: lines[f] ?? null,
      cycle: cycleOf.has(f) ? cycleOf.get(f) : null,
      eager: entries.size > 0 ? eager.has(f) : null,
      churn: churn ? churn[f] ?? 0 : null,
    }
  }

  const measured = files.filter((f) => roles[f] !== 'test' && roles[f] !== 'config')
  const byFanIn = [...measured].sort((a, b) => perFile[b].fanIn - perFile[a].fanIn || a.localeCompare(b))
  const byFanOut = [...measured].sort((a, b) => perFile[b].fanOut - perFile[a].fanOut || a.localeCompare(b))
  const pct = (sorted, key, q) => (sorted.length ? perFile[sorted[Math.floor(sorted.length * q)]][key] : 0)
  const hubLine = Math.max(5, pct(byFanIn, 'fanIn', 0.05))
  const fanOutLine = Math.max(8, pct(byFanOut, 'fanOut', 0.05))

  const hubs = byFanIn.filter((f) => perFile[f].fanIn >= hubLine)
  const orchestrators = byFanOut.filter((f) => perFile[f].fanOut >= fanOutLine)
  // Both at once, in a big file: the "god file" in the middle of everything.
  const godFiles = measured
    .filter((f) => perFile[f].fanIn >= Math.max(4, hubLine / 2) && perFile[f].fanOut >= Math.max(6, fanOutLine / 2) && (perFile[f].lines ?? 400) >= 300)
    .sort((a, b) => perFile[b].fanIn * perFile[b].fanOut - perFile[a].fanIn * perFile[a].fanOut)

  // Dead: nothing imports it, it isn't an entry, a test, config or type declarations.
  // Package markers (__init__.py) are loaded by the language, not imported by path.
  // Files marked `sleipnir-keep` are unreferenced on purpose.
  const keep = new Set(graph.keep ?? [])
  const dead = measured
    .filter((f) => perFile[f].fanIn === 0 && !entries.has(f) && !keep.has(f) && roles[f] !== 'types' && roles[f] !== 'entry' && !/(^|\/)__init__\.py$/.test(f))
    .sort()

  // What else goes with each one: files only it (or other unused files) uses,
  // which turn up unused once it's deleted.
  const unusedSet = new Set(dead)
  for (let grew = true; grew; ) {
    grew = false
    for (const f of measured) {
      if (unusedSet.has(f) || entries.has(f) || keep.has(f) || roles[f] === 'entry') continue
      const importers = [...all.inn.get(f)].filter((s) => roles[s] !== 'test')
      if (importers.length && importers.every((s) => unusedSet.has(s))) {
        unusedSet.add(f)
        grew = true
      }
    }
  }
  const unusedWith = {}
  for (const root of dead) {
    const only = [...reach([root], all.out).keys()].filter((f) => f !== root && unusedSet.has(f) && !dead.includes(f)).sort()
    if (only.length) unusedWith[root] = only
  }

  // Pages are endpoints: something importing a page usually wants a piece of it.
  const reusedPages = measured
    .filter((f) => roles[f] === 'page' && [...all.inn.get(f)].some((s) => roles[s] !== 'entry' && roles[s] !== 'test' && roles[s] !== 'page'))
    .map((f) => ({ path: f, importedBy: [...all.inn.get(f)].filter((s) => roles[s] !== 'test') }))

  // Imports pointing up the layers.
  // Type-only imports are left out: describing a shape isn't depending on it at runtime.
  const violations = []
  for (const e of edges) {
    if (e.source === e.target || e.kind === 'type' || !perFile[e.source] || !perFile[e.target]) continue
    const from = roles[e.source]
    const to = roles[e.target]
    const a = layerOf(from)
    const b = layerOf(to)
    if (a === null || b === null || from === 'entry') continue
    if (a < b) violations.push({ source: e.source, target: e.target, fromRole: from, toRole: to })
  }

  // Barrels: files that mostly re-export, imported widely — they defeat
  // tree-shaking and turn one import into many.
  const reexports = graph.reexports ?? {}
  const barrels = measured
    .filter((f) => (reexports[f] ?? 0) >= 3 && (reexports[f] ?? 0) >= perFile[f].fanOut * 0.6)
    .map((f) => ({ path: f, reexports: reexports[f], importedBy: perFile[f].fanIn }))
    .sort((a, b) => b.importedBy - a.importedBy)

  // Misplaced: a file whose connections mostly live in another folder.
  const dirOf = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.')
  // Judged by who USES it (its importers): what a file imports says what it
  // depends on, not where it belongs — a board component importing model code
  // is normal, a helper only ever used from another folder wants to live there.
  const misplaced = []
  for (const f of measured) {
    // Shared layers (utils, data, types) are MEANT to be used from elsewhere.
    if (!['component', 'logic', 'module'].includes(roles[f])) continue
    const neighbours = [...all.inn.get(f)].filter((n) => roles[n] !== 'test')
    if (neighbours.length < 3) continue
    const counts = new Map()
    for (const n of neighbours) counts.set(dirOf(n), (counts.get(dirOf(n)) ?? 0) + 1)
    const own = counts.get(dirOf(f)) ?? 0
    const [bestDir, best] = [...counts].filter(([d]) => d !== dirOf(f)).sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (bestDir && best / neighbours.length >= 0.6 && own / neighbours.length <= 0.2) {
      misplaced.push({ path: f, suggestedDir: bestDir, share: Math.round((best / neighbours.length) * 100) / 100 })
    }
  }

  // Heavy packages loaded eagerly from an entry point.
  const heavy = []
  for (const [f, pkgs] of Object.entries(graph.external ?? {})) {
    if (!perFile[f] || perFile[f].eager === false) continue
    for (const pkg of pkgs) {
      if (HEAVY_PACKAGES.some((h) => pkg === h || pkg.startsWith(`${h}/`))) heavy.push({ path: f, package: pkg, eager: perFile[f].eager })
    }
  }

  // Hotspots: changed often AND big or widely imported — where bugs cluster
  // (Tornhill's churn × complexity, with fan-in standing in for reach).
  let hotspots = []
  if (churn) {
    // Two or more changes, and only the top of the ranking: with a short
    // history every file was touched once, and a list of everything says nothing.
    const ranked = measured
      .filter((f) => (churn[f] ?? 0) >= 2)
      .map((f) => ({
        path: f,
        churn: churn[f],
        fanIn: perFile[f].fanIn,
        score: Math.round(churn[f] * Math.log2(2 + perFile[f].fanIn) * Math.sqrt(Math.max(1, (perFile[f].lines ?? 100) / 100)) * 10) / 10,
      }))
      .sort((a, b) => b.score - a.score)
    // A short list to act on: the top 5%, between 5 and 15 files.
    hotspots = ranked.slice(0, Math.min(15, Math.max(5, Math.ceil(measured.length * 0.05))))
  }

  return {
    summary: {
      files: files.length,
      edges: edges.length,
      cycles: cycles.length,
      filesInCycles: cycleOf.size,
      dead: dead.length,
      violations: violations.length,
      hubs: hubs.length,
      entries: entries.size,
    },
    perFile,
    entries: [...entries].sort(),
    cycles,
    hubs,
    orchestrators,
    godFiles,
    dead,
    unusedWith,
    reusedPages,
    violations,
    barrels,
    misplaced,
    heavy,
    hotspots,
  }
}

// ── Questions about one file ───────────────────────────────────────────────

/** Everything that depends on `path`, directly or not, with its distance — its blast radius. */
export function blastRadius(graph, path) {
  const { inn } = adjacency(graph.files, graph.edges)
  const seen = reach([path], inn)
  seen.delete(path)
  return [...seen].map(([file, distance]) => ({ path: file, distance })).sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path))
}

/** Everything `path` pulls in, directly or not. */
export function dependenciesOf(graph, path) {
  const { out } = adjacency(graph.files, graph.edges, isRuntime)
  const seen = reach([path], out)
  seen.delete(path)
  return [...seen].map(([file, distance]) => ({ path: file, distance })).sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path))
}

// ── Finding a feature ──────────────────────────────────────────────────────
//
// "/optimize my right click menu" names a FEATURE, not a file. Seed files are
// found by name (path tokens) and, when contents are available, by what the
// code says (handlers, strings); then the scope grows one hop along imports
// (what it uses) and importers (where it is mounted). The result is the small
// sub-graph an agent should read instead of the whole repository.

const STOPWORDS = new Set(['my', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'to', 'and', 'feature', 'features', 'our', 'this', 'that', 'page', 'code', 'make', 'faster', 'optimize', 'improve', 'with', 'is', 'it', 'its', 'lag', 'slow'])
const SYNONYMS = {
  'right click': ['contextmenu', 'context menu', 'oncontextmenu'],
  'rightclick': ['contextmenu', 'context menu'],
  'popup': ['popover', 'modal', 'dialog'],
  'modal': ['dialog'],
  'dropdown': ['select', 'menu', 'popover'],
  'login': ['auth', 'signin', 'sign in'],
  'signup': ['register', 'sign up'],
  'search': ['filter', 'query'],
  'cart': ['basket', 'checkout'],
  'graph': ['canvas', 'chart'],
}

/** The words of a feature request worth searching for, with phrases, joins and synonyms. */
export function featureTerms(query) {
  const words = String(query).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w && !STOPWORDS.has(w))
  const terms = new Set(words.filter((w) => w.length > 2))
  for (let i = 0; i < words.length - 1; i += 1) {
    const phrase = `${words[i]} ${words[i + 1]}`
    terms.add(words[i] + words[i + 1])
    for (const s of SYNONYMS[phrase] ?? []) terms.add(s.replace(/\s+/g, ''))
  }
  for (const w of words) for (const s of SYNONYMS[w] ?? []) terms.add(s.replace(/\s+/g, ''))
  return [...terms]
}

/**
 * The files that make up a feature.
 * contentHits (optional): { [path]: number } — how often the feature's terms
 * appear inside each file (the scanner fills this by reading files).
 */
export function featureScope(graph, query, { contentHits = {}, max = 15 } = {}) {
  const terms = featureTerms(query)
  const { out, inn } = adjacency(graph.files, graph.edges)
  // Two kinds of evidence, kept apart on purpose:
  //   by NAME    — the file is the feature (menu/ContextMenu.tsx);
  //   by CONTENT — the file only mentions it (App.tsx holds `setMenu`).
  // The scope grows only from the first kind. Growing from a mention made
  // App.tsx drag in every unrelated panel it renders.
  const named = new Map()
  const mentions = new Map()
  for (const f of graph.files) {
    const role = roleOf(f)
    if (role === 'test' || role === 'config') continue
    const toks = tokensOf(f)
    const joined = toks.join('')
    let s = 0
    for (const t of terms) {
      if (toks.includes(t)) s += 3
      else if (joined.includes(t)) s += 2
    }
    if (s > 0) named.set(f, s + Math.min(3, contentHits[f] ?? 0))
    else if ((contentHits[f] ?? 0) >= 2) mentions.set(f, contentHits[f])
  }
  const top = Math.max(0, ...named.values())
  const core = [...named].filter(([, s]) => s >= Math.max(2, top / 3)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([f]) => f)

  const picked = new Map(core.map((f) => [f, { path: f, distance: 0, why: 'is the feature' }]))
  for (const [f] of [...mentions].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    if (!picked.has(f)) picked.set(f, { path: f, distance: 1, why: 'uses the feature' })
  }
  for (const f of core) {
    for (const n of out.get(f) ?? []) if (!picked.has(n)) picked.set(n, { path: n, distance: 1, why: `used by ${f}` })
    for (const n of inn.get(f) ?? []) if (!picked.has(n)) picked.set(n, { path: n, distance: 1, why: `mounts ${f}` })
  }
  const weight = (e) => (named.get(e.path) ?? 0) + Math.min(4, mentions.get(e.path) ?? 0) / 2
  const rank = (e) => e.distance * 10 - weight(e) + (roleOf(e.path) === 'util' || roleOf(e.path) === 'types' ? 3 : 0)
  const files = [...picked.values()].filter((e) => roleOf(e.path) !== 'test').sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path)).slice(0, max)
  const kept = new Set(files.map((e) => e.path))
  return {
    terms,
    seeds: core,
    files,
    edges: graph.edges.filter((e) => kept.has(e.source) && kept.has(e.target)),
  }
}

// ── The report an agent reads ──────────────────────────────────────────────

/**
 * A compact Markdown report — what /optimize hands the AI instead of source
 * code. Capped per section (`limit`) so it stays a few thousand tokens on any
 * project. `scope` limits the listed files to a folder (metrics are still
 * computed on the whole project, so fan-in counts importers from outside it).
 */
export function formatReport(analysis, { scope = '', goal = '', limit = 20, feature = null } = {}) {
  const inScope = (f) => !scope || f === scope || f.startsWith(scope.replace(/\/?$/, '/'))
  const pf = analysis.perFile
  const fmt = (f) => {
    const m = pf[f]
    if (!m) return f
    const bits = [`in ${m.fanIn}`, `out ${m.fanOut}`]
    if (m.lines != null) bits.push(`${m.lines} lines`)
    if (m.churn) bits.push(`${m.churn} changes`)
    return `${f} (${bits.join(', ')}, ${m.role})`
  }
  const section = (title, items, render) => {
    const list = items.slice(0, limit)
    if (!list.length) return ''
    const more = items.length > list.length ? `\n- …and ${items.length - list.length} more` : ''
    return `\n### ${title} (${items.length})\n${list.map((x) => `- ${render(x)}`).join('\n')}${more}\n`
  }
  const s = analysis.summary
  let out = `# Architecture report${scope ? ` — ${scope}` : ''}${goal ? `\nGoal: ${goal}` : ''}\n`
  out += `\n${s.files} files, ${s.edges} imports, ${s.entries} entry points. ${s.cycles} import cycles (${s.filesInCycles} files), ${s.violations} upward imports, ${s.dead} unreferenced files.\n`
  out += `Counts: "in" = files importing it (fan-in), "out" = files it imports (fan-out).\n`
  if (feature) {
    out += `\n## Feature: ${feature.query}\nSearch terms: ${feature.terms.join(', ')}\n`
    out += feature.files.map((e) => `- ${fmt(e.path)}${e.distance ? ` — ${e.why}` : ' — core'}`).join('\n') + '\n'
  }
  out += section('Import cycles', analysis.cycles.filter((c) => c.files.some(inScope)), (c) => (c.loops ?? [c.loop]).map((l) => l.join(' → ')).join('\n  also: '))
  out += section('Hubs (many files depend on these — keep them small and stable)', analysis.hubs.filter(inScope), fmt)
  out += section('God files (central AND import a lot)', analysis.godFiles.filter(inScope), fmt)
  out += section('Orchestrators (import the most)', analysis.orchestrators.filter(inScope), fmt)
  out += section('Upward imports (a lower layer importing a higher one)', analysis.violations.filter((v) => inScope(v.source)), (v) => `${v.source} (${v.fromRole}) → ${v.target} (${v.toRole})`)
  out += section('Pages imported by non-pages (reusable parts trapped in a page)', analysis.reusedPages.filter((p) => inScope(p.path)), (p) => `${p.path} ← ${p.importedBy.join(', ')}`)
  out += section('Barrels (mostly re-exports, widely imported)', analysis.barrels.filter((b) => inScope(b.path)), (b) => `${b.path} (${b.reexports} re-exports, imported by ${b.importedBy})`)
  out += section('Heavy packages loaded eagerly', analysis.heavy.filter((h) => inScope(h.path)), (h) => `${h.path} imports ${h.package}`)
  out += section('Possibly misplaced (most connections live in another folder)', analysis.misplaced.filter((m) => inScope(m.path)), (m) => `${m.path} → ${m.suggestedDir} (${Math.round(m.share * 100)}% of its connections)`)
  out += section('Hotspots (changed often, and big or widely imported)', analysis.hotspots.filter((h) => inScope(h.path)), (h) => `${h.path} (score ${h.score}: ${h.churn} changes, in ${h.fanIn})`)
  out += section('Unreferenced (nothing imports these; check before deleting)', analysis.dead.filter(inScope), (f) => {
    const only = analysis.unusedWith?.[f] ?? []
    return only.length ? `${f} (+ ${only.length} only it uses: ${only.join(', ')})` : f
  })
  return out
}
