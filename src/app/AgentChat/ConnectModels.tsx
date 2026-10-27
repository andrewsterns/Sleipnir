import React, { useEffect, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import type { ProviderId, ProviderStatus } from './iApiKeySettings'
import type { useAiSettings } from './useAiSettings'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const SECTION_LABEL: React.CSSProperties = { fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }

const smallButton = (enabled = true): React.CSSProperties => ({
  background: 'transparent',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 9,
  letterSpacing: '0.08em',
  padding: '4px 8px',
  cursor: enabled ? 'pointer' : 'default',
  opacity: enabled ? 1 : 0.5,
  whiteSpace: 'nowrap',
  ...MONO,
})

const keyInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  color: 'var(--text-1)',
  fontSize: 11,
  padding: '6px 8px',
  ...MONO,
}

function statusText(p: ProviderStatus): string {
  if (!p.needsKey) return p.connected ? 'Running on this computer' : 'Not running — free, runs locally'
  if (!p.connected) return 'Not connected'
  if (p.source === 'env') return `Using ${p.envVar} from your environment`
  return `Connected · ····${p.hint}`
}

interface ProviderRowProps {
  provider: ProviderStatus
  onConnect: (key: string, providerId: ProviderId) => Promise<string | null>
  onDisconnect: (providerId: ProviderId) => Promise<string | null>
}

function ProviderRow({ provider: p, onConnect, onDisconnect }: ProviderRowProps) {
  const [pasting, setPasting] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    if (!key.trim()) return
    setBusy(true)
    setError(null)
    const err = await onConnect(key.trim(), p.id)
    setBusy(false)
    if (err) setError(err)
    else {
      setKey('')
      setPasting(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    const err = await onDisconnect(p.id)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <Frame flow="vertical" gap={6} padding={{ y: 8 }} stroke={{ top: { color: 'var(--border-1)' } }}>
      <Frame flow="horizontal" align="center" gap={8}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
            background: p.connected ? '#7ec98f' : 'transparent',
            border: `1px solid ${p.connected ? '#7ec98f' : 'var(--border-2)'}`,
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-1)', ...MONO }}>
            {p.label}
            {p.needsKey && <span style={{ color: 'var(--text-3)' }}> · {p.company}</span>}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>{statusText(p)}</span>
        </span>
        {p.needsKey && p.connected && p.source === 'saved' && (
          <button onClick={disconnect} disabled={busy} style={smallButton(!busy)}>
            DISCONNECT
          </button>
        )}
        {(!p.connected || !p.needsKey) && (
          <button onClick={() => window.settingsAPI?.openKeyPage(p.id)} style={smallButton()} title={p.keyUrl}>
            {p.needsKey ? 'GET KEY ↗' : 'GET OLLAMA ↗'}
          </button>
        )}
        {p.needsKey && p.source !== 'saved' && !pasting && (
          <button onClick={() => setPasting(true)} style={smallButton()}>
            {p.connected ? 'USE A SAVED KEY' : 'PASTE KEY'}
          </button>
        )}
      </Frame>
      {pasting && (
        <Frame flow="horizontal" gap={6}>
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') connect()
              if (e.key === 'Escape') setPasting(false)
            }}
            placeholder={p.keyHint ?? ''}
            style={keyInput}
          />
          <button onClick={connect} disabled={busy || !key.trim()} style={smallButton(!busy && !!key.trim())}>
            {busy ? 'CHECKING…' : 'CONNECT'}
          </button>
        </Frame>
      )}
      {error && <span style={{ fontSize: 9, color: '#e07a7a', lineHeight: 1.5, ...MONO }}>{error}</span>}
    </Frame>
  )
}

interface ConnectModelsProps {
  ai: ReturnType<typeof useAiSettings>
}

// The one place keys are added: paste any key into the top box and the
// provider is recognized from its prefix, or use a provider's own row. Either
// way the key is checked with the provider before it's saved (see
// electron/chatProviders/index.cjs's connect()).
export function ConnectModels({ ai }: ConnectModelsProps) {
  const [key, setKey] = useState('')
  const [detected, setDetected] = useState<ProviderId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justConnected, setJustConnected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const value = key.trim()
    if (!value) {
      setDetected(null)
      return
    }
    window.settingsAPI
      ?.detectProvider(value)
      .then((id) => {
        if (!cancelled) setDetected(id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key])

  const detectedLabel = ai.providers?.find((p) => p.id === detected)?.label

  const connect = async () => {
    if (!key.trim()) return
    setBusy(true)
    setError(null)
    setJustConnected(null)
    const err = await ai.connect(key.trim(), detected ?? undefined)
    setBusy(false)
    if (err) setError(err)
    else {
      setJustConnected(detectedLabel ?? 'Provider')
      setKey('')
    }
  }

  return (
    <Frame flow="vertical" gap={10}>
      <span style={SECTION_LABEL}>CONNECT MODELS</span>
      <Frame flow="vertical" gap={6}>
        <Frame flow="horizontal" gap={6}>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setError(null)
              setJustConnected(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') connect()
            }}
            placeholder="Paste a Claude, ChatGPT or Gemini API key"
            style={keyInput}
          />
          <button onClick={connect} disabled={busy || !key.trim()} style={smallButton(!busy && !!key.trim())}>
            {busy ? 'CHECKING…' : 'CONNECT'}
          </button>
        </Frame>
        <span style={{ fontSize: 9, color: error ? '#e07a7a' : 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          {error
            ? error
            : justConnected
              ? `${justConnected} connected.`
              : key.trim()
                ? detectedLabel
                  ? `Looks like a ${detectedLabel} key.`
                  : "Can't tell which provider this is — use that provider's PASTE KEY below."
                : 'Keys are checked with the provider, then stored encrypted on this computer.'}
        </span>
      </Frame>

      <Frame flow="vertical" gap={0}>
        {ai.providers === null ? (
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>Loading…</span>
        ) : (
          ai.providers.map((p) => <ProviderRow key={p.id} provider={p} onConnect={ai.connect} onDisconnect={ai.disconnect} />)
        )}
      </Frame>
    </Frame>
  )
}
