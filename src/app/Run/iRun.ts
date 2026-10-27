/** What a target is, and so what Play waits for — see electron/runTargets.cjs. */
export type RunKind = 'web' | 'app' | 'task' | 'static'

export interface RunTarget {
  /** Stable across detections: `<folder>:<source>:<name>`. */
  id: string
  label: string
  /** Project-relative folder it runs from — '' for the project root. */
  dir: string
  kind: RunKind
  command: string
  args: string[]
  /** The script body / a one-line description, for the picker's tooltip. */
  detail?: string
}

export type RunPhase = 'idle' | 'installing' | 'starting' | 'running' | 'ready' | 'exited' | 'error'

export interface RunStatus {
  targetId: string | null
  phase: RunPhase
  /** Where it's serving — set on 'ready', and on 'running' when an app printed one. */
  url?: string
  message?: string
  code?: number | null
}

export type RunRequest = { targetId: string } | { custom: string }

export interface RunAPI {
  detect: () => Promise<{ targets: RunTarget[]; defaultId: string | null }>
  start: (request: RunRequest) => void
  stop: () => void
  openExternal: (url: string) => Promise<void>
  onStatus: (callback: (status: RunStatus) => void) => () => void
  onOutput: (callback: (text: string) => void) => () => void
}

declare global {
  interface Window {
    runAPI?: RunAPI
  }
}

/** True while something is (or is about to be) running — Play shows Stop. */
export function isActivePhase(phase: RunPhase): boolean {
  return phase === 'installing' || phase === 'starting' || phase === 'running' || phase === 'ready'
}

// No web-transport equivalent exists — spawning a dev server isn't possible
// from a sandboxed browser tab, same reasoning as iTerminal.tsx.
export function isRunAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.runAPI
}
