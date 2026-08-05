// Shared shape both transports (web fetch → vite dev middleware, and Electron
// IPC → main process) implement identically, so the rest of the app never
// needs to know which one it's talking to.

import type { Architecture, GraphEdge, GraphNode, LibraryEntry, LibraryKind, NodeStatus, SavedPlan, ScaffoldLanguage, WidgetEntry, WidgetKind, WidgetCatalogEntry } from '../graph/types'

// Re-exported so existing consumers (e.g. sleipnirApi.ts) keep working
// unchanged — canonical definitions live in graph/types.ts since LibraryEntry
// needs them there too, and PlatformAPI already depends on that module.
export type { Architecture, LibraryEntry, LibraryKind, SavedPlan, ScaffoldLanguage, WidgetEntry, WidgetKind, WidgetCatalogEntry }

/** Everything addWidget (tools/widget-registry.mjs) needs to persist a new entry — this is exactly a WidgetCatalogEntry's `entry` field, resolved client-side rather than looked up server-side, so the catalog only has to exist in one place (widget-catalog.json). */
export type NewWidgetInput = Omit<WidgetEntry, 'createdAt'>

export type ComponentTier = 'atoms' | 'molecules' | 'organisms' | 'templates' | 'pages'

// Which files of the MVVM triplet to generate — only meaningful when
// language === 'typescript'. Defaults to all three (see webApi.ts/electronApi.ts).
export type ScaffoldPart = 'view' | 'viewModel' | 'interface'

export interface ScaffoldComponentResult {
  path: string
  files: string[]
}

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

export interface RefactorMove {
  from: string
  to: string
}

export interface RefactorRewrite {
  file: string
  changes: { oldSpecifier: string; newSpecifier: string }[]
}

/** A read-only Stage 1 codemod-lint finding — see tools/codemod-lint.mjs. Never causes a file change; purely informational. */
export interface RefactorViolation {
  file: string
  rule: string
  message: string
}

