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

/** A test runner the open project is set up for (see electron/testRunners.cjs). */
export interface ValidationRunner {
  id: string
  label: string
  /** The command line it runs, for a tooltip. */
  command: string
}

export interface ValidationDonePayload {
  exitCode: number | null
  timedOut: boolean
  /** Combined stdout+stderr, for when `results` fails to parse (vitest itself never started). */
  raw: string
  results: ValidationResults | null
  /** Which runner ran; absent when none was found. */
  runner?: { id: string; label: string }
}

export interface ValidationAPI {
  runners: () => Promise<ValidationRunner[]>
  run: (sessionId: string, runnerId?: string) => void
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
// root plumbed all the way down here. Other runners name suites by module or
// package (src::cart, github.com/shop/cart), which pass through unchanged.
export function shortenTestPath(absPath: string): string {
  if (!/[/\\]/.test(absPath)) return absPath
  const marker = absPath.lastIndexOf('/src/')
  return marker >= 0 ? absPath.slice(marker + 1) : (absPath.split(/[/\\]/).pop() ?? absPath)
}
