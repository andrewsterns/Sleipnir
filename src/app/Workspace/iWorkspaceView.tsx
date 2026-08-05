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
}
