import type { GraphNode } from '../../00_planning/graph/types'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** True while an assistant message is still receiving tokens — shows a blinking cursor, and is the one appended to as more `chat:token` events arrive. */
  streaming?: boolean
  /** Present on the synthetic message representing a run_command proposal — see CommandConfirmModal / AgentChat.tsx's inline output block. */
  command?: ProposedCommandState
}

export interface ProposedCommandState {
  requestId: string
  command: string
  args: string[]
  status: 'pending' | 'declined' | 'running' | 'done'
  output: string
  exitCode?: number | null
  timedOut?: boolean
}

export interface ProposedCommand {
  requestId: string
  command: string
  args: string[]
}

export interface CommandOutputPayload {
  requestId: string
  stream: 'stdout' | 'stderr'
  text: string
}

export interface CommandDonePayload {
  requestId: string
  exitCode: number | null
  timedOut: boolean
}

export interface AgentChatProps {
  /** Fired every time a plan node streams in, so the host app can jump to (and stay on) Planning's AI tab to watch the build live instead of wherever the user last navigated. */
  onPlanNodeCreated?: (node: GraphNode) => void
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface CodeGeneratedPayload {
  files: GeneratedFile[]
}

export interface ChatAPI {
  sendMessage: (
    sessionId: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    message: string,
  ) => Promise<void>
  cancel: (sessionId: string) => void
  onToken: (sessionId: string, callback: (delta: string) => void) => () => void
  onPlanNodeCreated: (sessionId: string, callback: (node: GraphNode) => void) => () => void
  /** Fired by the generate_code tool — staged content only, never written to disk (see WorkspaceView.tsx's pendingOverride). */
  onCodeGenerated: (sessionId: string, callback: (payload: CodeGeneratedPayload) => void) => () => void
  onDone: (sessionId: string, callback: (fullText: string) => void) => () => void
  onError: (sessionId: string, callback: (message: string) => void) => () => void
  /** Answers a pending run_command proposal — nothing runs until this is called with approved=true. */
  sendCommandDecision: (requestId: string, approved: boolean) => void
  onCommandProposed: (sessionId: string, callback: (payload: ProposedCommand) => void) => () => void
  onCommandOutput: (sessionId: string, callback: (payload: CommandOutputPayload) => void) => () => void
  onCommandDone: (sessionId: string, callback: (payload: CommandDonePayload) => void) => () => void
}

declare global {
  interface Window {
    chatAPI?: ChatAPI
  }
}

// No web-transport equivalent exists — the Anthropic API key only ever lives
// in the Electron main process's environment, never shipped to a browser
// build. Callers should check this before rendering <AgentChat /> and show
// a "desktop-only" message instead when it's false.
export function isChatAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.chatAPI
}
