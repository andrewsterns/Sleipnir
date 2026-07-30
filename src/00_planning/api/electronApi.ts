// Electron transport: same PlatformAPI surface, routed through IPC to the
// main process instead of fetch() to a dev server. The methods here are
// inert until Phase 1 adds electron/preload.ts's contextBridge and
// electron/main.ts's IPC handlers — `window.electronAPI` won't exist outside
// a packaged/dev Electron shell, so `getPlatformAPI()` (in sleipnirApi.ts)
// never selects this module until then.

import type { PlatformAPI } from './PlatformAPI'

export interface ElectronBridge extends PlatformAPI {}

declare global {
  interface Window {
    electronAPI?: ElectronBridge
  }
}

export function getElectronApi(): PlatformAPI | undefined {
  return window.electronAPI
}
