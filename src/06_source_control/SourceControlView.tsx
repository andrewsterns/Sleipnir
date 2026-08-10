import { useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { Button } from '../app/UIKit/Button/Button'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { DiscardFileModal } from './DiscardFileModal'
import { getWorkspaceInfo } from '../00_planning/api/sleipnirApi'
import { useSourceControlViewModel } from './SourceControlView.ViewModel'
import type { GitFileStatus, GitBranchTree, GitBranchTreeEntry, GitCommitSummary } from '../00_planning/api/sleipnirApi'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function statusLabel(f: GitFileStatus): string {
  if (f.untracked) return 'UNTRACKED'
  if (f.conflicted) return 'CONFLICT'
  const code = f.staged ? f.indexStatus : f.worktreeStatus
  switch (code) {
    case 'A': return 'ADDED'
    case 'D': return 'DELETED'
    case 'R': return 'RENAMED'
    case 'M': return 'MODIFIED'
    default: return code.trim() || 'CHANGED'
  }
}

function statusColor(f: GitFileStatus): string {
  if (f.conflicted) return '#e07a7a'
  if (f.untracked) return 'var(--text-3)'
  const code = f.staged ? f.indexStatus : f.worktreeStatus
  if (code === 'A') return '#7ec98f'
  if (code === 'D') return '#e07a7a'
  return '#e0a458'
}

function FileRow({
  file, active, onSelect, onToggleStage, onContextMenu, onMenuButton,
}: {
  file: GitFileStatus
  active: boolean
  onSelect: () => void
  onToggleStage: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMenuButton: (e: React.MouseEvent) => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <Frame
      flow="horizontal"
      align="center"
      gap={8}
      padding={{ x: 8, y: 5 }}
      radius="var(--radius-2)"
      fill={{ solid: active ? 'rgba(255,255,255,0.10)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent' }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleStage() }}
        title={file.staged ? 'Unstage' : 'Stage'}
        style={{
          width: 14, height: 14, flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.3)',
          background: file.staged ? 'var(--text-1)' : 'transparent',
          cursor: 'pointer', padding: 0,
        }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-1)', ...MONO, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.path}
      </span>
      {hovered ? (
        <IconButton
          onClick={(e) => { e.stopPropagation(); onMenuButton(e) }}
          title="More actions"
          glyph="⋯"
          iconSize={14}
          size={18}
          textColor="var(--text-3)"
        />
      ) : (
        <span style={{ fontSize: 8, letterSpacing: '0.06em', color: statusColor(file), ...MONO, flexShrink: 0 }}>
          {statusLabel(file)}
        </span>
      )}
    </Frame>
  )
}

function CommitDot({ commit, accent }: { commit: GitCommitSummary; accent: string }) {
  return (
    <div
      title={`${commit.shortHash} · ${commit.subject}\n${commit.author} · ${commit.date}`}
      style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'default' }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
      <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>{commit.shortHash}</span>
    </div>
  )
}

const BRANCH_ACCENT = '#7aa8e0'
const PRIMARY_ACCENT = '#7ec98f'

function BranchRow({ branch, accent }: { branch: GitBranchTreeEntry; accent: string }) {
  return (
    <Frame flow="vertical" gap={6} padding={{ y: 8 }} stroke={{ bottom: { color: 'rgba(255,255,255,0.06)' } }}>
      <Frame flow="horizontal" align="center" gap={6}>
        <Icon name="git-branch" size={11} />
        <span style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: branch.current ? 700 : 500, ...MONO }}>
          {branch.name}
        </span>
        {branch.current && (
          <span style={{ fontSize: 8, letterSpacing: '0.08em', color: accent, ...MONO }}>CURRENT</span>
        )}
      </Frame>

      {!branch.isPrimary && (
        <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO, paddingLeft: 17 }}>
          {branch.forkedFrom && branch.forkPoint
            ? `↳ forked from ${branch.forkedFrom} @ ${branch.forkPoint.shortHash} "${branch.forkPoint.subject}"`
            : `↳ no shared history with ${branch.forkedFrom ?? 'the primary branch'}`}
        </span>
      )}

      <Frame flow="horizontal" gap={12} wrap="wrap" style={{ paddingLeft: 17 }}>
        {branch.commits.map((c) => (
          <CommitDot key={c.hash} commit={c} accent={accent} />
        ))}
        {branch.commits.length === 0 && !branch.truncated && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>No commits ahead of the fork point.</span>
        )}
        {branch.truncated && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>… more branches omitted (commit budget reached)</span>
        )}
      </Frame>
    </Frame>
  )
}