export interface RefactorPlan {
  moves: RefactorMove[]
  rewrites: RefactorRewrite[]
  movedCount: number
  rewrittenFileCount: number
  /** Only populated by previewRefactor — applyRefactor's returned plan omits it (nothing to re-check after the move already happened). */
  violations?: RefactorViolation[]
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
  scaffoldComponent(
    name: string,
    tier: ComponentTier,
    language?: ScaffoldLanguage,
    parts?: ScaffoldPart[],
    libraryId?: string,
  ): Promise<ScaffoldComponentResult>
  regenerateGraph(): Promise<{ stdout: string }>
  /** Creates a brand-new blank component or prototype library (just a registry entry + empty root folder). */
  createLibrary(input: {
    id: string
    kind: LibraryKind
    label: string
    architecture: Architecture
    language: ScaffoldLanguage
  }): Promise<{ library: LibraryEntry }>
  listLibraries(kind?: LibraryKind): Promise<{ libraries: LibraryEntry[] }>
  /** Unregisters a library only — its files stay on disk untouched. Refuses on the two default libraries. */
  removeLibrary(id: string): Promise<void>
  /** Unregisters AND deletes the library's entire folder — irreversible. Refuses on the two default libraries. */
  deleteLibrary(id: string): Promise<void>
  /** Registered NavRail widgets (e.g. "Docker") — always fetched at runtime, never statically imported (see graph/types.ts's WidgetEntry comment). */
  listWidgets(): Promise<{ widgets: WidgetEntry[] }>
  /** Persists a new widget registry entry — the caller (WidgetStoreView) resolves a catalog entry's `entry` field into this shape first. */
  installWidget(input: NewWidgetInput): Promise<{ widget: WidgetEntry }>
  /** The Widget Store's browsable catalog — backed by widget-catalog.json today (see graph/types.ts's WidgetCatalogEntry comment for why it's fetched, not bundled). */
  getWidgetCatalog(): Promise<{ catalog: WidgetCatalogEntry[] }>
  readFile(path: string): Promise<{ content: string }>
  /** Overwrites an existing file's content. Added for the Phase 2 code editor's save action. */
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<{ tree: FileTreeNode[] }>
  /** Repo-root-scoped counterpart to listDir — for widgets browsing outside src/ (e.g. Docker's docker/ folder). */
  listRepoDir(path: string, extraFiles?: string[]): Promise<{ tree: FileTreeNode[] }>
  readRepoFile(path: string): Promise<{ content: string }>
  /** Repo-root-scoped counterpart to writeFile — the File menu's Open File/Save can target anywhere in the repo, not just src/. */
  writeRepoFile(path: string, content: string): Promise<void>
  createFile(path: string, content?: string): Promise<void>
  createDir(path: string): Promise<void>
  /** Copies a file/folder from anywhere on disk (sourceAbsolutePath, unrestricted — see importDialog) into a repo-relative destination directory, at its own basename. Used by the File menu's Import button. */
  importPath(sourceAbsolutePath: string, destRepoRelativeDir: string): Promise<{ path: string }>
  /**
   * The currently-open Workspace folder (see ROADMAP.md's Phase 0) — an
   * arbitrary project on disk, completely independent of SRC_ROOT/REPO_ROOT
   * (which stay pinned to Sleipnir's own repo for Planning/Components/
   * Prototypes/Refactor). `root`/`name` are both null when none is open yet.
   */
  getWorkspaceInfo(): Promise<WorkspaceInfo>
  listWorkspaceDir(path: string): Promise<{ tree: FileTreeNode[] }>
  readWorkspaceFile(path: string): Promise<{ content: string }>
  writeWorkspaceFile(path: string, content: string): Promise<void>
  createWorkspaceFile(path: string, content?: string): Promise<void>
  createWorkspaceDir(path: string): Promise<void>
  /**
   * Project-wide search (ROADMAP.md's Phase 1) — plain case-insensitive
   * substring search, capped at a server-side result limit (`truncated`
   * indicates more matches exist than were returned). `searchRepo` scopes to
   * Sleipnir's own repo, `searchWorkspace` to the currently-open Workspace
   * folder (throws if none is open, same as the other workspace-scoped
   * methods above).
   */
  searchRepo(query: string, opts?: { limit?: number }): Promise<{ matches: SearchMatch[]; truncated: boolean }>
  searchWorkspace(query: string, opts?: { limit?: number }): Promise<{ matches: SearchMatch[]; truncated: boolean }>
  /** Flat recursive file tree for Sleipnir's own repo (skip-list applied, same as listWorkspaceDir) — backs quick-open's file list when no Workspace is open. Unlike listRepoDir(''), this doesn't short-circuit to an empty tree. */
  listRepoTree(): Promise<{ tree: FileTreeNode[] }>
  /** Pure filesystem heuristic (package.json scripts, a lone .html file) — `config: null` when nothing's auto-detectable. No process spawning; see previewAPI (electronApi.ts) for actually running it. */
  detectPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfig | null }>
  getPreviewConfig(folderRepoRelativePath: string): Promise<{ config: PreviewConfigEntry | null }>
  setPreviewConfig(folderRepoRelativePath: string, config: PreviewConfig): Promise<{ config: PreviewConfigEntry }>
  getArchivedPaths(): Promise<{ entries: ArchiveEntry[] }>
  setArchived(path: string, archived: boolean, label?: string): Promise<{ entries: ArchiveEntry[] }>
  /** Plain idea/task nodes with no backing file — created from Planning's "+" flow. */
  getNotes(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  addNote(map: string, label: string, description?: string): Promise<{ node: GraphNode }>
  /** Created by the AI chat's create_plan_node tool — lands in the CLAUDE map as a draft node. */
  createPlanNode(
    planId: string,
    label: string,
    description?: string,
    parentId?: string,
  ): Promise<{ node: GraphNode }>
  /** Approve/complete a plan node created via createPlanNode. */
  setNodeStatus(id: string, status: NodeStatus): Promise<{ node: GraphNode }>
  /** Created by the File menu's Open File… flow for files with no existing graph node — dedupes by filePath. See src/App.tsx's open-file handler for the "does a node already exist" check (graph data isn't reachable from the Node backend). */
  openFileNode(path: string, label?: string): Promise<{ node: GraphNode }>
  /** Named, persisted lists of existing node ids — created via a widget's "add to plan" hover action. See src/00_planning/graph/resolvePlan.ts for the client-side neighbor-expansion this backs. */
  getPlans(): Promise<{ plans: SavedPlan[] }>
  createPlan(label: string, nodeIds: string[]): Promise<{ plan: SavedPlan }>
  deletePlan(id: string): Promise<void>
  /**
   * Runs a file through its language's local interpreter/compiler and
   * captures output. Desktop/local-trusted only: the web transport's runner
   * only exists behind `vite dev`'s own dev-only middleware (never shipped
   * to a production web build) — same trust boundary as every other
   * webApi.ts call. A sandboxed runner (Phase 4b) would be required before
   * this could ever be exposed beyond the developer's own machine.
   */
  runScript(path: string): Promise<RunResult>
  /** Computes what a Refactor to this architecture would change — never touches disk. `libraryId` defaults to the original default component library. */
  previewRefactor(architecture: Architecture, libraryId?: string): Promise<RefactorPlan>
  /**
   * Executes the same plan previewRefactor would compute: moves files
   * between folders and rewrites the import specifiers that break as a
   * result. Refuses to run against an uncommitted working tree (see
   * tools/refactor-engine.mjs's git-clean gate) so an unwanted result is
   * always a `git checkout` away.
   */
  applyRefactor(architecture: Architecture, libraryId?: string): Promise<{ plan: RefactorPlan }>
  getCurrentArchitecture(libraryId?: string): Promise<{ current: Architecture }>

  // ── Source Control (local git only — see tools/git-control.mjs) ──────────
  getGitStatus(): Promise<GitStatus>
  getGitDiff(path: string, staged?: boolean): Promise<{ diff: string }>
  stageFiles(paths: string[]): Promise<GitStatus>
  unstageFiles(paths: string[]): Promise<GitStatus>
  commitChanges(message: string): Promise<GitStatus>
  getBranches(): Promise<GitBranch[]>
  /** Simple branch list + divergence view (not a full multi-lane DAG) — see tools/git-control.mjs's getBranchTree. */
  getBranchTree(): Promise<GitBranchTree>
  /** Refuses to switch while the working tree is dirty — commit or stash first. */
  checkoutBranch(name: string): Promise<GitStatus>
  createBranch(name: string): Promise<GitStatus>
  /** Auto-sets upstream on a branch's first push instead of surfacing git's raw "no upstream" error. */
  gitPush(): Promise<GitOpResult>
  /** Returns `conflicted: true` (with the file list) on a merge conflict rather than attempting any automatic resolution — resolve in the Terminal panel. */
  gitPull(): Promise<GitOpResult>
  gitFetch(): Promise<GitOpResult>
  /** Writes always target this repo's local git config — see tools/git-control.mjs's getGitIdentity/setGitIdentity comment for why global is deliberately never touched. */
  getGitIdentity(): Promise<GitIdentity>
  setGitIdentity(name: string, email: string): Promise<GitIdentity>
}
