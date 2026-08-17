import { forwardRef, useState } from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { IconButton } from '../app/UIKit/IconButton/IconButton'
import { FolderBrowserView } from '../app/DesignSystem/FolderBrowserView'
import type { FolderBrowserHandle } from '../app/DesignSystem/iFolderBrowserView'
import { createWorkspaceDir, createWorkspaceFile } from '../00_planning/api/sleipnirApi'
import { NewWorkspacePlanModal } from '../app/Workspace/NewWorkspacePlanModal'
import type { ResearchViewProps } from './iResearchView'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function AddResearchFileButton({ onCreated }: { onCreated: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setAdding(false)
    setName('')
    setError(null)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createWorkspaceFile(trimmed, '')
      reset()
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!adding) {
    return <IconButton onClick={() => setAdding(true)} title="Add new file" icon="file-add" />
  }

  return (
    <Frame flow="horizontal" align="center" gap={4}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="file name"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-control)',
          color: 'var(--text-1)',
          fontSize: 10,
          padding: '6px 10px',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
          width: 120,
        }}
      />
      {error && <span style={{ fontSize: 10, color: '#e07a7a', fontFamily: 'var(--font-mono)' }}>{error}</span>}
    </Frame>
  )
}

function AddResearchFolderButton({ onCreated }: { onCreated: () => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setAdding(false)
    setName('')
    setError(null)
  }

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createWorkspaceDir(trimmed)
      reset()
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!adding) {
    return <IconButton onClick={() => setAdding(true)} title="Add new folder" icon="folder-add" />
  }

  return (
    <Frame flow="horizontal" align="center" gap={4}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="folder name"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--radius-control)',
          color: 'var(--text-1)',
          fontSize: 10,
          padding: '6px 10px',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
          width: 120,
        }}
      />
      {error && <span style={{ fontSize: 10, color: '#e07a7a', fontFamily: 'var(--font-mono)' }}>{error}</span>}
    </Frame>
  )
}

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
  const [addingPlan, setAddingPlan] = useState(false)

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
    <>
      <FolderBrowserView
        ref={ref}
        scope="workspace"
        root=".research"
        rootLabel="Research"
        supportsCreate
        headerAction={(refresh) => (
          <>
            <IconButton icon="plan-add" title="Add Plan…" onClick={() => setAddingPlan(true)} />
            <AddResearchFolderButton onCreated={refresh} />
            <AddResearchFileButton onCreated={refresh} />
          </>
        )}
      />
      {addingPlan && (
        <NewWorkspacePlanModal
          onClose={() => setAddingPlan(false)}
          onCreated={() => setAddingPlan(false)}
        />
      )}
    </>
  )
})
