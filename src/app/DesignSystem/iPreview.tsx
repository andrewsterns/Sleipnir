export type PreviewPhase = 'installing' | 'starting' | 'ready' | 'error'

export interface PreviewStatus {
  phase: PreviewPhase
  /** Set once phase reaches 'ready'. */
  url?: string
  /** Set on 'error' — a short reason. */
  message?: string
  /** Set on 'error' — a tail of the captured stdout/stderr, for debugging a bad manual config. */
  output?: string
}

export interface PreviewAPI {
  start: (folderPath: string, config: { command: string; args: string[] }) => void
  stop: (folderPath: string) => void
  onStatus: (folderPath: string, callback: (status: PreviewStatus) => void) => () => void
}

declare global {
  interface Window {
    previewAPI?: PreviewAPI
  }
}

// No web-transport equivalent exists — spawning/serving a live preview
// process isn't possible from a sandboxed browser tab, same reasoning as
// iTerminal.tsx's isTerminalAvailable.
export function isPreviewAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.previewAPI
}
