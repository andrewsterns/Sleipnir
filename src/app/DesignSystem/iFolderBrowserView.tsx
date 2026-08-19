import type { ReactNode } from 'react'
import type { IconName } from '../UIKit/Icon/Icon'
import type { GraphNode, SavedPlan } from '../../00_planning/graph/types'

/** One open tab within a single FolderBrowserView instance — local to that instance, never shared across categories. */
export interface BrowserTab {
  path: string
  label: string
  /** Line to scroll/position the cursor to once the tab's real content loads (1-based) — set by a search-result jump, see CodeEditorView's revealLine prop. Not persisted across re-opens of the same tab unless a new jump sets it again. */
  line?: number
}

/** `'primary'` is the always-present left pane; `'secondary'` is the optional split-right pane (see ROADMAP.md's "split editor panes"). */
export type PaneId = 'primary' | 'secondary'

/** One pane's own tab list + active tab — a path is never open in more than one pane at once (see CodeEditorView.ViewModel.tsx's LSP didOpen comment for why: two mounted editors on the same path would double-register with the language server). */
export interface PaneState {
  tabs: BrowserTab[]
  activeTabPath: string | null
}

export interface FolderBrowserViewProps {
  /**
   * `scope: 'src'` — root and every path are SRC_ROOT-relative (no `src/`
   * prefix), backed by listDir/readFile/writeFile — required for
   * `supportsCreate`, since LeftRailingView's own create/archive logic is
   * hardcoded to that convention.
   * `scope: 'repo'` — root and every path are repo-root-relative, backed by
   * listRepoDir/readRepoFile/writeRepoFile. No create/archive support.
   * `scope: 'workspace'` — root/paths are relative to whatever folder the
   * user opened via the Workspace feature (see ROADMAP.md's Phase 0),
   * backed by listWorkspaceDir/readWorkspaceFile/writeWorkspaceFile —
   * completely independent of SRC_ROOT/REPO_ROOT. Full create support, no
   * archive support (see LeftRailingView's supportsArchive prop).
   */
  scope: 'src' | 'repo' | 'workspace'
  root: string
  /** Overrides the rail header's displayed root label (defaults to `root`) without affecting where creates/reads actually resolve — e.g. Workspace passes the open folder's name here while `root` itself stays `''`. */
  rootLabel?: string
  /** repo-scope only — extra repo-relative files spliced in as top-level siblings (mirrors WidgetEntry.extraFiles, e.g. Docker's docker-compose.yml). */
  extraFiles?: string[]
  readOnly?: boolean
  /** Rendered in LeftRailing's header row, e.g. RefactorPanel — Components only. Render-prop (not a plain node) so the caller's action can trigger this instance's own tree refresh, same reasoning as WidgetShell's `rail` prop. */
  headerAction?: (refresh: () => void) => ReactNode
  /** Omit for no preview pane. Called with a scope-appropriate (src-relative for scope:'src') name/path. */
  getPreview?: (name: string, path: string) => ReactNode
  /** Shows LeftRailing's create/archive affordances — only meaningful (and only ever passed) alongside scope:'src'. */
  supportsCreate?: boolean
  /** Per-folder hover action (e.g. a Play button on a curated prototype's folder) — passed straight through to LeftRailing, see its own doc comment. */
  folderAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  /** Per-file hover action (e.g. a Play button on a prototype file) — passed straight through to LeftRailing, see its own doc comment. */
  fileAction?: (path: string, name: string) => { icon: IconName; title: string; onClick: () => void } | null | undefined
  /** "Add to plan" — passed straight through to LeftRailing, see its own doc comment. Present on every real-repo widget (App.tsx supplies one implementation for each); omitted for scope:'workspace', where an arbitrary external file has no relationship to Sleipnir's own graph/notes system. */
  onAddToPlan?: (label: string, paths: string[]) => void
  /** Adds an "Add node ▸" submenu to each row's context menu (pick a plan → pulls the real file/folder straight into it as a live asset, with a confirmation animation). Passed straight through to LeftRailing; Workspace only. */
  supportsAddNode?: boolean
  /** Fired right after "Add node ▸" pulls a file/folder into a plan, with the updated SavedPlan — passed straight through to LeftRailing, see its own doc comment. */
  onPlanUpdated?: (plan: SavedPlan) => void
  /** Opens (or focuses, if already open) this file as a tab on mount and whenever it changes — see DesignLibrary.view.tsx's reactive-effect comment for why "changes after mount" matters now that browsers stay mounted across NavRail switches. `line` (1-based) scrolls/positions the cursor there once loaded — set by search-result and quick-open jumps (see App.tsx's jumpToProjectFile). */
  initialFile?: { name: string; path: string; line?: number } | null
  /**
   * Staged AI-generated content for an approved plan node (see PlanningView's
   * "Generate Code" -> electron/chat.cjs's generate_code tool) — Components
   * only. Opens `path` as a tab showing this content instead of the disk
   * read, with autosave suppressed until the human explicitly saves.
   */
  pendingOverride?: { path: string; content: string; planNodeId: string } | null
  onOverrideSaved?: (planNodeId: string) => void
  /** Passed straight through to every open tab's CodeEditorView — see its own onImportsChanged doc comment. scope:'workspace' only in practice (Workspace/Research); omitted elsewhere, same as onAddToPlan. */
  onImportsChanged?: (path: string, content: string) => void
  /** Passed straight through to every open tab's CodeEditorView — see its own getGraphNodes/onLinkResolved doc comments (the "##token" editor extension). */
  getGraphNodes?: () => GraphNode[]
  onLinkResolved?: (path: string, target: GraphNode) => void
  /** REPO_ROOT-relative path to the open Workspace root — see WorkspaceInfo.repoRelativeRoot. Passed straight through to every open tab's CodeEditorView to gate LSP for scope:'workspace'; omitted for Research's `.research`-rooted instance (never TS/JS content). */
  repoRelativeRoot?: string | null
  /** The open Workspace's own absolute root — see WorkspaceInfo.root. Passed straight through alongside repoRelativeRoot; roots LSP at this external project itself when repoRelativeRoot is null. Omitted wherever repoRelativeRoot is (Research). */
  workspaceRoot?: string | null
}

/**
 * Imperative surface for the File menu's Save/Save All, which live in
 * App.tsx, outside any single browser's own tree. "Jump to/open a file" is
 * deliberately NOT here — `initialFile`/`pendingOverride` already handle
 * that reactively (including into an already-mounted instance, see their
 * doc comments above), so App.tsx just sets those props rather than needing
 * a second, imperative path to the same effect.
 */
export interface FolderBrowserHandle {
  /** Saves the active tab of whichever pane last had focus. */
  save: () => Promise<void>
  /** Saves every dirty tab, across both panes if split. */
  saveAll: () => Promise<void>
  /** LSP diagnostic counts across this instance's own open tabs, across both panes if split — see ProblemsDock. Only tabs with at least one diagnostic are included. */
  getProblems: () => { path: string; count: number }[]
  /** Activates and focuses `path` in whichever pane already has it open; if it isn't open anywhere, opens it into the currently-focused pane (same as a tree click). */
  focusTab: (path: string) => void
}
