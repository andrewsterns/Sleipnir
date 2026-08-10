import { forwardRef } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { FolderBrowserView } from '../app/DesignSystem/FolderBrowserView'
import type { FolderBrowserHandle } from '../app/DesignSystem/iFolderBrowserView'
import type { ResearchViewProps } from './iResearchView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// A project's own research notes — real files under its `.research/` folder
// (same convention as Planning's `.planning/`, per the same per-project
// bundling), browsed/edited via the same generic scope:'workspace' file API
// Workspace itself uses, just rooted one level deeper. No "Choose Folder…"
// here: Research only ever follows whichever project App.tsx already has
// open (see iResearchView.tsx's own comment) — switching projects remounts
// this whole view (see App.tsx's `key` on it), so there's nothing to reset
// locally.
export const ResearchView = forwardRef<FolderBrowserHandle, ResearchViewProps>(function ResearchView(
  { activeProject },
  ref,
) {
  if (!activeProject) {
    return (
      <Frame flow="vertical" grow align="center" justify="center" gap={16}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.06em', ...MONO }}>
          No project open
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', ...MONO }}>
          Open a project from File to start its research notes.
        </span>
      </Frame>
    )
  }

  return (
    <FolderBrowserView
      ref={ref}
      scope="workspace"
      root=".research"
      rootLabel="Research"
      supportsCreate
    />
  )
})
