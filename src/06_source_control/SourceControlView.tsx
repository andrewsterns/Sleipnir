import { useState, useRef, useEffect } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { Icon } from '../app/UIKit/Icon/Icon'
import { Button } from '../app/UIKit/Button/Button'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { Checkbox } from '../app/UIKit/Checkbox/Checkbox'
import { ListRow } from '../app/UIKit/ListRow/ListRow'
import { Search } from '../app/UIKit/Search/Search'
import { SEARCH_SORT_OPTIONS, type SearchSortId } from '../app/UIKit/Search/iSearch'
import { ContextMenu } from '../app/UIKit/ContextMenu/ContextMenu'
import { useContextMenu } from '../app/UIKit/ContextMenu/useContextMenu'
import { DiscardFileModal } from './DiscardFileModal'
import { CommitGraphView } from './CommitGraphView'
import { ConstellationView } from './ConstellationView'
import { getWorkspaceInfo } from '../00_planning/api/sleipnirApi'
import { useSourceControlViewModel } from './SourceControlView.ViewModel'
import { useFileStages } from '../00_planning/useFileStages'
import { StatusGlyph } from '../00_planning/graph/StatusGlyph'
import type { NodeStage } from '../00_planning/graph/types'
import type { GitFileStatus, GitBranchTree, GitBranchTreeEntry, GitCommitSummary } from '../00_planning/api/sleipnirApi'
import { useAppTheme } from '../00_themes/ThemeController'

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

