// Builds horse-gallop.svg, the SleipnirLoader animation: every piece of
// Horse-Before.svg morphing into its partner in Horse-After.svg and back, as
// a looping SMIL animation.
//
//   node tools/generate-horse-morph.mjs
//
// Pieces pair by id when the exports carry them (BA -> BA2, BB -> BB2, ...).
// Without ids they pair by document order, the order Figma writes the layers in.
// Animating `d` needs both ends to share one command structure, so each pair
// is rebuilt as matching cubic runs: the After piece is rotated and, if
// needed, reversed so its outline starts where the Before outline does, then
// both are split at each other's corners. Splitting never changes a shape, so
// the first and the halfway frames are the original artwork exactly.
//
// The legs are rigged (see Rig) so they swing from their hinges instead of
// sliding straight across: each piece turns about the hinge above it, and
// only the upper pieces that the drawings distort stretch and morph. The
// hinges come from Leg-Extended-hinge.svg, and the loop adds two passing
// poses between Before and After where a swinging leg folds the way
// Leg-Constricted-hinge.svg does (see Poses).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'src/app/UIKit/SleipnirLoader')
const BEFORE = path.join(DIR, 'Horse-Before.svg')
const AFTER = path.join(DIR, 'Horse-After.svg')
const OUT = path.join(DIR, 'horse-gallop.svg')

// Seconds for one full stride, Before -> After -> Before. Linear, so the legs
// never settle at either pose.
const DUR = 0.4
// How far, as a fraction of a stride, the C and D legs trail the A and B
// legs (front and back alike), so the feet don't all land at once.
const LAG = 0.06
// Corners closer than this (as a fraction of the outline's length) count as
// the same corner, so the pair isn't split into slivers.
const SNAP = 0.006
// Points sampled round each outline when choosing where the After one starts.
const SAMPLES = 160

// Without ids the pieces pair by document order except where the two exports
// list a leg's pieces in a different order. Index into After, by Before index.
const ORDER_SWAPS = { 22: 23, 23: 22 }

// ---- SVG ------------------------------------------------------------------

function readPaths(file) {
  const text = fs.readFileSync(file, 'utf8')
  const viewBox = text.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const paths = [...text.matchAll(/<path\b([^>]*?)\/?>/g)].map((m) => {
    const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))
    return { id: attrs.id, d: attrs.d, attrs }
  })
  return { viewBox, paths }
}

// Absolute M/L/H/V/C/Z (what Figma exports) -> subpaths of cubic segments,
// each segment [p0, c1, c2, p3].
function parseD(d) {
  const tokens = d.match(/[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)
  const subpaths = []
  let cur = null
  let pt = [0, 0]
  let i = 0
  let cmd = null
  const num = () => Number(tokens[i++])
  const line = (to) => {
    cur.push([pt, lerp(pt, to, 1 / 3), lerp(pt, to, 2 / 3), to])
    pt = to
  }
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++]
    if (/[a-z]/.test(cmd)) throw new Error(`relative command ${cmd} not supported`)
    switch (cmd) {
      case 'M':
        pt = [num(), num()]
        cur = []
        cur.start = pt
        subpaths.push(cur)
        cmd = 'L'
        break
      case 'L': line([num(), num()]); break
      case 'H': line([num(), pt[1]]); break
      case 'V': line([pt[0], num()]); break
      case 'C': {
        const c1 = [num(), num()]
        const c2 = [num(), num()]
        const to = [num(), num()]
        cur.push([pt, c1, c2, to])
        pt = to
        break
      }
      case 'Z':
        if (dist(pt, cur.start) > 1e-6) line(cur.start)
        pt = cur.start
        break
      default: throw new Error(`unexpected command ${cmd}`)
    }
  }
  return subpaths.map((s) => s.slice())
}

const fmt = (n) => String(Math.round(n * 1000) / 1000)
const pt2 = (p) => `${fmt(p[0])} ${fmt(p[1])}`

function toD(subpaths) {
  return subpaths
    .map((segs) => `M${pt2(segs[0][0])}` + segs.map((s) => `C${pt2(s[1])} ${pt2(s[2])} ${pt2(s[3])}`).join('') + 'Z')
    .join('')
}

// ---- Geometry -------------------------------------------------------------

function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) }

