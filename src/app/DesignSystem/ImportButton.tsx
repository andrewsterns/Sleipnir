import React, { useState } from 'react'
import { IconButton } from '../UIKit/IconButton/IconButton'
import { importDialog, importPath } from '../../00_planning/api/sleipnirApi'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export interface ImportButtonProps {
  /** Repo-root-relative destination directory the picked file/folder is copied into (e.g. "src/02_components") — see importPath's own doc comment for why this convention, not src-relative. */
  destRepoRelativeDir: string
  /** Fired with the newly-copied item's repo-relative path once the copy succeeds. */
  onImported: (importedRepoRelativePath: string) => void
}

// Electron-only (native, unrestricted file/folder picker — see
// electronApi.ts's importDialog comment) — hidden entirely rather than
// shown-disabled in a plain browser dev tab, since there's nothing a click
// could meaningfully do there.
export const ImportButton: React.FC<ImportButtonProps> = ({ destRepoRelativeDir, onImported }) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (typeof window.electronAPI?.importDialog !== 'function') return null

  const onClick = async () => {
    const picked = await importDialog()
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const { path } = await importPath(picked.path, destRepoRelativeDir)
      onImported(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <IconButton
        onClick={onClick}
        disabled={busy}
        title="Import…"
        icon="import"
        textColor="var(--text-2)"
      />
      {error && (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            fontSize: 9,
            color: '#e07a7a',
            background: 'var(--bg-2)',
            border: '1px solid rgba(224,122,122,0.4)',
            padding: '4px 6px',
            whiteSpace: 'nowrap',
            zIndex: 10,
            ...MONO,
          }}
        >
          {error}
        </span>
      )}
    </div>
  )
}
