// Shared shape both transports (web fetch → vite dev middleware, and Electron
// IPC → main process) implement identically, so the rest of the app never
// needs to know which one it's talking to.

import type { GraphNode } from '../graph/types'

export type ComponentTier = 'atoms' | 'molecules' | 'organisms' | 'templates' | 'pages'

// Kept in sync with tools/languages.mjs's LANGUAGES keys. TypeScript is the
// only one using the atoms/molecules/organisms tiering + MVVM triplet —
// others scaffold a single file into 03_prototypes (see sleipnir-backend.mjs).
export type ScaffoldLanguage = 'typescript' | 'python' | 'rust' | 'go'

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

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

// Physical folder layouts Refactor can reorganize src/02_components into.
// 'atomic' is the current default tiering — selecting it after a non-atomic
// architecture undoes whatever's currently in place, it isn't a no-op.
export type Architecture = 'atomic' | 'mvvm' | 'mvc' | 'mvp'

export interface RefactorMove {
  from: string
  to: string
}

export interface RefactorRewrite {
  file: string
  changes: { oldSpecifier: string; newSpecifier: string }[]
}

export interface RefactorPlan {
  moves: RefactorMove[]
  rewrites: RefactorRewrite[]
  movedCount: number
  rewrittenFileCount: number
}

export interface PlatformAPI {
  scaffoldComponent(
    name: string,
    tier: ComponentTier,
    language?: ScaffoldLanguage,
    parts?: ScaffoldPart[],
  ): Promise<ScaffoldComponentResult>
  regenerateGraph(): Promise<{ stdout: string }>
  readFile(path: string): Promise<{ content: string }>
  /** Overwrites an existing file's content. Added for the Phase 2 code editor's save action. */
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<{ tree: FileTreeNode[] }>
  createFile(path: string, content?: string): Promise<void>
  createDir(path: string): Promise<void>
  getArchivedPaths(): Promise<{ entries: ArchiveEntry[] }>
  setArchived(path: string, archived: boolean, label?: string): Promise<{ entries: ArchiveEntry[] }>
  /** Plain idea/task nodes with no backing file — created from Planning's "+" flow. */
  getNotes(): Promise<{ notes: GraphNode[] }>
  addNote(map: string, label: string, description?: string): Promise<{ node: GraphNode }>
  /**
   * Runs a file through its language's local interpreter/compiler and
   * captures output. Desktop/local-trusted only: the web transport's runner
   * only exists behind `vite dev`'s own dev-only middleware (never shipped
   * to a production web build) — same trust boundary as every other
   * webApi.ts call. A sandboxed runner (Phase 4b) would be required before
   * this could ever be exposed beyond the developer's own machine.
   */
  runScript(path: string): Promise<RunResult>
  /** Computes what a Refactor to this architecture would change — never touches disk. */
  previewRefactor(architecture: Architecture): Promise<RefactorPlan>
  /**
   * Executes the same plan previewRefactor would compute: moves files
   * between folders and rewrites the import specifiers that break as a
   * result. Refuses to run against an uncommitted working tree (see
   * tools/refactor-engine.mjs's git-clean gate) so an unwanted result is
   * always a `git checkout` away.
   */
  applyRefactor(architecture: Architecture): Promise<{ plan: RefactorPlan }>
  getCurrentArchitecture(): Promise<{ current: Architecture }>
}