function bez(s, t) {
  const u = 1 - t
  return [0, 1].map((k) => u * u * u * s[0][k] + 3 * u * u * t * s[1][k] + 3 * u * t * t * s[2][k] + t * t * t * s[3][k])
}

function split(s, t) {
  const [a, b, c, d] = s
  const ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t)
  const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t)
  const m = lerp(abc, bcd, t)
  return [[a, ab, abc, m], [m, bcd, cd, d]]
}

// Arc-length table for one segment: cumulative length at t = k/STEPS.
const STEPS = 32
function segTable(s) {
  const lens = [0]
  let prev = s[0]
  for (let k = 1; k <= STEPS; k++) {
    const p = bez(s, k / STEPS)
    lens.push(lens[k - 1] + dist(prev, p))
    prev = p
  }
  return lens
}

// t at which a segment has covered `len` of its own length.
function tAtLength(table, len) {
  for (let k = 1; k <= STEPS; k++) {
    if (table[k] >= len) {
      const span = table[k] - table[k - 1]
      return (k - 1 + (span > 0 ? (len - table[k - 1]) / span : 0)) / STEPS
    }
  }
  return 1
}

function measure(segs) {
  const tables = segs.map(segTable)
  const total = tables.reduce((sum, t) => sum + t[STEPS], 0)
  const starts = []
  let acc = 0
  for (const t of tables) { starts.push(acc / total); acc += t[STEPS] }
  return { tables, total, starts }
}

// Point at fraction f (0..1) of the outline's length.
function pointAt(segs, m, f) {
  let i = m.starts.length - 1
  while (i > 0 && m.starts[i] > f) i--
  const t = tAtLength(m.tables[i], (f - m.starts[i]) * m.total)
  return bez(segs[i], t)
}

function signedArea(segs) {
  let a = 0
  for (const s of segs) {
    for (let k = 0; k < 8; k++) {
      const p = bez(s, k / 8), q = bez(s, (k + 1) / 8)
      a += p[0] * q[1] - q[0] * p[1]
    }
  }
  return a / 2
}

function reverse(segs) {
  return segs.slice().reverse().map(([a, b, c, d]) => [d, c, b, a])
}

// Split the outline at each fraction in `fracs` (sorted, in [0, 1)) that isn't
// already a corner, returning the new segments in order.
function splitAt(segs, fracs) {
  const m = measure(segs)
  const out = []
  segs.forEach((seg, i) => {
    const from = m.starts[i]
    const to = i + 1 < segs.length ? m.starts[i + 1] : 1
    let rest = seg
    let restFrom = 0 // t on the original segment where `rest` begins
    for (const f of fracs) {
      if (f <= from + 1e-9 || f >= to - 1e-9) continue
      const t = tAtLength(m.tables[i], (f - from) * m.total)
      const local = (t - restFrom) / (1 - restFrom)
      const [head, tail] = split(rest, local)
      out.push(head)
      rest = tail
      restFrom = t
    }
    out.push(rest)
  })
  return out
}

// Restart a closed outline at fraction f.
function rotate(segs, f) {
  if (f <= 1e-9) return segs
  const cut = splitAt(segs, [f])
  const m = measure(cut)
  const i = m.starts.findIndex((s) => Math.abs(s - f) < 1e-6)
  return i <= 0 ? cut : cut.slice(i).concat(cut.slice(0, i))
}

function centroid(points) {
  const c = [0, 0]
  for (const p of points) { c[0] += p[0]; c[1] += p[1] }
  return [c[0] / points.length, c[1] / points.length]
}

function samples(segs) {
  const m = measure(segs)
  const pts = Array.from({ length: SAMPLES }, (_, k) => pointAt(segs, m, k / SAMPLES))
  const c = centroid(pts)
  return pts.map((p) => [p[0] - c[0], p[1] - c[1]])
}

