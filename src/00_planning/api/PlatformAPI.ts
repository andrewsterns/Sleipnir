// Shared shape both transports (web fetch → vite dev middleware, and Electron
// IPC → main process) implement identically, so the rest of the app never
// needs to know which one it's talking to.

import type { GraphEdge, GraphNode, NodeStage, NodeStatus, SavedPlan, ScaffoldEntry, ScaffoldLink } from '../graph/types'

// Re-exported so existing consumers (e.g. sleipnirApi.ts) keep working
// unchanged.
export type { SavedPlan }

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  createdAt: number
  children?: FileTreeNode[]
}

export interface ArchiveEntry {
  path: string
  label: string
  archivedAt: number
}

/** The currently-open Workspace folder — both null when none is open yet. See ROADMAP.md's Phase 0. */
export interface WorkspaceInfo {
  root: string | null
  name: string | null
}

/** One entry in File > Open Recent — see electron/workspaceStore.cjs. `name` is the project's display name (custom, via Rename Project, or the folder's basename) as of when it was last opened; may be stale if renamed from disk elsewhere. */
export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

/** One line hit from searchRepo/searchWorkspace — see ROADMAP.md's Phase 1. `column` is 1-based. */
export interface SearchMatch {
  path: string
  line: number
  column: number
  lineText: string
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

/** How to launch a folder's live preview — command/args follow node:child_process's execFile shape (never a shell string). `command: '__static__'` is a sentinel electron/preview.cjs recognizes as "serve this folder statically" rather than spawning anything. */
export interface PreviewConfig {
  command: string
  args: string[]
  port?: number
}

export interface PreviewConfigEntry extends PreviewConfig {
  path: string
  configuredAt: number
}

export interface GitFileStatus {
  path: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  untracked: boolean
  conflicted: boolean
}

export interface GitStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileStatus[]
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitCommitSummary {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
}

export interface GitBranchTreeEntry {
  name: string
  current: boolean
  isPrimary: boolean
  commits: GitCommitSummary[]
  /** Non-primary branches only — null when no common ancestor with the primary branch exists (disjoint history). */
  forkedFrom?: string | null
  forkPoint?: GitCommitSummary | null
  /** Set when the overall commit budget (see tools/git-control.mjs) was hit before reaching this branch — its commits list is empty, not exhaustive. */
  truncated?: boolean
}

export interface GitBranchTree {
  primary: string | null
  branches: GitBranchTreeEntry[]
}

/** Structured result for push/pull/fetch — never a raw stdout/stderr dump, so the UI can render state without parsing git text. */
export interface GitOpResult {
  ok: boolean
  message: string
  conflicted?: boolean
  conflictedFiles?: string[]
  ahead?: number
  behind?: number
}

/** `git config user.name`/`user.email` as currently effective for this repo (local override, else global) — empty string when unset at either scope. */
export interface GitIdentity {
  name: string
  email: string
}

export interface PlatformAPI {
  /** Re-runs tools/generate-graph.mjs's research/validation doc-graph scan — refreshes Planning's Research Notes/Validation maps after an archive/restore. */
  regenerateGraph(): Promise<{ stdout: string }>
  readFile(path: string): Promise<{ content: string }>
  /** Overwrites an existing file's content. Added for the Phase 2 code editor's save action. */
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<{ tree: FileTreeNode[] }>
  /** Repo-root-scoped counterpart to listDir. */
  listRepoDir(path: string, extraFiles?: string[]): Promise<{ tree: FileTreeNode[] }>
  readRepoFile(path: string): Promise<{ content: string }>
  /** Repo-root-scoped counterpart to writeFile. */
  writeRepoFile(path: string, content: string): Promise<void>
  createFile(path: string, content?: string): Promise<void>
  createDir(path: string): Promise<void>
  /**
   * The currently-open Workspace folder (see ROADMAP.md's Phase 0) — an
   * arbitrary project on disk, completely independent of SRC_ROOT/REPO_ROOT
   * (which stay pinned to Sleipnir's own repo). `root`/`name` are both null
   * when none is open yet.
   */
  getWorkspaceInfo(): Promise<WorkspaceInfo>
  listWorkspaceDir(path: string): Promise<{ tree: FileTreeNode[] }>
  readWorkspaceFile(path: string): Promise<{ content: string }>
  writeWorkspaceFile(path: string, content: string): Promise<void>
  createWorkspaceFile(path: string, content?: string): Promise<void>
  createWorkspaceDir(path: string): Promise<void>
  /** Removes a file or folder (recursively) from the currently-open Workspace. The Electron transport moves it to the OS Recycle Bin; the web transport (no browser-accessible trash) deletes it outright — see electron/main.cjs vs. tools/sleipnir-backend.mjs's deleteWorkspacePath. */
  deleteWorkspacePath(path: string): Promise<void>
  /** Renames/moves a Workspace path (fs.rename). Powers both in-place rename and cut→paste (move into another folder). Rejects if `toPath` already exists — callers de-conflict first. Both ends are validated against the workspace root. */
  renameWorkspacePath(fromPath: string, toPath: string): Promise<void>
  /** Copies a Workspace path (recursive for folders), for copy→paste. `toPath` is the caller's already-de-conflicted target; rejects if it still exists. */
  copyWorkspacePath(fromPath: string, toPath: string): Promise<void>
  /**
   * Project-wide search (ROADMAP.md's Phase 1) — plain case-insensitive
   * substring search over the currently-open Workspace folder, capped at a
   * server-side result limit (`truncated` indicates more matches exist than
   * were returned). Throws if no Workspace is open, same as the other
   * workspace-scoped methods above.
   */
  searchWorkspace(query: string, opts?: { limit?: number }): Promise<{ matches: SearchMatch[]; truncated: boolean }>
  /** Pure filesystem heuristic (package.json scripts, a lone .html file) — `config: null` when nothing's auto-detectable. No process spawning; see previewAPI (electronApi.ts) for actually running it. */
  detectPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfig | null }>
  getPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfigEntry | null }>
  setPreviewConfig(folderRepoRelativePath: string, config: PreviewConfig): Promise<{ config: PreviewConfigEntry }>
  getArchivedPaths(): Promise<{ entries: ArchiveEntry[] }>
  setArchived(path: string, archived: boolean, label?: string): Promise<{ entries: ArchiveEntry[] }>
  /** Plain idea/task nodes with no backing file — created from Planning's "+" flow. */
  getNotes(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  addNote(map: string, label: string, description?: string): Promise<{ node: GraphNode }>
  /** The "Add Node" modal's file-scaffolding branch — creates every entry's real Workspace file plus a matching graph node, atomically, in one call. `links` are architecture-implied auto-links (indices into `entries`), see AddNodeModal.ViewModel. */
  scaffoldNodes(map: string, entries: ScaffoldEntry[], links?: ScaffoldLink[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  /** Created by the AI chat's create_plan_node tool — lands in the CLAUDE map as a draft node. */
  createPlanNode(
    planId: string,
    label: string,
    description?: string,
    parentId?: string,
  ): Promise<{ node: GraphNode }>
  /** Approve/complete a plan node created via createPlanNode. */
  setNodeStatus(id: string, status: NodeStatus): Promise<{ node: GraphNode }>
  /** Full-replace of a node's outgoing 'borrows' edges — used by the node-card link editor and by re-scanning a saved file's real imports (see WorkspaceView's onImportsChanged). */
  setNodeBorrows(nodeId: string, targetIds: string[]): Promise<{ edges: GraphEdge[] }>
  /** Edits a notes.json node's label/description in place (the rename counterpart to addNote). Only nodes stored in notes.json (note, scaffolded, plan-step) are editable; throws for build-generated src nodes, which regenerate from source — callers gate "Rename" to notes-backed nodes. */
  updateNote(id: string, patch: { label?: string; description?: string }): Promise<{ node: GraphNode }>
  /** Permanently deletes a notes.json node (note, scaffolded, or plan-step) plus every edge touching it. The restorable-soft-hide counterpart, setArchived, is for build-generated src nodes instead. Does not delete any real Workspace file a scaffolded node points at — callers pair this with deleteWorkspacePath when the file should go too. */
  deleteNote(id: string): Promise<void>
  /** The per-node sprint-stage overlay — a { [nodeId]: stage } map covering every node id that's been tagged (see graph/stages.ts). Kept separate from the node records so build-generated nodes can be tagged too. */
  getNodeStages(): Promise<{ stages: Record<string, NodeStage> }>
  /** Tags one node with a stage, or clears it when `stage` is null. Any node id is valid — not restricted to notes.json nodes. */
  setNodeStage(id: string, stage: NodeStage | null): Promise<{ stages: Record<string, NodeStage> }>
  /** Named, persisted lists of existing node ids. See src/00_planning/graph/resolvePlan.ts for the client-side neighbor-expansion this backs. */
  getPlans(): Promise<{ plans: SavedPlan[] }>
  /** `assetPaths`, when given, seeds the plan from a Workspace asset-filter selection (see NewWorkspacePlanModal) instead of/alongside real graph node ids. `assetEdges` are the import connections detected between those paths at creation time. */
  createPlan(label: string, nodeIds?: string[], assetPaths?: string[], assetEdges?: { source: string; target: string }[]): Promise<{ plan: SavedPlan }>
  /** Merges workspace-relative paths into a plan's `generatedFiles`, recording what a "Generate Code" run produced while that plan's tab was active. */
  appendPlanGeneratedFiles(id: string, paths: string[]): Promise<{ plan: SavedPlan }>
  /** `opts.deleteFiles` also deletes every path in the plan's `generatedFiles`, resolved against the open Workspace root. */
  deletePlan(id: string, opts?: { deleteFiles?: boolean }): Promise<void>
  /**
   * Runs a file through its language's local interpreter/compiler and
   * captures output. Desktop/local-trusted only: the web transport's runner
   * only exists behind `vite dev`'s own dev-only middleware (never shipped
   * to a production web build) — same trust boundary as every other
   * webApi.ts call. A sandboxed runner (Phase 4b) would be required before
   * this could ever be exposed beyond the developer's own machine.
   */
  runScript(path: string): Promise<RunResult>

  // ── Source Control (local git only — see tools/git-control.mjs) ──────────
  getGitStatus(): Promise<GitStatus>
  getGitDiff(path: string, staged?: boolean): Promise<{ diff: string }>
  stageFiles(paths: string[]): Promise<GitStatus>
  unstageFiles(paths: string[]): Promise<GitStatus>
  /** Discards working-tree changes for the given paths (reverts tracked files to HEAD; unstages + removes untracked/new files). Destructive — the renderer confirms first. See tools/git-control.mjs's discardFiles. */
  discardFiles(paths: string[]): Promise<GitStatus>
  commitChanges(message: string): Promise<GitStatus>
  getBranches(): Promise<GitBranch[]>
  /** Simple branch list + divergence view (not a full multi-lane DAG) — see tools/git-control.mjs's getBranchTree. */
  getBranchTree(): Promise<GitBranchTree>
  /** Refuses to switch while the working tree is dirty — commit or stash first. */
  checkoutBranch(name: string): Promise<GitStatus>
  createBranch(name: string): Promise<GitStatus>
  renameBranch(oldName: string, newName: string): Promise<GitStatus>
  /** Auto-sets upstream on a branch's first push instead of surfacing git's raw "no upstream" error. */
  gitPush(): Promise<GitOpResult>
  /** Returns `conflicted: true` (with the file list) on a merge conflict rather than attempting any automatic resolution — resolve in the Terminal panel. */
  gitPull(): Promise<GitOpResult>
  gitFetch(): Promise<GitOpResult>
  /** Writes always target this repo's local git config — see tools/git-control.mjs's getGitIdentity/setGitIdentity comment for why global is deliberately never touched. */
  getGitIdentity(): Promise<GitIdentity>
  setGitIdentity(name: string, email: string): Promise<GitIdentity>
}
