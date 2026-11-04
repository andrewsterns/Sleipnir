import { useEffect, useRef, useState } from 'react'
import { applyTrailStatuses, getAgentTrail } from '../platform/sleipnirApi'
import { isPlanningWatchAvailable } from '../platform/iPlanningWatch'
import type { TrailEntry } from './graph/types'
import { FADE_MS } from './graph/agentTrail'

// The live agent trail (graph/agentTrail.ts): every agent tool call Sleipnir
// heard about, newest last — from .planning/trail.jsonl, re-read whenever the
// planning watcher says it grew, plus edits made on disk by agents Sleipnir
// can't hook (the watcher's workspace edits). Ticks `now` while anything on it
// is still fading, so marks dim smoothly and stop costing renders when idle.
const KEEP = 400
const TICK_MS = 400
// An edit the trail already has (a hooked agent's) isn't repeated from disk.
const SAME_EDIT_MS = 4_000

export function useAgentTrail(projectKey?: string | null) {
  const [entries, setEntries] = useState<TrailEntry[]>([])
  const [now, setNow] = useState(() => Date.now())
  const lastAt = useRef(0)

  useEffect(() => {
    let cancelled = false
    lastAt.current = 0
    setEntries([])
    const load = () =>
      getAgentTrail(lastAt.current)
        .then(({ entries: fresh }) => {
          if (cancelled || fresh.length === 0) return
          lastAt.current = fresh[fresh.length - 1].at
          setEntries((prev) => [...prev, ...fresh].slice(-KEEP))
          // What the new lines say about step statuses (see the backend's
          // applyTrailStatuses — it keeps its own place, so repeats are free).
          void applyTrailStatuses().catch(() => {})
        })
        .catch(() => {})
    void load()
    const api = isPlanningWatchAvailable() ? window.planningWatchAPI! : null
    const offTrail = api?.onChanged((info) => { if (info?.trail) void load() })
    const offEdits = api?.onWorkspaceEdited?.(({ paths, at }) => {
      setEntries((prev) => {
        const hooked = new Set(prev.filter((e) => e.kind === 'edit' && at - e.at < SAME_EDIT_MS).flatMap((e) => e.paths ?? []))
        const fresh = paths.filter((p) => !hooked.has(p))
        return fresh.length ? [...prev, { at, kind: 'edit' as const, paths: fresh }].slice(-KEEP) : prev
      })
    })
    return () => {
      cancelled = true
      offTrail?.()
      offEdits?.()
    }
  }, [projectKey])

  // Tick only while the newest entry could still be on screen.
  const newest = entries[entries.length - 1]?.at ?? 0
  const longest = Math.max(...Object.values(FADE_MS))
  useEffect(() => {
    if (!newest || Date.now() - newest > longest) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t - newest > longest) window.clearInterval(id)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [newest, longest])

  return { entries, now }
}
