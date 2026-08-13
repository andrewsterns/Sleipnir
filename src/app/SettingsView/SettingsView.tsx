import React, { useEffect, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { ApiKeySettings } from '../AgentChat/ApiKeySettings'
import { ANTHROPIC_MODELS, type KeyStatus, type ModelStatus } from '../AgentChat/iApiKeySettings'
import { getGitIdentity, setGitIdentity, type GitIdentity } from '../../00_planning/api/sleipnirApi'
import { useAppTheme } from '../../00_themes/ThemeController'
import { THEME_OPTIONS, type Theme } from '../../00_themes'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface SettingsSection {
  id: string
  label: string
}

// Every section this page can show — more land here over time (appearance/
// themes, keyboard shortcuts, ...), each just a new entry here plus a case
// in the switch below. The page chrome (header, section rail) never changes
// to accommodate them.
const SECTIONS: SettingsSection[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'git-identity', label: 'Git Identity' },
]

// A live, in-theme preview of a theme's own palette — the swatch itself is
// scoped to `theme-{id}`, so every var() inside resolves to that theme's
// tokens regardless of the theme the app is currently showing.
function ThemeSwatch({ id }: { id: Theme }) {
  return (
    <div
      className={`theme-${id}`}
      style={{
        width: 46,
        height: 34,
        flexShrink: 0,
        borderRadius: 6,
        overflow: 'hidden',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: 4,
      }}
    >
      <div style={{ height: 7, background: 'var(--bg-2)', border: '1px solid var(--border-1)', borderRadius: 2 }} />
      <div style={{ height: 3, width: '72%', background: 'var(--text-1)', borderRadius: 2 }} />
      <div style={{ height: 3, width: '48%', background: 'var(--text-2)', borderRadius: 2 }} />
    </div>
  )
}

// The customization layer's first tenant: pick the app-wide theme. Rows are
// token-styled so this panel itself repaints with the selection. Adding a
// theme is just a new THEME_OPTIONS entry + its CSS — no change here.
function AppearanceSection() {
  const { theme, setTheme } = useAppTheme()

  return (
    <Frame flow="vertical" gap={12} style={{ maxWidth: 420 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        THEME
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        The app-wide color theme. Applies everywhere instantly and is remembered on this device.
      </span>

      <Frame flow="vertical" gap={8}>
        {THEME_OPTIONS.map((opt) => {
          const active = opt.id === theme
          return (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              aria-pressed={active}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: 'var(--radius-control)',
                background: active ? 'var(--bg-2)' : 'transparent',
                border: `1px solid ${active ? 'var(--border-2)' : 'var(--border-1)'}`,
                color: 'var(--text-1)',
                ...MONO,
              }}
            >
              <ThemeSwatch id={opt.id} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-1)', letterSpacing: '0.02em' }}>{opt.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>{opt.description}</span>
              </span>
              <span style={{ fontSize: 13, color: active ? 'var(--text-1)' : 'var(--text-3)', flexShrink: 0 }}>
                {active ? '◉' : '○'}
              </span>
            </button>
          )
        })}
      </Frame>
    </Frame>
  )
}

function ApiKeysSection() {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)

  useEffect(() => {
    window.settingsAPI?.getKeyStatus('anthropic').then(setKeyStatus)
    window.settingsAPI?.getModel().then(setModelStatus)
  }, [])

  const modelLabel = ANTHROPIC_MODELS.find((m) => m.id === modelStatus?.model)?.label

  return (
    <Frame flow="vertical" gap={10} style={{ maxWidth: 360 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        AI CHAT
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        API key and model used by the AI chat — no key set falls back to a local Ollama model.
      </span>
      <Frame flow="horizontal" align="center" gap={10} style={{ position: 'relative' }}>
        <span style={{ fontSize: 10, color: 'var(--text-2)', ...MONO }}>
          {keyStatus?.configured
            ? `Anthropic key configured (····${keyStatus.hint})${modelLabel ? ` · ${modelLabel}` : ''}`
            : 'No key set — using local Ollama'}
        </span>
        <button
          onClick={() => setPopoverOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '5px 10px',
            cursor: 'pointer',
            ...MONO,
          }}
        >
          {keyStatus?.configured ? 'MANAGE' : 'SET KEY'}
        </button>
        {popoverOpen && (
          <ApiKeySettings
            onClose={() => setPopoverOpen(false)}
            onChanged={setKeyStatus}
          />
        )}
      </Frame>
    </Frame>
  )
}

function GitIdentitySection() {
  const [identity, setIdentityState] = useState<GitIdentity | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getGitIdentity()
      .then((id) => {
        setIdentityState(id)
        setName(id.name)
        setEmail(id.email)
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await setGitIdentity(name.trim(), email.trim())
      setIdentityState(next)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const dirty = !!identity && (name.trim() !== identity.name || email.trim() !== identity.email)

  return (
    <Frame flow="vertical" gap={10} style={{ maxWidth: 360 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        GIT IDENTITY
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        Used for commits made from Source Control — writes to this repo's local git config only.
      </span>
      <Frame flow="vertical" gap={6}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 11,
            padding: '6px 8px',
            ...MONO,
          }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 11,
            padding: '6px 8px',
            ...MONO,
          }}
        />
      </Frame>
      <Frame flow="horizontal" align="center" gap={10}>
        <button
          onClick={save}
          disabled={busy || !dirty}
          style={{
            background: dirty ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '6px 12px',
            cursor: busy || !dirty ? 'default' : 'pointer',
            opacity: busy || !dirty ? 0.5 : 1,
            ...MONO,
          }}
        >
          {busy ? 'SAVING…' : 'SAVE'}
        </button>
        {saved && !dirty && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>Saved.</span>
        )}
      </Frame>
      {error && <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

// A full page, not a bottom dock — settings is a growing list of sections
// (API keys today, appearance/themes and keyboard shortcuts planned), and a
// 320px terminal-style strip doesn't scale the way a real page with a
// section rail does. Reached via the gear pinned to the bottom of NavRail
// (see App.tsx), same as any other category — not a floating toggle/panel
// like TerminalDock/AgentDock/ProblemsDock.
export const SettingsView: React.FC = () => {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)
  const { theme } = useAppTheme()

  return (
    <Frame theme={theme} h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'var(--border-1)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          SETTINGS
        </span>
      </Frame>

      <Frame flow="horizontal" grow minH={0}>
        <ScrollWindow axis="y" flow="vertical" gap={0} minW={200} w={200} padding={16} stroke={{ right: { color: 'var(--border-1)' } }}>
          {SECTIONS.map((s) => {
            const active = s.id === activeSection
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: active ? 'rgba(var(--item-ink, 255,255,255), 0.06)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                  fontSize: 11,
                  letterSpacing: '0.02em',
                  ...MONO,
                }}
              >
                {s.label}
              </button>
            )
          })}
        </ScrollWindow>

        <Frame grow minW={0} scroll="y" padding={24}>
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'api-keys' && <ApiKeysSection />}
          {activeSection === 'git-identity' && <GitIdentitySection />}
        </Frame>
      </Frame>
    </Frame>
  )
}
