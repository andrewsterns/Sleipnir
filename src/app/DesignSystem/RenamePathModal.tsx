import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { TacticalPanel } from '../UIKit/Panel/Panel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface RenamePathModalProps {
  name: string
  isDir: boolean
  /** Injected like DeletePathModal's `deletePath` — the parent closes over the node's path and computes the destination, so this modal stays agnostic of which root the path resolves against. Rejects (e.g. "already exists") surface inline. */
  rename: (newName: string) => Promise<void>
  /** Heading noun override — e.g. "RENAME NODE" for a graph node. Defaults to FILE/FOLDER from `isDir`. */
  title?: string
  onClose: () => void
  onRenamed: () => void
}

export function RenamePathModal({ name, isDir, rename, title, onClose, onRenamed }: RenamePathModalProps) {
  const [value, setValue] = useState(name)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
    // Preselect the file stem (not the extension) so a rename edits the name,
    // not ".tsx", by default.
    const el = inputRef.current
    if (el) {
      el.focus()
      const dot = name.lastIndexOf('.')
      el.setSelectionRange(0, !isDir && dot > 0 ? dot : name.length)
    }
  }, [name, isDir])

  const submit = async () => {
    const next = value.trim()
    if (!next || next === name) { onClose(); return }
    if (next.includes('/') || next.includes('\\')) {
      setError('Name cannot contain a slash')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await rename(next)
      onRenamed()
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
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
              {title ?? `RENAME ${isDir ? 'FOLDER' : 'FILE'}`}
            </span>

            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') onClose()
              }}
              disabled={submitting}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 'var(--radius-2)',
                color: 'var(--text-1)',
                fontSize: 12,
                padding: '7px 9px',
                ...MONO,
              }}
            />

            {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={submit} disabled={submitting}>
                {submitting ? 'Renaming…' : 'Rename'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
