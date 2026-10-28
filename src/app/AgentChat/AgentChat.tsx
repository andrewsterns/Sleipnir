import React, { useEffect, useRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { SleipnirLoader } from '../UIKit/SleipnirLoader/SleipnirLoader'
import { useAgentChatViewModel } from './AgentChat.ViewModel'
import { ToolActivityRow } from './ToolActivityRow'
import { AGENT_MODE_HINT, AGENT_MODE_LABEL, type AgentChatProps, type AgentMode } from './iAgentChat'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
/** A reply that pauses this long mid-stream is thinking again (writing a tool call, usually). */
const QUIET_MS = 1500
/** Past this with no word from the provider, say so — it may be stuck. */
const STALL_MS = 30_000

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
  assistant: 'AI',
  system: 'SYSTEM',
}

const ROLE_COLOR: Record<string, string> = {
  user: 'var(--text-1)',
  assistant: 'var(--text-1)',
  system: 'var(--text-3)',
}

// Auto runs changes unasked, so it reads as a warning; Plan as a calm accent.
const MODE_COLOR: Record<AgentMode, string> = {
  ask: 'var(--text-2)',
  acceptEdits: '#7aa8e0',
  plan: '#7ec98f',
  auto: '#e0a040',
}

const EMPTY_HINT: Record<AgentMode, string> = {
  ask: 'Ask about the project, or ask for a change — you approve each change before it happens.',
  acceptEdits: 'File edits apply as the AI makes them (each has an Undo). Commands and commits still ask first.',
  plan: "Describe what to build — the AI explores the project and drafts a plan into Planning's AI tab.",
  auto: 'The AI runs changes without asking. Push, pull and destructive tools still ask.',
}

function SetupCard({ onConnectModels }: { onConnectModels?: () => void }) {
  return (
    <Frame flow="vertical" gap={8} padding={12} fill={{ solid: 'bg-0' }} stroke={{ color: 'var(--border-1)' }} style={{ maxWidth: 520 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-1)', ...MONO }}>CONNECT A MODEL TO START</span>
      <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
        Paste an API key for Claude, ChatGPT or Gemini — each provider’s “Get key” button takes you straight to its key page.
        Or run a model on this computer with Ollama, free and offline.
      </span>
      {onConnectModels && (
        <button
          onClick={onConnectModels}
          style={{
            alignSelf: 'flex-start',
            background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '5px 10px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          CONNECT MODELS
        </button>
      )}
    </Frame>
  )
}

/** The design commands the agent understands (see electron/agent/systemPrompt.cjs and tools/canvas.cjs). */
const SLASH_COMMANDS = [
  { name: '/frame', hint: 'design it on the Canvas board as editable frames' },
  { name: '/component', hint: 'design it as a component — Sleipnir writes the code' },
  { name: '/optimize', hint: 'measure the architecture or a feature, then plan the fixes' },
]

export const AgentChat: React.FC<AgentChatProps> = ({ onPlanNodeCreated, needsSetup, onConnectModels }) => {
  const {
    messages,
    input,
    setInput,
    sendMessage,
    cancel,
    streaming,
    silentForMs,
    available,
    mode,
    cycleMode,
    decideTool,
    undoChangeSet,
    reapplyChangeSet,
  } = useAgentChatViewModel(onPlanNodeCreated)
  const scrollRef = useRef<HTMLElement>(null)

  // The horse gallops whenever the model is working with nothing to show for
  // it: before the first token, after a tool finishes (the model is reading
  // its result), and when a reply goes quiet mid-stream. Not while a tool
  // waits on your approval — that's waiting on you, not on the model.
  const lastMessage = messages[messages.length - 1]
  const textStreaming = lastMessage?.role === 'assistant' && !!lastMessage.streaming && !lastMessage.tool
  const awaitingYou = lastMessage?.tool?.status === 'awaiting-approval'
  const thinking = streaming && !awaitingYou && (!textStreaming || silentForMs > QUIET_MS)
  const stalledSeconds = silentForMs >= STALL_MS ? Math.floor(silentForMs / 1000) : 0
  const stalled = stalledSeconds > 0

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking, stalled])

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

  // Shift+Tab cycles the permission mode, same as Claude Code.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      cycleMode()
    }
  }

  return (
    <Frame flow="vertical" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      <ScrollWindow ref={scrollRef} axis="y" flow="vertical" gap={10} padding={12} style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 &&
          (needsSetup ? (
            <SetupCard onConnectModels={onConnectModels} />
          ) : (
            <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>{EMPTY_HINT[mode]}</span>
          ))}
        {messages.map((m, i) => {
          // Consecutive tool rows sit under one AI label rather than repeating it.
          const previous = messages[i - 1]
          const continuesAssistant = m.role === 'assistant' && previous?.role === 'assistant'
          return (
            <div key={m.tool?.callId ?? i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!continuesAssistant && (
                <span style={{ fontSize: 9, letterSpacing: '0.1em', color: ROLE_COLOR[m.role], opacity: 0.7, ...MONO }}>
                  {ROLE_LABEL[m.role]}
                </span>
              )}
              {m.tool ? (
                <ToolActivityRow tool={m.tool} onDecide={decideTool} onUndo={undoChangeSet} onReapply={reapplyChangeSet} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: m.role === 'system' ? 'var(--text-3)' : 'var(--text-1)',
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
              )}
            </div>
          )
        })}
        {thinking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!textStreaming && (
              <span style={{ fontSize: 9, letterSpacing: '0.1em', color: ROLE_COLOR.assistant, opacity: 0.7, ...MONO }}>
                {ROLE_LABEL.assistant}
              </span>
            )}
            <SleipnirLoader size={32} />
            {stalledSeconds > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>
                No response for {stalledSeconds}s — still waiting. STOP cancels this turn.
              </span>
            )}
          </div>
        )}
      </ScrollWindow>

      {/* Design commands, offered while a "/" word is being typed. */}
      {/^\/\w*$/.test(input) && (
        <Frame flow="vertical" gap={0} stroke={{ top: { color: 'var(--border-1)' } }}>
          {SLASH_COMMANDS.filter((c) => c.name.startsWith(input)).map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setInput(`${c.name} `)}
              style={{ display: 'flex', gap: 10, alignItems: 'baseline', textAlign: 'left', background: 'transparent', border: 'none', padding: '6px 12px', cursor: 'pointer', ...MONO }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-1)' }}>{c.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{c.hint}</span>
            </button>
          ))}
        </Frame>
      )}

      <Frame
        as="form"
        onSubmit={handleSubmit}
        flow="horizontal"
        align="center"
        gap={8}
        padding={10}
        stroke={{ top: { color: mode === 'auto' ? 'rgba(224,160,64,0.6)' : 'var(--border-1)' } }}
      >
        <button
          type="button"
          onClick={cycleMode}
          title={`${AGENT_MODE_HINT[mode]} — click or Shift+Tab to change`}
          style={{
            background: 'transparent',
            border: `1px solid ${mode === 'ask' ? 'var(--border-2)' : MODE_COLOR[mode]}`,
            color: MODE_COLOR[mode],
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '4px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            ...MONO,
          }}
        >
          {AGENT_MODE_LABEL[mode].toUpperCase()}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'plan' ? 'Describe what to plan…' : 'Ask AI… (/frame or /component to design on the canvas)'}
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
              background: 'rgba(var(--item-ink, 255,255,255), 0.10)',
              border: '1px solid var(--border-2)',
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
              background: input.trim() ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
              border: '1px solid var(--border-2)',
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
