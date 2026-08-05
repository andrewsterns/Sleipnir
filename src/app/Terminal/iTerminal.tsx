export interface TerminalProps {
  /** Called when the underlying shell process exits, with its exit code. */
  onExit?: (code: number) => void
}

export interface TerminalAPI {
  spawn: (cols: number, rows: number) => Promise<{ id: string }>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => void
  onData: (id: string, callback: (data: string) => void) => () => void
  onExit: (id: string, callback: (code: number) => void) => () => void
}

declare global {
  interface Window {
    terminalAPI?: TerminalAPI
  }
}

// No web-transport equivalent exists — spawning a real shell isn't possible
// from a sandboxed browser tab. Callers should check this before rendering
// <Terminal /> and show a "desktop-only" message instead when it's false.
export function isTerminalAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.terminalAPI
}
