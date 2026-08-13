import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { Card } from '../UIKit/Card/Card'
import type { GraphNode } from '../../00_planning/graph/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface DeletePathModalProps {
  path: string
  name: string
  isDir: boolean
  /** Injected rather than imported directly — same DI pattern LeftRailing already uses for createFile/createDir, so this modal stays agnostic of which root (workspace-scoped today) the path resolves against. */
  deletePath: (path: string) => Promise<void>
  /** Plan node(s) scaffolded from this file — or, for a folder, from any file under it (see LeftRailing's findPlanNodes). When non-empty (and `deletePlanNodes` is supplied), the modal offers the extra "…+ Delete Node" choice, the inverse of DeleteNodeModal's "…+ Delete File". Empty/absent leaves it a plain single-button confirm. */
  planNodes?: GraphNode[]
  /** Permanently deletes the matched plan nodes by id (their notes.json records) — paired with `planNodes`. */
  deletePlanNodes?: (ids: string[]) => Promise<void>
  onClose: () => void
  onDeleted: () => void
}

// Same portal-to-nearest-theme-scope pattern as DeletePlanModal — a single
// confirm step (not type-to-confirm) since the underlying delete moves the
// item to the OS Recycle Bin when running the desktop app, not gone for
// good on a misclick.
export function DeletePathModal({ path, name, isDir, deletePath, planNodes = [], deletePlanNodes, onClose, onDeleted }: DeletePathModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  // Only offer the "…+ node" branch when there's actually something to delete
  // on both sides — a matched node list and a way to delete it.
  const hasNodes = planNodes.length > 0 && !!deletePlanNodes

  useLayoutEffect(() => {
    let node: HTMLElement | null = anchorRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
  }, [])

  // Delete the file first, then (if asked) the plan node(s) — same ordering
  // DeleteNodeModal's inverse flow uses, so a failed second step never leaves
  // the file already gone while the node still points at it (that's just the
  // "file only" outcome, recoverable), rather than the reverse.
  const handleDelete = async (alsoNodes: boolean) => {
    setSubmitting(true)
    setError(null)
    try {
      await deletePath(path)
      if (alsoNodes && deletePlanNodes && planNodes.length > 0) {
        await deletePlanNodes(planNodes.map((n) => n.id))
      }
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
          <Card flow="vertical" gap={14} padding={20} relative w={420}>
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: '#e07a7a', fontWeight: 600, ...MONO }}>
              DELETE {isDir ? 'FOLDER' : 'FILE'}
            </span>

            <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
              Delete <strong>{name}</strong>?
              {isDir && ' This removes the folder and everything inside it.'}
              {' '}Moves to the Recycle Bin when running the desktop app.
            </span>

            {hasNodes && (
              <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>
                {planNodes.length === 1 ? (
                  <>
                    Plan node <strong>{planNodes[0].label}</strong> is scaffolded from{' '}
                    {isDir ? 'a file in this folder' : 'this file'} — choose whether to delete it too.
                  </>
                ) : (
                  <>
                    <strong>{planNodes.length}</strong> plan nodes are scaffolded from{' '}
                    {isDir ? 'files in this folder' : 'this file'} — choose whether to delete them too.
                  </>
                )}
              </span>
            )}

            {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              {hasNodes ? (
                <>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(false)} disabled={submitting}>
                    {isDir ? 'Delete Folder Only' : 'Delete File Only'}
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => handleDelete(true)} disabled={submitting}>
                    {isDir ? 'Delete Folder' : 'Delete File'} + {planNodes.length === 1 ? 'Node' : `${planNodes.length} Nodes`}
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => handleDelete(false)} disabled={submitting}>
                  {submitting ? 'Deleting…' : 'Delete'}
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
