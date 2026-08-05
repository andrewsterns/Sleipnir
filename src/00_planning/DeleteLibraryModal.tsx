import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { TacticalPanel } from '../app/UIKit/Panel/Panel'
import { useDeleteLibraryViewModel, type DeleteLibraryModalProps } from './DeleteLibraryModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Same portal-to-nearest-theme-scope pattern as CreateLibraryModal, and the
// same type-the-name-to-confirm friction GitHub uses for repo deletion —
// this is the one library action that isn't reversible (see
// tools/sleipnir-backend.mjs#deleteLibrary), so it earns the extra step.
export function DeleteLibraryModal(props: DeleteLibraryModalProps) {
  const vm = useDeleteLibraryViewModel(props)
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
            onClick={vm.submitting ? undefined : vm.onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <TacticalPanel flow="vertical" gap={14} padding={20} variant="default" chamfer={6} relative w={440}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE LIBRARY
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              This permanently deletes <strong>{vm.library.root}</strong> and everything in it. This can't be undone —
              if you just want it out of Planning without losing the files, close this and use "Remove from Planning" instead.
            </span>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
                TYPE "{vm.library.label}" TO CONFIRM
              </span>
              <input
                autoFocus
                value={vm.confirmText}
                onChange={(e) => vm.setConfirmText(e.target.value)}
                placeholder={vm.library.label}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  padding: '6px 8px',
                  ...MONO,
                }}
              />
            </Frame>

            {vm.error && (
              <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{vm.error}</span>
            )}

            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={!vm.canSubmit} isLoading={vm.submitting}>
                {vm.submitting ? 'Deleting…' : 'Delete Permanently'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
