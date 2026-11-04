import { useState } from 'react'
import { DEFAULT_FORCES, FORCE_RANGES, type GraphForces } from './graph/layout'

const KEY = 'sleipnir.graphForces.v2'
// The first version of these dials, whose center ran the other way (0–1, 1 the
// tightest). Read once and turned around, so a saved setting keeps its look.
const V1_KEY = 'sleipnir.graphForces'
// The single SPACING slider before that. Spacing scaled the push, which is repel.
const LEGACY_SPACING_KEY = 'sleipnir.graphSpacing'

const inRange = (v: unknown, { min, max }: { min: number; max: number }): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function load(): GraphForces {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GraphForces>
      return {
        center: inRange(parsed.center, FORCE_RANGES.center) ? parsed.center : DEFAULT_FORCES.center,
        repel: inRange(parsed.repel, FORCE_RANGES.repel) ? parsed.repel : DEFAULT_FORCES.repel,
      }
    }
    const v1 = localStorage.getItem(V1_KEY)
    if (v1) {
      const old = JSON.parse(v1) as Partial<GraphForces>
      const center = typeof old.center === 'number' ? FORCE_RANGES.center.max * (1 - Math.min(1, Math.max(0, old.center))) : DEFAULT_FORCES.center
      const repel = inRange(old.repel, FORCE_RANGES.repel) ? old.repel : DEFAULT_FORCES.repel
      return { center, repel }
    }
    const spacing = Number(localStorage.getItem(LEGACY_SPACING_KEY))
    if (spacing > 1) {
      return { ...DEFAULT_FORCES, repel: Math.min(FORCE_RANGES.repel.max, DEFAULT_FORCES.repel * spacing) }
    }
  } catch {
    // Unreadable — the defaults below.
  }
  return DEFAULT_FORCES
}

// The graph's center and repel dials, remembered on this machine: a viewer's
// comfort setting, not project data, so it lives in local storage and falls
// back to the defaults whenever that isn't there.
export function useGraphForces(): [GraphForces, (patch: Partial<GraphForces>) => void] {
  const [forces, setForcesState] = useState<GraphForces>(load)
  const setForces = (patch: Partial<GraphForces>) => {
    setForcesState((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Not remembered this time; the dials still work.
      }
      return next
    })
  }
  return [forces, setForces]
}
