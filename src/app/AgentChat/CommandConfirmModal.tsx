import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { Card } from '../UIKit/Card/Card'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface CommandConfirmModalProps {
  command: string
  args: string[]
  onDecide: (approved: boolean) => void
}

// Same portal-to-theme-scope + backdrop + Card skeleton as DiscardFileModal —
// the one other place in the app gates an action behind an explicit confirm.
// Unlike DiscardFileModal's discard() (async, can fail), deciding here is a
// synchronous local state update, so there's no submitting/error state.
export function CommandConfirmModal({ command, args, onDecide }: CommandConfirmModalProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  if (!portalTarget) return <div ref={anchorRef} style={{ display: 'contents' }} />

  const fullCommand = [command, ...args].join(' ')

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={460}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e0a040', fontWeight: 600, ...MONO }}>
              RUN COMMAND?
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              The AI agent wants to run this command in your open Workspace:
            </span>

            <Frame padding={10} fill={{ solid: 'bg-0' }} stroke={{ color: 'var(--border-1)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-1)', wordBreak: 'break-all', ...MONO }}>{fullCommand}</span>
            </Frame>

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={() => onDecide(false)}>
                Decline
              </Button>
              <Button variant="primary" size="sm" onClick={() => onDecide(true)}>
                Run
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
