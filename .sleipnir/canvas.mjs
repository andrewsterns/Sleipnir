#!/usr/bin/env node
// Sleipnir Canvas CLI — standalone, vendored copy.
//
// COPIED into each project as `.sleipnir/canvas.mjs` by Sleipnir's scaffolder
// (tools/agentSkills/scaffold.mjs) and meant to be committed, exactly like
// `.sleipnir/plan.mjs`: an AI agent (Claude Code, Codex, Gemini…) or a teammate
// without Sleipnir can design onto the project's Canvas boards with nothing but
// Node. So: `node:` builtins only, no install, no absolute paths.
//
// It is also the ONE implementation — Sleipnir's in-app agent tool
// (electron/agent/tools/canvas.cjs) imports buildOnBoard from this very file,
// so `/frame` typed in the app and `/frame` typed in a terminal agent produce
// the same board content.
//
// What it does: turns a small, forgiving JSON SPEC (frames, stacks, text,
// shapes, images) into real Canvas nodes and appends them to a board in
// `.components/.boards/`. Sleipnir picks the change up live. A build can ask
// to become a COMPONENT (or an SVG component): the board carries the request,
// and Sleipnir — which owns the emitters — promotes it and writes the code
// file into `.components/` the next time the board is open.
//
// Usage:
//   node .sleipnir/canvas.mjs list-boards --root .
//   node .sleipnir/canvas.mjs build --root . --spec <file|-> [--board <name|id>] \
//       [--component <Name>] [--svg]
//   node .sleipnir/canvas.mjs spec-help

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const COMPONENTS_DIR = '.components'
const LEGACY_DIR = '.canvas'
const SCHEMA_VERSION = 1

// ── Spec → nodes ───────────────────────────────────────────────────────────

let counter = 0
function nextId(prefix) {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

const LAYOUTS = { vertical: 'vertical', column: 'vertical', horizontal: 'horizontal', row: 'horizontal', grid: 'grid', free: 'freeform', freeform: 'freeform' }
const ALIGNS = new Set(['start', 'center', 'end', 'stretch'])
const JUSTIFIES = new Set(['start', 'center', 'end', 'between', 'around'])

function num(v, fallback) {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** A size: a number of px, or 'fill' / 'hug'. */
function sizeOf(v) {
  if (v === 'fill' || v === 'hug') return v
  const n = num(v, undefined)
  return n === undefined ? undefined : Math.max(1, n)
}

function paddingOf(v) {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'number') return v
  if (Array.isArray(v)) {
    const [t = 0, r = t, b = t, l = r] = v.map((x) => num(x, 0))
    return t === r && r === b && b === l ? t : { top: t, right: r, bottom: b, left: l }
  }
  if (typeof v === 'object') return { top: num(v.top, 0), right: num(v.right, 0), bottom: num(v.bottom, 0), left: num(v.left, 0) }
  return num(v, undefined)
}

function padSides(p) {
  if (p === undefined) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p }
  return p
}

/** Paint: '#rrggbb' or a theme token ('bg-1', 'text-1', 'border-1'…). */
function fillsOf(spec) {
  if (spec.src) return [{ type: 'image', src: String(spec.src), scaleMode: spec.fit === 'contain' ? 'fit' : 'fill' }]
  if (spec.gradient && Array.isArray(spec.gradient.stops)) {
    return [
      {
        type: 'linear',
        angle: num(spec.gradient.angle, 180),
        stops: spec.gradient.stops.map((s, i, all) =>
          typeof s === 'string' ? { position: all.length > 1 ? i / (all.length - 1) : 0, color: s } : { position: num(s.position, 0), color: String(s.color) },
        ),
      },
    ]
  }
  if (spec.fill) return [{ type: 'solid', color: String(spec.fill), ...(spec.fillOpacity !== undefined ? { opacity: num(spec.fillOpacity, 1) } : {}) }]
  return undefined
}

