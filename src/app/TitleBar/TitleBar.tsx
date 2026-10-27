import React, { useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Logo } from '../UIKit/Logo/Logo'
import type { RecentProject } from '../../00_planning/api/sleipnirApi'
import { isUpdaterAvailable, useAppUpdate, type UpdateState, type UpdateStatus } from './iUpdater'
import { isLicenseAvailable, useLicense } from '../License/iLicense'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Matches the titleBarOverlay height set in electron/main.cjs — the OS draws
// its own minimize/maximize/close buttons on top of the right edge of this
// row at that same height, so this bar's height has to line up with it.
export const TITLE_BAR_HEIGHT = 32

interface MenuItem {
  label: string
  /** React key + submenu-open identity, when the label isn't unique (two recent projects can share a name — see buildRecentItems). Defaults to `label`. */
  key?: string
  /** Native tooltip — the recent list uses it to show each project's full path. */
  title?: string
  onSelect?: () => void
  /** A nested flyout instead of a direct action — mutually exclusive with onSelect. Only one level deep (Open Recent's own use case). */
  items?: MenuItem[]
  /** Draws a divider above this item — separates a list from an action on that list (Open Recent's "Clear Recent Projects"). */
  separatorBefore?: boolean
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

const execEdit = (command: string) => () => document.execCommand(command)

export interface TitleBarProps {
  onSave?: () => void
  onSaveAll?: () => void
  /** The currently open project's display name — null when none is open (blank/New Window state). Rendered next to the Logo since the OS title bar is hidden (see main.cjs's titleBarStyle). */
  projectName?: string | null
  /** True when the project is the auto-provided "scratch" project (no real folder chosen yet) — shows an unsaved marker next to the name, and makes "Save Project" ask for a folder. */
  isScratch?: boolean
  /** Saves the whole project: picks a folder for an unsaved one, flushes pending autosaves for a real one (see App's onSaveProject). */
  onSaveProject?: () => void
  /** Copies the project into a new folder and switches to the copy (see App's onSaveProjectAs). */
  onSaveProjectAs?: () => void
  onOpenProject?: () => void
  recentProjects?: RecentProject[]
  onOpenRecentProject?: (path: string) => void
  /** Empties the recent-projects list — nothing on disk is touched and the open project stays open (see App's onClearRecentProjects). Omitted (or with an empty list) hides the menu item. */
  onClearRecentProjects?: () => void
  onNewWindow?: () => void
  /** Opens Settings ▸ License — the target of the title bar's PRO / Upgrade badge. */
  onOpenLicense?: () => void
  /** The Play button (app/Run/RunControl), placed after the project name. Passed in rather than built here because App.tsx owns the runner it shares with the Run dock. */
  runControl?: React.ReactNode
}

/** What buildMenus needs from useAppUpdate — kept off TitleBarProps since the TitleBar owns its own update state. */
interface UpdateMenuProps {
  updateStatus: UpdateStatus | null
  onCheckForUpdates?: () => void
}

// Open Recent's flyout: the recent projects themselves, then a divided
// "Clear Recent Projects" action. Shown only when there's something to
// clear, so the empty state stays a single "No Recent Projects" line.
function buildRecentItems(
  recentProjects: RecentProject[] | undefined,
  onOpenRecentProject: TitleBarProps['onOpenRecentProject'],
  onClearRecentProjects: TitleBarProps['onClearRecentProjects'],
): MenuItem[] {
  if (!recentProjects || recentProjects.length === 0) return [{ label: 'No Recent Projects' }]
  // Keyed by label downstream, so same-named projects in different folders
  // need disambiguating — the path is the unique part.
  const items: MenuItem[] = recentProjects.map((p) => ({
    label: p.name,
    key: p.path,
    onSelect: () => onOpenRecentProject?.(p.path),
    title: p.path,
  }))
  if (onClearRecentProjects) {
    items.push({ label: 'Clear Recent Projects', onSelect: onClearRecentProjects, separatorBefore: true })
  }
  return items
}

function buildMenus({
  onSave,
  onSaveAll,
  isScratch,
  onSaveProject,
  onSaveProjectAs,
  onOpenProject,
  recentProjects,
  onOpenRecentProject,
  onClearRecentProjects,
  onNewWindow,
  updateStatus,
  onCheckForUpdates,
}: TitleBarProps & UpdateMenuProps): MenuDef[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'Open Project…', onSelect: onOpenProject },
        {
          label: 'Open Recent',
          items: buildRecentItems(recentProjects, onOpenRecentProject, onClearRecentProjects),
        },
        { label: 'New Window', onSelect: onNewWindow },
        // An unsaved project needs a folder chosen, hence the ellipsis.
        { label: isScratch ? 'Save Project…' : 'Save Project', onSelect: onSaveProject, separatorBefore: true },
        { label: 'Save Project As…', onSelect: onSaveProjectAs },
        { label: 'Save', onSelect: onSave, separatorBefore: true },
        { label: 'Save All', onSelect: onSaveAll },
        { label: 'Reload', onSelect: () => window.location.reload() },
        { label: 'Exit', onSelect: () => window.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', onSelect: execEdit('undo') },
        { label: 'Redo', onSelect: execEdit('redo') },
        { label: 'Cut', onSelect: execEdit('cut') },
        { label: 'Copy', onSelect: execEdit('copy') },
        { label: 'Paste', onSelect: execEdit('paste') },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Toggle Fullscreen',
          onSelect: () => {
            if (document.fullscreenElement) document.exitFullscreen()
            else document.documentElement.requestFullscreen()
          },
        },
      ],
    },
    {
      label: 'Window',
      items: [{ label: 'Minimize', onSelect: undefined }],
    },
    {
      label: 'Help',
      items: [
        { label: 'Check for Updates…', onSelect: onCheckForUpdates },
        {
          label: updateStatus ? `Version ${updateStatus.currentVersion}` : 'Version —',
          separatorBefore: true,
        },
      ],
    },
  ]
}

