// Scans source folders for import relationships and emits per-map graph JSON
// consumed by src/00_planning/graph/combine.ts. Re-run with `npm run generate:graph`
// whenever components/prototypes are added, renamed, or rewired.
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { isSourceFile } from './source-extensions.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const OUT_DIR = path.join(SRC, '00_planning', 'graph', 'generated')

const SKIP_RE = /\.(stories|test|spec)\.tsx?$/

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

function typeForId(id) {
  if (id.includes('01_atoms')) return 'atom'
  if (id.includes('02_molecules')) return 'molecule'
  if (id.includes('03_organisms')) return 'organism'
  if (id.includes('04_templates')) return 'template'
  if (id.includes('05_pages')) return 'page'
  if (id.includes('00_themes')) return 'theme'
  if (id.startsWith('03_prototypes')) return 'prototype'
  return 'other'
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

// Reused by tools/refactor-engine.mjs to re-scan the same source tree these
// functions already know how to walk/parse — exported so importing this
// module doesn't require re-running (or duplicating) the scan logic below.
export { walk, toId, typeForId, extractImportSpecifiers, resolveImport, ROOT, SRC }

function buildCodeGraph(scanDir, mapName) {
  const files = walk(scanDir).filter((f) => !SKIP_RE.test(f))
  const nodes = files.map((f) => {
    const id = toId(f)
    return {
      id,
      label: stripExt(path.basename(f)),
      kind: 'built',
      map: mapName,
      filePath: path.relative(ROOT, f).replace(/\\/g, '/'),
      type: typeForId(id),
    }
  })
  const idSet = new Set(nodes.map((n) => n.id))
  const edges = []
  for (const f of files) {
    const fromId = toId(f)
    const content = fs.readFileSync(f, 'utf8')
    for (const spec of extractImportSpecifiers(content)) {
      const resolved = resolveImport(f, spec)
      if (!resolved) continue
      const targetId = toId(resolved)
      if (targetId === fromId || !idSet.has(targetId)) continue
      edges.push({ source: fromId, target: targetId, kind: 'borrows' })
    }
  }
  return { nodes, edges, files }
}

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
// which is what regenerateGraph() in sleipnir-backend.mjs spawns) — never on
// import, so tools/refactor-engine.mjs can import the functions above for a
// fresh in-process scan without triggering a graph regen/file write as a
// side effect.
if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const dsm = buildCodeGraph(path.join(SRC, '02_components'), 'dsm')
  const prototypes = buildCodeGraph(path.join(SRC, '03_prototypes'), 'prototypes')

  // Cross-map borrow edges: prototypes importing from components. The borrowed
  // component node is pulled into the prototypes graph (tagged with its true
  // home map) so the Prototypes view can show what it leans on.
  for (const f of prototypes.files) {
    const fromId = toId(f)
    const content = fs.readFileSync(f, 'utf8')
    for (const spec of extractImportSpecifiers(content)) {
      const resolved = resolveImport(f, spec)
      if (!resolved) continue
      const targetId = toId(resolved)
      if (!targetId.startsWith('02_components/')) continue
      const dsmNode = dsm.nodes.find((n) => n.id === targetId)
      if (!dsmNode) continue
      if (!prototypes.nodes.some((n) => n.id === targetId)) {
        prototypes.nodes.push({ ...dsmNode, map: 'dsm' })
      }
      prototypes.edges.push({ source: fromId, target: targetId, kind: 'borrows' })
    }
  }

  const research = buildDocGraph(path.join(SRC, '01_research'), 'research')
  const validation = buildDocGraph(path.join(SRC, '04_validation'), 'validation')

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const write = (name, data) => {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ nodes: data.nodes, edges: data.edges }, null, 2))
  }
  write('dsm', dsm)
  write('prototypes', prototypes)
  write('research', research)
  write('validation', validation)

  console.log(`dsm:         ${dsm.nodes.length} nodes, ${dsm.edges.length} edges`)
  console.log(`prototypes:  ${prototypes.nodes.length} nodes, ${prototypes.edges.length} edges`)
  console.log(`research:    ${research.nodes.length} nodes, ${research.edges.length} edges`)
  console.log(`validation:  ${validation.nodes.length} nodes, ${validation.edges.length} edges`)
}
