import type { GraphMapId, SavedPlan } from '../../00_planning/graph/types'
import type { RecentProject, WorkspaceInfo } from '../../00_planning/api/PlatformAPI'

/**
 * WorkspaceView otherwise takes no props — unlike Components/Prototypes/
 * Docker (handed a libraryId/entry by the caller, see App.tsx's
 * renderCategory), it manages most of its own state entirely via
 * getWorkspaceInfo()/openWorkspace(). `initialFile` is the one exception:
 * App.tsx's jumpToProjectFile (ROADMAP.md's Phase 1 — project-wide search
 * and quick-open) needs to open a specific workspace-relative file/line
 * here the same way it already does for Components/Open Files.
 */
export interface WorkspaceViewProps {
  initialFile?: { name: string; path: string; line?: number } | null
  /** Staged AI-generated content for an approved plan node (see PlanningView's "Generate Code" -> App.tsx's onCodeGenerated) — opened as an unsaved override on top of whatever's really on disk at that path, same mechanism FolderBrowserView already exposes generically. */
  pendingOverride?: { path: string; content: string; planNodeId: string } | null
  onOverrideSaved?: (planNodeId: string) => void
  /** Fired when the "Add Plan" asset-filter flow (NewWorkspacePlanModal) creates a new plan — App.tsx both records it in `plans` state and jumps to it in Planning. */
  onPlanCreated?: (plan: SavedPlan) => void
  /** Fired when the file browser's "Add node ▸" context-menu action pulls a file/folder into an EXISTING plan (see LeftRailingView's onPlanUpdated) — App.tsx merges the change into `plans` state so a Planning tab already open on that plan picks up the addition without a reload. */
  onPlanUpdated?: (plan: SavedPlan) => void
  /** Fired after this view's own "Choose/Switch Folder…" button successfully opens a different project — lets App.tsx keep its own activeProject/recentProjects state (the TitleBar label, Planning's per-project board) in sync with a change that didn't originate from the File menu. */
  onProjectOpened?: (info: WorkspaceInfo) => void
  /** File > Open Recent's list, threaded down for the "No folder open" empty state's own quick-reopen shortcuts — App.tsx is the single fetch point, same reasoning as `plans`. */
  recentProjects?: RecentProject[]
  onOpenRecentProject?: (path: string) => void
  /** "Show in Planning"/"Show in Canvas" from a tree row's context menu (App.tsx's jumpToPlanningNode/jumpToCanvasComponent). Undefined hides both menu items, same convention as onAddToPlan. */
  onShowInPlanning?: (mapId: GraphMapId, nodeId: string) => void
  onShowInCanvas?: (filePath: string) => void
  /** Every filePath with a written canvas component — owned by App.tsx (useCanvasComponentPaths), gates whether "Show in Canvas" appears on a given row. */
  canvasComponentPaths?: Set<string>
  /**
   * Fired with both ends of a cut→paste or rename in the file tree, before the
   * tree repaints. App.tsx uses it to reattach Canvas boards to files that
   * moved — moving a component out of `.canvas` into real source is how a
   * staged component is promoted, and the board has to follow it rather than
   * keep pointing at the path it left (see 01_canvas/model/relink.ts).
   */
  onPathMoved?: (from: string, to: string) => Promise<void>
  /** Fired after a path is deleted from the file tree. App.tsx uses it to reconcile Canvas boards whose component file just went — the delete counterpart to onPathMoved. */
  onPathDeleted?: (path: string) => Promise<void>
}
