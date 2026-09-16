// Cuts a whole-workspace architecture down to something a plan tab can draw.
// A small project is shown whole. A large one keeps the files near what the
// plan touches (within `hops` imports of them) and collapses everything else
// into one node per folder, with the imports between them rolled up — so the
// plan still reads in the context of the whole codebase without a hairball.
import type { WorkspaceScan } from './workspaceScanCache'

export interface ScopeOptions {
  /** Import hops (either direction) out from the focus files to keep. */
  hops?: number
  /** At or under this many files, everything is kept. Also caps kept files. */
  max?: number
}

export interface ScopedArchitecture {
  /** Kept file paths, in scan order. */
  files: string[]
  /** Collapsed folders and how many files each stands for. */
  folders: { path: string; count: number }[]
  /** Deduplicated imports between node ids (see archId / folderId). */
  edges: { source: string; target: string }[]
}

export const archId = (path: string) => `arch/${path}`
export const folderId = (dir: string) => `folder/${dir}`

// Collapsed folders group by at most this many leading segments, so a deep
// tree becomes a handful of aggregates rather than one per leaf directory.
const FOLDER_DEPTH = 2

export function folderKeyOf(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.slice(0, FOLDER_DEPTH).join('/') || '.'
}

export function scopeArchitecture(
  scan: WorkspaceScan,
  focus: { paths: string[]; dirs: string[] },
  { hops = 2, max = 300 }: ScopeOptions = {},
): ScopedArchitecture {
  const dedupe = (edges: { source: string; target: string }[]) => {
    const seen = new Set<string>()
    return edges.filter((e) => {
      const key = `${e.source}>${e.target}`
      if (e.source === e.target || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  if (scan.files.length <= max) {
    return {
      files: scan.files,
      folders: [],
      edges: dedupe(scan.edges.map((e) => ({ source: archId(e.source), target: archId(e.target) }))),
    }
  }

  const fileSet = new Set(scan.files)
  const adjacent = new Map<string, string[]>()
  for (const e of scan.edges) {
    adjacent.set(e.source, [...(adjacent.get(e.source) ?? []), e.target])
    adjacent.set(e.target, [...(adjacent.get(e.target) ?? []), e.source])
  }

  const kept = new Set<string>()
  const keep = (p: string) => {
    if (kept.size < max && fileSet.has(p)) kept.add(p)
  }
  for (const p of focus.paths) keep(p)
  // A folder a planned file will land in: its existing direct children are context.
  for (const dir of focus.dirs) {
    for (const f of scan.files) {
      if (f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/')) keep(f)
    }
  }
  let frontier = [...kept]
  for (let hop = 0; hop < hops && frontier.length; hop++) {
    const next: string[] = []
    for (const p of frontier) {
      for (const q of adjacent.get(p) ?? []) {
        if (!kept.has(q) && kept.size < max) {
          kept.add(q)
          next.push(q)
        }
      }
    }
    frontier = next
  }

  const counts = new Map<string, number>()
  for (const f of scan.files) {
    if (kept.has(f)) continue
    const key = folderKeyOf(f)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const idOf = (p: string) => (kept.has(p) ? archId(p) : folderId(folderKeyOf(p)))

  return {
    files: scan.files.filter((f) => kept.has(f)),
    folders: [...counts].map(([path, count]) => ({ path, count })).sort((a, b) => a.path.localeCompare(b.path)),
    edges: dedupe(scan.edges.map((e) => ({ source: idOf(e.source), target: idOf(e.target) }))),
  }
}
