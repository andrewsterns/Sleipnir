// Rename, retarget and relocate a component that already has a file.
//
// No longer a gate. Promotion writes its own file into `.canvas` with a derived
// path (see CanvasView.ViewModel's promoteSelectedToComponent), so this is not
// the thing standing between a frame and code on disk — it is how you change
// your mind about a component afterwards. That also retired COMPONENT ONLY,
// whose only purpose was reaching a promoted-but-unwritten state that can no
// longer exist.
//
// The path field always re-contains through resolveComponentPath, so what the
// preview shows is exactly what will be written, and a path that escapes the
// component root is refused with the reason visible rather than silently
// corrected. Naming is surfaced prominently because it drives both the exported
// symbol and the filename.
//
// Nothing here writes: the modal is a form over a `draft`, and the outcome is
// the caller's to commit, so CANCEL genuinely cancels.

import { useEffect, useMemo, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { listWorkspaceDir } from '../../00_planning/api/sleipnirApi'
import { CANVAS_TARGETS } from '../emit/targets'
import { componentFileName, componentSymbol, propsInterfaceName } from '../emit/react'
import {
  PathEscapeError,
  deriveComponentPath,
  parentDir,
  relativeToRoot,
  resolveComponentPath,
} from '../model/paths'
import { toCamelCase } from '../../00_planning/graph/naming'
import { LAYER } from '../../app/shellLayout'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import type { CanvasTarget } from '../model/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const FIELD: React.CSSProperties = {
  ...MONO,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 11,
  padding: '6px 8px',
  outline: 'none',
  width: '100%',
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{children}</span>
}

/** Flattens the workspace tree to directory paths, for the folder autocomplete. */
function flattenDirs(tree: FileTreeNode[], out: string[] = []): string[] {
  for (const node of tree) {
    if (node.type !== 'dir') continue
    out.push(node.path)
    if (node.children) flattenDirs(node.children, out)
  }
  return out
}

/** Seeds for the fields — a frame about to be promoted, or an already-promoted component. */
export interface ComponentDraft {
  name: string
  target: CanvasTarget
  /** The sandbox every path here is re-contained into. See model/paths.ts. */
  componentRoot: string
  /**
   * Where the component's file already is, when it has one.
   *
   * Decides whether this dialog is creating or editing — the two outcomes the
   * caller commits are genuinely different (a fresh emit versus a rename/move
   * that preserves the existing file's human-written code), and saying
   * "CREATE COMPONENT" over the second would be a lie. Also seeds the folder
   * field so opening the dialog and saving without touching anything is a
   * no-op rather than a relocation.
   */
  filePath?: string
}

export interface CreateComponentModalProps {
  draft: ComponentDraft
  workspaceName?: string | null
  /** Commits nothing — see the file header. */
  onClose: () => void
  /** Resolved workspace-relative path plus the chosen name/target. Rejects with a message the modal shows inline, staying open. */
  onApprove: (input: { name: string; target: CanvasTarget; filePath: string }) => Promise<void>
}

