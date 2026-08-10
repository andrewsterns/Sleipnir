import React, { useEffect, useRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { SleipnirLoader } from '../UIKit/SleipnirLoader/SleipnirLoader'
import { useAgentChatViewModel } from './AgentChat.ViewModel'
import type { AgentChatProps } from './iAgentChat'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

let _kfInjected = false
function ensureCursorCSS() {
  if (_kfInjected || typeof document === 'undefined') return
  const el = document.createElement('style')
  el.setAttribute('data-agent-chat-kf', '')
  el.textContent = `@keyframes agent-cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }`
  document.head.appendChild(el)
  _kfInjected = true
}
ensureCursorCSS()

const ROLE_LABEL: Record<string, string> = {
  user: 'YOU',
  assistant: 'CLAUDE',
  system: 'SYSTEM',
}

const ROLE_COLOR: Record<string, string> = {
  user: 'var(--text-1)',
  assistant: 'var(--text-1)',
  system: 'var(--text-3)',
}

export const AgentChat: React.FC<AgentChatProps> = ({ onPlanNodeCreated }) => {
  const { messages, input, setInput, sendMessage, cancel, streaming, available } = useAgentChatViewModel(onPlanNodeCreated)
  const scrollRef = useRef<HTMLElement>(null)

  // Gap between "sent" and the first token: no assistant message exists yet
  // to show a streaming cursor on, so show the gallop here instead.
  const lastMessage = messages[messages.length - 1]
  const waitingForFirstToken = streaming && lastMessage?.role !== 'assistant'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, waitingForFirstToken])

  if (!available) {
    return (
      <Frame flow="vertical" h="fill" w="fill" align="center" justify="center" fill={{ solid: 'bg-1' }} padding={20}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', textAlign: 'center', ...MONO }}>
          AI CHAT IS DESKTOP-ONLY — RUN THE ELECTRON APP
        </span>
      </Frame>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage()
  }

  return (
    <Frame flow="vertical" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      <ScrollWindow ref={scrollRef} axis="y" flow="vertical" gap={10} padding={12} style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 && (
          <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
            Ask for a plan and it'll show up as draft nodes in Planning's CLAUDE tab.
          </span>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: ROLE_COLOR[m.role], opacity: 0.7, ...MONO }}>
              {ROLE_LABEL[m.role]}
            </span>
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: m.role === 'system' ? 'var(--text-3)' : 'var(--text-1)',
                fontStyle: m.role === 'system' ? 'italic' : 'normal',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                ...MONO,
              }}
            >
              {m.content}
              {m.streaming && (
                <span style={{ display: 'inline-block', width: 7, animation: 'agent-cursor-blink 1s step-start infinite' }}>
                  ▌
                </span>
              )}
            </span>
          </div>
        ))}
        {waitingForFirstToken && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: ROLE_COLOR.assistant, opacity: 0.7, ...MONO }}>
              {ROLE_LABEL.assistant}
            </span>
            <SleipnirLoader size={32} />
          </div>
        )}
      </ScrollWindow>

      <Frame
        as="form"
        onSubmit={handleSubmit}
        flow="horizontal"
        align="center"
        gap={8}
        padding={10}
        stroke={{ top: { color: 'rgba(255,255,255,0.08)' } }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Claude…"
          disabled={streaming}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 12,
            color: 'var(--text-1)',
            ...MONO,
          }}
        />
        {streaming ? (
          <button
            type="button"
            onClick={cancel}
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-1)',
              fontSize: 9,
              letterSpacing: '0.08em',
              padding: '4px 10px',
              cursor: 'pointer',
              ...MONO,
            }}
          >
            STOP
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              background: input.trim() ? 'rgba(255,255,255,0.10)' : 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-1)',
              fontSize: 9,
              letterSpacing: '0.08em',
              padding: '4px 10px',
              cursor: input.trim() ? 'pointer' : 'default',
              opacity: input.trim() ? 1 : 0.5,
              ...MONO,
            }}
          >
            SEND
          </button>
        )}
      </Frame>
    </Frame>
  )
}