const NO_DRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const SEPARATOR: React.CSSProperties = {
  height: 1,
  margin: '4px 0',
  background: 'var(--border-2)',
}

const menuItemStyle = (active: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  cursor: active ? 'pointer' : 'default',
  color: active ? 'var(--text-1)' : 'var(--text-3)',
  fontSize: 12,
  padding: '6px 12px',
  ...MONO,
})

// The transient line a manual Help ▸ Check for Updates leaves in the title
// bar — background checks never set this, so a quiet failure (offline, no
// release feed yet) doesn't nag.
const MANUAL_RESULT_TEXT: Partial<Record<UpdateState, (s: UpdateStatus) => string>> = {
  upToDate: (s) => `Up to date (v${s.currentVersion})`,
  error: () => 'Update check failed',
  unsupported: () => 'Updates only run in the installed app',
}

// Right-hand title bar slot: download progress, then the "Restart to update"
// button once the new version is on disk (see electron/updater.cjs).
const UpdateIndicator: React.FC<{
  status: UpdateStatus | null
  manualResult: UpdateState | null
  onInstall: () => void
}> = ({ status, manualResult, onInstall }) => {
  if (!status) return null
  if (status.state === 'ready') {
    return (
      <button
        onClick={onInstall}
        title={`Version ${status.version} is downloaded — restart Sleipnir to install it`}
        style={{
          background: 'transparent',
          border: '1px solid var(--nominal)',
          borderRadius: 'var(--radius-control)',
          color: 'var(--nominal)',
          cursor: 'pointer',
          fontSize: 11,
          padding: '2px 8px',
          whiteSpace: 'nowrap',
          ...MONO,
        }}
      >
        Restart to update{status.version ? ` · v${status.version}` : ''}
      </button>
    )
  }
  const text =
    status.state === 'downloading'
      ? `Downloading update${status.percent ? ` ${status.percent}%` : '…'}`
      : manualResult
        ? MANUAL_RESULT_TEXT[manualResult]?.(status)
        : undefined
  if (!text) return null
  return (
    <span title={status.error} style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', ...MONO }}>
      {text}
    </span>
  )
}

// Right-hand title bar badge: a quiet "PRO" once licensed, otherwise an
// "Upgrade" link — both open Settings ▸ License (see electron/license.cjs).
const LicenseBadge: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const { status, isPro } = useLicense()
  if (!status || !isLicenseAvailable()) return null
  return (
    <button
      onClick={onOpen}
      title={isPro ? 'Sleipnir Pro' : 'Free version — see what Sleipnir Pro adds'}
      style={{
        background: 'transparent',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-control)',
        color: isPro ? 'var(--nominal)' : 'var(--text-3)',
        cursor: 'pointer',
        fontSize: 10,
        letterSpacing: '0.08em',
        padding: '2px 8px',
        marginLeft: 8,
        whiteSpace: 'nowrap',
        ...MONO,
      }}
    >
      {isPro ? 'PRO' : 'Upgrade'}
    </button>
  )
}

