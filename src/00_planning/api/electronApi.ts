// Electron transport: same PlatformAPI surface, routed through IPC to the
// main process instead of fetch() to a dev server. The methods here are
// inert until Phase 1 adds electron/preload.ts's contextBridge and
// electron/main.ts's IPC handlers — `window.electronAPI` won't exist outside
// a packaged/dev Electron shell, so `getPlatformAPI()` (in sleipnirApi.ts)
// never selects this module until then.

import type { PlatformAPI, RecentProject, WorkspaceInfo } from './PlatformAPI'

// Picking a path is inherently native-shell territory — a browser's
// <input type=file>/directory picker returns file *content*, never a real
// filesystem path, so there's no web-transport equivalent to implement
// these against (see electron/preload.cjs). Declared here as extras beyond
// PlatformAPI rather than added to it, same as how terminalAPI/chatAPI live
// entirely outside PlatformAPI — callers feature-detect with `?.` rather
// than assuming every PlatformAPI method exists.
export interface ElectronBridge extends PlatformAPI {
  /** Opens a real, unrestricted native folder picker for the Workspace feature (see ROADMAP.md's Phase 0) — repoints the app at a different project entirely. Persists the choice for next launch. `null` if canceled, `{error}` if the picked folder can't be opened. */
  openWorkspace?(): Promise<WorkspaceInfo | { error: string } | null>
  /** Relocates the auto-provided "scratch" project (its .planning + any files created while unsaved) into a folder the user picks, repoints this window to it, and resets scratch for next time. `null` if canceled, `{error}` on failure. Only meaningful while `getWorkspaceInfo().isScratch` is true. */
  saveScratchToFolder?(): Promise<WorkspaceInfo | { error: string } | null>
  /** File > Open Recent's list — most-recently-opened first, capped at 10. */
  getRecentProjects?(): Promise<{ projects: RecentProject[] }>
  /** Reopens a known project path without the folder-picker dialog. `{error}` if the folder no longer exists on disk. */
  openRecentProject?(projectPath: string): Promise<WorkspaceInfo | { error: string }>
  /** File > New Window — closes the current project in place (single-window reset; see App.tsx). Workspace and Planning both go back to their blank/no-project states. */
  newWindow?(): Promise<{ ok: true }>
  /** File > Rename Project — sets a custom display name, stored inside the project's own `.planning/project.json` so it travels with the folder. */
  renameProject?(projectPath: string, name: string): Promise<{ name: string }>
  /** Recolors this window's native (OS-drawn) minimize/maximize/close overlay to match the active theme. Fire-and-forget; Windows-only (a no-op elsewhere). Called by ThemeController whenever the theme changes. */
  setTitleBarTheme?(colors: { color: string; symbolColor: string }): void
  /** Clones a repo from `url` into a user-picked folder (native picker), then opens it as this window's project — same repoint flow as openWorkspace. `null` if canceled, `{error}` on failure. Electron-only. */
  cloneRepo?(url: string): Promise<WorkspaceInfo | { error: string } | null>
  /** Fired when this window's close button/Cmd+Q is pressed — the handler must call respondBeforeClose so main knows whether to warn about unsaved staged AI content (see App.tsx's pendingOverride). */
  onBeforeClose?(callback: () => void): () => void
  respondBeforeClose?(hasUnsavedChanges: boolean): Promise<void>
  /** Fired only when the human picked "Save && Close" in the resulting warning dialog — save everything, then call saveBeforeCloseDone. */
  onSaveBeforeClose?(callback: () => void): () => void
  saveBeforeCloseDone?(): Promise<void>
}

declare global {
  interface Window {
    electronAPI?: ElectronBridge
  }
}

export function getElectronApi(): PlatformAPI | undefined {
  return window.electronAPI
}
