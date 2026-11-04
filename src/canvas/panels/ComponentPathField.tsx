// Where a component's file lives, written out in full in one field
// (`.components/widgets/card.tsx`) — with a dropdown that completes the folder
// part as you type. Picking a folder keeps the file name; typing a different
// one renames the file.
//
// Suggestions are folders inside the component root (the only place the canvas
// may write), never Sleipnir's own dot-folders. ↑/↓ move through them, Enter or
// a click takes one, Escape closes the list (a second Escape is the caller's
// cancel).

import { useEffect, useMemo, useState } from 'react'
import { listWorkspaceDir } from '../../platform/sleipnirApi'
import type { FileTreeNode } from '../../platform/PlatformAPI'
import { normalizeRelPath, parentDir } from '../../document/paths'
import { UI_FONT } from './inspectorKit'
import { TextField } from '../../app/UIKit/Field/TextField'

const MAX_SUGGESTIONS = 8

function flattenDirs(tree: FileTreeNode[], out: string[] = []): string[] {
  for (const node of tree) {
    if (node.type !== 'dir') continue
    out.push(node.path)
    if (node.children) flattenDirs(node.children, out)
  }
  return out
}

/** Every folder under `root` (workspace-relative, root included) — the workspace's real ones plus any the board records. */
function useRootFolders(root: string, extra: string[]): string[] {
  const [workspaceDirs, setWorkspaceDirs] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    listWorkspaceDir('')
      .then(({ tree }) => alive && setWorkspaceDirs(flattenDirs(tree)))
      .catch(() => alive && setWorkspaceDirs([]))
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => {
    const base = normalizeRelPath(root)
    const out = new Set<string>([base])
    const add = (dir: string) => {
      const norm = normalizeRelPath(dir)
      if (norm !== base && !norm.startsWith(`${base}/`)) return
      // Dot-folders are Sleipnir's own (.boards holds the board files), never a home for a component.
      if (norm.slice(base.length).split('/').some((seg) => seg.startsWith('.'))) return
      out.add(norm)
    }
    workspaceDirs.forEach(add)
    for (const dir of extra) if (dir) add(`${base}/${dir}`)
    return [...out].sort()
  }, [root, workspaceDirs, extra])
}

const fileNameOf = (path: string) => (path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path)

export function ComponentPathField({
  componentRoot,
  value,
  onChange,
  onSubmit,
  onCancel,
  extraFolders = [],
  fallbackFileName,
  submitOnBlur = true,
}: {
  componentRoot: string
  /** The full workspace-relative file path, as typed so far. */
  value: string
  onChange: (path: string) => void
  /** Enter with no suggestion highlighted, or leaving the field. */
  onSubmit?: () => void
  /** Escape with the list already closed. */
  onCancel?: () => void
  /** Folders the board records under the root that may not exist on disk yet (CanvasDoc.componentFolders). */
  extraFolders?: string[]
  /** The file name a picked folder gets when the field has none yet. */
  fallbackFileName: string
  /** Leaving the field commits too — off where committing writes a new file, which wants a deliberate click. @default true */
  submitOnBlur?: boolean
}) {
  const folders = useRootFolders(componentRoot, extraFolders)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Complete the folder part: everything up to the last slash.
  const dir = value.includes('/') ? parentDir(value) : value
  const query = dir.trim().toLowerCase()
  const matches = useMemo(
    () => folders.filter((f) => f !== dir && (!query || f.toLowerCase().includes(query))).slice(0, MAX_SUGGESTIONS),
    [folders, dir, query],
  )
  const showList = open && matches.length > 0

  const choose = (folder: string) => {
    onChange(`${folder}/${fileNameOf(value) || fallbackFileName}`)
    setOpen(false)
    setActive(-1)
  }

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <TextField size="md"
        value={value}
        title={value}
        placeholder={`${componentRoot}/…`}
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          if (submitOnBlur) onSubmit?.()
        }}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && matches.length > 0) {
            e.preventDefault()
            setOpen(true)
            setActive((i) => (i + 1) % matches.length)
          } else if (e.key === 'ArrowUp' && matches.length > 0) {
            e.preventDefault()
            setActive((i) => (i <= 0 ? matches.length - 1 : i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (showList && active >= 0) choose(matches[active])
            else {
              setOpen(false)
              onSubmit?.()
            }
          } else if (e.key === 'Escape') {
            if (showList) {
              e.stopPropagation()
              setOpen(false)
            } else onCancel?.()
          }
        }}
        style={{ color: 'var(--text-2)' }}
      />
      {showList && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-2)',
            borderRadius: 'var(--radius-field)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
            padding: '2px 0',
          }}
        >
          {matches.map((folder, i) => (
            <button
              key={folder}
              type="button"
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur closes the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(folder)
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                ...UI_FONT,
                display: 'block',
                width: '100%',
                textAlign: 'left',
                fontSize: 11,
                padding: '4px 8px',
                border: 'none',
                cursor: 'pointer',
                color: i === active ? 'var(--text-1)' : 'var(--text-2)',
                background: i === active ? 'rgba(var(--item-ink, 255,255,255), 0.10)' : 'transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {folder}/
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