function styleOf(spec, { isText = false } = {}) {
  const style = {}
  const fills = isText ? (spec.background ? [{ type: 'solid', color: String(spec.background) }] : undefined) : fillsOf(spec)
  if (fills) style.fills = fills
  if (spec.stroke) {
    const s = typeof spec.stroke === 'string' ? { color: spec.stroke } : spec.stroke
    style.stroke = { color: String(s.color ?? 'border-1'), width: num(s.width, 1), ...(s.style ? { style: s.style } : {}) }
  }
  if (spec.radius !== undefined) style.radius = num(spec.radius, 0)
  if (spec.opacity !== undefined) style.opacity = Math.min(1, Math.max(0, num(spec.opacity, 1)))
  if (spec.rotate !== undefined) style.rotate = num(spec.rotate, 0) || undefined
  if (spec.clip) style.clip = true
  if (spec.shadow) {
    const sh = typeof spec.shadow === 'object' ? spec.shadow : {}
    style.effects = [{ type: 'drop-shadow', x: num(sh.x, 0), y: num(sh.y, 4), blur: num(sh.blur, 12), color: String(sh.color ?? '#000000'), opacity: num(sh.opacity, 0.25) }]
  }
  const w = sizeOf(spec.w)
  const h = sizeOf(spec.h)
  if (w === 'fill' || w === 'hug') style.w = w
  if (h === 'fill' || h === 'hug') style.h = h
  if (spec.margin !== undefined) style.margin = paddingOf(spec.margin)
  return style
}

const TEXT_CHAR_W = 0.55

/** A rough box for text, so a 'hug' parent and the board placement have something to go on. */
function textBox(spec) {
  const size = num(spec.size, 16)
  const lines = String(spec.text ?? '').split('\n')
  const longest = Math.max(1, ...lines.map((l) => l.length))
  return { w: Math.ceil(longest * size * TEXT_CHAR_W) + 4, h: Math.ceil(lines.length * size * 1.4) }
}

function typeOf(spec) {
  const t = String(spec.type ?? (spec.text !== undefined ? 'text' : spec.children ? 'frame' : spec.src ? 'image' : 'frame')).toLowerCase()
  return { rectangle: 'rect', box: 'frame', circle: 'ellipse', oval: 'ellipse', img: 'image', stack: 'frame', group: 'frame' }[t] ?? t
}

/**
 * One spec node → one canvas node. `parentFlow` decides whether its x/y mean
 * anything: under a stack or grid the layout places it, as on the board.
 */
