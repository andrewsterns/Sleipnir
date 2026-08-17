import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import { getNodeStages, setNodeStage } from './api/sleipnirApi'
import type { NodeStage } from './graph/types'

// Single in-memory cache of the stage overlay (.planning/stages.json),
// shared by every view that reads or writes a node/file's stage — Workspace's
// file tree, Source Control, and Planning's node card/graph/list. Before this
// existed, each view fetched its own copy into local useState at mount time,
// so a status set from Workspace would sit invisible in an already-mounted
// Planning tab (and vice versa) until that tab happened to unmount and
// refetch. useSyncExternalStore fixes that: every subscriber re-renders off
// the same object the moment any of them writes through.
let stages: Record<string, NodeStage> = {}
let loaded = false
let inflight: Promise<void> | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const fn of subscribers) fn()
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

function getSnapshot() {
  return stages
}

async function load() {
  if (loaded) return
  if (!inflight) {
    inflight = getNodeStages()
      .then(({ stages: fresh }) => { stages = fresh; loaded = true; notify() })
      .catch(() => { loaded = true })
      .finally(() => { inflight = null })
  }
  await inflight
}

// Forces the next read to refetch — for callers that know the overlay
// changed server-side outside of setStage (e.g. a node's stage entry being
// swept on node deletion, see sleipnir-backend.mjs's deleteNode).
export async function refreshStages() {
  loaded = false
  await load()
}

// Tags (or, passing null, clears) one id's stage — any node id, or a
// useFileStages `file:<path>` synthetic key. Optimistic: updates the shared
// cache (so every subscriber recolors instantly) before the write-through
// resolves; rolls back and rethrows on failure so callers can surface it.
export async function setStage(id: string, stage: NodeStage | null) {
  const prev = stages
  const next = { ...prev }
  if (stage) next[id] = stage
  else delete next[id]
  stages = next
  notify()
  try {
    await setNodeStage(id, stage)
  } catch (e) {
    stages = prev
    notify()
    throw e
  }
}

// Live-subscribed { [id]: stage } overlay. Lazily fetches once across the
// whole app (module-level `loaded`/`inflight` de-dupe concurrent mounts), then
// every subsequent read is just the shared snapshot.
export function useStages(): Record<string, NodeStage> {
  useEffect(() => { load() }, [])
  return useSyncExternalStore(subscribe, getSnapshot)
}
