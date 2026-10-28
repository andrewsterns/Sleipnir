// The Health lens: an ArchitectureHealth (tools/architecture-health.mjs — the
// same numbers /optimize agents read) keyed by the architecture graph's node
// ids, so GraphCanvas can size nodes by how much leans on them and color the
// problems. Kept apart from `data` like stages and the plan overlay: switching
// the lens on or off never rebuilds the force layout.
import type { ArchitectureHealth } from '../api/PlatformAPI'
import { blastRadius, dependenciesOf } from '../../../tools/agentSkills/vendor/graphCore.mjs'
import { archId } from './architectureScope'
import type { WorkspaceScan } from './workspaceScanCache'

export interface NodeHealth {
  path: string
  role: string
  fanIn: number
  fanOut: number
  instability: number
  lines: number | null
  churn: number | null
  inCycle: boolean
  /** Nothing imports it and it is no entry point. */
  unused: boolean
  /** Imports something from a layer above its own. */
  upward: boolean
  hub: boolean
  hotspot: boolean
  /** Heavy packages it pulls into the first load. */
  heavy: string[]
  /** 0–1: how much a change here tends to hurt, relative to the hottest file (see heatOf). */
  heat: number
}

export interface HealthLens {
  nodes: Map<string, NodeHealth>
  /** Drawn links (`edgeKey(source, target)`) that close an import loop. */
  cycleEdges: Set<string>
  /** Drawn links that point up the layers. */
  upwardEdges: Set<string>
}

export const edgeKey = (source: string, target: string) => `${source}>${target}`

export function buildHealthLens(health: ArchitectureHealth): HealthLens {
  const unused = new Set([...health.dead, ...Object.values(health.unusedWith ?? {}).flat()])
  const hubs = new Set(health.hubs)
  const hotspots = new Set(health.hotspots.map((h) => h.path))
  const upward = new Set(health.violations.map((v) => v.source))
  const heavy = new Map<string, string[]>()
  for (const h of health.heavy) heavy.set(h.path, [...(heavy.get(h.path) ?? []), h.package])

  const heat = heatOf(health)
  const nodes = new Map<string, NodeHealth>()
  for (const [path, m] of Object.entries(health.perFile)) {
    nodes.set(archId(path), {
      path,
      role: m.role,
      fanIn: m.fanIn,
      fanOut: m.fanOut,
      instability: m.instability,
      lines: m.lines,
      churn: m.churn,
      inCycle: m.cycle !== null,
      unused: unused.has(path),
      upward: upward.has(path),
      hub: hubs.has(path),
      hotspot: hotspots.has(path),
      heavy: heavy.get(path) ?? [],
      heat: heat.get(path) ?? 0,
    })
  }
  return {
    nodes,
    cycleEdges: new Set(health.cycleEdges.map(([s, t]) => edgeKey(archId(s), archId(t)))),
    upwardEdges: new Set(health.violations.map((v) => edgeKey(archId(v.source), archId(v.target)))),
  }
}

// Tests and config change with everything and break nothing; no heat.
const COLD_ROLES = new Set(['test', 'config'])

/**
 * The heat map's value per file: the hotspot score — how often it changes, how
 * much leans on it, how big it is — for every file rather than just the top
 * few, as a share of the hottest. Square-rooted so the middle of the range
 * still shows. Without git history every file counts as changed once, so heat
 * falls back to importers and size.
 */
export function heatOf(health: ArchitectureHealth): Map<string, number> {
  const raw = new Map<string, number>()
  for (const [path, m] of Object.entries(health.perFile)) {
    if (COLD_ROLES.has(m.role)) continue
    const score = (m.churn ?? 1) * Math.log2(2 + m.fanIn) * Math.sqrt(Math.max(1, (m.lines ?? 100) / 100))
    if (score > 0) raw.set(path, score)
  }
  const max = Math.max(0, ...raw.values())
  return new Map([...raw].map(([path, score]) => [path, max ? Math.sqrt(score / max) : 0]))
}

/**
 * A node's drawn radius under the lens: its usual size plus a step that grows
 * with the square root of its importers, capped — a file 70 others import reads
 * as the load-bearing thing it is without swallowing its neighbours.
 */
export function healthRadius(base: number, fanIn: number): number {
  return base + Math.min(7, Math.sqrt(fanIn) * 1.2)
}

/** What changing `path` can break (its importers, transitively) and what it leans on, from the live scan. */
export function impactOf(scan: WorkspaceScan | null, path: string) {
  if (!scan) return { dependents: [], dependencies: [] }
  return { dependents: blastRadius(scan, path), dependencies: dependenciesOf(scan, path) }
}

/** The hover/tooltip line for one node: its counts and anything wrong with it. */
export function describeNodeHealth(h: NodeHealth): string {
  const bits = [`in ${h.fanIn}`, `out ${h.fanOut}`, h.role]
  if (h.inCycle) bits.push('in an import loop')
  if (h.upward) bits.push('imports up the layers')
  if (h.unused) bits.push('unused')
  if (h.hotspot) bits.push('hotspot')
  if (h.heavy.length) bits.push(`loads ${h.heavy.join(', ')} on first launch`)
  return bits.join(' · ')
}