export const TitleBar: React.FC<TitleBarProps> = (props) => {
  const { projectName, isScratch } = props
  const update = useAppUpdate()
  const MENUS = buildMenus({
    ...props,
    updateStatus: update.status,
    onCheckForUpdates: isUpdaterAvailable() ? update.check : undefined,
  })
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const onClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
        setOpenSubmenu(null)
      }
    }
    window.addEventListener('mousedown', onClickAway)
    return () => window.removeEventListener('mousedown', onClickAway)
  }, [openMenu])

  return (
    <Frame
      as="header"
      flow="horizontal"
      align="center"
      h={TITLE_BAR_HEIGHT}
      minH={TITLE_BAR_HEIGHT}
      shrink={0}
      fill={{ solid: 'bg-1' }}
      stroke={{ bottom: { color: 'var(--border-1)' } }}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        ref={rootRef}
        style={{ display: 'flex', alignItems: 'center', height: '100%', ...NO_DRAG }}
      >
        {/* Fixed 44px box, centered — matches the NavRail's width so the logo
            sits directly above (and centre-aligned with) the rail's icons. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, flexShrink: 0, color: 'var(--text-1)' }}>
          <Logo className="h-4 w-auto" />
        </div>

        {MENUS.map((menu) => (
          <div key={menu.label} style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setOpenMenu((cur) => (cur === menu.label ? null : menu.label))
                setOpenSubmenu(null)
              }}
              style={{
                background: openMenu === menu.label ? 'rgba(var(--item-ink, 255,255,255), 0.08)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-2)',
                fontSize: 12,
                padding: '0 10px',
                height: TITLE_BAR_HEIGHT,
                ...MONO,
              }}
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <div
                style={{
                  position: 'absolute',
                  top: TITLE_BAR_HEIGHT,
                  left: 0,
                  minWidth: 160,
                  zIndex: 2000,
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-2)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  padding: '4px 0',
                }}
              >
                {menu.items.map((item) => (
                  <div key={item.key ?? item.label} style={{ position: 'relative' }}>
                    {item.separatorBefore && <div style={SEPARATOR} />}
                    <button
                      disabled={!item.onSelect && !item.items}
                      title={item.title}
                      onClick={() => {
                        if (item.items) {
                          setOpenSubmenu((cur) => (cur === item.label ? null : item.label))
                          return
                        }
                        item.onSelect?.()
                        setOpenMenu(null)
                        setOpenSubmenu(null)
                      }}
                      style={menuItemStyle(!!item.onSelect || !!item.items)}
                    >
                      {item.label}
                      {item.items ? ' ›' : ''}
                    </button>

                    {item.items && openSubmenu === item.label && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: '100%',
                          minWidth: 180,
                          maxHeight: 320,
                          overflowY: 'auto',
                          zIndex: 2001,
                          background: 'var(--bg-2)',
                          border: '1px solid var(--border-2)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                          padding: '4px 0',
                        }}
                      >
                        {item.items.map((sub) => (
                          <React.Fragment key={sub.key ?? sub.label}>
                            {sub.separatorBefore && <div style={SEPARATOR} />}
                            <button
                              disabled={!sub.onSelect}
                              title={sub.title}
                              onClick={() => {
                                sub.onSelect?.()
                                setOpenMenu(null)
                                setOpenSubmenu(null)
                              }}
                              style={menuItemStyle(!!sub.onSelect)}
                            >
                              {sub.label}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {projectName && (
          <span
            title={isScratch ? 'Unsaved — File ▸ Save Project…' : projectName}
            style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', ...MONO }}
          >
            {projectName}
            {isScratch && <span style={{ color: '#e0a040' }}> ●</span>}
          </span>
        )}
        {props.runControl}
      </div>

      {/* Pushed right, and clear of the OS-drawn minimize/maximize/close
          overlay (main.cjs's titleBarOverlay) — titlebar-area-* is where the
          page may draw, so the gap to the window's right edge is exactly the
          overlay's width. Falls back to 0 where there's no overlay. */}
      <div
        style={{
          marginLeft: 'auto',
          marginRight: 'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 10px)',
          display: 'flex',
          alignItems: 'center',
          ...NO_DRAG,
        }}
      >
        <UpdateIndicator status={update.status} manualResult={update.manualResult} onInstall={update.install} />
        <LicenseBadge onOpen={props.onOpenLicense} />
      </div>
    </Frame>
  )
}
