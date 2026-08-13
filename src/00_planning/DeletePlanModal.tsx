import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Card } from '../app/UIKit/Card/Card'
import { useDeletePlanViewModel, type DeletePlanModalProps } from './DeletePlanModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Same portal-to-nearest-theme-scope pattern as DeleteLibraryModal, but a
// plain 2-3 button choice rather than type-to-confirm — deleting a plan
// (references, optionally plus the workspace files it generated) is less
// destructive than deleting a whole library folder, so it doesn't earn that
// extra friction.
export function DeletePlanModal(props: DeletePlanModalProps) {
  const vm = useDeletePlanViewModel(props)
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

  const fileCount = vm.plan.generatedFiles?.length ?? 0

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
              DELETE PLAN
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Delete <strong>{vm.plan.label}</strong>? It references {vm.plan.nodeIds.length} node
              {vm.plan.nodeIds.length === 1 ? '' : 's'}.
              {fileCount > 0 &&
                ` It also generated ${fileCount} file${fileCount === 1 ? '' : 's'} in your Workspace — choose whether to delete those too.`}
            </span>

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => vm.remove(false)} disabled={vm.submitting}>
                Remove Plan Only
              </Button>
              {fileCount > 0 && (
                <Button variant="primary" size="sm" onClick={() => vm.remove(true)} disabled={vm.submitting}>
                  Remove Plan + Delete Files
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
