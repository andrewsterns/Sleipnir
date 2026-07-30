import React, { useState } from 'react'
import { Frame } from '../../01_atoms/Frame/Frame'
import { Icon } from '../../01_atoms/Icon/Icon'
import { Terminal } from '../Terminal/Terminal'
import { isTerminalAvailable } from '../Terminal/iTerminal'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Mounted once at the App shell level, not per-page. The panel's contents
// (<Terminal />) only ever mount once — the first time the user opens it —
// and then stay mounted (just hidden via CSS) for the rest of the app's
// lifetime, so the underlying shell process survives closing the panel.
export const TerminalDock: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const available = isTerminalAvailable()

  const toggle = () => {
    setOpen((o) => !o)
    setEverOpened(true)
  }

  return (
    <>
      <button
        onClick={toggle}
        title="Terminal"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
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
        }}
      >
        <Icon name="terminal" size={18} />
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
          fill={{ solid: '#0b0d11' }}
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
            <span style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-3)', ...MONO }}>
              TERMINAL
            </span>
            <button
              onClick={() => setOpen(false)}
              title="Close"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, ...MONO }}
            >
              ×
            </button>
          </Frame>
          <Frame grow minH={0}>
            {available ? (
              <Terminal />
            ) : (
              <Frame flow="vertical" align="center" justify="center" h="fill">
                <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', ...MONO }}>
                  TERMINAL IS DESKTOP-ONLY — RUN THE ELECTRON APP
                </span>
              </Frame>
            )}
          </Frame>
        </Frame>
      )}
    </>
  )
}
