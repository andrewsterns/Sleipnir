import { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { Checkbox } from '../UIKit/Checkbox/Checkbox'
import { Card } from '../UIKit/Card/Card'
import { Search } from '../UIKit/Search/Search'
import { ListRow } from '../UIKit/ListRow/ListRow'
import { Icon } from '../UIKit/Icon/Icon'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import { AddNodesSection } from '../../00_planning/AddNodesSection'
import { useNewWorkspacePlanViewModel, type NewWorkspacePlanModalProps } from './NewWorkspacePlanModal.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 8,
  letterSpacing: '0.1em',
  color: 'var(--text-3)',
  ...MONO,
}

type PlanTreeVM = ReturnType<typeof useNewWorkspacePlanViewModel>

// One recursive row for the unified dirs+files picker — a directory row
// toggles expand/collapse on click (the chevron mirrors the Workspace
// sidebar's tree) with its own tri-state Checkbox for "everything under
// here"; a file row's whole row toggles its own selection. Deliberately a
// stripped-down cousin of LeftRailingView's TreeNodeRow: no hover actions,
// rename, or context menu — just pick what goes in the plan.
function PlanTreeRow({ node, depth, vm }: { node: FileTreeNode; depth: number; vm: PlanTreeVM }) {
  if (node.type === 'dir') {
    const state = vm.dirState(node.path)
    const expanded = vm.isExpanded(node.path)
    return (
      <Frame flow="vertical" gap={0} w="fill">
        <ListRow
          indent={8 + depth * 14}
          labelOpacity={state !== 'none' ? 1 : 0.75}
          onClick={() => vm.toggleExpand(node.path)}
          leading={
            <>
              <Checkbox
                checked={state === 'all'}
                indeterminate={state === 'some'}
                onChange={() => vm.toggleDir(node.path)}
                stopPropagation
              />
              <span style={{ opacity: 0.7, width: 8, display: 'inline-block', flexShrink: 0, fontSize: 9 }}>
                {expanded ? '▾' : '▸'}
              </span>
            </>
          }
          iconStart={<Icon name="folder" size={14} />}
        >
          {node.name}
        </ListRow>
        {expanded && node.children?.map((child) => <PlanTreeRow key={child.path} node={child} depth={depth + 1} vm={vm} />)}
      </Frame>
    )
  }

  const selected = vm.isSelected(node.path)
  return (
    <ListRow
      indent={8 + depth * 14}
      labelOpacity={selected ? 1 : 0.65}
      onClick={() => vm.toggleFile(node.path)}
      leading={
        <>
          <Checkbox checked={selected} onChange={() => vm.toggleFile(node.path)} stopPropagation />
          <span style={{ width: 8, flexShrink: 0 }} />
        </>
      }
      iconStart={<Icon name="file" size={14} />}
    >
      {node.name}
    </ListRow>
  )
}

// Same portal-to-nearest-theme-scope pattern as the other modals — picks a
// Workspace project's files from a single nested tree (naming-convention
// and/or file-type filters, per-row and bulk selection), then seeds a new
// SavedPlan with whatever's checked (see NewWorkspacePlanModal.ViewModel's
// matchedPaths).
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
                {/* Text search + a single wide filter dropdown covering both
                    ASSET TYPE (naming-convention) and FILE TYPE (extension)
                    facets — the same shared Search control used everywhere
                    else, built-in `filters` prop rather than a hand-rolled
                    chip row, so this reads and behaves identically to every
                    other left-rail search's filter icon. */}
                <Search
                  value={vm.query}
                  onChange={vm.setQuery}
                  placeholder="Search files…"
                  w="fill"
                  filters={{ options: vm.filterOptions, active: vm.activeFilterIds, onChange: vm.setActiveFilterIds }}
                />

                {/* Both Select-All controls sit together on the left, above
                    the tree — one for files (respects the current
                    search/filter), one for whole directories (bulk-applies
                    each dir's own "select everything under here" toggle to
                    every dir currently matching). */}
                <Frame flow="horizontal" align="center" gap={16}>
                  <div
                    onClick={vm.toggleAllFiles}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: vm.filesSelectableCount ? 'pointer' : 'default' }}
                  >
                    <Checkbox
                      checked={vm.allFilesSelected}
                      indeterminate={vm.someFilesSelected}
                      onChange={vm.toggleAllFiles}
                      disabled={vm.filesSelectableCount === 0}
                      stopPropagation
                    />
                    <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-2)', ...MONO }}>Select all files</span>
                  </div>
                  <div
                    onClick={vm.toggleAllDirs}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: vm.dirsSelectableCount ? 'pointer' : 'default' }}
                  >
                    <Checkbox
                      checked={vm.allDirsSelected}
                      indeterminate={vm.someDirsSelected}
                      onChange={vm.toggleAllDirs}
                      disabled={vm.dirsSelectableCount === 0}
                      stopPropagation
                    />
                    <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-2)', ...MONO }}>Select all dirs</span>
                  </div>
                </Frame>

                <Frame flow="vertical" gap={6}>
                  <span style={SECTION_LABEL}>WORKSPACE</span>
                  <Frame flow="vertical" gap={2} maxH={280} scroll="y">
                    {vm.tree.length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', padding: '4px 2px', ...MONO }}>No files match</span>
                    ) : (
                      vm.tree.map((node) => <PlanTreeRow key={node.path} node={node} depth={0} vm={vm} />)
                    )}
                  </Frame>
                </Frame>

                <AddNodesSection
                  rows={vm.addNodeRows}
                  onAddRow={vm.addRow}
                  onRemoveRow={vm.removeRow}
                  onQueryChange={vm.setRowQuery}
                  onResolveFile={vm.resolveRowToFile}
                  onResolveDir={vm.resolveRowToDir}
                  onResolveNote={vm.resolveRowToNote}
                  onClearResolution={vm.clearRowResolution}
                  onSetRowStage={vm.setRowStage}
                  suggestionsFor={vm.suggestionsFor}
                />

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
                disabled={!vm.label.trim() || !vm.hasAnythingToAdd}
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