function FileRow({
  file, stage, active, onSelect, onToggleStage, onContextMenu, onMenuButton,
}: {
  file: GitFileStatus
  /** Planning stage of the plan node this file backs, if any — shown as the at-rest status. */
  stage?: NodeStage
  active: boolean
  onSelect: () => void
  onToggleStage: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onMenuButton: (e: React.MouseEvent) => void
}) {
  return (
    <ListRow
      selected={active}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      // Git status (MODIFIED/ADDED/…) moves to the row tooltip now that the
      // trailing shows planning status instead.
      title={statusLabel(file)}
      leading={
        <Checkbox
          checked={file.staged}
          onChange={onToggleStage}
          stopPropagation
          title={file.staged ? 'Unstage' : 'Stage'}
        />
      }
      trailing={(hovered) =>
        hovered ? (
          <IconButton
            onClick={(e) => { e.stopPropagation(); onMenuButton(e) }}
            title="More actions"
            glyph="⋯"
            iconSize={14}
            size={18}
            textColor="var(--text-3)"
          />
        ) : (
          // Planning status: the plan node this file backs, or 'proposed' by
          // default (the universal default) when it backs no node.
          <StatusGlyph stage={stage} title={stage ? `plan: ${stage}` : undefined} />
        )
      }
    >
      {file.path}
    </ListRow>
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
    <Frame flow="vertical" gap={6} padding={{ y: 8 }} stroke={{ bottom: { color: 'var(--border-1)' } }}>
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

export default function SourceControlView({
  active = true,
  refreshToken = 0,
}: {
  /** True while Source Control is the visible category (primary or split pane). */
  active?: boolean
  /** Bumped by App on every in-app save so a just-saved file shows immediately. */
  refreshToken?: number
} = {}) {
  const vm = useSourceControlViewModel()
  const { theme } = useAppTheme()
  // Planning stage per file (by workspace-relative path) — lets a changed file
  // show the status of the plan node it backs, same glyph as the planning list.
  // Reloads with dataVersion so a file added/committed this session picks up.
  const fileStages = useFileStages(vm.dataVersion)
  const [showBranches, setShowBranches] = useState(false)
  // Which main-pane view is shown when no file is selected. 'commits' is the
  // real commit DAG (CommitGraphView); 'constellation' weaves plan nodes into
  // it (ConstellationView); 'branches' keeps the older per-branch divergence
  // summary (BranchTreeView).
  const [rightView, setRightView] = useState<'commits' | 'constellation' | 'branches'>('commits')
  const fileMenu = useContextMenu<GitFileStatus>()
  const [discardingFile, setDiscardingFile] = useState<GitFileStatus | null>(null)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [fileQuery, setFileQuery] = useState('')
  // Changed-file sort, sharing the Workspace/Planning search sort control
  // (see SEARCH_SORT_OPTIONS). 'recent' orders by worktree mtime (GitFileStatus.mtime).
  const [fileSort, setFileSort] = useState<SearchSortId>('name')
  const [showAddRemote, setShowAddRemote] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const fileSearchRef = useRef<HTMLElement>(null)

  // Re-read git state whenever Source Control becomes the visible category, and
  // whenever an in-app save bumps refreshToken. App keeps every category mounted
  // and just toggles `display`, so switching TO this view is neither a remount
  // (the only thing that fires the ViewModel's own mount refresh) nor a
  // window-focus change — without this, a file created/edited/saved in another
  // category (e.g. a new file in Workspace) never shows up here until the app
  // loses and regains focus. Driven by an explicit App prop rather than an
  // IntersectionObserver because IO firing on a display:none→flex toggle is
  // unreliable; a prop change is deterministic. refresh/refreshBranchTree are
  // stable (useCallback), so the effect only re-runs when active/refreshToken
  // actually change.
  const { refresh, refreshBranchTree } = vm
  useEffect(() => {
    if (active) { refresh(); refreshBranchTree() }
  }, [active, refreshToken, refresh, refreshBranchTree])

  useEffect(() => {
    if (!fileSearchOpen) return
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Element
      if (fileSearchRef.current?.contains(t)) return
      setFileSearchOpen(false)
      setFileQuery('')
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [fileSearchOpen])

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
    const notARepo = /not a git repository/i.test(vm.error)
    return (
      <Frame theme={theme} flow="vertical" h="fill" w="fill" align="center" justify="center" gap={10} fill={{ solid: 'bg-1' }}>
        <span style={{ fontSize: 11, color: notARepo ? 'var(--text-2)' : '#e07a7a', ...MONO }}>
          {notARepo ? 'This folder is not a Git repository yet.' : vm.error}
        </span>
        <Frame flow="horizontal" align="center" gap={8}>
          {notARepo && (
            <Button variant="primary" size="sm" onClick={vm.doInit} disabled={vm.initializing} isLoading={vm.initializing}>
              {vm.initializing ? 'Initializing…' : 'Initialize repository'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={vm.refresh}>Retry</Button>
        </Frame>
        {notARepo && (
          <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
            Or clone a repo from the Workspace tab.
          </span>
        )}
      </Frame>
    )
  }

  const status = vm.status!
  const nothingStaged = vm.staged.length === 0
  // Last two path segments of the repo git status is actually reading — shown
  // so "my changes aren't showing" is obviously a wrong-folder problem when it
  // is one (full path on hover).
  const repoLabel = status.root
    ? status.root.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2).join('/')
    : null

  const filterFiles = (files: GitFileStatus[]) => {
    const matched = fileQuery.trim()
      ? files.filter((f) => f.path.toLowerCase().includes(fileQuery.toLowerCase()))
      : files
    return [...matched].sort((a, b) =>
      fileSort === 'name' ? a.path.localeCompare(b.path) : b.mtime - a.mtime,
    )
  }

  return (
    <Frame theme={theme} flow="horizontal" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      {/* Left column — branch, sync actions, changed files, commit box */}
      <Frame flow="vertical" gap={0} w={320} shrink={0} h="fill" stroke={{ right: { color: 'border-1' } }}>
        <Frame flow="vertical" gap={10} padding={14} stroke={{ bottom: { color: 'border-1' } }}>
          {(fileSearchOpen || fileQuery) ? (
            // Opening search slides the input over the branch/title row instead
            // of dropping a line beneath it \u2014 same cover-the-title interaction
            // as Planning/LeftRailing (see SidebarHeader's search mode).
            <Frame ref={fileSearchRef}>
              <Search
                value={fileQuery}
                onChange={setFileQuery}
                placeholder={`Search files\u2026`}
                w="fill"
                autoFocus={fileSearchOpen && !fileQuery}
                // Same sort dropdown as the Workspace/Planning searches.
                sort={{
                  options: SEARCH_SORT_OPTIONS,
                  active: fileSort,
                  onChange: (v) => setFileSort(v as SearchSortId),
                }}
              />
            </Frame>
          ) : (
            <Frame flow="horizontal" align="center" justify="between">
              <Frame flow="horizontal" align="center" gap={6} style={{ cursor: 'pointer' }} onClick={() => setShowBranches((s) => !s)}>
                <Icon name="git-branch" size={13} />
                <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, ...MONO }}>
                  {status.branch ?? 'detached HEAD'}
                </span>
              </Frame>
              <Frame flow="horizontal" align="center" gap={4}>
                {(status.ahead > 0 || status.behind > 0) && (
                  <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>
                    {status.ahead > 0 ? `\u2191${status.ahead}` : ''}{status.behind > 0 ? ` \u2193${status.behind}` : ''}
                  </span>
                )}
                <IconButton
                  as="span"
                  glyph="\u27f3"
                  iconSize={15}
                  title="Refresh \u2014 re-read git status (needed after committing in the terminal or editing outside Sleipnir)"
                  textColor="var(--text-3)"
                  onClick={() => { vm.refresh(); vm.refreshBranchTree() }}
                />
                <IconButton
                  as="span"
                  icon="search"
                  iconSize={13}
                  title="Search files"
                  textColor="var(--text-3)"
                  onClick={() => setFileSearchOpen(true)}
                />
              </Frame>
            </Frame>
          )}

          {repoLabel && (
            <span
              title={`Source Control is tracking this repository:\n${status.root}\n\nIf your changes aren't here, this is the wrong folder — open the right project via File ▸ Open Project.`}
              style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...MONO }}
            >
              ▸ tracking …/{repoLabel}
            </span>
          )}

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
                        flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-2)',
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
                    flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border-2)',
                    color: 'var(--text-1)', fontSize: 10, padding: '4px 6px', ...MONO,
                  }}
                />
                <Button variant="ghost" size="sm" onClick={vm.submitNewBranch} disabled={vm.switchingBranch || !vm.newBranchName.trim()}>
                  Create
                </Button>
              </Frame>
            </Frame>
          )}

          {status.remotes && status.remotes.length > 0 ? (
            <Frame flow="horizontal" gap={6} align="center">
              <Button variant="ghost" size="sm" onClick={vm.doFetch} isLoading={vm.fetching}>Fetch</Button>
              <Button variant="ghost" size="sm" onClick={vm.doPull} isLoading={vm.pulling}>Pull</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={vm.doPush}
                isLoading={vm.pushing}
                disabled={status.ahead === 0 && !!status.upstream}
              >
                {/* "Publish" on first push (no upstream yet), "Push" thereafter.
                    Never "Up to date" — that's a status, shown separately below so
                    it can't be mistaken for a dead button. */}
                {status.upstream ? 'Push' : 'Publish'}
              </Button>
              {status.upstream && status.ahead === 0 && status.behind === 0 && !vm.pushing && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, letterSpacing: '0.06em', color: '#7ec98f', ...MONO }}>
                  {'✓'} Up to date
                </span>
              )}
            </Frame>
          ) : showAddRemote ? (
            /* No remote → let the user wire an 'origin' so Publish has a target. */
            <Frame flow="vertical" gap={6}>
              <input
                autoFocus
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && remoteUrl.trim()) { vm.doAddRemote(remoteUrl); setShowAddRemote(false) }
                  if (e.key === 'Escape') setShowAddRemote(false)
                }}
                placeholder="https://github.com/user/repo.git"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-control)', color: 'var(--text-1)', fontSize: 10, padding: '5px 8px', outline: 'none', ...MONO }}
              />
              <Frame flow="horizontal" gap={6}>
                <Button variant="ghost" size="sm" onClick={() => setShowAddRemote(false)} disabled={vm.addingRemote}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={() => { vm.doAddRemote(remoteUrl); setShowAddRemote(false) }} disabled={vm.addingRemote || !remoteUrl.trim()} isLoading={vm.addingRemote}>
                  Add remote
                </Button>
              </Frame>
            </Frame>
          ) : (
            <Frame flow="horizontal" gap={8} align="center">
              <span style={{ fontSize: 9, color: 'var(--text-3)', ...MONO }}>No remote — commits stay local.</span>
              <Button variant="ghost" size="sm" onClick={() => setShowAddRemote(true)}>Add remote…</Button>
            </Frame>
          )}

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
            {filterFiles(vm.staged).map((f) => (
              <FileRow key={f.path} file={f} stage={fileStages.get(f.path)} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
            ))}
          </Frame>

          <Frame flow="vertical" gap={2}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
              CHANGES ({vm.unstaged.length})
            </span>
            {filterFiles(vm.unstaged).map((f) => (
              <FileRow key={f.path} file={f} stage={fileStages.get(f.path)} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
            ))}
          </Frame>

          <Frame flow="vertical" gap={2}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
              UNTRACKED ({vm.untracked.length})
            </span>
            {filterFiles(vm.untracked).map((f) => (
              <FileRow key={f.path} file={f} stage={fileStages.get(f.path)} active={vm.selected?.path === f.path} onSelect={() => vm.selectFile(f)} onToggleStage={() => vm.toggleStage(f)} onContextMenu={(e) => fileMenu.openFromEvent(e, f)} onMenuButton={(e) => fileMenu.openFromButton(e, f)} />
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
              resize: 'none', background: 'var(--bg-2)', border: '1px solid var(--border-2)',
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

      {/* Main area — the commit graph by default, or the selected file's diff */}
      <Frame flow="vertical" grow minW={0} h="fill" scroll="y">
        <Frame flow="horizontal" align="center" justify="between" padding={{ x: 16, y: 10 }} stroke={{ bottom: { color: 'border-1' } }}>
          {vm.selected ? (
            <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', ...MONO }}>
              {vm.selected.path}
            </span>
          ) : (
            <Frame flow="horizontal" gap={4} align="center">
              <Button variant={rightView === 'commits' ? 'secondary' : 'ghost'} size="sm" onClick={() => setRightView('commits')}>Commits</Button>
              <Button variant={rightView === 'constellation' ? 'secondary' : 'ghost'} size="sm" onClick={() => setRightView('constellation')}>Constellation</Button>
              <Button variant={rightView === 'branches' ? 'secondary' : 'ghost'} size="sm" onClick={() => setRightView('branches')}>Branches</Button>
            </Frame>
          )}
          {vm.selected && (
            <Button variant="ghost" size="sm" onClick={vm.clearSelection}>
              Back
            </Button>
          )}
        </Frame>
        {vm.selected ? (
          <Frame padding={{ y: 8 }}>
            <DiffView diff={vm.diff} loading={vm.diffLoading} />
          </Frame>
        ) : rightView === 'commits' ? (
          <CommitGraphView reloadToken={vm.dataVersion} />
        ) : rightView === 'constellation' ? (
          <ConstellationView reloadToken={vm.dataVersion} />
        ) : (
          <Frame padding={{ x: 16, y: 4 }}>
            <BranchTreeView tree={vm.branchTree} loading={vm.branchTreeLoading} />
          </Frame>
        )}
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
