// What a window was showing, kept across a page reload so a change from the
// agent doesn't throw you back to the start: the space, the split, the dock and
// the Workspace's open files. Per window and per run (sessionStorage), so two
// windows don't fight over it and a fresh launch still starts clean.

import type { PaneId, PaneState } from './DesignSystem/iFolderBrowserView'

export function readSession(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: a reload just starts fresh.
  }
}

const SHELL_KEY = 'sleipnir-shell'

export interface ShellSession {
  active: string
  secondary: string | null
  dock: string | null
}

/** The shell as it was, keeping only spaces and docks that still exist (a space can be renamed or removed by an update). */
export function shellFromStored(stored: unknown, spaces: readonly string[], docks: readonly string[], fallback: string): ShellSession {
  const s = (stored ?? {}) as Partial<Record<keyof ShellSession, unknown>>
  const known = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : null)
  const active = known(s.active, spaces) ?? fallback
  const secondary = known(s.secondary, spaces)
  return { active, secondary: secondary === active ? null : secondary, dock: known(s.dock, docks) }
}

export const readShell = (spaces: readonly string[], docks: readonly string[], fallback: string) => shellFromStored(readSession(SHELL_KEY), spaces, docks, fallback)
export const writeShell = (shell: ShellSession) => writeSession(SHELL_KEY, shell)

export type Panes = Record<PaneId, PaneState>

const emptyPane = (): PaneState => ({ tabs: [], activeTabPath: null })

function paneFrom(stored: unknown): PaneState {
  const p = (stored ?? {}) as Partial<PaneState>
  if (!Array.isArray(p.tabs)) return emptyPane()
  const tabs = p.tabs.filter((t) => typeof t?.path === 'string' && typeof t?.label === 'string').map((t) => ({ path: t.path, label: t.label }))
  const active = tabs.some((t) => t.path === p.activeTabPath) ? (p.activeTabPath as string) : (tabs[tabs.length - 1]?.path ?? null)
  return { tabs, activeTabPath: active }
}

/** Open files as they were stored; anything unreadable simply isn't reopened. */
export function panesFromStored(stored: unknown): Panes {
  const s = (stored ?? {}) as Partial<Record<PaneId, unknown>>
  return { primary: paneFrom(s.primary), secondary: paneFrom(s.secondary) }
}

const filesKey = (root: string) => `sleipnir-open-files:${root}`
export const readOpenFiles = (root: string): Panes => panesFromStored(readSession(filesKey(root)))
export const writeOpenFiles = (root: string, panes: Panes) => writeSession(filesKey(root), panes)
