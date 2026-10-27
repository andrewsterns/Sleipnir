import React, { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Icon } from '../UIKit/Icon/Icon'
import { AgentChat } from '../AgentChat/AgentChat'
import { ApiKeySettings } from '../AgentChat/ApiKeySettings'
import { ModelPicker } from '../AgentChat/ModelPicker'
import { useAiSettings } from '../AgentChat/useAiSettings'
import type { GraphNode } from '../../00_planning/graph/types'
import { DOCK_PANEL_HEIGHT, DOCK_TOGGLE_MARGIN, DOCK_TOGGLE_RAISED, LAYER } from '../shellLayout'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface AgentDockProps {
  /** Controlled from App.tsx so only one of Terminal/AgentDock's full-width bottom panels is ever open at once. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Forwarded to AgentChat — lets App.tsx jump to Planning's AI tab live as AI builds nodes. */
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
  const ai = useAiSettings()
  // The gear here is the primary place to connect models — right where
  // you're chatting — not buried in the full Settings page (Settings still
  // has its own copy for discoverability from the gear in NavRail).
  const [settingsOpen, setSettingsOpen] = useState(false)

  const ollamaRunning = !!ai.providers?.find((p) => p.id === 'ollama')?.connected
  const needsSetup = ai.providers !== null && !ai.anyCloudConnected && !ollamaRunning

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
          bottom: shiftUp ? DOCK_TOGGLE_RAISED : DOCK_TOGGLE_MARGIN,
          zIndex: LAYER.dock,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: open ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'rgba(var(--item-ink, 255,255,255), 0.08)',
          border: '1px solid var(--border-2)',
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
            height: DOCK_PANEL_HEIGHT,
            // The sibling docks' floating toggles share LAYER.dock and come
            // later in the DOM, so they'd paint over the Connect popover that
            // hangs above this panel — lift the panel while it's open.
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