export function CreateComponentModal({
  draft,
  workspaceName,
  onClose,
  onApprove,
}: CreateComponentModalProps) {
  const [name, setName] = useState(draft.name)
  const [target, setTarget] = useState<CanvasTarget>(draft.target)
  // Left empty when the component sits in the folder promotion derived for it,
  // and seeded with the real one only when someone has filed it somewhere of
  // their own. That single distinction gets both cases right: renaming a
  // component in its auto-named folder moves the folder too (leaving `Card` in
  // `frame/` would just be stale), while a component deliberately filed under,
  // say, `widgets/` stays there through any number of renames. Either way the
  // path preview below shows exactly where it will land before SAVE.
  const [folder, setFolder] = useState(() => {
    if (!draft.filePath) return ''
    const actual = relativeToRoot(draft.componentRoot, parentDir(draft.filePath))
    return actual === toCamelCase(draft.name) ? '' : actual
  })
  const [dirs, setDirs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listWorkspaceDir('')
      .then(({ tree }) => setDirs(flattenDirs(tree)))
      .catch(() => setDirs([]))
  }, [])

  // Default folder is the component's own slug beneath the sandbox root.
  const effectiveFolder = folder.trim() || toCamelCase(name || draft.name)

  const resolved = useMemo(() => {
    try {
      // An untouched folder field must produce the SAME path the automatic
      // write would, so deriveComponentPath owns that shape and this only
      // hand-builds the path when the human typed a folder of their own.
      const path = folder.trim()
        ? resolveComponentPath(draft.componentRoot, `${effectiveFolder}/${componentFileName(name || draft.name)}`)
        : deriveComponentPath(draft.componentRoot, name || draft.name)
      return { path, error: null as string | null }
    } catch (e) {
      return {
        path: null,
        error: e instanceof PathEscapeError ? e.message : e instanceof Error ? e.message : String(e),
      }
    }
  }, [draft.componentRoot, draft.name, effectiveFolder, folder, name])

  const suggestions = useMemo(() => {
    const query = folder.trim().toLowerCase()
    if (!query) return []
    return dirs.filter((d) => d.toLowerCase().includes(query)).slice(0, 5)
  }, [dirs, folder])

  const canApprove = !!name.trim() && !!resolved.path && !busy

  const submit = async () => {
    if (!canApprove || !resolved.path) return
    setBusy(true)
    setError(null)
    try {
      await onApprove({ name: name.trim(), target, filePath: resolved.path })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'grid',
        placeItems: 'center',
        // The shell's dialog tier, not a local guess — at 50 this sat UNDER the
        // bottom dock, so an open terminal covered the lower third of the dialog
        // including its Approve button. See app/shellLayout.ts.
        zIndex: LAYER.dialog,
      }}
    >
      <Frame
        flow="vertical"
        gap={14}
        padding={16}
        fill={{ solid: 'bg-1' }}
        stroke={{ color: 'border-1', width: 1 }}
        radius={6}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <span style={{ ...MONO, fontSize: 11, color: 'var(--text-1)', letterSpacing: '0.08em' }}>
          {draft.filePath ? 'EDIT COMPONENT' : 'CREATE COMPONENT'}
        </span>

        <Frame flow="vertical" gap={4} w="fill">
          <Label>NAME</Label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onClose()
            }}
            style={FIELD}
          />
          {/* Naming drives real code, so show exactly what it produces. */}
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>
            export const {componentSymbol(name || draft.name)} · {propsInterfaceName(name || draft.name)}
          </span>
        </Frame>

        <Frame flow="vertical" gap={4} w="fill">
          <Label>LANGUAGE</Label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as CanvasTarget)}
            style={FIELD}
          >
            {CANVAS_TARGETS.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.available}>
                {t.available ? t.label : `${t.label} — ${t.unavailableReason ?? 'unavailable'}`}
              </option>
            ))}
          </select>
        </Frame>

        <Frame flow="vertical" gap={4} w="fill">
          <Label>FOLDER</Label>
          <input
            value={folder}
            placeholder={toCamelCase(name || draft.name)}
            onChange={(e) => setFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onClose()
            }}
            style={FIELD}
          />
          {suggestions.length > 0 && (
            <Frame flow="vertical" w="fill">
              {suggestions.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  className="srow"
                  onClick={() => setFolder(dir)}
                  style={{
                    ...MONO,
                    fontSize: 10,
                    textAlign: 'left',
                    padding: '3px 6px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                  }}
                >
                  {dir}
                </button>
              ))}
            </Frame>
          )}
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', wordBreak: 'break-all' }}>
            → {workspaceName || 'workspace'}/{resolved.path ?? '—'}
          </span>
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>
            Always written inside {draft.componentRoot}/ — the canvas cannot write anywhere else.
          </span>
        </Frame>

        {(resolved.error || error) && (
          <span style={{ ...MONO, fontSize: 10, color: '#e07a7a' }}>{resolved.error ?? error}</span>
        )}

        <Frame flow="horizontal" gap={8} justify="end" w="fill">
          <button
            type="button"
            onClick={onClose}
            style={{
              ...MONO,
              fontSize: 10,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              cursor: 'pointer',
              padding: '6px 10px',
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canApprove}
            style={{
              ...MONO,
              fontSize: 10,
              background: canApprove ? 'var(--bg-3)' : 'transparent',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-control)',
              color: canApprove ? 'var(--text-1)' : 'var(--text-3)',
              cursor: canApprove ? 'pointer' : 'default',
              padding: '6px 14px',
            }}
          >
            {busy ? 'WRITING…' : draft.filePath ? 'SAVE' : 'APPROVE'}
          </button>
        </Frame>
      </Frame>
    </div>
  )
}