// Orient and restart `b` so it lines up point-for-point with `a`, comparing
// the shapes about their own centres so a leg that swings far still matches.
// `turn` is how far `b` is known to have turned from `a`; without one, each
// start is scored at its own best turn.
function align(a, b, turn) {
  if (Math.sign(signedArea(a)) !== Math.sign(signedArea(b))) b = reverse(b)
  const pa = samples(a)
  const pb = samples(b).map((q) => (turn === undefined ? q : rot(q, -turn)))
  let best = 0
  let bestCost = Infinity
  for (let s = 0; s < SAMPLES; s++) {
    let cost = 0
    let dot = 0, cross = 0
    for (let k = 0; k < SAMPLES; k++) {
      const p = pa[k], q = pb[(k + s) % SAMPLES]
      cost += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
      dot += p[0] * q[0] + p[1] * q[1]
      cross += p[0] * q[1] - p[1] * q[0]
    }
    // Both shapes' spread is the same for every start, so the best turn's
    // cost only differs by this.
    if (turn === undefined) cost = -Math.hypot(dot, cross)
    if (cost < bestCost) { bestCost = cost; best = s }
  }
  return rotate(b, best / SAMPLES)
}

// Give two outlines the same number of segments with matching corners: walk
// both corner lists together, pairing corners within SNAP and splitting the
// other outline wherever one has a corner the other lacks.
function match(a, b, turn) {
  b = align(a, b, turn)
  const fa = measure(a).starts
  const fb = measure(b).starts
  const addA = []
  const addB = []
  let i = 0, j = 0
  while (i < fa.length || j < fb.length) {
    const x = i < fa.length ? fa[i] : Infinity
    const y = j < fb.length ? fb[j] : Infinity
    if (Math.abs(x - y) < SNAP) { i++; j++ }
    else if (x < y) { addB.push(x); i++ }
    else { addA.push(y); j++ }
  }
  const outA = splitAt(a, addA)
  const outB = splitAt(b, addB)
  if (outA.length !== outB.length) throw new Error(`segment mismatch ${outA.length} vs ${outB.length}`)
  return [outA, outB]
}

// ---- Rig ------------------------------------------------------------------

// The skeleton, by Before index. The body carries the tail and the top piece
// of each leg; each leg runs top to hoof, every piece hinged to the one above.
const BODY = 25
const TAIL = 0
// Each list runs leg A (#AEAEAE), B (#8C8C8C), C (#3C3C3C), D (#0D0D0D).
const FORE = [[1, 2, 3], [7, 8, 9], [16, 17, 18], [19, 20, 21]]
const HIND = [[6, 4, 5], [12, 10, 11], [15, 13, 14], [24, 23, 22]]
const LAGGING = [FORE[2], FORE[3], HIND[2], HIND[3]]
// The hind leg Leg-Extended-hinge.svg and Leg-Constricted-hinge.svg draw,
// with its hinges marked: hip, knee, ankle. Their pieces run hoof, lower,
// upper. Extended is this leg's Before pose; Constricted is it folded up.
const HINGED_LEG = HIND[3]
const EXTENDED = path.join(DIR, 'Leg-Extended-hinge.svg')
const CONSTRICTED = path.join(DIR, 'Leg-Constricted-hinge.svg')

// Corresponding points on a matched pair, for fitting the motion between them.
function anchors(subpaths) {
  return subpaths[0].flatMap((s) => [0, 1 / 3, 2 / 3].map((t) => bez(s, t)))
}

// Best rotation (+ scale, if asked) + translation taking `from` onto `to`
// (2-D Kabsch), and how far off the points land after it.
function fitRigid(from, to, { scaled = false } = {}) {
  const cf = centroid(from)
  const ct = centroid(to)
  let dot = 0, cross = 0, spread = 0
  from.forEach((p, k) => {
    const a = [p[0] - cf[0], p[1] - cf[1]]
    const b = [to[k][0] - ct[0], to[k][1] - ct[1]]
    dot += a[0] * b[0] + a[1] * b[1]
    cross += a[0] * b[1] - a[1] * b[0]
    spread += a[0] * a[0] + a[1] * a[1]
  })
  const th = Math.atan2(cross, dot)
  const s = scaled ? Math.hypot(dot, cross) / spread : 1
  const r = rot(cf, th)
  const fit = { th, s, t: [ct[0] - r[0] * s, ct[1] - r[1] * s] }
  fit.rms = Math.sqrt(from.reduce((sum, p, k) => sum + dist(apply(fit, p), to[k]) ** 2, 0) / from.length)
  return fit
}
function apply(fit, p) {
  const r = rot(p, fit.th)
  return [r[0] * fit.s + fit.t[0], r[1] * fit.s + fit.t[1]]
}

