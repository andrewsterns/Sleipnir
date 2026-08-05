import type { GraphNode, LibraryEntry } from '../../00_planning/graph/types'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  /** True while an assistant message is still receiving tokens — shows a blinking cursor, and is the one appended to as more `chat:token` events arrive. */
  streaming?: boolean
}

export interface AgentChatProps {
  /** Fired every time a plan node streams in, so the host app can jump to (and stay on) Planning's CLAUDE tab to watch the build live instead of wherever the user last navigated. */
  onPlanNodeCreated?: (node: GraphNode) => void
  /** Fired when the user types the `/plan` slash command — opens the same Create Library modal the Planning UI's "+ New Library" button does. Intercepted locally; never reaches the LLM. */
  onPlanCommand?: () => void
  /** Fired when the AI itself calls the create_library tool (natural-language request, not the `/plan` command) — the library already exists by the time this fires; the host app can jump to it in Planning. */
  onLibraryCreated?: (library: LibraryEntry) => void
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
  onLibraryCreated: (sessionId: string, callback: (library: LibraryEntry) => void) => () => void
  /** Fired by the generate_code tool — staged content only, never written to disk (see DesignLibrary.view.tsx's pendingOverride). */
  onCodeGenerated: (sessionId: string, callback: (payload: CodeGeneratedPayload) => void) => () => void
  onDone: (sessionId: string, callback: (fullText: string) => void) => () => void
  onError: (sessionId: string, callback: (message: string) => void) => () => void
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
