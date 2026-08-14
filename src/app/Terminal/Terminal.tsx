import React from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { useTerminalViewModel } from './Terminal.ViewModel'
import type { TerminalProps } from './iTerminal'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export const Terminal: React.FC<TerminalProps> = ({ onExit }) => {
  const { containerRef, exitCode } = useTerminalViewModel({ onExit })

  return (
    <Frame flow="vertical" h="fill" w="fill" fill={{ solid: 'bg-1' }} padding={8}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {exitCode !== null && (
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-3)', padding: '4px 2px', ...MONO }}>
          SHELL EXITED ({exitCode})
        </span>
      )}
    </Frame>
  )
}
