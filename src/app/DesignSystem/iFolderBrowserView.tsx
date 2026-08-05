import type { ReactNode } from 'react'
import type { IconName } from '../UIKit/Icon/Icon'

/** One open tab within a single FolderBrowserView instance — local to that instance, never shared across categories. */
export interface BrowserTab {
  path: string
  label: string
  /** Line to scroll/position the cursor to once the tab's real content loads (1-based) — set by a search-result jump, see CodeEditorView's revealLine prop. Not persisted across re-opens of the same tab unless a new jump sets it again. */
  line?: number
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
  /** Saves the active tab only. */
  save: () => Promise<void>
  /** Saves every dirty tab. */
  saveAll: () => Promise<void>
  /** LSP diagnostic counts across this instance's own open tabs — see ProblemsDock. Only tabs with at least one diagnostic are included. */
  getProblems: () => { path: string; count: number }[]
  /** Activates an already-open tab by path — used by ProblemsDock's click-to-jump. No-ops if `path` isn't currently open. */
  focusTab: (path: string) => void
}