// Fit one outline onto another of the same shape, whatever their start points.
function fitShape(a, b, opts) {
  const [f, t] = match(a, b)
  return fitRigid(anchors([f]), anchors([t]), opts)
}

function rot(p, th, c = [0, 0]) {
  const x = p[0] - c[0], y = p[1] - c[1]
  const cs = Math.cos(th), sn = Math.sin(th)
  return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function polygon(segs) {
  return segs.flatMap((s) => Array.from({ length: 8 }, (_, k) => bez(s, k / 8)))
}

function inside(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// Centre of where two pieces overlap — roughly where they hinge.
function overlapCentre(a, b) {
  const pa = polygon(a), pb = polygon(b)
  const box = (p) => [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]
  const ba = box(pa), bb = box(pb)
  const x0 = Math.max(ba[0], bb[0]), y0 = Math.max(ba[1], bb[1])
  const x1 = Math.min(ba[2], bb[2]), y1 = Math.min(ba[3], bb[3])
  const hits = []
  for (let x = x0; x <= x1; x += 0.2) for (let y = y0; y <= y1; y += 0.2) {
    if (inside(pa, x, y) && inside(pb, x, y)) hits.push([x, y])
  }
  if (hits.length) return centroid(hits)
  // Not touching: the midpoint of their closest points.
  let best = [Infinity]
  for (const p of pa) for (const q of pb) {
    const d = dist(p, q)
    if (d < best[0]) best = [d, lerp(p, q, 0.5)]
  }
  return best[1]
}

// Two pieces that keep their shape and turn about a shared pin both carry
// the pin to the same place. Solve for that point; keep `guess` instead when
// the answer is ill-posed (they turn alike) or wanders off the joint.
const PIN_REACH = 4
function pin(a, b, guess) {
  const dc = Math.cos(a.th) - Math.cos(b.th)
  const ds = Math.sin(a.th) - Math.sin(b.th)
  const k2 = dc * dc + ds * ds
  if (k2 < 0.01) return guess
  const r = [b.t[0] - a.t[0], b.t[1] - a.t[1]]
  // (Ra - Rb) is the scaled rotation [[dc, -ds], [ds, dc]].
  const p = [(dc * r[0] + ds * r[1]) / k2, (-ds * r[0] + dc * r[1]) / k2]
  return dist(p, guess) <= PIN_REACH ? p : guess
}

// ---- Build ----------------------------------------------------------------

const before = readPaths(BEFORE)
const after = readPaths(AFTER)
if (before.paths.length !== after.paths.length) {
  throw new Error(`Before has ${before.paths.length} pieces, After has ${after.paths.length}`)
}

const byId = new Map(after.paths.filter((p) => p.id).map((p) => [p.id, p]))
const letter = (i) => 'B' + String.fromCharCode(65 + i)

const pieces = before.paths.map((b, i) => {
  const name = b.id ?? letter(i)
  const a = b.id ? byId.get(`${b.id}2`) : after.paths[ORDER_SWAPS[i] ?? i]
  if (!a) throw new Error(`no After piece for ${name}`)
  const sb = parseD(b.d)
  const sa = parseD(a.d)
  if (sb.length !== sa.length) throw new Error(`${name}: ${sb.length} vs ${sa.length} subpaths`)
  return { name, attrs: b.attrs, before: sb, after: sa }
})

// Rebuild a piece's two outlines point-for-point (see match) and fit the turn
// between them; `turn` is that turn when the rig already knows it.
function pair(p, turn) {
  const pairs = p.before.map((segs, k) => match(segs, p.after[k], turn))
  p.from = pairs.map((q) => q[0])
  p.to = pairs.map((q) => q[1])
  p.fit = fitRigid(anchors(p.from), anchors(p.to))
}

// ---- Poses ----
//
// The loop runs through five keys: Before, a passing pose, After, a second
// passing pose, and Before again. The passing poses are drawn by the rig: each
// leg's upper piece is halfway, and below it a leg that's swinging forward
// in that half folds up (lower and hoof turned as in Constricted), while one
// pushing back stays straight, as in Extended.
const KEYS = 5
const BODY_AT = [0, 0.5, 1, 0.5, 0] // how far each key is from Before to After

// Every piece moves as
//   p -> pivotAt(τ) + turn(angle(τ)) * stretch(τ) along `axis` * (p - pivot)
// with its outline also morphing toward After by morph(τ); τ runs 0..1 over
// the loop, and angle/stretch/morph are straight lines between the keys.
function keyed(values, tau) {
  const x = (tau - Math.floor(tau) || (tau ? 1 : 0)) * (values.length - 1)
  const k = Math.min(Math.floor(x), values.length - 2)
  return values[k] + (values[k + 1] - values[k]) * (x - k)
}
function move(p, q, tau) {
  let v = rot(sub(q, p.pivot), -p.axis)
  v = [v[0] * keyed(p.stretch, tau), v[1]]
  return add(p.pivotAt(tau), rot(v, p.axis + keyed(p.angle, tau)))
}
function unmove(p, q, key) {
  const tau = key / (KEYS - 1)
  let v = rot(sub(q, p.pivotAt(tau)), -(p.axis + keyed(p.angle, tau)))
  v = [v[0] / keyed(p.stretch, tau), v[1]]
  return add(p.pivot, rot(v, p.axis))
}

const angleOf = (v) => Math.atan2(v[1], v[0])
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const scale = (a, k) => [a[0] * k, a[1] * k]
const ones = Array(KEYS).fill(1)
const atBody = (tau) => keyed(BODY_AT, tau)

const body = pieces[BODY]
// The body barely turns, and is too intricate (mane, ears) for a free turn to
// line up reliably.
pair(body, 0)
const bodyCentre = centroid(anchors(body.from))
const bodyEnd = apply(body.fit, bodyCentre)
Object.assign(body, {
  pivot: bodyCentre,
  pivotAt: (tau) => lerp(bodyCentre, bodyEnd, atBody(tau)),
  angle: BODY_AT.map((f) => body.fit.th * f),
  axis: 0,
  stretch: ones,
  morph: BODY_AT,
})

// The tail hangs off the body, its hinge easing onto where the two overlap
// in the After pose.
{
  const tail = pieces[TAIL]
  pair(tail)
  const h0 = overlapCentre(body.before[0], tail.before[0])
  const h1 = overlapCentre(body.after[0], tail.after[0])
  const drift = sub(h1, move(body, h0, 0.5))
  const turn = wrap(tail.fit.th - body.fit.th) + body.fit.th
  Object.assign(tail, {
    pivot: h0,
    pivotAt: (tau) => add(move(body, h0, tau), scale(drift, atBody(tau))),
    angle: BODY_AT.map((f) => turn * f),
    axis: 0,
    stretch: ones,
    morph: BODY_AT,
  })
}

// Hinges on the drawn leg, carried into Before coordinates, and the folded
// pose's joint angles: how far the lower piece turns off the upper's line,
// and the hoof off the lower.
const drawn = (() => {
  const read = (file) => {
    const text = fs.readFileSync(file, 'utf8')
    const pins = [...text.matchAll(/<circle\b[^>]*\bcx="([-\d.]+)"[^>]*\bcy="([-\d.]+)"/g)].map((m) => [+m[1], +m[2]])
    const [hoof, lower, upper] = readPaths(file).paths.map((p) => parseD(p.d)[0])
    return { hoof, lower, upper, hip: pins[0], knee: pins[1], ankle: pins[2] }
  }
  const ext = read(EXTENDED)
  const con = read(CONSTRICTED)
  const [u, l, h] = HINGED_LEG.map((i) => pieces[i].before[0])
  const upperFit = fitShape(ext.upper, u)
  const lowerFit = fitShape(ext.lower, l)
  const lowerTurn = fitShape(ext.lower, con.lower).th
  const hoofTurn = fitShape(ext.hoof, con.hoof).th
  const upperTurn = angleOf(sub(con.knee, con.hip)) - angleOf(sub(ext.knee, ext.hip))
  return {
    hip: apply(upperFit, ext.hip),
    knee: apply(lowerFit, ext.knee),
    ankle: apply(lowerFit, ext.ankle),
    foldKnee: wrap(lowerTurn - upperTurn),
    foldAnkle: wrap(hoofTurn - lowerTurn),
  }
})()

const hingedUpper = pieces[HINGED_LEG[0]].before[0]
const hingedLower = pieces[HINGED_LEG[1]].before[0]

for (const leg of [...FORE, ...HIND]) {
  const [upper, lower, hoof] = leg.map((i) => pieces[i])
  for (const p of [lower, hoof]) pair(p)

  // Hinges, Before pose. The hind legs are the drawn one at other sizes, so
  // its hinges carry over; the fore legs start from where their pieces
  // overlap. Either way a pin both rigid pieces agree on wins where there is
  // one (see pin), so the lower piece and hoof turn without slipping.
  const hind = HIND.includes(leg)
  let hip, knee, ankle
  if (hind) {
    const up = fitShape(hingedUpper, upper.before[0], { scaled: true })
    const low = fitShape(hingedLower, lower.before[0], { scaled: true })
    hip = apply(up, drawn.hip)
    knee = apply(low, drawn.knee)
    ankle = apply(low, drawn.ankle)
  } else {
    hip = overlapCentre(body.before[0], upper.before[0])
    knee = overlapCentre(upper.before[0], lower.before[0])
    ankle = overlapCentre(lower.before[0], hoof.before[0])
  }
  const upperFit = fitShape(upper.before[0], upper.after[0])
  if (upperFit.rms < 0.05) knee = pin(upperFit, lower.fit, knee)

  ankle = pin(lower.fit, hoof.fit, ankle)

  // After pose. The lower piece keeps its shape, so it fixes where the knee
  // and ankle went. An upper piece that keeps its shape too just turns, its
  // hip sliding a little inside the body if the drawing moved it; one that
  // distorts has its hip ride the body and stretches to reach the knee.
  const upperRigid = upperFit.rms < 0.05
  const hip1 = upperRigid ? apply(upperFit, hip) : move(body, hip, 0.5)
  const hipDrift = sub(hip1, move(body, hip, 0.5))
  const knee1 = apply(lower.fit, knee)
  const bone0 = sub(knee, hip), bone1 = sub(knee1, hip1)
  const upperTurn = upperRigid ? upperFit.th : wrap(angleOf(bone1) - angleOf(bone0))
  const upperStretch = upperRigid ? 1 : Math.hypot(...bone1) / Math.hypot(...bone0)
  pair(upper, upperTurn)
  const kneeAfter = wrap(lower.fit.th - upperTurn)
  const ankleAfter = wrap(hoof.fit.th - lower.fit.th)

  // Which half this leg swings forward in, and which pose is it folded.
  const hoofAt = (key) => (key ? apply(hoof.fit, centroid(anchors(hoof.from))) : centroid(anchors(hoof.from)))
  const swingsFirst = hoofAt(1)[0] > hoofAt(0)[0]
  const reach = (key) => dist(key ? hip1 : hip, hoofAt(key))
  const foldedAfter = reach(1) < reach(0)
  const straight = foldedAfter ? [0, 0] : [kneeAfter, ankleAfter]
  const folded = hind
    ? [drawn.foldKnee, drawn.foldAnkle]
    : foldedAfter ? [kneeAfter, ankleAfter] : [0, 0]
  const passing = (swinging) => (swinging ? folded : straight)

  // Joint angles per key (absolute turns from Before, built up the leg).
  const upperAngle = [0, upperTurn / 2, upperTurn, upperTurn / 2, 0]
  const joints = [[0, 0], passing(swingsFirst), [kneeAfter, ankleAfter], passing(!swingsFirst), [0, 0]]
  const lowerAngle = upperAngle.map((a, k) => a + joints[k][0])
  const hoofAngle = lowerAngle.map((a, k) => a + joints[k][1])

  Object.assign(upper, {
    pivot: hip,
    // A lagging leg runs behind the body, but its hip still rides it.
    pivotAt: (tau) => add(move(body, hip, tau + upper.lag), scale(hipDrift, atBody(tau + upper.lag))),
    angle: upperAngle,
    axis: angleOf(bone0),
    stretch: [1, (1 + upperStretch) / 2, upperStretch, (1 + upperStretch) / 2, 1],
    morph: BODY_AT,
  })
  Object.assign(lower, {
    pivot: knee,
    pivotAt: (tau) => move(upper, knee, tau),
    angle: lowerAngle,
    axis: 0,
    stretch: ones,
    morph: BODY_AT,
  })
  Object.assign(hoof, {
    pivot: ankle,
    pivotAt: (tau) => move(lower, ankle, tau),
    angle: hoofAngle,
    axis: 0,
    stretch: ones,
    morph: BODY_AT,
  })
  for (const p of [upper, lower, hoof]) p.lag = LAGGING.includes(leg) ? LAG : 0
  Object.assign(leg, { upper, lower, hoof, foldSign: Math.sign(wrap(folded[0] - straight[0])) || -1 })
}

// Between the keys a leg swinging straight down can reach past the ground the
// drawings stand on. Re-key the joints finely, and wherever a hoof would dip
// below that line, bend the knee - whichever way lifts it with less bend,
// keeping to the way it last bent - until it clears.
const GROUND_STEPS = 32
const hoofLow = (hoof, tau) => Math.max(...anchors(hoof.from).map((q) => move(hoof, q, tau)[1]))
const ground = Math.max(...[...FORE, ...HIND].flatMap(({ hoof }) => [hoofLow(hoof, 0), hoofLow(hoof, 0.5)]))
for (const leg of [...FORE, ...HIND]) {
  const { lower, hoof } = leg
  const taus = Array.from({ length: GROUND_STEPS + 1 }, (_, k) => k / GROUND_STEPS)
  const lowerAngle = taus.map((tau) => keyed(lower.angle, tau))
  const hoofAngle = taus.map((tau) => keyed(hoof.angle, tau))
  lower.angle = lowerAngle.slice()
  hoof.angle = hoofAngle.slice()
  let way = leg.foldSign
  const bends = taus.map((tau, k) => {
    const lifts = (bend) => {
      lower.angle[k] = lowerAngle[k] + bend
      hoof.angle[k] = hoofAngle[k] + bend
      return hoofLow(hoof, tau) <= ground
    }
    for (let deg = 0; deg <= 150; deg += 1) {
      for (const w of [way, -way]) {
        const bend = (w * deg * Math.PI) / 180
        if (lifts(bend)) {
          if (deg) way = w
          return bend
        }
      }
    }
    return 0
  })
  // Ease each bend in and out so the knee doesn't snap.
  const eased = bends.map((b, k) => {
    const prev = bends[(k + GROUND_STEPS - 1) % GROUND_STEPS], next = bends[(k + 1) % GROUND_STEPS]
    return b || (prev + next) / 4
  })
  taus.forEach((_, k) => {
    lower.angle[k] = lowerAngle[k] + eased[k]
    hoof.angle[k] = hoofAngle[k] + eased[k]
  })
}

const mapSegs = (subpaths, fn) => subpaths.map((segs) => segs.map((s) => s.map(fn)))

// The outline each piece morphs toward inside its motion: After, carried
// back through the After key's turn and stretch, so move + morph lands
// exactly on After. A piece that only turns comes back as its Before self,
// and isn't morphed at all.
const RIGID = 0.02
// Measured without the lag, so a lagging leg still holds the drawn shapes
// (just a moment late) rather than morphing to make up the difference.
const lags = pieces.map((p) => p.lag ?? 0)
for (const p of pieces) p.lag = 0
for (const p of pieces) {
  p.local = mapSegs(p.to, (q) => unmove(p, q, 2))
  const drift = Math.max(...p.from.flatMap((sp, a) => sp.flatMap((s, b) => s.map((q, c) => dist(q, p.local[a][b][c])))))
  p.rigid = drift < RIGID
  p.drift = drift
}
pieces.forEach((p, i) => { p.lag = lags[i] })

// A piece's outline at loop position τ (its own position runs `lag` behind).
function outline(p, tau) {
  tau -= p.lag ?? 0
  const m = keyed(p.morph, tau)
  return p.from.map((subpath, a) => subpath.map((s, b) => s.map((q, c) => move(p, lerp(q, p.local[a][b][c], m), tau))))
}

// One frame at loop position τ, for previews.
const frame = (p, tau) => toD(outline(p, tau))

// The loop's extent, so no hoof or tail tip swings out of the artboard.
const extent = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k <= 64; k++) {
    for (const p of pieces) {
      for (const q of polygon(outline(p, k / 64).flat())) {
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1])
      }
    }
  }
  return [Math.floor(Math.min(0, x0)), Math.floor(Math.min(0, y0)), Math.ceil(x1), Math.ceil(y1)]
})()
const VIEW = `${extent[0]} ${extent[1]} ${extent[2] - extent[0]} ${extent[3] - extent[1]}`
const W = extent[2] - extent[0]
const H = extent[3] - extent[1]

