import { useEffect, useRef, useState } from 'react'
import type { GraphNode } from '../../00_planning/graph/types'
import type { AgentMode, ChangeSet, ChatMessage, ToolActivity, ToolDecision, ToolUpdate } from './iAgentChat'
import { AGENT_MODES, isChatAvailable } from './iAgentChat'

function mergeTool(existing: ToolActivity | undefined, update: ToolUpdate): ToolActivity {
  return {
    name: '',
    kind: 'read',
    summary: '',
    status: 'running',
    output: '',
    ...existing,
    ...update,
  }
}

// Closes off a still-streaming assistant message — once a tool row lands
// after it, later tokens belong to a new message, and the old one must stop
// showing a cursor.
function settleStreaming(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1]
  return last?.role === 'assistant' && last.streaming ? [...messages.slice(0, -1), { ...last, streaming: false }] : messages
}

export function useAgentChatViewModel(onPlanNodeCreated?: (node: GraphNode) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mode, setMode] = useState<AgentMode>('ask')
  const available = isChatAvailable()

  // One session for the component's lifetime — same one-session-per-mount
  // idea as the terminal's pty session (see Terminal.ViewModel.tsx).
  const sessionIdRef = useRef(crypto.randomUUID())

  // Ref, not a dep — App.tsx passes an inline callback that gets a new
  // identity every render, and re-subscribing the IPC listeners on every
  // render would leak duplicate `chat:*` handlers.
  const onPlanNodeCreatedRef = useRef(onPlanNodeCreated)
  onPlanNodeCreatedRef.current = onPlanNodeCreated

  // New chats start in the saved default mode (Settings > AI).
  useEffect(() => {
    window.settingsAPI
      ?.getAgentSettings?.()
      .then((s) => setMode(s.defaultMode))
      .catch(() => {})
  }, [])

  const patchTool = (callId: string, patch: (tool: ToolActivity) => ToolActivity) => {
    setMessages((prev) => prev.map((m) => (m.tool?.callId === callId ? { ...m, tool: patch(m.tool) } : m)))
  }

  useEffect(() => {
    const api = window.chatAPI
    if (!api) return
    const sessionId = sessionIdRef.current

    const unsubToken = api.onToken(sessionId, (delta) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
        }
        return [...prev, { role: 'assistant', content: delta, timestamp: Date.now(), streaming: true }]
      })
    })

    const unsubPlanNode = api.onPlanNodeCreated(sessionId, (node) => {
      onPlanNodeCreatedRef.current?.(node)
    })

    const unsubTool = api.onTool(sessionId, (update) => {
      setMessages((prev) => {
        if (prev.some((m) => m.tool?.callId === update.callId)) {
          return prev.map((m) => (m.tool?.callId === update.callId ? { ...m, tool: mergeTool(m.tool, update) } : m))
        }
        return [
          ...settleStreaming(prev),
          { role: 'assistant', content: '', timestamp: Date.now(), tool: mergeTool(undefined, update) },
        ]
      })
    })

    const unsubToolOutput = api.onToolOutput(sessionId, ({ callId, text }) => {
      patchTool(callId, (t) => ({ ...t, output: t.output + text }))
    })

    const unsubDone = api.onDone(sessionId, () => {
      setMessages((prev) => settleStreaming(prev))
      setStreaming(false)
    })

    const unsubError = api.onError(sessionId, (message) => {
      setMessages((prev) => {
        const withoutPartial = prev[prev.length - 1]?.streaming ? prev.slice(0, -1) : prev
        return [...withoutPartial, { role: 'system', content: `Error: ${message}`, timestamp: Date.now() }]
      })
      setStreaming(false)
    })

    return () => {
      unsubToken()
      unsubPlanNode()
      unsubTool()
      unsubToolOutput()
      unsubDone()
      unsubError()
    }
  }, [])

  const decideTool = (callId: string, decision: ToolDecision, paths?: string[]) => {
    window.chatAPI?.sendToolDecision(callId, decision, paths)
    // Optimistic — the main process confirms with its own status patch.
    patchTool(callId, (t) => ({ ...t, status: decision === 'deny' ? 'denied' : 'running' }))
  }

  const setChangeSet = (callId: string, changeSet: ChangeSet) => patchTool(callId, (t) => ({ ...t, changeSet }))

  const undoChangeSet = async (callId: string, changeSetId: string) => {
    const api = window.chatAPI
    if (!api) return
    try {
      const { changeSet, conflicts } = await api.undoChangeSet(changeSetId)
      setChangeSet(callId, changeSet)
      if (conflicts.length) {
        patchTool(callId, (t) => ({ ...t, error: conflicts.map((c) => `${c.path}: ${c.error}`).join('\n') }))
      }
    } catch (e) {
      patchTool(callId, (t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }))
    }
  }

  const reapplyChangeSet = async (callId: string, changeSetId: string) => {
    const api = window.chatAPI
    if (!api) return
    try {
      const { changeSet, failed } = await api.applyChangeSet(changeSetId)
      setChangeSet(callId, changeSet)
      if (failed.length) {
        patchTool(callId, (t) => ({ ...t, error: failed.map((f) => `${f.path}: ${f.error}`).join('\n') }))
      }
    } catch (e) {
      patchTool(callId, (t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }))
    }
  }

  const cycleMode = () => {
    setMode((m) => AGENT_MODES[(AGENT_MODES.indexOf(m) + 1) % AGENT_MODES.length])
  }

  const sendMessage = async () => {
    const api = window.chatAPI
    const text = input.trim()
    if (!api || !text || streaming) return

    // Text only: tool calls stay inside the message that made them, so the
    // history survives switching models between messages.
    // Text split by tool rows is merged back into one turn per role, since some
    // providers require user/assistant turns to alternate.
    const history: { role: 'user' | 'assistant'; content: string }[] = []
    for (const m of messages) {
      if ((m.role !== 'user' && m.role !== 'assistant') || m.tool || !m.content) continue
      const last = history[history.length - 1]
      if (last?.role === m.role) last.content += `\n\n${m.content}`
      else history.push({ role: m.role, content: m.content })
    }

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }])
    setStreaming(true)
    await api.sendMessage(sessionIdRef.current, history, text, { mode })
  }

  const cancel = () => {
    window.chatAPI?.cancel(sessionIdRef.current)
    setStreaming(false)
  }

  return {
    messages,
    input,
    setInput,
    sendMessage,
    cancel,
    streaming,
    available,
    mode,
    setMode,
    cycleMode,
    decideTool,
    undoChangeSet,
    reapplyChangeSet,
  }
}
