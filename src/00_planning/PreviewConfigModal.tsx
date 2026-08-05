import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { TacticalPanel } from '../app/UIKit/Panel/Panel'
import { usePreviewConfigViewModel, type PreviewConfigModalProps } from './PreviewConfigModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Shown when Play can't auto-detect how to start a prototype folder's
// preview (no package.json dev/start/serve script, no lone .html file) —
// same portal-into-theme-ancestor pattern as OpenFolderModal.tsx/
// CreateLibraryModal.tsx.
export function PreviewConfigModal(props: PreviewConfigModalProps) {
  const vm = usePreviewConfigViewModel(props)
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
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
              CONFIGURE PREVIEW
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
              Couldn't auto-detect how to run {vm.path} — no package.json dev/start/serve script and no single .html
              file. What command starts it?
            </span>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>START COMMAND</span>
              <input
                autoFocus
                value={vm.commandLine}
                onChange={(e) => vm.setCommandLine(e.target.value)}
                placeholder="npm run dev"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-1)',
                  fontSize: 11,
                  padding: '6px 8px',
                  ...MONO,
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
                Runs from inside the folder itself — a relative script name/path is enough, no need to repeat the
                folder.
              </span>
            </Frame>

            {vm.error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{vm.error}</span>}

            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={!vm.canSubmit} isLoading={vm.submitting}>
                {vm.submitting ? 'Saving…' : 'Save & Launch'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