export function specToNode(spec, parentFlow = 'freeform') {
  if (!spec || typeof spec !== 'object') throw new Error('Each node must be an object.')
  const type = typeOf(spec)
  const placed = parentFlow === 'freeform'
  const at = { x: placed ? num(spec.x, 0) : 0, y: placed ? num(spec.y, 0) : 0 }
  const name = spec.name ? String(spec.name) : undefined

  if (type === 'text') {
    const box = textBox(spec)
    const w = sizeOf(spec.w)
    const h = sizeOf(spec.h)
    const font = {}
    if (spec.size !== undefined) font.size = num(spec.size, 16)
    if (spec.weight !== undefined) font.weight = num(spec.weight, 400)
    if (spec.mono) font.mono = true
    font.color = String(spec.color ?? 'text-1')
    if (spec.align) font.align = spec.align
    if (spec.lineHeight !== undefined) font.lineHeight = num(spec.lineHeight, 1.4)
    return {
      id: nextId('text'),
      name: name ?? String(spec.text ?? 'Text').slice(0, 32),
      kind: 'text',
      rect: { ...at, w: typeof w === 'number' ? w : box.w, h: typeof h === 'number' ? h : box.h },
      style: styleOf(spec, { isText: true }),
      text: String(spec.text ?? ''),
      font,
    }
  }

  if (type === 'rect' || type === 'ellipse' || type === 'triangle' || type === 'polygon') {
    const w = sizeOf(spec.w)
    const h = sizeOf(spec.h)
    const style = styleOf(spec)
    if (!style.fills && !style.stroke) style.fills = [{ type: 'solid', color: '#d9d9d9' }]
    return {
      id: nextId('vector'),
      name: name ?? { rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', polygon: 'Polygon' }[type],
      kind: 'vector',
      rect: { ...at, w: typeof w === 'number' ? w : 100, h: typeof h === 'number' ? h : 100 },
      style,
      shape: type === 'rect' ? 'rectangle' : type === 'ellipse' ? 'ellipse' : 'polygon',
      ...(type === 'triangle' ? { sides: 3 } : type === 'polygon' ? { sides: Math.max(3, Math.round(num(spec.sides, 5))) } : {}),
    }
  }

  if (type === 'image') {
    if (!spec.src) throw new Error('An image needs "src": a workspace path (e.g. .components/assets/hero.png) or an https: URL.')
    const w = sizeOf(spec.w)
    const h = sizeOf(spec.h)
    return {
      id: nextId('frame'),
      name: name ?? 'Image',
      kind: 'frame',
      rect: { ...at, w: typeof w === 'number' ? w : 320, h: typeof h === 'number' ? h : 200 },
      style: { ...styleOf(spec), clip: true },
      children: [],
    }
  }

  if (type !== 'frame') throw new Error(`Unknown node type "${spec.type}". Use frame, text, rect, ellipse, triangle, polygon or image.`)

  const flow = LAYOUTS[String(spec.layout ?? 'free').toLowerCase()] ?? 'freeform'
  const style = { ...styleOf(spec) }
  if (!style.fills && spec.fill === undefined && spec.transparent !== true && parentFlow === 'root') style.fills = [{ type: 'solid', color: 'bg-1' }]
  if (flow !== 'freeform') style.flow = flow
  else style.flow = 'freeform'
  if (spec.gap !== undefined) style.gap = num(spec.gap, 0)
  const padding = paddingOf(spec.padding)
  if (padding !== undefined) style.padding = padding
  if (ALIGNS.has(spec.align)) style.align = spec.align
  if (JUSTIFIES.has(spec.justify)) style.justify = spec.justify
  if (spec.wrap) style.wrap = true
  if (flow === 'grid') style.cols = Math.max(1, Math.round(num(spec.cols, 2)))

  const children = (Array.isArray(spec.children) ? spec.children : []).map((c) => specToNode(c, flow))
  const w = sizeOf(spec.w)
  const h = sizeOf(spec.h)
  const est = estimateFrame(flow, style, children)
  return {
    id: nextId('frame'),
    name: name ?? 'Frame',
    kind: 'frame',
    rect: { ...at, w: typeof w === 'number' ? w : est.w, h: typeof h === 'number' ? h : est.h },
    style,
    children,
  }
}

/** A frame's size from its children, for a frame the spec didn't size — what 'hug' would give. */
function estimateFrame(flow, style, children) {
  const pad = padSides(style.padding)
  const gap = style.gap ?? 0
  if (children.length === 0) return { w: 200 + pad.left + pad.right, h: 120 + pad.top + pad.bottom }
  const ws = children.map((c) => c.rect.w)
  const hs = children.map((c) => c.rect.h)
  if (flow === 'vertical') return { w: Math.max(...ws) + pad.left + pad.right, h: hs.reduce((a, b) => a + b, 0) + gap * (children.length - 1) + pad.top + pad.bottom }
  if (flow === 'horizontal') return { w: ws.reduce((a, b) => a + b, 0) + gap * (children.length - 1) + pad.left + pad.right, h: Math.max(...hs) + pad.top + pad.bottom }
  if (flow === 'grid') {
    const cols = style.cols ?? 2
    const rows = Math.ceil(children.length / cols)
    return { w: Math.max(...ws) * cols + gap * (cols - 1) + pad.left + pad.right, h: Math.max(...hs) * rows + gap * (rows - 1) + pad.top + pad.bottom }
  }
  return {
    w: Math.max(...children.map((c) => c.rect.x + c.rect.w)) + pad.right,
    h: Math.max(...children.map((c) => c.rect.y + c.rect.h)) + pad.bottom,
  }
}

// ── Boards on disk ─────────────────────────────────────────────────────────

function resolveSafe(root, rel) {
  const abs = path.resolve(root, rel)
  const base = path.resolve(root)
  if (abs !== base && !abs.startsWith(base + path.sep)) throw new Error(`Path escapes the project: ${rel}`)
  return abs
}

/** The board folder: `.components/.boards`, or a not-yet-migrated `.canvas/.boards`. */
function boardsDir(root) {
  const current = resolveSafe(root, COMPONENTS_DIR)
  const legacy = resolveSafe(root, LEGACY_DIR)
  const base = fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy
  return path.join(base, '.boards')
}

function readBoards(root) {
  const dir = boardsDir(root)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        return doc && doc.id && Array.isArray(doc.nodes) ? [{ file: path.join(dir, f), doc }] : []
      } catch {
        return []
      }
    })
}

