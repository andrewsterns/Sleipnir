import React, { useEffect, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { ScrollWindow } from '../UIKit/ScrollWindow/ScrollWindow'
import { ApiKeySettings } from '../AgentChat/ApiKeySettings'
import { MODEL_OPTIONS, OLLAMA_MODEL_ID, type AgentSettings, type KeyStatus, type ModelStatus } from '../AgentChat/iApiKeySettings'
import { AGENT_MODES, AGENT_MODE_HINT, AGENT_MODE_LABEL } from '../AgentChat/iAgentChat'
import {
  getAgentScaffolding,
  getGitIdentity,
  setAgentScaffolding,
  setGitIdentity,
  type GitIdentity,
} from '../../00_planning/api/sleipnirApi'
import type { AgentScaffolding } from '../../00_planning/api/PlatformAPI'
import { useAppTheme } from '../../00_themes/ThemeController'
import { THEME_OPTIONS, type Theme } from '../../00_themes'
import { useKeybindings } from '../../00_keybindings/KeybindingsController'
import { DEFAULT_KEYBINDINGS } from '../../00_keybindings'

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
  { id: 'agent-permissions', label: 'AI Permissions' },
  { id: 'git-identity', label: 'Git Identity' },
  { id: 'agent-scaffolding', label: 'Agent Scaffolding' },
  { id: 'keybindings', label: 'Keybindings' },
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

  const modelLabel = MODEL_OPTIONS.find((m) => m.id === modelStatus?.model)?.label
  const usingOllama = modelStatus?.model === OLLAMA_MODEL_ID

  return (
    <Frame flow="vertical" gap={10} style={{ maxWidth: 360 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        AI CHAT
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        API key and model used by the AI chat — pick Local Ollama in the model list to run free and local instead.
      </span>
      <Frame flow="horizontal" align="center" gap={10} style={{ position: 'relative' }}>
        <span style={{ fontSize: 10, color: 'var(--text-2)', ...MONO }}>
          {usingOllama
            ? 'Using local Ollama'
            : keyStatus?.configured
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

// Which permission mode a new AI chat starts in, and how many tool steps one
// message may take. App-wide, stored in userData (see
// electron/agent/agentSettingsStore.cjs) — "Always allow" rules are per
// project and granted from the chat itself.
function AgentPermissionsSection() {
  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [turnsInput, setTurnsInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.settingsAPI
      ?.getAgentSettings?.()
      .then((s) => {
        setSettings(s)
        setTurnsInput(String(s.maxToolTurns))
      })
      .catch(() => {})
  }, [])

  const save = async (patch: Partial<AgentSettings>) => {
    setError(null)
    try {
      const next = await window.settingsAPI!.setAgentSettings(patch)
      setSettings(next)
      setTurnsInput(String(next.maxToolTurns))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!window.settingsAPI) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>AI settings are desktop-only.</span>
  }

  return (
    <Frame flow="vertical" gap={16} style={{ maxWidth: 420 }}>
      <Frame flow="vertical" gap={10}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>DEFAULT PERMISSION MODE</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          The mode a new AI chat starts in. Switch per chat with the mode button or Shift+Tab.
        </span>
        <Frame flow="vertical" gap={6}>
          {AGENT_MODES.map((m) => {
            const active = settings?.defaultMode === m
            return (
              <button
                key={m}
                onClick={() => save({ defaultMode: m })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: active ? 'rgba(var(--item-ink, 255,255,255), 0.06)' : 'transparent',
                  border: `1px solid ${active ? 'var(--border-2)' : 'var(--border-1)'}`,
                  cursor: 'pointer',
                  ...MONO,
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{AGENT_MODE_LABEL[m]}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.4 }}>{AGENT_MODE_HINT[m]}</span>
                </span>
                <span style={{ fontSize: 13, color: active ? 'var(--text-1)' : 'var(--text-3)' }}>{active ? '◉' : '○'}</span>
              </button>
            )
          })}
        </Frame>
      </Frame>

      <Frame flow="vertical" gap={8}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>TOOL STEPS PER MESSAGE</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          How many rounds of tool calls one message may take before the AI stops and hands back control.
        </span>
        <input
          type="number"
          min={1}
          max={200}
          value={turnsInput}
          onChange={(e) => setTurnsInput(e.target.value)}
          onBlur={() => {
            const n = Number(turnsInput)
            if (Number.isInteger(n) && n !== settings?.maxToolTurns) save({ maxToolTurns: n })
            else setTurnsInput(String(settings?.maxToolTurns ?? ''))
          }}
          style={{
            width: 100,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            color: 'var(--text-1)',
            fontSize: 11,
            padding: '6px 8px',
            ...MONO,
          }}
        />
      </Frame>

      {error && <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>}
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

// The generated per-agent scaffolding (AGENTS.md, CLAUDE.md, GEMINI.md, the
// /plan slash commands for Claude Code / Codex / Gemini, and the vendored
// planning CLI). Project-scoped, like GitIdentitySection above — the setting
// lives in this project's own .planning/project.json and travels with the
// folder, so the same choice applies on whatever machine opens it next.
function AgentScaffoldingSection() {
  const [config, setConfig] = useState<AgentScaffolding | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const pending = getAgentScaffolding()
    // Undefined means the web transport, which never scaffolds a project.
    if (!pending) {
      setUnavailable(true)
      return
    }
    pending.then((next) => (next ? setConfig(next) : setUnavailable(true))).catch(() => setUnavailable(true))
  }, [])

  const setCommit = async (commit: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await setAgentScaffolding({ commit })
      const next = await getAgentScaffolding()
      if (next) setConfig(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame flow="vertical" gap={10} style={{ maxWidth: 460 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        AGENT SCAFFOLDING
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        Sleipnir writes <code>AGENTS.md</code>, <code>CLAUDE.md</code>, <code>GEMINI.md</code> and a{' '}
        <code>/plan</code> command for Claude Code, Codex and Gemini into every project it opens, plus a
        self-contained planning CLI at <code>.sleipnir/plan.mjs</code>. Any edits you make outside the
        generated block are kept.
      </span>

      {unavailable ? (
        <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
          No project is open, or this build has no filesystem access.
        </span>
      ) : (
        <>
          <Frame flow="vertical" gap={4}>
            {[
              {
                commit: true,
                label: 'SHARE WITH THE TEAM',
                help: 'Leave the files committable. Anyone who clones the repo gets a working /plan with only Node installed — no Sleipnir needed.',
              },
              {
                commit: false,
                label: 'KEEP LOCAL',
                help: 'Add the generated files to .git/info/exclude, which is per-clone and never committed. Your .gitignore is left alone, and AGENTS.md / CLAUDE.md / GEMINI.md stay visible to git since they may hold your own notes.',
              },
            ].map((option) => {
              const active = config?.commit === option.commit
              return (
                <button
                  key={option.label}
                  onClick={() => !active && setCommit(option.commit)}
                  disabled={busy || !config}
                  style={{
                    background: active ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
                    border: `1px solid ${active ? 'var(--border-1)' : 'var(--border-2)'}`,
                    color: 'var(--text-1)',
                    textAlign: 'left',
                    padding: '8px 10px',
                    cursor: busy || active || !config ? 'default' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                    ...MONO,
                  }}
                >
                  <Frame flow="vertical" gap={4}>
                    <span style={{ fontSize: 9, letterSpacing: '0.08em' }}>
                      {active ? '● ' : '○ '}
                      {option.label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>{option.help}</span>
                  </Frame>
                </button>
              )
            })}
          </Frame>

          {config?.state && (
            <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6, ...MONO }}>
              Last written {new Date(config.state.generatedAt).toLocaleString()} · v{config.state.version} ·{' '}
              {config.paths.length} files
            </span>
          )}
          {config?.state?.skipped?.length ? (
            <Frame flow="vertical" gap={2}>
              {config.state.skipped.map((s) => (
                <span key={s.path} style={{ fontSize: 9, color: '#e0b07a', ...MONO }}>
                  Skipped {s.path}: {s.reason}
                </span>
              ))}
            </Frame>
          ) : null}
        </>
      )}
      {error && <span style={{ fontSize: 9, color: '#e07a7a', ...MONO }}>{error}</span>}
    </Frame>
  )
}

// Deliberately minimal — only one real hotkey exists anywhere in the app
// today (CommandPalette's Ctrl/Cmd+P, via Frame's onHotkey), so this just
// remaps that one, built to extend as more commands register hotkeys later
// (see 00_keybindings/index.ts). Not a general modifier-remapping UI.
function KeybindingsSection() {
  const { bindings, setBinding } = useKeybindings()
  const [listeningId, setListeningId] = useState<string | null>(null)

  const onCaptureKeyDown = (id: string) => (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return // wait for a real key
    setBinding(id, e.key.toLowerCase())
    setListeningId(null)
  }

  return (
    <Frame flow="vertical" gap={12} style={{ maxWidth: 420 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
        KEYBINDINGS
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, ...MONO }}>
        Remaps to both Ctrl and Cmd, so it works the same on every platform. Applies instantly and is remembered on this device.
      </span>
      <Frame flow="vertical" gap={4}>
        {DEFAULT_KEYBINDINGS.map((b) => {
          const current = bindings[b.id] ?? b.key
          const listening = listeningId === b.id
          return (
            <Frame key={b.id} flow="horizontal" align="center" justify="between" gap={10} padding={{ y: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-1)', ...MONO }}>{b.label}</span>
              {listening ? (
                <input
                  autoFocus
                  readOnly
                  value="Press a key…"
                  onKeyDown={onCaptureKeyDown(b.id)}
                  onBlur={() => setListeningId(null)}
                  style={{
                    width: 140, textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--border-2)',
                    color: 'var(--text-2)', fontSize: 10, padding: '5px 8px', outline: 'none', ...MONO,
                  }}
                />
              ) : (
                <button
                  onClick={() => setListeningId(b.id)}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-1)',
                    fontSize: 10, letterSpacing: '0.04em', padding: '5px 10px', cursor: 'pointer', ...MONO,
                  }}
                >
                  Ctrl/Cmd + {current.toUpperCase()}
                </button>
              )}
            </Frame>
          )
        })}
      </Frame>
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
          {activeSection === 'agent-permissions' && <AgentPermissionsSection />}
          {activeSection === 'git-identity' && <GitIdentitySection />}
          {activeSection === 'agent-scaffolding' && <AgentScaffoldingSection />}
          {activeSection === 'keybindings' && <KeybindingsSection />}
        </Frame>
      </Frame>
    </Frame>
  )
}
