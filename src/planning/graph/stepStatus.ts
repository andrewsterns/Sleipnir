// The one status a plan step — or any node or file — carries: the three states
// AI agents already track their own work in (Claude Code's todo list, Codex's
// and Gemini's plans). An agent reports progress in its own terms and the graph
// shows exactly what it said, nothing to translate.
//
// Approval isn't a status. It's a human's go-ahead, recorded on the step as
// `status: 'approved'` (the record that its planned files were written), and it
// moves a pending step to in_progress. See tools/sleipnir-backend.mjs's
// setNodeStatus, which keeps the two in step for every caller.
// Testing sits between the two: the work is written and its tests are running.
export type StepStatus = 'pending' | 'in_progress' | 'testing' | 'completed'

export const STEP_STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'testing', 'completed']

// Every value older boards hold, read as its nearest survivor: the four sprint
// stages (and the two retired before them) and the approval statuses a step
// carried before it had a status of its own. tools/sleipnir-backend.mjs keeps
// the same map for stages.json; stepStatus.test.ts holds the two together.
export const LEGACY_STEP_STATUS: Readonly<Record<string, StepStatus>> = {
  proposed: 'pending',
  todo: 'pending',
  draft: 'pending',
  'in-progress': 'in_progress',
  'in-review': 'in_progress',
  test: 'testing',
  tests: 'testing',
  blocked: 'in_progress',
  approved: 'in_progress',
  done: 'completed',
}

export function isStepStatus(value: unknown): value is StepStatus {
  return value === 'pending' || value === 'in_progress' || value === 'testing' || value === 'completed'
}

// A stored or reported value as a status, or undefined for anything unknown.
export function toStepStatus(value: unknown): StepStatus | undefined {
  if (isStepStatus(value)) return value
  return typeof value === 'string' ? LEGACY_STEP_STATUS[value] : undefined
}
