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
  /** True (Electron only) when the window has no *chosen* project and is working in the auto-provided "scratch" project — plans/files persist to a per-user scratch dir until saved to a real folder via saveScratchToFolder. Absent/false for a real opened project (and always for the web transport, which has no scratch fallback). */
  isScratch?: boolean
  /** Null when the open Workspace root is outside Sleipnir's own repo (or none is open) — otherwise the REPO_ROOT-relative path to it, forward-slashed ('' when the Workspace root IS REPO_ROOT itself — the default first-launch state). Gates the code editor's LSP attachment for scope:'workspace' (tsserver's project root is hardcoded to REPO_ROOT — see tools/lsp-proxy.mjs's getTsServer). */
  repoRelativeRoot?: string | null
}

/** A path stored in `.planning/` that no longer exists in the Workspace — usually renamed, moved, or deleted outside Sleipnir. See tools/sleipnir-backend.mjs's checkPlanningPaths. */
export interface MissingPlanningRef {
  path: string
  isDir: boolean
  /** Everything that stores this path: a plan's assetPaths/assetFolders entry, or a notes.json node's filePath. */
  refs: { kind: 'assetPath' | 'assetFolder' | 'note'; planId?: string; nodeId?: string; /** A note node's own map (fixed map or plan id), for jumping to it. */ mapId?: string; label: string }[]
  /** Where it probably went. `git` comes from recorded renames and is safe to bulk-apply; `name` is the only file in the Workspace with the same filename and needs a human to confirm. */
  suggestion?: { path: string; source: 'git' | 'name' }
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
  /** Worktree modified time (ms epoch) — backs the search's "Recently modified" sort. 0 if the file is gone/unstattable. */
  mtime: number
}

