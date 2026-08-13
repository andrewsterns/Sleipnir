import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { Checkbox } from '../UIKit/Checkbox/Checkbox'
import { Card } from '../UIKit/Card/Card'
import { Search } from '../UIKit/Search/Search'
import { useNewWorkspacePlanViewModel, type NewWorkspacePlanModalProps } from './NewWorkspacePlanModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: '0.1em',
  color: 'var(--text-3)',
  ...MONO,
}

// Shared checkbox-row style for the directory and file pick lists — a selected
// row reads at full ink, an unselected one a step dimmer.
function pickRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 2px',
    cursor: 'pointer',
    fontSize: 11,
    color: selected ? 'var(--text-1)' : 'var(--text-2)',
    ...MONO,
  }
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'transparent',
    border: '1px solid var(--border-2)',
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
          <Card flow="vertical" gap={14} padding={20} relative w={480} maxH="80vh" scroll="y">
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
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-2)',
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
                {/* Text search over the file list — the same shared Search
                    control used everywhere else, so filter chips/clear behave
                    identically. Filters what's shown (and what "Select all"
                    spans); it never changes the selection itself. */}
                <Search
                  value={vm.query}
                  onChange={vm.setQuery}
                  placeholder="Search files…"
                  w="fill"
                />

                {vm.suffixOptions.length > 0 && (
                  <Frame flow="vertical" gap={6}>
                    <span style={SECTION_LABEL}>ASSET TYPE</span>
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
                    <span style={SECTION_LABEL}>DIRECTORIES</span>
                    <Frame flow="vertical" gap={2} style={{ maxHeight: 120, overflowY: 'auto' }}>
                      {vm.dirs.map((d) => {
                        const state = vm.dirState(d.filePaths)
                        return (
                          <div key={d.path} onClick={() => vm.toggleDir(d.filePaths)} style={pickRowStyle(state !== 'none')}>
                            <Checkbox
                              checked={state === 'all'}
                              indeterminate={state === 'some'}
                              onChange={() => vm.toggleDir(d.filePaths)}
                              stopPropagation
                            />
                            {d.name} <span style={{ color: 'var(--text-3)' }}>({d.fileCount})</span>
                          </div>
                        )
                      })}
                    </Frame>
                  </Frame>
                )}

                <Frame flow="vertical" gap={6}>
                  {/* Section header carries the real Select-All: a live tri-state
                      Checkbox over the visible rows, replacing the old bare
                      "SELECT ALL" text button. */}
                  <Frame flow="horizontal" align="center" justify="between">
                    <span style={SECTION_LABEL}>FILES</span>
                    <div
                      onClick={vm.toggleAllVisible}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: vm.visibleFiles.length ? 'pointer' : 'default' }}
                    >
                      <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-2)', ...MONO }}>Select all</span>
                      <Checkbox
                        checked={vm.allVisibleSelected}
                        indeterminate={vm.someVisibleSelected}
                        onChange={vm.toggleAllVisible}
                        disabled={vm.visibleFiles.length === 0}
                        stopPropagation
                      />
                    </div>
                  </Frame>
                  <Frame flow="vertical" gap={2} style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {vm.visibleFiles.length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', padding: '4px 2px', ...MONO }}>No files match</span>
                    ) : (
                      vm.visibleFiles.map((f) => {
                        const slash = f.path.lastIndexOf('/')
                        const dir = slash >= 0 ? f.path.slice(0, slash + 1) : ''
                        const base = slash >= 0 ? f.path.slice(slash + 1) : f.path
                        const selected = vm.isSelected(f.path)
                        return (
                          <div key={f.path} onClick={() => vm.toggleFile(f.path)} style={pickRowStyle(selected)}>
                            <Checkbox checked={selected} onChange={() => vm.toggleFile(f.path)} stopPropagation />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dir && <span style={{ color: 'var(--text-3)' }}>{dir}</span>}
                              {base}
                            </span>
                          </div>
                        )
                      })
                    )}
                  </Frame>
                </Frame>

                <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>
                  {vm.selectedCount} of {vm.totalCount} file{vm.totalCount === 1 ? '' : 's'} selected
                  {vm.selectedCount === 0 && ' — nothing to add yet'}
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
          </Card>
        </Frame>,
        portalTarget,
      )}
    </div>
  )
}
