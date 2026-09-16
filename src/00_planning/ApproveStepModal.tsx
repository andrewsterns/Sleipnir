import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Card } from '../app/UIKit/Card/Card'
import { Button } from '../app/UIKit/Button/Button'
import { Text } from '../app/UIKit/Text/Text'
import { useApproveStepViewModel, type ApproveStepModalProps } from './ApproveStepModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
const PLAN_COLOR = 'var(--graph-plan, #5b9dff)'

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: '7px 9px',
  ...MONO,
}

const SECTION_LABEL: React.CSSProperties = { fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }

// Approving a plan step that declared files: review where each lands (editable)
// and what it will contain (editable preview, rendered from the project's
// templates with imports wired), then create them. The only path by which a
// planned file becomes a real one. Same portal-to-theme-scope + Card surface as
// AddNodeModal.
export function ApproveStepModal(props: ApproveStepModalProps) {
  const vm = useApproveStepViewModel(props)
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

  const { step } = vm
  return (
    <div ref={anchorRef} style={{ display: 'contents' }}>
      {ReactDOM.createPortal(
        <Frame fixed inset z={200} flow="vertical" align="center" justify="center">
          <div
            aria-hidden="true"
            onClick={vm.submitting ? undefined : props.onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,5,10,0.85)', backdropFilter: 'blur(6px)' }}
          />
          <Card flow="vertical" gap={14} padding={20} relative w={560} maxH="85vh" scroll="y">
            <Frame flow="vertical" gap={4}>
              <Text variant="xs" weight="black" color="text-2">Review &amp; approve</Text>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', ...MONO }}>
                {step.order !== undefined && <span style={{ color: PLAN_COLOR }}>{step.order}. </span>}
                {step.label}
              </span>
              {step.description && (
                <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.6, ...MONO }}>{step.description}</span>
              )}
            </Frame>

            <Frame flow="vertical" gap={8}>
              <span style={SECTION_LABEL}>CREATES ({vm.files.length})</span>
              {vm.files.map((f) => {
                const expanded = vm.expandedId === f.nodeId
                return (
                  <Frame key={f.nodeId} flow="vertical" gap={6} padding={8} radius="var(--radius-control)" stroke={{ color: f.problem ? 'border-2' : 'border-1' }}>
                    <Frame flow="horizontal" align="center" gap={6}>
                      <input
                        value={f.rawPath}
                        onChange={(e) => vm.setPath(f.nodeId, e.target.value)}
                        disabled={vm.submitting}
                        aria-label="File path"
                        style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap', ...MONO }}>
                        {f.role}
                        {f.language ? ` · ${f.language}` : ''}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => vm.setExpandedId(expanded ? null : f.nodeId)}>
                        {expanded ? 'Hide' : 'Preview'}
                      </Button>
                    </Frame>
                    {f.problem && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{f.problem}</span>}
                    {expanded && (
                      <Frame flow="vertical" gap={4}>
                        <textarea
                          value={f.content}
                          onChange={(e) => vm.setContent(f.nodeId, e.target.value)}
                          disabled={vm.submitting}
                          rows={10}
                          spellCheck={false}
                          aria-label={`Contents of ${f.path}`}
                          style={{ ...INPUT_STYLE, fontSize: 11, resize: 'vertical', whiteSpace: 'pre' }}
                        />
                        {f.contentEdited && (
                          <Frame flow="horizontal" justify="end">
                            <Button variant="ghost" size="sm" onClick={() => vm.resetContent(f.nodeId)} disabled={vm.submitting}>
                              Reset to generated
                            </Button>
                          </Frame>
                        )}
                      </Frame>
                    )}
                  </Frame>
                )
              })}
            </Frame>

            {vm.importUpdates.length > 0 && (
              <Frame flow="vertical" gap={4}>
                <span style={SECTION_LABEL}>ADDS IMPORTS TO</span>
                {vm.importUpdates.map((u) => (
                  <span key={`${u.path}>${u.importPath}`} style={{ fontSize: 10, color: 'var(--text-2)', wordBreak: 'break-all', ...MONO }}>
                    {u.path} <span style={{ opacity: 0.5 }}>← {u.importPath}</span>
                  </span>
                ))}
              </Frame>
            )}

            {vm.edits.length > 0 && (
              <Frame flow="vertical" gap={4}>
                <span style={SECTION_LABEL}>ALSO EDITS (not changed here)</span>
                {vm.edits.map((p) => (
                  <span key={p} style={{ fontSize: 10, color: 'var(--text-2)', wordBreak: 'break-all', ...MONO }}>
                    {p}
                  </span>
                ))}
              </Frame>
            )}

            {vm.error && <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{vm.error}</span>}

            <Frame flow="horizontal" gap={8} justify="end" wrap="wrap">
              <Button variant="ghost" size="sm" onClick={props.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={vm.submit} disabled={!vm.canSubmit}>
                {vm.submitting ? 'Creating…' : `Create ${vm.files.length} file${vm.files.length === 1 ? '' : 's'} & approve`}
              </Button>
            </Frame>
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
