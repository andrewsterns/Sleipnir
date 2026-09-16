// One cached import scan of the whole open Workspace — every file plus every
// detected import between them — shared by every consumer that needs the
// project's real architecture (plan tabs' architecture view, asset plans'
// reference walk). Scanning reads every source file, so doing it per tab switch
// or per refresh (as resolveAssetPlan used to) doesn't scale.
//
// Invalidation is deliberately granular:
//   invalidateWorkspacePaths — files whose content changed (editor save, a
//                              plan step writing its files): only those are re-read
//   invalidateWorkspaceListing — files may have been added/removed: re-list, scan
//                              only files not scanned before, drop deleted ones
//   invalidateWorkspaceScan  — start over (manual refresh)
// The cache is keyed by workspace root, so opening another project starts fresh.
import { getWorkspaceInfo, listWorkspaceDir, readWorkspaceFile } from '../api/sleipnirApi'
import type { FileTreeNode } from '../api/PlatformAPI'
import { detectEdgesForPaths } from './importAdapters/detectEdges'

export interface WorkspaceScan {
  /** Every workspace-relative file path. */
  files: string[]
  /** Detected imports: `source` imports `target`, both paths in `files`. */
  edges: { source: string; target: string }[]
}

export interface ScanDeps {
  rootKey: () => Promise<string>
  listFiles: () => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

export function flattenFilePaths(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'file') into.push(n.path)
    else if (n.children) flattenFilePaths(n.children, into)
  }
  return into
}

// Extensions that can only ever be an import TARGET, never a source of
// imports of its own — an image/font/media/archive has no syntax to scan.
// Excluded from content scanning purely as a cost cut; they still show up as
// files and as edge targets.
const NON_SOURCE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'mkv',
  'pdf', 'zip', 'gz', 'tar', '7z', 'rar',
  'wasm', 'exe', 'dll', 'so', 'dylib', 'node',
])

export function isScannableSource(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return !NON_SOURCE_EXTS.has(ext)
}

const defaultDeps: ScanDeps = {
  // No open project (or no transport) keys the cache as '' rather than failing the scan.
  rootKey: async () => {
    try {
      return (await getWorkspaceInfo()).root ?? ''
    } catch {
      return ''
    }
  },
  listFiles: () => listWorkspaceDir('').then(({ tree }) => flattenFilePaths(tree)),
  readFile: (path) => readWorkspaceFile(path).then((r) => r.content),
}

interface CacheState {
  key: string
  /** Scanned source file -> its outgoing imports. */
  bySource: Map<string, { source: string; target: string }[]>
  dirty: Set<string>
  stale: 'none' | 'listing' | 'all'
  result: WorkspaceScan | null
  inflight: Promise<WorkspaceScan> | null
}

let state: CacheState | null = null

export async function getWorkspaceScan(deps: ScanDeps = defaultDeps): Promise<WorkspaceScan> {
  const key = await deps.rootKey()
  if (!state || state.key !== key) {
    state = { key, bySource: new Map(), dirty: new Set(), stale: 'all', result: null, inflight: null }
  }
  const s = state
  if (s.inflight) return s.inflight
  if (s.result && s.stale === 'none' && s.dirty.size === 0) return s.result
  s.inflight = rescan(s, deps).finally(() => {
    s.inflight = null
  })
  return s.inflight
}

async function rescan(s: CacheState, deps: ScanDeps): Promise<WorkspaceScan> {
  // Take the pending work now, so invalidations arriving mid-scan queue for
  // the next call instead of being lost.
  const full = s.stale === 'all' || !s.result
  const dirty = s.dirty
  s.dirty = new Set()
  s.stale = 'none'
  try {
    const files = await deps.listFiles()
    const fileSet = new Set(files)
    if (full) s.bySource.clear()
    for (const source of [...s.bySource.keys()]) if (!fileSet.has(source)) s.bySource.delete(source)

    const toScan = files.filter((p) => isScannableSource(p) && (full || dirty.has(p) || !s.bySource.has(p)))
    const edges = toScan.length ? await detectEdgesForPaths(toScan, deps.readFile, files) : []
    for (const p of toScan) s.bySource.set(p, [])
    for (const e of edges) s.bySource.get(e.source)?.push(e)

    s.result = { files, edges: [...s.bySource.values()].flat().filter((e) => fileSet.has(e.target)) }
    return s.result
  } catch (err) {
    s.stale = 'all'
    throw err
  }
}

export function invalidateWorkspacePaths(paths: string[]): void {
  if (!state) return
  for (const p of paths) state.dirty.add(p)
}

export function invalidateWorkspaceListing(): void {
  if (state && state.stale === 'none') state.stale = 'listing'
}

export function invalidateWorkspaceScan(): void {
  if (state) state.stale = 'all'
}

/** Test-only: forget everything. */
export function resetWorkspaceScanCache(): void {
  state = null
}
