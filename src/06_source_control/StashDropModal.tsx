import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Card } from '../app/UIKit/Card/Card'
import type { GitStash } from '../00_planning/api/sleipnirApi'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface StashDropModalProps {
  stash: GitStash
  drop: () => Promise<void>
  onClose: () => void
  onDropped: () => void
}

// Dropping a stash permanently discards whatever working-tree changes it
// held — no HEAD version to fall back to, same irreversibility as
// DiscardFileModal's working-tree discard, so it gets the same explicit
// portal-to-theme-scope confirm skeleton.
export function StashDropModal({ stash, drop, onClose, onDropped }: StashDropModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  const handleDrop = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await drop()
      onDropped()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  if (!portalTarget) return <div ref={anchorRef} style={{ display: 'contents' }} />

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={submitting ? undefined : onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={420}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DROP STASH
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Drop <strong>{stash.message || stash.ref}</strong>? The changes it holds are permanently discarded — apply or
              pop it first if you want them back. This cannot be undone.
            </span>

            {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleDrop} disabled={submitting}>
                {submitting ? 'Dropping…' : 'Drop'}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
