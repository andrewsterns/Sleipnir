import { forwardRef } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { FolderBrowserView } from './FolderBrowserView'
import { getComponentPreview } from './DesignLibrary.ViewModel'
import { RefactorPanel } from '../RefactorPanel/RefactorPanel'
import { ImportButton } from './ImportButton'
import { LIBRARIES } from '../../00_planning/graph/types'
import { setNodeStatus } from '../../00_planning/api/sleipnirApi'
import type { FolderBrowserHandle } from './iFolderBrowserView'

const DEFAULT_LIBRARY_ID = 'dsm'

function libraryRootFor(libraryId: string): string {
  return LIBRARIES.find((lib) => lib.id === libraryId)?.root ?? '02_components'
}

interface DesignLibraryViewProps {
  /** Which registered component library to browse. Defaults to the original default library. */
  libraryId?: string
  /** Opens this file on mount (e.g. jumped here from Planning) — otherwise starts blank. */
  initialFile?: { name: string; path: string } | null
  /** AI-generated content for `initialFile`, staged for review rather than read from disk — see the generate_code tool in electron/chat.cjs. Cleared via onOverrideSaved once the human hits Save. */
  pendingOverride?: { path: string; content: string; planNodeId: string } | null
  onOverrideSaved?: (planNodeId: string) => void
  onAddToPlan: (label: string, paths: string[]) => void
}

// Thin config wrapper around the unified FolderBrowserView — Components'
// only real specialization vs. a plain widget is the curated/AutoPreview
// preview tier (getComponentPreview, unchanged), the Refactor action, and
// create/archive support. All the browsing/tabs/save machinery lives in
// FolderBrowserView now.
const DesignLibraryView = forwardRef<FolderBrowserHandle, DesignLibraryViewProps>(function DesignLibraryView(
  { libraryId = DEFAULT_LIBRARY_ID, initialFile, pendingOverride, onOverrideSaved, onAddToPlan },
  ref,
) {
  const root = libraryRootFor(libraryId)

  // The human's explicit Save is the actual approval gate for AI-generated
  // code (see FolderBrowserView's suppressAutoSave wiring) — only once it
  // lands on disk does the plan node get marked done and the override
  // cleared, so navigating back to this file afterward shows the real saved
  // content, not stale AI text.
  const handleOverrideSaved = (planNodeId: string) => {
    setNodeStatus(planNodeId, 'done').catch(() => {})
    onOverrideSaved?.(planNodeId)
  }

  return (
    <FolderBrowserView
      ref={ref}
      scope="src"
      root={root}
      supportsCreate
      getPreview={getComponentPreview}
      headerAction={(refresh) => (
        <Frame flow="horizontal" align="center" gap={6}>
          <ImportButton destRepoRelativeDir={`src/${root}`} onImported={refresh} />
          <RefactorPanel onApplied={refresh} libraryId={libraryId} showLabel={false} />
        </Frame>
      )}
      initialFile={initialFile}
      pendingOverride={pendingOverride}
      onOverrideSaved={handleOverrideSaved}
      onAddToPlan={onAddToPlan}
    />
  )
})

export default DesignLibraryView
