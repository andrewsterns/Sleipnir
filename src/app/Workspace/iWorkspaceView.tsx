import type { SavedPlan } from '../../00_planning/graph/types'
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
  /** Fired after this view's own "Choose/Switch Folder…" button successfully opens a different project — lets App.tsx keep its own activeProject/recentProjects state (the TitleBar label, Planning's per-project board) in sync with a change that didn't originate from the File menu. */
  onProjectOpened?: (info: WorkspaceInfo) => void
  /** File > Open Recent's list, threaded down for the "No folder open" empty state's own quick-reopen shortcuts — App.tsx is the single fetch point, same reasoning as `plans`. */
  recentProjects?: RecentProject[]
  onOpenRecentProject?: (path: string) => void
}
