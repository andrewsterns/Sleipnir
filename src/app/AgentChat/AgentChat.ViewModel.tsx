import { useEffect, useRef, useState } from 'react'
import type { GraphNode } from '../../00_planning/graph/types'
import type { ChatMessage } from './iAgentChat'
import { isChatAvailable } from './iAgentChat'

export function useAgentChatViewModel(onPlanNodeCreated?: (node: GraphNode) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const available = isChatAvailable()

  // One session for the component's lifetime — same one-session-per-mount
  // idea as the terminal's pty session (see Terminal.ViewModel.tsx).
  const sessionIdRef = useRef(crypto.randomUUID())

  // Ref, not a dep — App.tsx passes an inline callback that gets a new
  // identity every render, and re-subscribing the IPC listeners on every
  // render would leak duplicate `chat:*` handlers.
  const onPlanNodeCreatedRef = useRef(onPlanNodeCreated)
  onPlanNodeCreatedRef.current = onPlanNodeCreated

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
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `Created plan node "${node.label}" in the AI tab — review and approve it in Planning.`,
          timestamp: Date.now(),
        },
      ])
      onPlanNodeCreatedRef.current?.(node)
    })

    const unsubDone = api.onDone(sessionId, () => {
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }]
        }
        return prev
      })
      setStreaming(false)
    })

    const unsubError = api.onError(sessionId, (message) => {
      setMessages((prev) => {
        const withoutPartial = prev[prev.length - 1]?.streaming ? prev.slice(0, -1) : prev
        return [...withoutPartial, { role: 'system', content: `Error: ${message}`, timestamp: Date.now() }]
      })
      setStreaming(false)
    })

    // run_command's propose/confirm/stream sequence — one new chat message
    // per proposal, updated in place by the output/done events that follow.
    const unsubCommandProposed = api.onCommandProposed(sessionId, ({ requestId, command, args }) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          command: { requestId, command, args, status: 'pending', output: '' },
        },
      ])
    })
    const unsubCommandOutput = api.onCommandOutput(sessionId, ({ requestId, text }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.command?.requestId === requestId ? { ...m, command: { ...m.command, output: m.command.output + text } } : m,
        ),
      )
    })
    const unsubCommandDone = api.onCommandDone(sessionId, ({ requestId, exitCode, timedOut }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.command?.requestId === requestId ? { ...m, command: { ...m.command, status: 'done', exitCode, timedOut } } : m,
        ),
      )
    })

    return () => {
      unsubToken()
      unsubPlanNode()
      unsubDone()
      unsubError()
      unsubCommandProposed()
      unsubCommandOutput()
      unsubCommandDone()
    }
  }, [])

  const decideCommand = (requestId: string, approved: boolean) => {
    window.chatAPI?.sendCommandDecision(requestId, approved)
    setMessages((prev) =>
      prev.map((m) =>
        m.command?.requestId === requestId ? { ...m, command: { ...m.command, status: approved ? 'running' : 'declined' } } : m,
      ),
    )
  }

  const sendMessage = async () => {
    const api = window.chatAPI
    const text = input.trim()
    if (!api || !text || streaming) return

    const history = messages
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: Date.now() }])
    setStreaming(true)
    await api.sendMessage(sessionIdRef.current, history, text)
  }

  const cancel = () => {
    window.chatAPI?.cancel(sessionIdRef.current)
    setStreaming(false)
  }

  return { messages, input, setInput, sendMessage, cancel, streaming, available, decideCommand }
}