function BranchTreeView({ tree, loading }: { tree: GitBranchTree | null; loading: boolean }) {
  if (loading && !tree) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Loading branch tree…</span>
  }
  if (!tree || tree.branches.length === 0) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>No branches found.</span>
  }
  return (
    <Frame flow="vertical" gap={0}>
      {tree.branches.map((b) => (
        <BranchRow key={b.name} branch={b} accent={b.isPrimary ? PRIMARY_ACCENT : BRANCH_ACCENT} />
      ))}
    </Frame>
  )
}

function DiffView({ diff, loading }: { diff: string; loading: boolean }) {
  if (loading) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Loading diff…</span>
  }
  if (!diff) {
    return <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Select a changed file to view its diff.</span>
  }
  const lines = diff.split('\n')
  return (
    <Frame flow="vertical" gap={0} style={{ ...MONO, fontSize: 11, lineHeight: '18px' }}>
      {lines.map((line, i) => {
        let color = 'var(--text-2)'
        let bg = 'transparent'
        if (line.startsWith('+') && !line.startsWith('+++')) { color = '#7ec98f'; bg = 'rgba(126,201,143,0.08)' }
        else if (line.startsWith('-') && !line.startsWith('---')) { color = '#e07a7a'; bg = 'rgba(224,122,122,0.08)' }
        else if (line.startsWith('@@')) { color = '#7aa8e0' }
        else if (line.startsWith('diff --git') || line.startsWith('index ')) { color = 'var(--text-3)' }
        return (
          <div key={i} style={{ color, background: bg, whiteSpace: 'pre', padding: '0 8px' }}>
            {line || ' '}
          </div>
        )
      })}
    </Frame>
  )
}

