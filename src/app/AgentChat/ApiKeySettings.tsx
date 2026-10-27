import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { ConnectModels } from './ConnectModels'
import type { useAiSettings } from './useAiSettings'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

interface ApiKeySettingsProps {
  ai: ReturnType<typeof useAiSettings>
  onClose: () => void
  /** Which edge of the anchor to hang the popover from — 'left' (default, grows rightward) fits a
   *  left-aligned trigger; 'right' (grows leftward) fits a trigger pinned near the right edge of the
   *  screen, like AgentDock's header, where left:0 would push the popover off-screen. */
  align?: 'left' | 'right'
  /** 'down' (default) drops below the anchor; 'up' opens above it — for a trigger docked to the
   *  bottom of the screen, like AgentDock's header, where 'down' would run off the viewport. */
  direction?: 'down' | 'up'
}

// Popover shell around ConnectModels — keys for Claude, ChatGPT and Gemini,
// plus local Ollama's status. Picking a model lives in the dock header
// (ModelPicker), right where the chat is.
export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ ai, onClose, align = 'left', direction = 'down' }) => (
  <Frame
    flow="vertical"
    gap={12}
    padding={16}
    style={{
      position: 'absolute',
      ...(direction === 'up' ? { bottom: '100%', marginBottom: 6 } : { top: '100%', marginTop: 6 }),
      ...(align === 'right' ? { right: 0 } : { left: 0 }),
      width: 380,
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: 1001,
      // --bg-2 is translucent in the tactical themes; without the blur, the
      // page behind shows through a panel this size and reads as clutter.
      backdropFilter: 'blur(14px)',
      boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    }}
    fill={{ solid: 'bg-2' }}
    stroke={{ color: 'var(--border-2)' }}
    radius={4}
  >
    <ConnectModels ai={ai} />
    <button
      onClick={onClose}
      style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.08em', cursor: 'pointer', alignSelf: 'flex-start', ...MONO }}
    >
      CLOSE
    </button>
  </Frame>
)
