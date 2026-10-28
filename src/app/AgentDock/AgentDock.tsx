import React, { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { AgentChat } from '../AgentChat/AgentChat'
import { ApiKeySettings } from '../AgentChat/ApiKeySettings'
import { ModelPicker } from '../AgentChat/ModelPicker'
import { useAiSettings } from '../AgentChat/useAiSettings'
import type { GraphNode } from '../../00_planning/graph/types'
import { DOCK_PANEL_HEIGHT, LAYER, STATUS_BAR_HEIGHT } from '../shellLayout'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface AgentDockProps {
  /** Controlled from App.tsx so only one of Terminal/AgentDock's full-width bottom panels is ever open at once. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Forwarded to AgentChat — lets App.tsx jump to Planning's AI tab live as AI builds nodes. */
  onPlanNodeCreated?: (node: GraphNode) => void
}

// Toggled from the status bar. Same mount-once-hide-via-CSS pattern as TerminalDock:
// <AgentChat/> mounts exactly once, the first time it's opened, and stays
// mounted afterward so the conversation survives closing the panel.
export const AgentDock: React.FC<AgentDockProps> = ({ open, onOpenChange, onPlanNodeCreated }) => {
  const [everOpened, setEverOpened] = useState(false)
  if (open && !everOpened) setEverOpened(true)
  const ai = useAiSettings()
  // The gear here is the primary place to connect models — right where
  // you're chatting — not buried in the full Settings page (Settings still
  // has its own copy for discoverability from the gear in NavRail).
  const [settingsOpen, setSettingsOpen] = useState(false)

  const ollamaRunning = !!ai.providers?.find((p) => p.id === 'ollama')?.connected
  const needsSetup = ai.providers !== null && !ai.anyCloudConnected && !ollamaRunning

  return (
    <>
      {everOpened && (
        <Frame
          flow="vertical"
          gap={0}
          style={{
            position: 'fixed',
            right: 0,
            left: 0,
            bottom: STATUS_BAR_HEIGHT,
            height: DOCK_PANEL_HEIGHT,
            // The Connect popover hangs above this panel, over the content —
            // lift the panel while it's open so nothing at LAYER.dock covers it.
            zIndex: settingsOpen ? LAYER.dock + 1 : LAYER.dock,
            display: open ? 'flex' : 'none',
          }}
          fill={{ solid: 'bg-1' }}
          stroke={{ top: { color: 'border-2' } }}
        >
          <Frame
            flow="horizontal"
            align="center"
            justify="between"
            padding={{ x: 14, y: 6 }}
            stroke={{ bottom: { color: 'border-1' } }}
            shrink={0}
          >
            <Frame flow="horizontal" align="center" gap={10} minW={0}>
              <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>AI CHAT</span>
              {window.settingsAPI && <ModelPicker ai={ai} onConnect={() => setSettingsOpen(true)} />}
            </Frame>
            <Frame flow="horizontal" align="center" gap={12} style={{ position: 'relative' }}>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                title="Connect models"
                style={{
                  background: settingsOpen ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
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
                <ApiKeySettings ai={ai} align="right" direction="up" onClose={() => setSettingsOpen(false)} />
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
            <AgentChat
              onPlanNodeCreated={onPlanNodeCreated}
              needsSetup={needsSetup}
              onConnectModels={() => setSettingsOpen(true)}
            />
          </Frame>
        </Frame>
      )}
    </>
  )
}