export default function SourceControlView() {
  const vm = useSourceControlViewModel()
  const [showBranches, setShowBranches] = useState(false)
  const fileMenu = useContextMenu<GitFileStatus>()
  const [discardingFile, setDiscardingFile] = useState<GitFileStatus | null>(null)

  const copyRelativePath = (f: GitFileStatus) => { void navigator.clipboard.writeText(f.path) }
  const copyAbsolutePath = async (f: GitFileStatus) => {
    const info = await getWorkspaceInfo()
    void navigator.clipboard.writeText(info.root ? `${info.root}/${f.path}` : f.path)
  }

  if (vm.loading && !vm.status) {
    return (
      <Frame flow="vertical" h="fill" w="fill" align="center" justify="center">
        <span style={{ fontSize: 11, color: 'var(--text-3)', ...MONO }}>Loading git status…</span>
      </Frame>
    )
  }

  if (vm.error && !vm.status) {
    return (
      <Frame flow="vertical" h="fill" w="fill" align="center" justify="center" gap={8}>
        <span style={{ fontSize: 11, color: '#e07a7a', ...MONO }}>{vm.error}</span>
        <Button variant="ghost" size="sm" onClick={vm.refresh}>Retry</Button>
      </Frame>
    )
  }

  const status = vm.status!
  const nothingStaged = vm.staged.length === 0

  return (
    <Frame theme="tactical" flow="horizontal" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      {/* Left column — branch, sync actions, changed files, commit box */}
      <Frame flow="vertical" gap={0} w={320} shrink={0} h="fill" stroke={{ right: { color: 'border-1' } }}>
        <Frame flow="vertical" gap={10} padding={14} stroke={{ bottom: { color: 'border-1' } }}>
          <Frame flow="horizontal" align="center" justify="between">
            <Frame flow="horizontal" align="center" gap={6} style={{ cursor: 'pointer' }} onClick={() => setShowBranches((s) => !s)}>
              <Icon name="git-branch" size={13} />
              <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                {status.branch ?? 'detached HEAD'}
              </span>
            </Frame>
            {(status.ahead > 0 || status.behind > 0) && (
              <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
                {status.ahead > 0 ? `↑${status.ahead}` : ''}{status.behind > 0 ? ` ↓${status.behind}` : ''}
              </span>
            )}
          </Frame>

          {showBranches && (
            <Frame flow="vertical" gap={4} padding={8} radius="var(--radius-2)" stroke={{ color: 'border-1' }}>
              {vm.branches.map((b) =>
                vm.renamingBranch === b.name ? (
                  <Frame key={b.name} flow="horizontal" align="center" gap={4} padding={{ x: 4, y: 3 }}>
                    <input
                      autoFocus
                      value={vm.renameValue}
                      onChange={(e) => vm.setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') vm.submitRenameBranch()
                        if (e.key === 'Escape') vm.cancelRenameBranch()
                      }}
                      disabled={vm.renamingInFlight}
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                        color: 'var(--text-1)', fontSize: 10, padding: '3px 5px', ...MONO,
                      }}
                    />
                    <button
                      onClick={() => vm.submitRenameBranch()}
                      title="Save"
                      disabled={vm.renamingInFlight}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-1)', cursor: 'pointer', fontSize: 11, ...MONO }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => vm.cancelRenameBranch()}
                      title="Cancel"
                      disabled={vm.renamingInFlight}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, ...MONO }}
                    >
                      ×
                    </button>
                  </Frame>
                ) : (
                  <Frame
                    key={b.name}
                    flow="horizontal"
                    align="center"
                    justify="between"
                    padding={{ x: 4, y: 3 }}
                    style={{ cursor: b.current ? 'default' : 'pointer' }}
                    onClick={() => !b.current && !vm.switchingBranch && vm.switchBranch(b.name)}
                  >
                    <span style={{ fontSize: 10, color: b.current ? 'var(--text-1)' : 'var(--text-2)', ...MONO }}>
                      {b.current ? '● ' : ''}{b.name}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); vm.startRenameBranch(b.name) }}
                      title="Rename branch"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 10, ...MONO }}
                    >
                      ✎
                    </button>
                  </Frame>
                ),
              )}
              <Frame flow="horizontal" gap={4} padding={{ top: 4 }}>
                <input
                  value={vm.newBranchName}
                  onChange={(e) => vm.setNewBranchName(e.target.value)}
                  placeholder="new-branch-name"
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'var(--text-1)', fontSize: 10, padding: '4px 6px', ...MONO,
                  }}
                />
                <Button variant="ghost" size="sm" onClick={vm.submitNewBranch} disabled={vm.switchingBranch || !vm.newBranchName.trim()}>
                  Create
                </Button>
              </Frame>
            </Frame>
          )}

          <Frame flow="horizontal" gap={6}>
            <Button variant="ghost" size="sm" onClick={vm.doFetch} isLoading={vm.fetching}>Fetch</Button>
            <Button variant="ghost" size="sm" onClick={vm.doPull} isLoading={vm.pulling}>Pull</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={vm.doPush}
              isLoading={vm.pushing}
              disabled={status.ahead === 0 && !!status.upstream}
            >
              {status.upstream && status.ahead === 0 ? 'Up to date' : 'Push'}
            </Button>
          </Frame>

          {vm.opResult && (
            <span style={{ fontSize: 9, color: vm.opResult.ok ? '#7ec98f' : '#e07a7a', ...MONO }}>
              {vm.opResult.message}
              {vm.opResult.conflicted && vm.opResult.conflictedFiles?.length
                ? ` (${vm.opResult.conflictedFiles.join(', ')})` : ''}
            </span>
          )}
        </Frame>

        <Frame flow="vertical" gap={10} grow minH={0} scroll="y" padding={14}>
          {vm.error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{vm.error}</span>}

          <Frame flow="vertical" gap={2}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
              STAGED ({vm.staged.length})
            </span>
            {vm.staged.map((f) => (
              <FileRow key={f.path} file={f} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
            ))}
          </Frame>

          <Frame flow="vertical" gap={2}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
              CHANGES ({vm.unstaged.length})
            </span>
            {vm.unstaged.map((f) => (
              <FileRow key={f.path} file={f} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
            ))}
          </Frame>

          <Frame flow="vertical" gap={2}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
              UNTRACKED ({vm.untracked.length})
            </span>
            {vm.untracked.map((f) => (
              <FileRow key={f.path} file={f} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
            ))}
          </Frame>

          {status.files.length === 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>Working tree clean.</span>
          )}
        </Frame>

        <Frame flow="vertical" gap={6} padding={14} stroke={{ top: { color: 'border-1' } }}>
          <textarea
            value={vm.commitMessage}
            onChange={(e) => vm.setCommitMessage(e.target.value)}
            placeholder="Commit message"
            rows={3}
            style={{
              resize: 'none', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-1)', fontSize: 11, padding: '6px 8px', ...MONO,
            }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={vm.commit}
            isLoading={vm.committing}
            disabled={nothingStaged || !vm.commitMessage.trim()}
          >
            Commit {vm.staged.length > 0 ? `(${vm.staged.length})` : ''}
          </Button>
        </Frame>
      </Frame>

      {/* Main area — the branch tree by default, or the selected file's diff */}
      <Frame flow="vertical" grow minW={0} h="fill" scroll="y">
        <Frame flow="horizontal" align="center" justify="between" padding={{ x: 16, y: 10 }} stroke={{ bottom: { color: 'border-1' } }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO }}>
            {vm.selected?.path ?? 'Branches'}
          </span>
          {vm.selected && (
            <Button variant="ghost" size="sm" onClick={vm.clearSelection}>
              Back to branches
            </Button>
          )}
        </Frame>
        <Frame padding={vm.selected ? { y: 8 } : { x: 16, y: 4 }}>
          {vm.selected
            ? <DiffView diff={vm.diff} loading={vm.diffLoading} />
            : <BranchTreeView tree={vm.branchTree} loading={vm.branchTreeLoading} />}
        </Frame>
      </Frame>

      {fileMenu.menu && (() => {
        const f = fileMenu.menu.data
        return (
          <ContextMenu
            x={fileMenu.menu.x}
            y={fileMenu.menu.y}
            anchorEl={fileMenu.menu.anchorEl}
            onClose={fileMenu.close}
            items={[
              { label: 'Open diff', onSelect: () => vm.selectFile(f) },
              { label: f.staged ? 'Unstage' : 'Stage', onSelect: () => vm.toggleStage(f) },
              { label: 'Discard changes', separator: true, destructive: true, onSelect: () => setDiscardingFile(f) },
              { label: 'Copy path', separator: true, onSelect: () => copyAbsolutePath(f) },
              { label: 'Copy relative path', onSelect: () => copyRelativePath(f) },
            ]}
          />
        )
      })()}

      {discardingFile && (
        <DiscardFileModal
          path={discardingFile.path}
          isNew={discardingFile.untracked || (discardingFile.staged && discardingFile.indexStatus === 'A')}
          discard={() => vm.discard(discardingFile)}
          onClose={() => setDiscardingFile(null)}
          onDiscarded={() => setDiscardingFile(null)}
        />
      )}
    </Frame>
  )
}
