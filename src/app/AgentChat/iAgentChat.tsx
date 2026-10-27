import type { GraphNode } from '../../00_planning/graph/types'

/** Permission modes a person can pick in the chat — see electron/agent/permissions.cjs. */
export type AgentMode = 'ask' | 'acceptEdits' | 'plan' | 'auto'

/** Everything sendMessage accepts, including the internal 'headless' mode Planning's one-shot builds use. */
export type AgentModeOrHeadless = AgentMode | 'headless'

/** Shift+Tab cycle order — keep in sync with USER_MODES in electron/agent/permissions.cjs. */
export const AGENT_MODES: AgentMode[] = ['ask', 'acceptEdits', 'plan', 'auto']

export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  ask: 'Ask',
  acceptEdits: 'Accept edits',
  plan: 'Plan',
  auto: 'Auto',
}

export const AGENT_MODE_HINT: Record<AgentMode, string> = {
  ask: 'Reads freely; asks before every change',
  acceptEdits: 'Applies file edits and plan nodes; asks before commands and commits',
  plan: 'Read-only; explores and writes a plan',
  auto: 'Runs changes without asking, except push, pull and destructive tools',
}

export type ToolKind = 'read' | 'edit' | 'exec' | 'external'

export type ToolStatus = 'running' | 'awaiting-approval' | 'done' | 'denied' | 'error'

export interface ChangeSetFile {
  path: string
  status: 'added' | 'modified' | 'unchanged'
  diff: string
  additions: number
  deletions: number
  applied: boolean
}

export interface ChangeSet {
  id: string
  state: 'pending' | 'applied' | 'discarded' | 'reverted'
  files: ChangeSetFile[]
}

/** One tool call, as the chat shows it — built up from `chat:tool` patches. */
export interface ToolActivity {
  callId: string
  name: string
  kind: ToolKind
  summary: string
  inputPreview?: string
  status: ToolStatus
  /** Whether the approval card may offer "Always allow in this project". */
  canRemember?: boolean
  /** Streamed text, e.g. run_command's stdout/stderr. */
  output: string
  error?: string
  exitCode?: number | null
  timedOut?: boolean
  changeSet?: ChangeSet
}

/** A `chat:tool` event: a partial ToolActivity for one callId. */
export type ToolUpdate = Partial<ToolActivity> & { callId: string }

export interface ToolOutputPayload {
  callId: string
  text: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** True while an assistant message is still receiving tokens — shows a blinking cursor, and is the one appended to as more `chat:token` events arrive. */
  streaming?: boolean
  /** Present on the message representing one tool call — see ToolActivityRow. */
  tool?: ToolActivity
}

export interface AgentChatProps {
  /** Fired every time a plan node streams in, so the host app can jump to (and stay on) Planning's AI tab to watch the build live instead of wherever the user last navigated. */
  onPlanNodeCreated?: (node: GraphNode) => void
  /** True when no model is usable yet (no cloud key, local Ollama not running) — the empty chat shows a setup card instead of a hint. */
  needsSetup?: boolean
  /** Opens the Connect models panel. */
  onConnectModels?: () => void
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface CodeGeneratedPayload {
  files: GeneratedFile[]
}

export interface SendMessageOptions {
  mode?: AgentModeOrHeadless
}

export type ToolDecision = 'once' | 'always' | 'deny'

export interface ChangeSetApplyResult {
  applied: string[]
  failed: { path: string; error: string }[]
  changeSet: ChangeSet
}

export interface ChangeSetUndoResult {
  reverted: string[]
  conflicts: { path: string; error: string }[]
  changeSet: ChangeSet
}

export interface ChatAPI {
  sendMessage: (
    sessionId: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    message: string,
    options?: SendMessageOptions,
  ) => Promise<void>
  cancel: (sessionId: string) => void
  onToken: (sessionId: string, callback: (delta: string) => void) => () => void
  onPlanNodeCreated: (sessionId: string, callback: (node: GraphNode) => void) => () => void
  /** Headless sessions only: generate_code hands the files over instead of writing them (see PlanningView). */
  onCodeGenerated: (sessionId: string, callback: (payload: CodeGeneratedPayload) => void) => () => void
  onDone: (sessionId: string, callback: (fullText: string) => void) => () => void
  onError: (sessionId: string, callback: (message: string) => void) => () => void
  onTool: (sessionId: string, callback: (update: ToolUpdate) => void) => () => void
  onToolOutput: (sessionId: string, callback: (payload: ToolOutputPayload) => void) => () => void
  /** Answers a tool call waiting on approval. `paths` narrows an approved change set to some of its files. */
  sendToolDecision: (callId: string, decision: ToolDecision, paths?: string[]) => void
  applyChangeSet: (id: string, paths?: string[]) => Promise<ChangeSetApplyResult>
  undoChangeSet: (id: string) => Promise<ChangeSetUndoResult>
}

declare global {
  interface Window {
    chatAPI?: ChatAPI
  }
}

// No web-transport equivalent exists — provider keys only ever live in the
// Electron main process, never shipped to a browser build. Callers should
// check this before rendering <AgentChat /> and show a "desktop-only" message
// instead when it's false.
export function isChatAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.chatAPI
}
