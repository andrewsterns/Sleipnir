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

  const nodeCount = vm.plan.nodeIds.length
  const fileCount = vm.plan.generatedFiles?.length ?? 0
  // Deleting a plan always deletes its nodes; files are the only opt-in extra.
  const nodesLabel = `${nodeCount} Node${nodeCount === 1 ? '' : 's'}`
  const planLabel = nodeCount > 0 ? `Delete Plan & ${nodesLabel}` : 'Delete Plan'
  const everythingLabel = `Delete Plan, ${nodesLabel} & ${fileCount} File${fileCount === 1 ? '' : 's'}`

  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={vm.submitting ? undefined : vm.onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={460}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE PLAN
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Delete <strong>{vm.plan.label}</strong>? It groups {nodeCount} node
              {nodeCount === 1 ? '' : 's'}
              {fileCount > 0 ? ` and generated ${fileCount} file${fileCount === 1 ? '' : 's'} in your Workspace` : ''}.
            </span>

            <Frame flow="vertical" gap={4}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6, ...MONO }}>
                <strong style={{ color: '#e07a7a' }}>{planLabel}</strong> permanently removes the plan
                {nodeCount > 0 ? ' and its nodes, plus every connection to them' : ''}
                {fileCount > 0 ? ' — the generated files stay in your Workspace' : ''}. This can't be undone.
              </span>
              {fileCount > 0 && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6, ...MONO }}>
                  <strong style={{ color: '#e07a7a' }}>{everythingLabel}</strong> also deletes the generated files from disk.
                </span>
              )}
            </Frame>

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant={fileCount > 0 ? 'secondary' : 'primary'} size="sm" onClick={() => vm.remove(false)} disabled={vm.submitting}>
                {planLabel}
              </Button>
              {fileCount > 0 && (
                <Button variant="primary" size="sm" onClick={() => vm.remove(true)} disabled={vm.submitting}>
                  {everythingLabel}
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
