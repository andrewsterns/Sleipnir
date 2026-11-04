import { forwardRef, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { IconButton } from '../../app/UIKit/IconButton/IconButton'
import { FolderBrowserView } from '../../app/DesignSystem/FolderBrowserView'
import type { FolderBrowserHandle } from '../../app/DesignSystem/iFolderBrowserView'
import { createWorkspaceDir, createWorkspaceFile } from '../../platform/sleipnirApi'
import { NewWorkspacePlanModal } from '../../app/Workspace/NewWorkspacePlanModal'
import type { DocsPaneProps } from './iDocsPane'
import { TextField } from '../../app/UIKit/Field/TextField'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

function AddDocFileButton({ onCreated }: { onCreated: () => void }) {
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
      <TextField size="md"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="file name"
        style={{ width: 120 }}
      />
      {error && <span style={{ fontSize: 11, color: '#e07a7a', fontFamily: 'var(--font-ui)' }}>{error}</span>}
    </Frame>
  )
}

function AddDocFolderButton({ onCreated }: { onCreated: () => void }) {
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
      <TextField size="md"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') reset()
        }}
        onBlur={() => { if (!name) reset() }}
        placeholder="folder name"
        style={{ width: 120 }}
      />
      {error && <span style={{ fontSize: 11, color: '#e07a7a', fontFamily: 'var(--font-ui)' }}>{error}</span>}
    </Frame>
  )
}

// Canvas's Docs pane: a project's own notes — real files under its
// `.research/` folder (the name predates this pane and stays, so existing
// projects keep their docs; same per-project bundling as `.planning/`),
// browsed/edited via the same generic scope:'workspace' file API Workspace
// itself uses, just rooted one level deeper. No "Choose Folder…" here: the
// pane only ever follows whichever project App.tsx already has open (see
// iDocsPane.tsx's own comment) — switching projects remounts
// this whole view (see App.tsx's `key` on it), so there's nothing to reset
// locally.
export const DocsPane = forwardRef<FolderBrowserHandle, DocsPaneProps>(function DocsPane(
  { activeProject },
  ref,
) {
  const [addingPlan, setAddingPlan] = useState(false)

  if (!activeProject) {
    return (
      <Frame flow="vertical" grow align="center" justify="center" gap={16}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.03em', ...UI_FONT }}>
          No project open
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', ...UI_FONT }}>
          Open a project from File to start its docs.
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
        rootLabel="Docs"
        supportsCreate
        headerAction={(refresh) => (
          <>
            <IconButton icon="plan-add" title="Add Plan…" onClick={() => setAddingPlan(true)} />
            <AddDocFolderButton onCreated={refresh} />
            <AddDocFileButton onCreated={refresh} />
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
