import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { TacticalPanel } from '../UIKit/Panel/Panel'
import { useNewWorkspacePlanViewModel, type NewWorkspacePlanModalProps } from './NewWorkspacePlanModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: active ? 'var(--text-1)' : 'var(--text-3)',
    fontSize: 11,
    letterSpacing: '0.02em',
    padding: '5px 9px',
    cursor: 'pointer',
    ...MONO,
  }
}

// Same portal-to-nearest-theme-scope pattern as the other modals — picks a
// Workspace project's files by naming-convention chips and/or top-level
// directory checkboxes, then seeds a new SavedPlan with whatever matches
// (see NewWorkspacePlanModal.ViewModel's matchedPaths).
export function NewWorkspacePlanModal(props: NewWorkspacePlanModalProps) {
  const vm = useNewWorkspacePlanViewModel(props)
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
          <TacticalPanel flow="vertical" gap={14} padding={20} variant="default" chamfer={6} relative w={480} maxH="80vh" scroll="y">
            <span style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
              ADD PLAN FROM WORKSPACE
            </span>

            <Frame flow="vertical" gap={6}>
              <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>NAME</span>
              <input
                autoFocus
                value={vm.label}
                onChange={(e) => vm.setLabel(e.target.value)}
                placeholder="Plan name"
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

            {vm.loading ? (
              <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Reading Workspace…</span>
            ) : (
              <>
                {vm.suffixOptions.length > 0 && (
                  <Frame flow="vertical" gap={6}>
                    <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>ASSET TYPE</span>
                    <Frame flow="horizontal" gap={6} wrap="wrap">
                      {vm.suffixOptions.map((o) => (
                        <button
                          key={o.suffix}
                          type="button"
                          onClick={() => vm.toggleSuffix(o.suffix)}
                          style={toggleStyle(vm.activeSuffixes.includes(o.suffix))}
                        >
                          {o.suffix} ({o.count})
                        </button>
                      ))}
                    </Frame>
                  </Frame>
                )}

                {vm.dirs.length > 0 && (
                  <Frame flow="vertical" gap={6}>
                    <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>DIRECTORIES</span>
                    <Frame flow="vertical" gap={2} style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {vm.dirs.map((d) => (
                        <label
                          key={d.path}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 2px',
                            cursor: 'pointer',
                            fontSize: 11,
                            color: vm.activeDirs.includes(d.path) ? 'var(--text-1)' : 'var(--text-2)',
                            ...MONO,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={vm.activeDirs.includes(d.path)}
                            onChange={() => vm.toggleDir(d.path)}
                          />
                          {d.name} <span style={{ color: 'var(--text-3)' }}>({d.fileCount})</span>
                        </label>
                      ))}
                    </Frame>
                  </Frame>
                )}

                <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>
                  {vm.matchedPaths.length} file{vm.matchedPaths.length === 1 ? '' : 's'} match
                  {vm.matchedPaths.length === 0 && ' — nothing to add yet'}
                </span>
              </>
            )}

            {vm.error && (
              <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{vm.error}</span>
            )}

            <Frame flow="horizontal" gap={8} justify="end">
              <Button variant="ghost" size="sm" onClick={vm.onClose} disabled={vm.submitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={vm.submit}
                disabled={!vm.label.trim() || vm.matchedPaths.length === 0}
                isLoading={vm.submitting}
              >
                {vm.detectingEdges ? 'Detecting connections…' : vm.submitting ? 'Creating…' : 'Create Plan'}
              </Button>
            </Frame>
          </TacticalPanel>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
