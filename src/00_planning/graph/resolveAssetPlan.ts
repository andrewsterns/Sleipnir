import { listWorkspaceDir, readWorkspaceFile } from '../api/sleipnirApi'
import type { FileTreeNode } from '../api/PlatformAPI'
import { detectEdgesForPaths } from './importAdapters/detectEdges'
import type { GraphData, SavedPlan } from './types'

function flattenFilePaths(nodes: FileTreeNode[], into: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'file') into.push(n.path)
    else if (n.children) flattenFilePaths(n.children, into)
  }
  return into
}

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
// every path's content is still re-read and re-scanned fresh, so edges
// always reflect the file's current imports, not whatever was detected when
// the plan was made. `plan.assetEdges`/frozen `assetPaths` remain on the
// type purely as graphForPlan's flash-free first-paint fallback
// (PlanningView.ViewModel.tsx) before this resolves.
//
// Nodes aren't limited to the explicitly-added set either, and not just one
// hop out from it: an edge whose target resolves outside the plan's own pool
// (relative or tsconfig/jsconfig-aliased, e.g. '@molecules/Foo' pointing at
// a file never added to this plan) gets a node for that file too, and THAT
// file's own imports are scanned in turn, breadth-first, until the walk runs
// out of new files or hits MAX_DISCOVERED_NODES — so a seed file's full
// reference chain shows up (CardView -> Section -> useElementOrigin -> ...),
// not just its direct imports. Each file's content is read and scanned
// exactly once regardless of how many other files reference it.
export async function resolveAssetPlanGraph(plan: SavedPlan): Promise<GraphData> {
  const folders = plan.assetFolders ?? []
  const folderFiles = (await Promise.all(folders.map((f) => listFilesUnder(f).catch(() => [] as string[])))).flat()
  const loosePaths = (plan.assetPaths ?? []).filter((p) => !folders.some((f) => p === f || p.startsWith(`${f}/`)))
  const explicitPaths = [...new Set([...folderFiles, ...loosePaths])]
  const explicitSet = new Set(explicitPaths)

  const readFile = (p: string) => readWorkspaceFile(p).then((r) => r.content)
  // Resolve specifiers against every real file in the workspace, not just
  // this plan's own pool — falls back to just the explicit set (today's old
  // behavior) if the whole-workspace listing fails.
  const resolvePool = await listFilesUnder('').catch(() => explicitPaths)

  const visited = new Set(explicitPaths)
  const allEdges: { source: string; target: string }[] = []
  const edgeSeen = new Set<string>()
  let frontier = explicitPaths
  while (frontier.length > 0 && visited.size < MAX_DISCOVERED_NODES) {
    const edges = await detectEdgesForPaths(frontier, readFile, resolvePool)
    const next: string[] = []
    for (const e of edges) {
      const key = `${e.source}>${e.target}`
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key)
        allEdges.push(e)
      }
      if (!visited.has(e.target)) {
        visited.add(e.target)
        next.push(e.target)
      }
    }
    frontier = next
  }

  const idFor = (path: string) => `workspace-asset/${plan.id}/${path}`

  return {
    nodes: [...visited].map((path) => ({
      id: idFor(path),
      label: path.split('/').pop() ?? path,
      kind: 'built',
      map: plan.id,
      filePath: path,
      type: 'workspace-file',
      ...(explicitSet.has(path) ? {} : { discovered: true }),
    })),
    edges: allEdges.map((e) => ({ source: idFor(e.source), target: idFor(e.target), kind: 'borrows' as const })),
  }
}
