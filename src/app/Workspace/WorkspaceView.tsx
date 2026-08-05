import { forwardRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Button } from '../UIKit/Button/Button'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { FolderBrowserView } from '../DesignSystem/FolderBrowserView'
import { useWorkspaceViewModel } from './WorkspaceView.ViewModel'
import type { FolderBrowserHandle } from '../DesignSystem/iFolderBrowserView'
import type { WorkspaceViewProps } from './iWorkspaceView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Electron-only, same feature-detection convention as App.tsx's
// electronDialogsAvailable — a plain browser dev tab has no native folder
// picker and no persisted "last workspace" (see electron/workspaceStore.cjs),
// so this category explains why it's disabled rather than silently no-oping
// on click.
const workspaceAvailable = typeof window.electronAPI?.openWorkspace === 'function'

// Lets "Open Folder" actually repoint the app at an arbitrary project on
// disk (ROADMAP.md's Phase 0) — a wholly separate, independently-rooted
// scope:'workspace' alongside Components/Prototypes/Docker's scope:'src'|
// 'repo', which stay pinned to Sleipnir's own install. No onAddToPlan (an
// arbitrary external file has no relationship to Sleipnir's own graph), no
// LSP (tsserver's project root isn't parameterized per-workspace yet).
export const WorkspaceView = forwardRef<FolderBrowserHandle, WorkspaceViewProps>(function WorkspaceView({ initialFile }, ref) {
  const { info, loading, error, chooseFolder } = useWorkspaceViewModel()

  if (loading) return null

  if (!info?.root) {
    return (
      <Frame flow="vertical" grow align="center" justify="center" gap={16}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em', ...MONO }}>
          {workspaceAvailable ? 'No folder open' : 'Workspace requires the desktop app'}
        </span>
        {workspaceAvailable && (
          <Button variant="primary" size="md" onClick={chooseFolder}>
            Choose Workspace Folder…
          </Button>
        )}
        {error && <span style={{ fontSize: 10, color: '#e07a7a', ...MONO }}>{error}</span>}
      </Frame>
    )
  }

  return (
    <FolderBrowserView
      // Workspace's root is always "" (same convention OPEN_FILES_ID's
      // scope:'repo' browser uses) — the key forces a full remount on
      // folder switch so the previous folder's open tabs don't leak into
      // the new one (FolderBrowserView.ViewModel's reset effect is keyed on
      // `root`, which never itself changes here).
      key={info.root}
      ref={ref}
      scope="workspace"
      root=""
      supportsCreate
      initialFile={initialFile}
      headerAction={() => <IconButton icon="folder-add" title="Switch Folder…" onClick={chooseFolder} />}
    />
  )
})
