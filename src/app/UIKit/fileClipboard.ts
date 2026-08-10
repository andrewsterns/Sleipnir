import { useSyncExternalStore } from 'react'

// A single app-wide file clipboard for cut/copy → paste in the workspace file
// tree. A module-level store (not a React context) on purpose: the Workspace
// and Research trees mount in different parts of the app but share one
// workspace root, so cutting in one and pasting in the other must see the same
// entry without a provider spanning both.
export interface FileClipboardEntry {
  /** Workspace-relative path of the cut/copied file or folder. */
  path: string
  isDir: boolean
  mode: 'cut' | 'copy'
}

let entry: FileClipboardEntry | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function setFileClipboard(next: FileClipboardEntry | null) {
  entry = next
  emit()
}

export function getFileClipboard(): FileClipboardEntry | null {
  return entry
}

// Subscribe a component to clipboard changes so a "Paste" item enables/disables
// live and a cut source can dim while pending.
export function useFileClipboard(): FileClipboardEntry | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => entry,
    () => entry,
  )
}