export function listBoards(root) {
  return readBoards(root)
    .sort((a, b) => (b.doc.updatedAt ?? 0) - (a.doc.updatedAt ?? 0))
    .map(({ doc }) => ({ id: doc.id, name: doc.name, nodes: doc.nodes.length, updatedAt: doc.updatedAt }))
}

/**
 * Builds `spec` onto a board: the named one (id or name), else the one edited
 * most recently — the board the human has open, almost always — else a new
 * "AI designs" board. The new frame lands to the right of what's there.
 *
 * `component` asks Sleipnir to promote the result to a component (writing its
 * code into `.components/<name>/`); `svg` makes that an SVG component.
 */
export function buildOnBoard(root, { spec, board, component, svg } = {}) {
  if (!root) throw new Error('No project folder.')
  let parsed = spec
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch (e) {
      throw new Error(`The spec isn't valid JSON: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The spec must be one JSON object: the root frame.')

  const boards = readBoards(root)
  const wanted = board ? String(board).toLowerCase() : null
  let target = wanted
    ? boards.find((b) => b.doc.id.toLowerCase() === wanted || String(b.doc.name ?? '').toLowerCase() === wanted)
    : [...boards].sort((a, b) => (b.doc.updatedAt ?? 0) - (a.doc.updatedAt ?? 0))[0]
  const now = Date.now()
  if (!target) {
    const id = nextId('canvas')
    const doc = { version: SCHEMA_VERSION, id, name: board ? String(board) : 'AI designs', nodes: [], components: [], createdAt: now, updatedAt: now }
    target = { file: path.join(boardsDir(root), `${id}.json`), doc }
  }

  const node = specToNode({ type: 'frame', ...parsed }, 'root')
  // To the right of everything already on the board, top-aligned with it.
  const nodes = target.doc.nodes
  if (nodes.length > 0) {
    node.rect.x = Math.max(...nodes.map((n) => n.rect.x + n.rect.w)) + 120
    node.rect.y = Math.min(...nodes.map((n) => n.rect.y))
  } else {
    node.rect.x = num(parsed.x, 0)
    node.rect.y = num(parsed.y, 0)
  }
  // What Sleipnir should do with it once it sees it: bring it into view, and
  // (for /component) promote it and write its code.
  node.request = { focus: true }
  if (component || svg) {
    node.request.component = { name: typeof component === 'string' && component ? component : node.name, ...(svg ? { format: 'svg' } : {}) }
    if (typeof component === 'string' && component) node.name = component
  }

  const doc = { ...target.doc, nodes: [...nodes, node], updatedAt: now }
  fs.mkdirSync(path.dirname(target.file), { recursive: true })
  fs.writeFileSync(target.file, JSON.stringify(doc, null, 2))
  return {
    board: { id: doc.id, name: doc.name },
    nodeId: node.id,
    name: node.name,
    size: { w: node.rect.w, h: node.rect.h },
    component: node.request.component ?? null,
  }
}

// ── The spec, documented ───────────────────────────────────────────────────

export const SPEC_HELP = `A spec is ONE JSON object — the root frame. Every node:

  type      "frame" (default) | "text" | "rect" | "ellipse" | "triangle" | "polygon" | "image"
  name      layer name (also the component name for /component)
  w, h      px, or "fill" (take the parent's space) / "hug" (fit the content)
  x, y      px — only inside a "free" layout; stacks and grids place children themselves

Frames:
  layout    "vertical" | "horizontal" | "grid" | "free" (default)
  gap       px between children           padding  px, [v, h], [t, r, b, l] or {top,…}
  align     "start" | "center" | "end" | "stretch"   (cross axis)
  justify   "start" | "center" | "end" | "between" | "around"   (main axis)
  wrap      true to wrap a horizontal stack        cols   grid columns
  children  [nodes]

Paint (frames, shapes; text gets "background"):
  fill      "#rrggbb" or a theme token: bg-1 bg-2 bg-3 text-1 text-2 text-3 border-1 border-2
  gradient  { "angle": 180, "stops": ["#ff0080", "#7928ca"] }
  stroke    "#hex" | { "color": "border-1", "width": 1 }
  radius    px    opacity  0–1    shadow  true | { x, y, blur, color, opacity }
  rotate    degrees    margin  like padding (inside a stack or grid)    clip  true

Text:  text, size (16), weight (400), color ("text-1"), align ("left"|"center"|"right"), mono, lineHeight
Image: src (a workspace path such as .components/assets/hero.png, or an https: URL), fit ("cover"|"contain")

Example — a pricing card:
{ "name": "PricingCard", "layout": "vertical", "gap": 12, "padding": 24, "w": 280, "fill": "bg-2", "radius": 12,
  "stroke": { "color": "border-1", "width": 1 },
  "children": [
    { "type": "text", "text": "Pro", "size": 14, "color": "text-2" },
    { "type": "text", "text": "$39", "size": 40, "weight": 700 },
    { "type": "frame", "layout": "horizontal", "justify": "center", "padding": [10, 16], "fill": "#6fa8dc", "radius": 8, "w": "fill",
      "children": [{ "type": "text", "text": "Buy", "weight": 600, "color": "#0b1320" }] }
  ] }`

// ── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[key] = true
      else {
        out[key] = next
        i += 1
      }
    } else out._.push(a)
  }
  return out
}

function readSpec(source) {
  if (!source || source === true) throw new Error('--spec is required: a JSON file, or - for stdin.')
  return source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8')
}

const HELP = `Sleipnir Canvas CLI

  node .sleipnir/canvas.mjs list-boards --root .
  node .sleipnir/canvas.mjs build --root . --spec <file|-> [--board <name|id>] [--component <Name>] [--svg]
  node .sleipnir/canvas.mjs spec-help

build appends the spec's frame to a board (the named one, else the most recently
edited, else a new "AI designs" board). Sleipnir shows it live. --component asks
Sleipnir to make it a component and write its code into .components/<name>/;
--svg makes that an SVG component (vector shapes only).`

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const command = args._[0]
  const root = path.resolve(typeof args.root === 'string' ? args.root : '.')
  try {
    if (command === 'list-boards') {
      process.stdout.write(JSON.stringify(listBoards(root), null, 2) + '\n')
    } else if (command === 'build') {
      const result = buildOnBoard(root, {
        spec: readSpec(args.spec),
        board: typeof args.board === 'string' ? args.board : undefined,
        component: args.component === true ? true : typeof args.component === 'string' ? args.component : undefined,
        svg: !!args.svg,
      })
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else if (command === 'spec-help') {
      process.stdout.write(SPEC_HELP + '\n')
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
