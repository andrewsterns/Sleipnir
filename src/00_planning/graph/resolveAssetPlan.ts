import { listWorkspaceDir } from '../api/sleipnirApi'
import { flattenFilePaths, getWorkspaceScan } from './workspaceScanCache'
import type { GraphData, SavedPlan } from './types'

async function listFilesUnder(folder: string): Promise<string[]> {
  const { tree } = await listWorkspaceDir(folder)
  return flattenFilePaths(tree)
}

// Hard circuit-breaker on the transitive walk below — a single
// heavily-shared atom/hook can otherwise pull a large fraction of the
// codebase into one plan. Generous enough that a real feature's reference
// tree fits comfortably; if a plan legitimately hits it, that's a sign the
// seed file(s) sit close to the root of the whole dependency graph, not that
// the cap needs raising.
const MAX_DISCOVERED_NODES = 300

// A live re-derivation of an asset-based plan's nodes/edges from the
// Workspace's current disk state — the counterpart to resolvePlan.ts's
// resolvePlanGraph for the *other* kind of plan (graph-node-based). Never a
// frozen snapshot: `assetFolders` (whole directories selected at creation,
// see NewWorkspacePlanModal.ViewModel's dirState) are re-listed on every
// call, so a file added under one since plan creation shows up as a new node
// automatically; `assetPaths` entries outside any assetFolders stay a fixed
// set (they were hand-picked one at a time, not "everything under X"), but
// edges always reflect each file's current imports, not whatever was detected
// when the plan was made. `plan.assetEdges`/frozen `assetPaths` remain on the
// type purely as graphForPlan's flash-free first-paint fallback
// (PlanningView.ViewModel.tsx) before this resolves.
//
// Nodes aren't limited to the explicitly-added set either, and not just one
// hop out from it, and not just outgoing imports: this walks the whole
// project's import graph (the shared cached scan — see workspaceScanCache.ts)
// BOTH directions from the explicit seed set until it runs out of new files
// or hits MAX_DISCOVERED_NODES. The reverse direction matters as much as the
// forward one — an image or font has no imports of its own, so the ONLY way
// to connect it to anything is to find the components that import IT.
export async function resolveAssetPlanGraph(plan: SavedPlan): Promise<GraphData> {
  const folders = plan.assetFolders ?? []
  const folderFiles = (await Promise.all(folders.map((f) => listFilesUnder(f).catch(() => [] as string[])))).flat()
  const loosePaths = (plan.assetPaths ?? []).filter((p) => !folders.some((f) => p === f || p.startsWith(`${f}/`)))
  const explicitPaths = [...new Set([...folderFiles, ...loosePaths])]
  const explicitSet = new Set(explicitPaths)

  const { edges: allProjectEdges } = await getWorkspaceScan().catch(() => ({ files: explicitPaths, edges: [] }))
  const pushTo = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  const forward = new Map<string, string[]>()
  const backward = new Map<string, string[]>()
  for (const e of allProjectEdges) {
    pushTo(forward, e.source, e.target)
    pushTo(backward, e.target, e.source)
  }

  const visited = new Set(explicitPaths)
  const allEdges: { source: string; target: string }[] = []
  const edgeSeen = new Set<string>()
  const addEdge = (source: string, target: string) => {
    const key = `${source}>${target}`
    if (edgeSeen.has(key)) return
    edgeSeen.add(key)
    allEdges.push({ source, target })
  }
  // The cap only ever gates whether a NEW (not-yet-visited) file gets pulled
  // in and explored further — it must never block processing of the current
  // frontier's own edges, or an explicit set that's already at/over the cap
  // (e.g. a whole-project `assetFolders: ['src']` pick) would lose ALL of
  // its edges, including the ones purely between files the user themselves
  // added.
  let frontier = explicitPaths
  while (frontier.length > 0) {
    const next: string[] = []
    for (const path of frontier) {
      for (const target of forward.get(path) ?? []) {
        addEdge(path, target)
        if (!visited.has(target) && visited.size < MAX_DISCOVERED_NODES) {
          visited.add(target)
          next.push(target)
        }
      }
      for (const source of backward.get(path) ?? []) {
        addEdge(source, path)
        if (!visited.has(source) && visited.size < MAX_DISCOVERED_NODES) {
          visited.add(source)
          next.push(source)
        }
      }
    }
    frontier = next
  }

  const idFor = (path: string) => `workspace-asset/${plan.id}/${path}`

  return {
    nodes: [...visited].map((path) => ({
      id: idFor(path),
      label: path.split('/').pop() ?? path,
      // Every node a plan picks up — explicitly added or pulled in by the
      // reference walk — starts life as 'proposed' (ring, not solid dot):
      // a file being under review for this plan isn't the same claim as
      // "this is a finished, built part of the app," and every other
      // node-creation path (scaffoldNodes, addNote, createPlanNode) already
      // defaults the same way.
      kind: 'proposed',
      map: plan.id,
      filePath: path,
      type: 'workspace-file',
      ...(explicitSet.has(path) ? {} : { discovered: true }),
    })),
    edges: allEdges.map((e) => ({ source: idFor(e.source), target: idFor(e.target), kind: 'borrows' as const })),
  }
}