const deg = (a) => fmt((a * 180) / Math.PI)
// A lagging piece starts its loop most of a stride in, which is the same as
// starting it `lag` late without a frozen first moment.
const loopOf = (p) => `dur="${DUR}s"${p.lag ? ` begin="-${fmt((1 - p.lag) * DUR)}s"` : ''} repeatCount="indefinite"`
const attrsOf = (p, keepFill) =>
  Object.entries(p.attrs)
    .filter(([k]) => k !== 'd' && k !== 'id' && (keepFill || k !== 'fill'))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('')

// Pivots ride curves (a hinge swings round the one above it), so they're
// keyed PIVOT_STEPS times between keys; turns and stretches are straight
// lines between keys already.
const PIVOT_STEPS = 8
const taus = Array.from({ length: (KEYS - 1) * PIVOT_STEPS + 1 }, (_, k) => k / ((KEYS - 1) * PIVOT_STEPS))

const markup = pieces
  .map((p) => {
    const from = toD(p.from)
    const anim = (type, values) => `<animateTransform attributeName="transform" type="${type}" ${loopOf(p)} values="${values.join(';')}"/>`
    const stretches = p.stretch.some((s) => Math.abs(s - 1) > 1e-6)
    const groups = [
      `<g>${anim('translate', taus.map((tau) => pt2(p.pivotAt(tau))))}`,
      `<g>${anim('rotate', p.angle.map(deg))}`,
      ...(stretches
        ? [`<g transform="rotate(${deg(p.axis)})">`, `<g>${anim('scale', p.stretch.map((s) => `${fmt(s)} 1`))}`]
        : []),
      `<g transform="${stretches ? `rotate(${deg(-p.axis)}) ` : ''}translate(${fmt(-p.pivot[0])} ${fmt(-p.pivot[1])})">`,
    ]
    const morph = p.rigid
      ? ''
      : `<animate attributeName="d" ${loopOf(p)} values="${p.morph
          .map((m) => toD(p.from.map((sp, a) => sp.map((s, b) => s.map((q, c) => lerp(q, p.local[a][b][c], m))))))
          .join(';')}"/>`
    return (
      groups.join('') +
      (morph ? `<path data-piece="${p.name}" d="${from}"${attrsOf(p)}>${morph}</path>` : `<path data-piece="${p.name}" d="${from}"${attrsOf(p)}/>`) +
      '</g>'.repeat(groups.length)
    )
  })
  .join('\n')

