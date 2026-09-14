// Web transport: talks to the local dev-only file API backed by
// vite.config.ts's sleipnir-api middleware. Only meaningful under `vite dev`
// — there's no server to call in a production web build.

import type {
  PlatformAPI,
  FileTreeNode,
  ArchiveEntry,
  RunResult,
  GitStatus,
  GitBranch,
  GitBranchTree,
  GitCommitGraph,
  GitCommitFileMap,
  GitOpResult,
  GitIdentity,
  GitStash,
  PreviewConfig,
  PreviewConfigEntry,
  WorkspaceInfo,
  SearchMatch,
} from './PlatformAPI'
import type { GraphEdge, GraphNode, NodeStage, NodeStatus, SavedPlan, ScaffoldEntry, ScaffoldLink } from '../graph/types'

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.success === false) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`)
  }
  return data as T
}

export const webApi: PlatformAPI = {
  regenerateGraph(): Promise<{ stdout: string }> {
    return fetch('/api/sleipnir/regenerate-graph', { method: 'POST' }).then((res) => asJson<{ stdout: string }>(res))
  },

  readFile(path: string): Promise<{ content: string }> {
    return fetch(`/api/sleipnir/read-file?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ content: string }>(res),
    )
  },

  writeFile(path: string, content: string): Promise<void> {
    return fetch('/api/sleipnir/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  listDir(path: string): Promise<{ tree: FileTreeNode[] }> {
    return fetch(`/api/sleipnir/list-dir?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ tree: FileTreeNode[] }>(res),
    )
  },

  listRepoDir(path: string, extraFiles?: string[]): Promise<{ tree: FileTreeNode[] }> {
    const qs = new URLSearchParams({ path })
    for (const f of extraFiles ?? []) qs.append('extraFiles', f)
    return fetch(`/api/sleipnir/list-repo-dir?${qs}`).then((res) => asJson<{ tree: FileTreeNode[] }>(res))
  },

  readRepoFile(path: string): Promise<{ content: string }> {
    return fetch(`/api/sleipnir/read-repo-file?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ content: string }>(res),
    )
  },

  writeRepoFile(path: string, content: string): Promise<void> {
    return fetch('/api/sleipnir/write-repo-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  createFile(path: string, content?: string): Promise<void> {
    return fetch('/api/sleipnir/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  createDir(path: string): Promise<void> {
    return fetch('/api/sleipnir/create-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<void>(res))
  },

  getWorkspaceInfo(): Promise<WorkspaceInfo> {
    return fetch('/api/sleipnir/workspace/info').then((res) => asJson<WorkspaceInfo>(res))
  },

  listWorkspaceDir(path: string): Promise<{ tree: FileTreeNode[] }> {
    return fetch(`/api/sleipnir/workspace/list-dir?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ tree: FileTreeNode[] }>(res),
    )
  },

  readWorkspaceFile(path: string): Promise<{ content: string }> {
    return fetch(`/api/sleipnir/workspace/read-file?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ content: string }>(res),
    )
  },

  writeWorkspaceFile(path: string, content: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  createWorkspaceFile(path: string, content?: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  createWorkspaceDir(path: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/create-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<void>(res))
  },

  deleteWorkspacePath(path: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/delete-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<void>(res))
  },

  renameWorkspacePath(fromPath: string, toPath: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/rename-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPath, toPath }),
    }).then((res) => asJson<void>(res))
  },

  copyWorkspacePath(fromPath: string, toPath: string): Promise<void> {
    return fetch('/api/sleipnir/workspace/copy-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPath, toPath }),
    }).then((res) => asJson<void>(res))
  },

  searchWorkspace(query: string, opts?: { limit?: number }): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
    const params = new URLSearchParams({ query, ...(opts?.limit ? { limit: String(opts.limit) } : {}) })
    return fetch(`/api/sleipnir/search-workspace?${params}`).then((res) => asJson<{ matches: SearchMatch[]; truncated: boolean }>(res))
  },

  detectPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfig | null }> {
    return fetch(`/api/sleipnir/detect-preview-config?path=${encodeURIComponent(folderRepoRelativePath)}`).then((res) =>
      asJson<{ config: PreviewConfig | null }>(res),
    )
  },

  getPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfigEntry | null }> {
    return fetch(`/api/sleipnir/preview-config?path=${encodeURIComponent(folderRepoRelativePath)}`).then((res) =>
      asJson<{ config: PreviewConfigEntry | null }>(res),
    )
  },

  setPreviewConfig(folderRepoRelativePath: string, config: PreviewConfig): Promise<{ config: PreviewConfigEntry }> {
    return fetch('/api/sleipnir/preview-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderRepoRelativePath, config }),
    }).then((res) => asJson<{ config: PreviewConfigEntry }>(res))
  },

  getArchivedPaths(): Promise<{ entries: ArchiveEntry[] }> {
    return fetch('/api/sleipnir/archive').then((res) => asJson<{ entries: ArchiveEntry[] }>(res))
  },

  setArchived(path: string, archived: boolean, label?: string): Promise<{ entries: ArchiveEntry[] }> {
    return fetch('/api/sleipnir/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, archived, label }),
    }).then((res) => asJson<{ entries: ArchiveEntry[] }>(res))
  },

  getNotes(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return fetch('/api/sleipnir/notes').then((res) => asJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>(res))
  },

  addNote(map: string, label: string, description?: string): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map, label, description }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  scaffoldNodes(map: string, entries: ScaffoldEntry[], links?: ScaffoldLink[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return fetch('/api/sleipnir/scaffold-nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map, entries, links }),
    }).then((res) => asJson<{ nodes: GraphNode[]; edges: GraphEdge[] }>(res))
  },

  createPlanNode(
    planId: string,
    label: string,
    description?: string,
    parentId?: string,
  ): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/plan-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, label, description, parentId }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  proposeFileNode(
    planId: string,
    label: string,
    description: string | undefined,
    filePath: string,
    content: string,
    parentId?: string,
    linkTargetIds?: string[],
  ): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/plan-node/propose-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, label, description, filePath, content, parentId, linkTargetIds }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  setNodeStatus(id: string, status: NodeStatus): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/node-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  setNodeBorrows(nodeId: string, targetIds: string[]): Promise<{ edges: GraphEdge[] }> {
    return fetch('/api/sleipnir/node-borrows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, targetIds }),
    }).then((res) => asJson<{ edges: GraphEdge[] }>(res))
  },

  updateNote(id: string, patch: { label?: string; description?: string }): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/update-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, patch }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  deleteNote(id: string): Promise<void> {
    return fetch('/api/sleipnir/delete-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).then((res) => asJson<void>(res))
  },

  getNodeStages(): Promise<{ stages: Record<string, NodeStage> }> {
    return fetch('/api/sleipnir/node-stages').then((res) => asJson<{ stages: Record<string, NodeStage> }>(res))
  },

  setNodeStage(id: string, stage: NodeStage | null): Promise<{ stages: Record<string, NodeStage> }> {
    return fetch('/api/sleipnir/node-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stage }),
    }).then((res) => asJson<{ stages: Record<string, NodeStage> }>(res))
  },

  setDefaultNodeStages(ids: string[], stage: NodeStage): Promise<{ stages: Record<string, NodeStage> }> {
    return fetch('/api/sleipnir/node-stages/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, stage }),
    }).then((res) => asJson<{ stages: Record<string, NodeStage> }>(res))
  },

  getPlans(): Promise<{ plans: SavedPlan[] }> {
    return fetch('/api/sleipnir/plans').then((res) => asJson<{ plans: SavedPlan[] }>(res))
  },

  createPlan(
    label: string,
    nodeIds: string[] = [],
    assetPaths?: string[],
    assetEdges?: { source: string; target: string }[],
    assetFolders?: string[],
  ): Promise<{ plan: SavedPlan }> {
    return fetch('/api/sleipnir/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, nodeIds, assetPaths, assetEdges, assetFolders }),
    }).then((res) => asJson<{ plan: SavedPlan }>(res))
  },

  appendPlanGeneratedFiles(id: string, paths: string[]): Promise<{ plan: SavedPlan }> {
    return fetch('/api/sleipnir/plans/generated-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paths }),
    }).then((res) => asJson<{ plan: SavedPlan }>(res))
  },

  addPlanNodes(id: string, nodeIds: string[]): Promise<{ plan: SavedPlan }> {
    return fetch('/api/sleipnir/plans/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nodeIds }),
    }).then((res) => asJson<{ plan: SavedPlan }>(res))
  },

  addPlanAssets(id: string, paths?: string[], folders?: string[]): Promise<{ plan: SavedPlan }> {
    return fetch('/api/sleipnir/plans/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paths, folders }),
    }).then((res) => asJson<{ plan: SavedPlan }>(res))
  },

  approvePlanNodes(planId: string): Promise<{ approvedIds: string[]; needsReviewIds: string[] }> {
    return fetch('/api/sleipnir/plans/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    }).then((res) => asJson<{ approvedIds: string[]; needsReviewIds: string[] }>(res))
  },

  renamePlan(id: string, label: string): Promise<{ plan: SavedPlan }> {
    return fetch('/api/sleipnir/rename-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, label }),
    }).then((res) => asJson<{ plan: SavedPlan }>(res))
  },

  deletePlan(id: string, opts?: { deleteFiles?: boolean; deleteNodes?: boolean }): Promise<void> {
    return fetch('/api/sleipnir/delete-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, deleteFiles: opts?.deleteFiles, deleteNodes: opts?.deleteNodes }),
    }).then((res) => asJson<void>(res))
  },

  runScript(path: string): Promise<RunResult> {
    return fetch('/api/sleipnir/run-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<RunResult>(res))
  },

  getGitStatus(): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/status').then((res) => asJson<GitStatus>(res))
  },

  getGitDiff(path: string, staged?: boolean): Promise<{ diff: string }> {
    const qs = `?path=${encodeURIComponent(path)}&staged=${staged ? '1' : '0'}`
    return fetch(`/api/sleipnir/git/diff${qs}`).then((res) => asJson<{ diff: string }>(res))
  },

  stageFiles(paths: string[]): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    }).then((res) => asJson<GitStatus>(res))
  },

  unstageFiles(paths: string[]): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    }).then((res) => asJson<GitStatus>(res))
  },

  discardFiles(paths: string[]): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    }).then((res) => asJson<GitStatus>(res))
  },

  commitChanges(message: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then((res) => asJson<GitStatus>(res))
  },

  getBranches(): Promise<GitBranch[]> {
    return fetch('/api/sleipnir/git/branches')
      .then((res) => asJson<{ branches: GitBranch[] }>(res))
      .then((data) => data.branches)
  },

  getBranchTree(): Promise<GitBranchTree> {
    return fetch('/api/sleipnir/git/branch-tree').then((res) => asJson<GitBranchTree>(res))
  },

  getCommitGraph(): Promise<GitCommitGraph> {
    return fetch('/api/sleipnir/git/commit-graph').then((res) => asJson<GitCommitGraph>(res))
  },

  getCommitFileMap(): Promise<GitCommitFileMap> {
    return fetch('/api/sleipnir/git/commit-files').then((res) => asJson<GitCommitFileMap>(res))
  },

  checkoutBranch(name: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((res) => asJson<GitStatus>(res))
  },

  createBranch(name: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/create-branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((res) => asJson<GitStatus>(res))
  },

  renameBranch(oldName: string, newName: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/rename-branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    }).then((res) => asJson<GitStatus>(res))
  },

  gitPush(): Promise<GitOpResult> {
    return fetch('/api/sleipnir/git/push', { method: 'POST' }).then((res) => asJson<GitOpResult>(res))
  },

  gitPull(): Promise<GitOpResult> {
    return fetch('/api/sleipnir/git/pull', { method: 'POST' }).then((res) => asJson<GitOpResult>(res))
  },

  gitFetch(): Promise<GitOpResult> {
    return fetch('/api/sleipnir/git/fetch', { method: 'POST' }).then((res) => asJson<GitOpResult>(res))
  },

  gitStashPush(message?: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/stash-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).then((res) => asJson<GitStatus>(res))
  },

  gitStashList(): Promise<GitStash[]> {
    return fetch('/api/sleipnir/git/stash-list')
      .then((res) => asJson<{ stashes: GitStash[] }>(res))
      .then((data) => data.stashes)
  },

  gitStashApply(ref: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/stash-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    }).then((res) => asJson<GitStatus>(res))
  },

  gitStashPop(ref: string): Promise<GitStatus> {
    return fetch('/api/sleipnir/git/stash-pop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    }).then((res) => asJson<GitStatus>(res))
  },

  gitStashDrop(ref: string): Promise<GitStash[]> {
    return fetch('/api/sleipnir/git/stash-drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    })
      .then((res) => asJson<{ stashes: GitStash[] }>(res))
      .then((data) => data.stashes)
  },

  getGitIdentity(): Promise<GitIdentity> {
    return fetch('/api/sleipnir/git/identity').then((res) => asJson<GitIdentity>(res))
  },

  setGitIdentity(name: string, email: string): Promise<GitIdentity> {
    return fetch('/api/sleipnir/git/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    }).then((res) => asJson<GitIdentity>(res))
  },
}
