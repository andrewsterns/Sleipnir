import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { TacticalPanel } from '../UIKit/Panel/Panel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface DeletePathModalProps {
  path: string
  name: string
  isDir: boolean
  /** Injected rather than imported directly — same DI pattern LeftRailing already uses for createFile/createDir, so this modal stays agnostic of which root (workspace-scoped today) the path resolves against. */
  deletePath: (path: string) => Promise<void>
  onClose: () => void
  onDeleted: () => void
}

// Same portal-to-nearest-theme-scope pattern as DeletePlanModal — a single
// confirm step (not type-to-confirm) since the underlying delete moves the
// item to the OS Recycle Bin when running the desktop app, not gone for
// good on a misclick.
export function DeletePathModal({ path, name, isDir, deletePath, onClose, onDeleted }: DeletePathModalProps) {
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

  const handleDelete = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await deletePath(path)
      onDeleted()
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
          <TacticalPanel flow="vertical" gap={14} padding={20} variant="default" chamfer={6} relative w={420}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE {isDir ? 'FOLDER' : 'FILE'}
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Delete <strong>{name}</strong>?
              {isDir && ' This removes the folder and everything inside it.'}
              {' '}Moves to the Recycle Bin when running the desktop app.
            </span>

            {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleDelete} disabled={submitting}>
                {submitting ? 'Deleting…' : 'Delete'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
