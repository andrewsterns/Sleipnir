import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Card } from '../app/UIKit/Card/Card'
import { useDeleteNodeViewModel, type DeleteNodeModalProps } from './DeleteNodeModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// The node-level twin of DeletePlanModal — same portal-to-nearest-theme-scope
// pattern and the same plain confirm (not type-to-confirm). A node backed by a
// real Workspace file (a scaffolded node) gets the extra "…+ Delete File"
// choice, mirroring the plan modal's "…+ Delete Files"; a plain note or
// plan-step has nothing on disk, so it's a single Delete.
export function DeleteNodeModal(props: DeleteNodeModalProps) {
  const vm = useDeleteNodeViewModel(props)
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

  const filePath = vm.node.filePath

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={vm.submitting ? undefined : vm.onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={440}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE NODE
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Permanently delete <strong>{vm.node.label}</strong>? This removes the node and its
              links from the graph and can't be undone.
              {filePath && ` It was scaffolded from ${filePath} — choose whether to delete that file too.`}
            </span>

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              {filePath ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => vm.remove(false)} disabled={vm.submitting}>
                    Delete Node Only
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => vm.remove(true)} disabled={vm.submitting}>
                    Delete Node + File
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => vm.remove(false)} disabled={vm.submitting}>
                  Delete Node
                </Button>
              )}
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
