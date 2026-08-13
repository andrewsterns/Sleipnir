import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Card } from '../app/UIKit/Card/Card'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Confirms permanently dismissing the built-in Welcome guide map. Welcome
// isn't a real saved plan — it's hand-authored static content (see
// graph/proposed-nodes.ts's `welcome` entry), so there's nothing on disk to
// delete: the choice is persisted as a local "hidden" flag (see PlanningView's
// welcome-dismissed storage) that keeps it out of the PLANS list, the tab
// strip, and the empty state for good. Same portal-to-nearest-theme-scope +
// Card pattern as DeletePlanModal, minus the file-deletion branch it has no
// use for here.
export function DismissWelcomeModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
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

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={440}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE WELCOME
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Permanently remove the <strong>Welcome</strong> guide from Planning? It won't appear in the
              PLANS list or the start page anymore. This is a display preference stored on this machine —
              no files are affected.
            </span>

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={onConfirm}>
                Delete Welcome
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
