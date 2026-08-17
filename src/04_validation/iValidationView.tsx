export interface ValidationAssertionResult {
  title: string
  fullName: string
  status: 'passed' | 'failed' | 'pending' | 'skipped' | 'todo'
  duration: number
  failureMessages: string[]
}

export interface ValidationTestFileResult {
  /** Absolute path, as vitest's JSON reporter reports it. */
  name: string
  status: 'passed' | 'failed'
  assertionResults: ValidationAssertionResult[]
}

export interface ValidationResults {
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  success: boolean
  testResults: ValidationTestFileResult[]
}

export interface ValidationOutputPayload {
  stream: 'stdout' | 'stderr'
  text: string
}

export interface ValidationDonePayload {
  exitCode: number | null
  timedOut: boolean
  /** Combined stdout+stderr, for when `results` fails to parse (vitest itself never started). */
  raw: string
  results: ValidationResults | null
}

export interface ValidationAPI {
  run: (sessionId: string) => void
  stop: (sessionId: string) => void
  onOutput: (sessionId: string, callback: (payload: ValidationOutputPayload) => void) => () => void
  onDone: (sessionId: string, callback: (payload: ValidationDonePayload) => void) => () => void
}

declare global {
  interface Window {
    validationAPI?: ValidationAPI
  }
}

// No web-transport equivalent — see electron/validation.cjs (same reasoning
// as terminal/chat/preview: spawning a real child process isn't possible
// from a sandboxed browser tab).
export function isValidationAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.validationAPI
}

// vitest's JSON reporter reports absolute paths — trims down to a
// project-relative-looking path for display without needing the Workspace
// root plumbed all the way down here.
export function shortenTestPath(absPath: string): string {
  const marker = absPath.lastIndexOf('/src/')
  return marker >= 0 ? absPath.slice(marker + 1) : (absPath.split(/[/\\]/).pop() ?? absPath)
}
