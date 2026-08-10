/**
 * Research otherwise takes no props, same reasoning as WorkspaceView — it
 * manages its own file-browsing state entirely via FolderBrowserView, scoped
 * to the currently open project's own `.research/` folder (see ResearchView's
 * own comment). `activeProject` is the one thing it needs from outside: App.tsx
 * is the single source of truth for which project is open (see its own
 * `activeProject` state), and Research has no "Choose Folder…" of its own —
 * unlike Workspace, it only ever follows whatever project is already active.
 */
export interface ResearchViewProps {
  activeProject: { path: string; name: string } | null
}
