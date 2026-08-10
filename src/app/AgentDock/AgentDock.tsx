import React, { useEffect, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { AgentChat } from '../AgentChat/AgentChat'
import { ApiKeySettings } from '../AgentChat/ApiKeySettings'
import { ANTHROPIC_MODELS, type KeyStatus, type ModelStatus } from '../AgentChat/iApiKeySettings'
import type { GraphNode } from '../../00_planning/graph/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface AgentDockProps {
  /** Controlled from App.tsx so only one of Terminal/AgentDock's full-width bottom panels is ever open at once. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Forwarded to AgentChat — lets App.tsx jump to Planning's CLAUDE tab live as Claude builds nodes. */
  onPlanNodeCreated?: (node: GraphNode) => void
  /** True whenever any dock (this one or a sibling) is open — App.tsx reclaims DOCK_PANEL_HEIGHT from the layout above when that happens, so every dock's own toggle button shifts up in lockstep to stay clear of whichever panel is now occupying that space, rather than floating on top of it. */
  shiftUp?: boolean
}

// Sits directly beside TerminalDock's toggle (40px button + 20px gap + 8px
// spacing = 68px from the right edge). Same mount-once-hide-via-CSS pattern:
// <AgentChat/> mounts exactly once, the first time it's opened, and stays
// mounted afterward so the conversation survives closing the panel.
export const AgentDock: React.FC<AgentDockProps> = ({ open, onOpenChange, onPlanNodeCreated, shiftUp }) => {
  const [everOpened, setEverOpened] = useState(false)
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null)
  // The gear here is the primary place to manage the key/model — right where
  // you're chatting — not buried in the full Settings page (Settings still
  // has its own copy for discoverability from the gear in NavRail).
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.settingsAPI?.getKeyStatus('anthropic').then(setKeyStatus)
    window.settingsAPI?.getModel().then(setModelStatus)
  }, [])

  const modelLabel = ANTHROPIC_MODELS.find((m) => m.id === modelStatus?.model)?.label

  const toggle = () => {
    onOpenChange(!open)
    setEverOpened(true)
  }

  return (
    <>
      <button
        onClick={toggle}
        title="AI Chat"
        style={{
          position: 'fixed',
          right: 68,
          bottom: shiftUp ? 340 : 20,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: open ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          color: 'var(--text-1)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'bottom 0.15s ease',
        }}
      >
        <Icon name="sparkle" size={15} />
      </button>

      {everOpened && (
        <Frame
          flow="vertical"
          gap={0}
          style={{
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: 0,
            height: 320,
            zIndex: 999,
            display: open ? 'flex' : 'none',
          }}
          fill={{ solid: 'bg-1' }}
          stroke={{ top: { color: 'rgba(255,255,255,0.12)' } }}
        >
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 14, y: 6 }}
            stroke={{ bottom: { color: 'rgba(255,255,255,0.08)' } }}
            shrink={0}
          >
            <Frame flow="horizontal" align="center" gap={10}>
              <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
                AI CHAT
              </span>
              {keyStatus && (
                <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-3)', opacity: 0.7, ...MONO }}>
                  {keyStatus.configured
                    ? `· ${modelLabel ?? 'Anthropic'} (····${keyStatus.hint})`
                    : '· Local Ollama'}
                </span>
              )}
            </Frame>
            <Frame flow="horizontal" align="center" gap={12} style={{ position: 'relative' }}>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                title="AI chat settings — key & model"
                style={{
                  background: settingsOpen ? 'rgba(255,255,255,0.10)' : 'transparent',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  display: 'flex',
                  padding: 4,
                  borderRadius: 3,
                }}
              >
                <Icon name="settings" size={13} />
              </button>
              {settingsOpen && (
                <ApiKeySettings
                  align="right"
                  direction="up"
                  onClose={() => setSettingsOpen(false)}
                  onChanged={setKeyStatus}
                  onModelChanged={(id) => setModelStatus((s) => (s ? { ...s, model: id } : s))}
                />
              )}
              <button
                onClick={() => onOpenChange(false)}
                title="Close"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, ...MONO }}
              >
                ×
              </button>
            </Frame>
          </Frame>
          <Frame grow minH={0}>
            <AgentChat onPlanNodeCreated={onPlanNodeCreated} />
          </Frame>
        </Frame>
      )}
    </>
  )
}
