import React, { useEffect, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Dropdown } from '../UIKit/Dropdown/Dropdown'
import { ANTHROPIC_MODELS, type KeyStatus, type ModelStatus } from './iApiKeySettings'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const PROVIDER = 'anthropic'

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: '0.14em',
  color: 'var(--text-3)',
  ...MONO,
}

interface ApiKeySettingsProps {
  onClose: () => void
  /** Fired after a successful save/clear so AgentChat's status line updates without a manual refresh. */
  onChanged?: (status: KeyStatus) => void
  /** Fired after a successful model change, same reasoning as onChanged. */
  onModelChanged?: (modelId: string) => void
  /** Which edge of the anchor to hang the popover from — 'left' (default, grows rightward) fits a
   *  left-aligned trigger; 'right' (grows leftward) fits a trigger pinned near the right edge of the
   *  screen, like AgentDock's header, where left:0 would push the popover off-screen. */
  align?: 'left' | 'right'
  /** 'down' (default) drops below the anchor; 'up' opens above it — for a trigger docked to the
   *  bottom of the screen, like AgentDock's header, where 'down' would run off the viewport. */
  direction?: 'down' | 'up'
}

// BYOK form — paste an Anthropic API key, stored encrypted-at-rest by the
// main process (see electron/apiKeyStore.cjs) and never re-displayed in
// full once saved, only as a last-4-chars hint — plus the model picker
// (see electron/modelStore.cjs). No key configured falls back to the local
// Ollama provider automatically (see chat.cjs), which ignores the model
// picker entirely.
export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({
  onClose,
  onChanged,
  onModelChanged,
  align = 'left',
  direction = 'down',
}) => {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.settingsAPI?.getKeyStatus(PROVIDER).then(setStatus)
    window.settingsAPI?.getModel().then(setModelStatus)
  }, [])

  const save = async () => {
    const key = input.trim()
    if (!key) return
    setBusy(true)
    setError(null)
    try {
      const next = await window.settingsAPI!.setKey(PROVIDER, key)
      setStatus(next)
      setInput('')
      onChanged?.(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await window.settingsAPI!.clearKey(PROVIDER)
      setStatus(next)
      onChanged?.(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const changeModel = async (id: string) => {
    const previous = modelStatus
    setModelStatus((s) => (s ? { ...s, model: id } : s))
    try {
      await window.settingsAPI!.setModel(id)
      onModelChanged?.(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setModelStatus(previous)
    }
  }

  const modelOptions = (modelStatus?.options ?? ANTHROPIC_MODELS).map((m) => ({ value: m.id, label: m.label }))

  return (
    <Frame
      flow="vertical"
      gap={16}
      padding={16}
      style={{
        position: 'absolute',
        ...(direction === 'up' ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
        ...(align === 'right' ? { right: 0 } : { left: 0 }),
        width: 300,
        maxHeight: '80vh',
        overflowY: 'auto',
        zIndex: 1001,
      }}
      fill={{ solid: 'bg-2' }}
      stroke={{ color: 'var(--border-2)' }}
      radius={4}
    >
      <Frame flow="vertical" gap={10}>
        <span style={SECTION_LABEL}>ANTHROPIC API KEY</span>

        {status?.configured ? (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-2)', ...MONO }}>
              Key configured (····{status.hint})
            </span>
            <button
              onClick={clear}
              disabled={busy}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-2)',
                color: 'var(--text-1)',
                fontSize: 9,
                letterSpacing: '0.08em',
                padding: '6px 10px',
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
                ...MONO,
              }}
            >
              REMOVE KEY
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
              No key set — chat falls back to a local Ollama model. To use cloud AI instead:
            </span>
            <ol
              style={{
                margin: 0,
                paddingLeft: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 10,
                color: 'var(--text-2)',
                lineHeight: 1.5,
                ...MONO,
              }}
            >
              <li>Go to console.anthropic.com and sign in (or create a free account).</li>
              <li>Open Settings → API Keys.</li>
              <li>Click "Create Key", name it, and copy the value — it starts with sk-ant-.</li>
              <li>Paste it below and click Save.</li>
            </ol>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="sk-ant-…"
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border-2)',
                color: 'var(--text-1)',
                fontSize: 11,
                padding: '6px 8px',
                ...MONO,
              }}
            />
            <button
              onClick={save}
              disabled={busy || !input.trim()}
              style={{
                background: input.trim() ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
                border: '1px solid var(--border-2)',
                color: 'var(--text-1)',
                fontSize: 9,
                letterSpacing: '0.08em',
                padding: '6px 10px',
                cursor: busy || !input.trim() ? 'default' : 'pointer',
                opacity: busy || !input.trim() ? 0.5 : 1,
                ...MONO,
              }}
            >
              SAVE
            </button>
          </>
        )}
      </Frame>

      <Frame flow="vertical" gap={10} stroke={{ top: { color: 'var(--border-2)' } }} padding={{ top: 14 }}>
        <span style={SECTION_LABEL}>MODEL</span>
        <Dropdown
          options={modelOptions}
          value={modelStatus?.model}
          onChange={(v) => changeModel(v as string)}
          variant="surface"
          w="fill"
        />
        <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          Applies once a key is configured above — otherwise chat uses local Ollama.
        </span>
      </Frame>

      {error && <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>}

      <button
        onClick={onClose}
        style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.08em', cursor: 'pointer', alignSelf: 'flex-start', ...MONO }}
      >
        CLOSE
      </button>
    </Frame>
  )
}
