// Scans src/01_research and src/04_validation for docs and emits per-map
// graph JSON consumed by src/00_planning/graph/combine.ts. Re-run with
// `npm run generate:graph` whenever those folders' contents change.
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { isSourceFile } from './source-extensions.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const OUT_DIR = path.join(SRC, '00_planning', 'graph', 'generated')

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (isSourceFile(entry.name)) files.push(full)
  }
  return files
}

// Only TS/TSX import specifiers resolve to another node's id (see
// resolveImport below), so only that extension pair is worth stripping from
// the id itself — other languages keep their extension as part of the id.
function toId(absPath) {
  return path.relative(SRC, absPath).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '')
}

// Purely cosmetic — strips whatever extension a file has for its display label.
function stripExt(name) {
  return name.replace(/\.[^./]+$/, '')
}

// Matches both `import ... from '...'` and `export ... from '...'`
// (re-exports, e.g. `export type { FrameProps } from './iFrame'`) — a plain
// `import`-only regex misses these, undercounting real dependency edges.
function extractImportSpecifiers(content) {
  const importRe = /(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/g
  const specs = []
  let m
  while ((m = importRe.exec(content))) specs.push(m[1])
  return specs
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

export { walk, toId, extractImportSpecifiers, resolveImport, ROOT, SRC }

// research/ and validation/ can contain this app's own page implementation
// (e.g. ResearchView.tsx) alongside the docs they display — that's source
// code, not a research doc, so it's excluded here specifically.
const CODE_EXT_RE = /\.(tsx?|jsx?|mjs|cjs)$/

function buildDocGraph(scanDir, mapName) {
  const files = walk(scanDir).filter((f) => !CODE_EXT_RE.test(f))
  const nodes = files.map((f) => ({
    id: path.relative(SRC, f).replace(/\\/g, '/'),
    label: stripExt(path.basename(f)),
    kind: 'built',
    map: mapName,
    filePath: path.relative(ROOT, f).replace(/\\/g, '/'),
    type: 'doc',
  }))
  return { nodes, edges: [] }
}

// Only runs when this file is executed directly (`node tools/generate-graph.mjs`,
// which is what regenerateGraph() in sleipnir-backend.mjs spawns).
if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const research = buildDocGraph(path.join(SRC, '01_research'), 'research')
  const validation = buildDocGraph(path.join(SRC, '04_validation'), 'validation')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const write = (name, data) => {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ nodes: data.nodes, edges: data.edges }, null, 2))
  }
  write('research', research)
  write('validation', validation)

  console.log(`research:    ${research.nodes.length} nodes, ${research.edges.length} edges`)
  console.log(`validation:  ${validation.nodes.length} nodes, ${validation.edges.length} edges`)
}
