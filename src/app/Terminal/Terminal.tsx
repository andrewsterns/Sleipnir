import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { useTerminalViewModel } from './Terminal.ViewModel'
import type { TerminalProps } from './iTerminal'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

export const Terminal: React.FC<TerminalProps> = ({ onExit, sessionId, onSession }) => {
  const { containerRef, exitCode } = useTerminalViewModel({ onExit, sessionId, onSession })

  return (
    <Frame flow="vertical" h="fill" w="fill" fill={{ solid: 'bg-1' }} padding={8}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {exitCode !== null && (
        <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)', padding: '4px 2px', ...UI_FONT }}>
          Shell exited ({exitCode})
        </span>
      )}
    </Frame>
  )
}