export interface GitStatus {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileStatus[]
  /** Configured remote names (e.g. ['origin']) — empty means Publish has nowhere to go, so the UI can offer "Add remote…". */
  remotes: string[]
  /** The git top-level directory this status is for (an ancestor of the open folder if it sits inside a larger repo) — shown so a workspace-root mismatch is diagnosable. Null if not resolvable. */
  root?: string | null
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

/** One commit in the real DAG returned by getCommitGraph — a GitCommitSummary plus the topology (parent hashes), ref decorations, and remote/local reachability that getBranchTree's summary-only entries lack. */
export interface GitCommitNode extends GitCommitSummary {
  /** Full hashes of this commit's parents — 2+ for a merge, 0 for a root commit. */
  parents: string[]
  /** Branch/tag ref labels pointing at this commit, e.g. 'main', 'origin/main', 'tag: v1.0'. */
  refs: string[]
  /** This commit is the checked-out HEAD. */
  isHead: boolean
  /** Reachable from a remote-tracking branch (origin/*) — i.e. already pushed. */
  pushed: boolean
  /** Reachable from a local branch. `pushed && !local` means fetched-only (on a remote ref, not yet merged into any local branch); `local && !pushed` means an unpushed local commit. */
  local: boolean
}

/** A real parent-linked commit DAG with per-commit push/fetch state, for the commit-graph visualization — distinct from getBranchTree's bounded divergence summary. Commits are newest-first (git --date-order). */
export interface GitCommitGraph {
  commits: GitCommitNode[]
  /** Current branch name, or null in detached HEAD. */
  head: string | null
  /** True when history was capped before the full DAG was walked (see tools/git-control.mjs's MAX_GRAPH_COMMITS). */
  truncated: boolean
}

/** Per-commit changed-file lists (keyed by full hash), the join key for the constellation view — a plan node's workspace-relative filePath against the commits that touched it. Merge commits map to an empty list. See tools/git-control.mjs's getCommitFileMap. */
export interface GitCommitFileMap {
  files: Record<string, string[]>
}

/** Structured result for push/pull/fetch — never a raw stdout/stderr dump, so the UI can render state without parsing git text. */
export interface GitOpResult {
  ok: boolean
  message: string
  conflicted?: boolean
  conflictedFiles?: string[]
  ahead?: number
  behind?: number
  /** Push failed because the repo has no remote — the UI can offer "Add remote…". */
  noRemote?: boolean
}

/** `git config user.name`/`user.email` as currently effective for this repo (local override, else global) — empty string when unset at either scope. */
export interface GitIdentity {
  name: string
  email: string
}

/** What the last scaffolder run recorded into `.sleipnir/scaffold.json`. */
export interface AgentScaffoldingState {
  version: number
  generatedAt: string
  skills: string[]
  skipped?: { path: string; reason: string }[]
}

/**
 * Per-project config and current state of the generated agent files — AGENTS.md,
 * CLAUDE.md, GEMINI.md, the `/plan` slash commands, and the vendored planning CLI.
 * Rendered from tools/agentSkills/registry.mjs; see tools/agentSkills/scaffold.mjs.
 */
export interface AgentScaffolding {
  /**
   * True (the default) leaves the generated files committable, so a collaborator who
   * clones the repo gets a working `/plan` without installing Sleipnir. False adds the
   * files Sleipnir owns to `.git/info/exclude` — per-clone, never committed itself, so
   * it neither shows up in a teammate's checkout nor dirties the shared `.gitignore`.
   * AGENTS.md/CLAUDE.md/GEMINI.md are never excluded either way: they may carry the
   * human's own instructions, so whether those get committed is their call.
   */
  commit: boolean
  version?: number
  /** Null when this project has never been scaffolded. */
  state: AgentScaffoldingState | null
  /** Every path the scaffolder owns in this project. */
  paths: string[]
}

/** The outcome of one scaffolder run. `skipped` is non-fatal by design — scaffolding must never break opening a project. */
export interface AgentScaffoldingResult {
  agentScaffolding: { commit: boolean; version: number }
  written: string[]
  skipped: { path: string; reason: string }[]
  excluded: string[]
}

/** One `git stash` entry — `ref` is the addressable form (`stash@{0}`) apply/pop/drop take. */
export interface GitStash {
  ref: string
  message: string
  author: string
  date: string
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
  /** Created by the AI chat's create_plan_node tool — lands in the AI map as a draft node. */
  createPlanNode(
    planId: string,
    label: string,
    description?: string,
    parentId?: string,
  ): Promise<{ node: GraphNode }>
  /** Same as createPlanNode, plus a staged `proposedFile` — a workspace-relative path + full content that does NOT touch real disk (see tools/sleipnir-plan.mjs's propose-file). `filePath` is validated immediately (rejects an escaping path or one that already has a real file) but nothing is written until a human reviews and saves it through the same staged-editor-tab flow generate_code uses. `linkTargetIds`, when given, draws 'borrows' edges from the new node so proposed files can visibly reference each other before any of them are real. */
  proposeFileNode(
    planId: string,
    label: string,
    description: string | undefined,
    filePath: string,
    content: string,
    parentId?: string,
    linkTargetIds?: string[],
  ): Promise<{ node: GraphNode }>
  /** Approve/complete a plan node created via createPlanNode. */
  setNodeStatus(id: string, status: NodeStatus): Promise<{ node: GraphNode }>
  /** Full-replace of a node's outgoing 'borrows' edges — used by the node-card link editor and by re-scanning a saved file's real imports (see WorkspaceView's onImportsChanged). */
  setNodeBorrows(nodeId: string, targetIds: string[]): Promise<{ edges: GraphEdge[] }>
  /** Moves a planned-file placeholder (a plan step's not-yet-written file) to another path before approval. Validated like a declaration: a real project path, not under `.planning/`, not an existing file. The node's id embeds its path, so the returned node carries the NEW id; edges, the plan's nodeIds and plan.md follow. */
  updatePlannedFilePath(nodeId: string, path: string): Promise<{ node: GraphNode }>
  /** Edits a notes.json node's label/description in place (the rename counterpart to addNote). Only nodes stored in notes.json (note, scaffolded, plan-step) are editable; throws for build-generated src nodes, which regenerate from source — callers gate "Rename" to notes-backed nodes. */
  updateNote(id: string, patch: { label?: string; description?: string }): Promise<{ node: GraphNode }>
  /** Permanently deletes a notes.json node (note, scaffolded, or plan-step) plus every edge touching it. The restorable-soft-hide counterpart, setArchived, is for build-generated src nodes instead. Does not delete any real Workspace file a scaffolded node points at — callers pair this with deleteWorkspacePath when the file should go too. */
  deleteNote(id: string): Promise<void>
  /** The per-node sprint-stage overlay — a { [nodeId]: stage } map covering every node id that's been tagged (see graph/stages.ts). Kept separate from the node records so build-generated nodes can be tagged too. */
  getNodeStages(): Promise<{ stages: Record<string, NodeStage> }>
  /** Tags one node with a stage, or clears it when `stage` is null. Any node id is valid — not restricted to notes.json nodes. */
  setNodeStage(id: string, stage: NodeStage | null): Promise<{ stages: Record<string, NodeStage> }>
  /** Fills `stage` for every id in `ids` that has no stage yet, leaving already-tagged ids untouched — one read/write regardless of how many ids, unlike calling setNodeStage per id. Used to give newly-added plan files an explicit default status. */
  setDefaultNodeStages(ids: string[], stage: NodeStage): Promise<{ stages: Record<string, NodeStage> }>
  /** Named, persisted lists of existing node ids. See src/00_planning/graph/resolvePlan.ts for the client-side neighbor-expansion this backs. */
  getPlans(): Promise<{ plans: SavedPlan[] }>
  /** `assetPaths`, when given, seeds the plan from a Workspace asset-filter selection (see NewWorkspacePlanModal) instead of/alongside real graph node ids. `assetEdges` are the import connections detected between those paths at creation time (an initial-paint snapshot only — see graph/resolveAssetPlan.ts for the live re-scan). `assetFolders` are the top-level directories that were fully selected, re-listed live on every view so files added under them later show up automatically. */
  createPlan(label: string, nodeIds?: string[], assetPaths?: string[], assetEdges?: { source: string; target: string }[], assetFolders?: string[]): Promise<{ plan: SavedPlan }>
  /** Merges workspace-relative paths into a plan's `generatedFiles`, recording what a "Generate Code" run produced while that plan's tab was active. */
  appendPlanGeneratedFiles(id: string, paths: string[]): Promise<{ plan: SavedPlan }>
  /** Merges existing graph node ids into a plan's `nodeIds` (deduped) — used when a link drawn on a plan tab targets a node from another plan, pulling it in so the edge resolves on this plan's graph. Returns the updated plan. */
  addPlanNodes(id: string, nodeIds: string[]): Promise<{ plan: SavedPlan }>
  /** Bulk-approves every `status: 'draft'` node belonging to this plan (its own `nodeIds` plus any note sharing its `planId` on the shared "claude" review map) in one write — the Planning graph's "Approve All" action on a freshly AI-drafted plan. A node carrying a staged `proposedFile` is deliberately skipped (never bulk-approved sight-unseen) and returned in `needsReviewIds` instead — the caller should route those through the same review-then-save flow generate_code uses (PlanningView's `onCodeGenerated`), one at a time. */
  approvePlanNodes(planId: string): Promise<{ approvedIds: string[]; needsReviewIds: string[] }>
  /** Merges real Workspace-relative file paths and/or whole folders into a plan's `assetPaths`/`assetFolders` (deduped) — pulls an existing file/folder straight into a plan (see LeftRailingView's "Add node ▸" action) as a real, file-backed asset node, additive alongside any existing `nodeIds`. Returns the updated plan. */
  addPlanAssets(id: string, paths?: string[], folders?: string[]): Promise<{ plan: SavedPlan }>
  /** Changes a plan's display label. The id is left alone: it embeds a slug of the ORIGINAL label but is referenced by graph nodes' `planId` and by open tabs, none of which would follow a re-slug. */
  renamePlan(id: string, label: string): Promise<{ plan: SavedPlan }>
  /** Every `.planning/` file reference that no longer exists on disk, each with a suggested new location when one can be found. Read-only. */
  checkPlanningPaths(): Promise<{ missing: MissingPlanningRef[] }>
  /** Rewrites every stored reference to `from` (or anything under it, for a folder) to `to` — plan asset paths/edges, notes' filePath, and `file:` stage keys. `changed` is the number of references rewritten. */
  relinkPlanningPath(from: string, to: string): Promise<{ changed: number }>
  /** Drops every stored reference to `path` (or anything under it) — removes it from plans, deletes notes nodes backed by it, and clears its stage tag. Never touches the Workspace file itself. */
  removePlanningRef(path: string): Promise<{ removed: number }>
  /** The plan record is always removed. `opts.deleteFiles` also deletes the plan's `generatedFiles` (and, with `deleteNodes`, each removed node's backing file), resolved against the open Workspace root. `opts.deleteNodes` also removes the plan's nodes from the graph and every edge touching them. */
  deletePlan(id: string, opts?: { deleteFiles?: boolean; deleteNodes?: boolean }): Promise<void>
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
  /** The real parent-linked commit DAG with per-commit push/fetch state, for the commit-graph visualization. Heavier than getBranchTree (walks all branches + remotes); call it only for the graph view. See tools/git-control.mjs's getCommitGraph. */
  getCommitGraph(): Promise<GitCommitGraph>
  /** Per-commit changed-file lists, for the constellation view's plan-node↔commit provenance join. Separate from getCommitGraph so the plain commit graph stays light. See tools/git-control.mjs's getCommitFileMap. */
  getCommitFileMap(): Promise<GitCommitFileMap>
  /** Refuses to switch while the working tree is dirty — commit or stash first. */
  checkoutBranch(name: string): Promise<GitStatus>
  createBranch(name: string): Promise<GitStatus>
  renameBranch(oldName: string, newName: string): Promise<GitStatus>
  /** Auto-sets upstream on a branch's first push instead of surfacing git's raw "no upstream" error. */
  gitPush(): Promise<GitOpResult>
  /** Returns `conflicted: true` (with the file list) on a merge conflict rather than attempting any automatic resolution — the Source Control view surfaces this as a banner (open the file, then "Mark Resolved" to stage it). */
  gitPull(): Promise<GitOpResult>
  gitFetch(): Promise<GitOpResult>
  /** Fails if the working tree is clean — nothing to stash. */
  gitStashPush(message?: string): Promise<GitStatus>
  gitStashList(): Promise<GitStash[]>
  gitStashApply(ref: string): Promise<GitStatus>
  /** Apply + drop in one step. */
  gitStashPop(ref: string): Promise<GitStatus>
  gitStashDrop(ref: string): Promise<GitStash[]>
  /** `git init` (main as initial branch) — turns the open non-repo folder into a git repo. Optional: provided by the Electron shell, absent on the web-dev transport (feature-detect with `?.`). */
  gitInit?(): Promise<GitOpResult>
  /** Adds or updates a remote (defaults to 'origin') so a freshly init'd / remote-less repo can publish. Optional (Electron shell only). */
  gitAddRemote?(url: string, name?: string): Promise<GitOpResult>
  /** Writes always target this repo's local git config — see tools/git-control.mjs's getGitIdentity/setGitIdentity comment for why global is deliberately never touched. */
  getGitIdentity(): Promise<GitIdentity>
  setGitIdentity(name: string, email: string): Promise<GitIdentity>
}
