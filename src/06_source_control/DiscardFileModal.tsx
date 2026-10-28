import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Button } from '../app/UIKit/Button/Button'
import { Card } from '../app/UIKit/Card/Card'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
/** How many paths a bulk discard lists before summarising the rest. */
const LISTED = 6

export interface DiscardTarget {
  path: string
  /** True for untracked/newly-added files, which discard *deletes* rather than reverts — worth spelling out since there's no HEAD version to fall back to. */
  isNew: boolean
}

export interface DiscardFileModalProps {
  /** One file (a row's menu) or a whole section (its header's ⋯ menu). */
  files: DiscardTarget[]
  discard: () => Promise<void>
  onClose: () => void
  onDiscarded: () => void
}

// Discard is not undoable through git's reflog for working-tree changes, so it
// gets an explicit confirm — same portal-to-theme-scope pattern as
// DeletePathModal.
export function DiscardFileModal({ files, discard, onClose, onDiscarded }: DiscardFileModalProps) {
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

  const handleDiscard = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await discard()
      onDiscarded()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const single = files.length === 1 ? files[0] : null
  const newCount = files.filter((f) => f.isNew).length
  const consequence = single
    ? single.isNew
      ? ' This is a new/untracked file — discarding deletes it.'
      : ' This reverts the file to the last commit.'
    : newCount === files.length
      ? ' They are all new/untracked — discarding deletes them.'
      : newCount > 0
        ? ` ${newCount} new/untracked ${newCount === 1 ? 'file is' : 'files are'} deleted; the rest revert to the last commit.`
        : ' They revert to the last commit.'

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
              DISCARD CHANGES
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              {single ? (
                <>Discard changes to <strong>{single.path}</strong>?</>
              ) : (
                <>Discard changes to <strong>{files.length} files</strong>?</>
              )}
              {consequence} This cannot be undone.
            </span>

            {!single && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', ...MONO }}>
                {files.slice(0, LISTED).map((f) => f.path).join('\n')}
                {files.length > LISTED ? `\n…and ${files.length - LISTED} more` : ''}
              </span>
            )}

            {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleDiscard} disabled={submitting}>
                {submitting ? 'Discarding…' : single ? 'Discard' : `Discard ${files.length}`}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
