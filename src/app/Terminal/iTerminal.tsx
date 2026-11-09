export interface TerminalProps {
  /** Called when the underlying shell process exits, with its exit code. */
  onExit?: (code: number) => void
  /** A session already running to reattach to (after a page reload); absent, a new shell starts. */
  sessionId?: string
  /** Tells the owner which session this terminal is showing, so closing its tab can end it. */
  onSession?: (id: string) => void
}

export interface TerminalAPI {
  spawn: (cols: number, rows: number) => Promise<{ id: string }>
  /** The shells still running for this window. */
  list: () => Promise<{ id: string }[]>
  /** What a running shell has printed so far, and how much that is; null if it has gone. */
  attach: (id: string) => Promise<{ data: string; end: number } | null>
  write: (id: string, data: string) => void
  resize: (id: string, cols: number, rows: number) => void
  kill: (id: string) => void
  /** `end` is how much the shell had printed once this chunk was included. */
  onData: (id: string, callback: (data: string, end: number) => void) => () => void
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