const svg =
  // One ink for every piece: currentColor, so SleipnirLoader sets it from the
  // theme (black when the file is viewed on its own).
  `<svg class="horse-gallop" width="${W}" height="${H}" viewBox="${VIEW}" fill="currentColor" xmlns="http://www.w3.org/2000/svg">\n` +
  `<!-- Generated by tools/generate-horse-morph.mjs from Horse-Before.svg, Horse-After.svg and the Leg-*-hinge.svg examples. Do not edit. -->\n` +
  markup +
  `\n</svg>\n`

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, svg)
  const frameArg = process.argv.indexOf('--frames')
  if (frameArg > -1) {
    // Static frames for eyeballing the loop, in the pieces' own greys so the
    // hinges show: --frames <dir>. frame-0.25 and frame-0.75 are the two
    // passing poses.
    const dir = process.argv[frameArg + 1]
    fs.mkdirSync(dir, { recursive: true })
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const tau = k / 8
      const paths = pieces.map((p) => `<path d="${frame(p, tau)}"${attrsOf(p, true)}/>`).join('')
      fs.writeFileSync(
        path.join(dir, `frame-${tau}.svg`),
        `<svg width="${W * 4}" height="${H * 4}" viewBox="${VIEW}" xmlns="http://www.w3.org/2000/svg"><rect x="${extent[0]}" y="${extent[1]}" width="${W}" height="${H}" fill="#fff"/>${paths}</svg>`,
      )
    }
    console.log('morphing:', pieces.filter((p) => !p.rigid).map((p) => `${p.name} ${p.drift.toFixed(2)}`).join(', '))
  }
  console.log(`wrote ${path.relative(ROOT, OUT)} (${pieces.length} pieces, ${(svg.length / 1024).toFixed(1)} KB, viewBox ${VIEW})`)
}
