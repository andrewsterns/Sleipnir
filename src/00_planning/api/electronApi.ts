// Electron transport: same PlatformAPI surface, routed through IPC to the
// main process instead of fetch() to a dev server. The methods here are
// inert until Phase 1 adds electron/preload.ts's contextBridge and
// electron/main.ts's IPC handlers — `window.electronAPI` won't exist outside
// a packaged/dev Electron shell, so `getPlatformAPI()` (in sleipnirApi.ts)
// never selects this module until then.

import type { PlatformAPI, WorkspaceInfo } from './PlatformAPI'

// Picking a path is inherently native-shell territory — a browser's
// <input type=file>/directory picker returns file *content*, never a real
// filesystem path, so there's no web-transport equivalent to implement
// these against (see electron/preload.cjs). Declared here as extras beyond
// PlatformAPI rather than added to it, same as how terminalAPI/chatAPI live
// entirely outside PlatformAPI — callers feature-detect with `?.` rather
// than assuming every PlatformAPI method exists.
export interface ElectronBridge extends PlatformAPI {
  /** Returns the picked file's repo-relative path, `{ error }` if it's outside the repo, or `null` if canceled. */
  openFileDialog?(): Promise<{ path: string } | { error: string } | null>
  /** Same shape as openFileDialog, for a directory instead. */
  openFolderDialog?(): Promise<{ path: string } | { error: string } | null>
  /** Unlike openFileDialog/openFolderDialog, deliberately unrestricted — Import's whole point is picking from outside the repo. Returns the raw absolute path, or `null` if canceled. */
  importDialog?(): Promise<{ path: string } | null>
  /** Opens a real, unrestricted native folder picker for the Workspace feature (see ROADMAP.md's Phase 0) — repoints the app at a different project entirely, unlike openFolderDialog (which adds a widget onto Sleipnir's own repo). Persists the choice for next launch. `null` if canceled, `{error}` if the picked folder can't be opened. */
  openWorkspace?(): Promise<WorkspaceInfo | { error: string } | null>
}

declare global {
  interface Window {
    electronAPI?: ElectronBridge
  }
}

export function getElectronApi(): PlatformAPI | undefined {
  return window.electronAPI
}
