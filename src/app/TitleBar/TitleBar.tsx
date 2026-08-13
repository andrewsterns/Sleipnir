import React, { useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Logo } from '../UIKit/Logo/Logo'
import type { RecentProject } from '../../00_planning/api/sleipnirApi'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Matches the titleBarOverlay height set in electron/main.cjs — the OS draws
// its own minimize/maximize/close buttons on top of the right edge of this
// row at that same height, so this bar's height has to line up with it.
export const TITLE_BAR_HEIGHT = 32

interface MenuItem {
  label: string
  onSelect?: () => void
  /** A nested flyout instead of a direct action — mutually exclusive with onSelect. Only one level deep (Open Recent's own use case). */
  items?: MenuItem[]
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
  /** True when the project is the auto-provided "scratch" project (no real folder chosen yet) — shows an unsaved marker next to the name and enables "Save Project to Folder…". */
  isScratch?: boolean
  /** Relocates the scratch project into a real folder the user picks (see App's onSaveProjectToFolder). Only meaningful while `isScratch`. */
  onSaveProjectToFolder?: () => void
  onOpenProject?: () => void
  recentProjects?: RecentProject[]
  onOpenRecentProject?: (path: string) => void
  onNewWindow?: () => void
}

function buildMenus({
  onSave,
  onSaveAll,
  isScratch,
  onSaveProjectToFolder,
  onOpenProject,
  recentProjects,
  onOpenRecentProject,
  onNewWindow,
}: TitleBarProps): MenuDef[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'Open Project…', onSelect: onOpenProject },
        {
          label: 'Open Recent',
          items:
            recentProjects && recentProjects.length > 0
              ? recentProjects.map((p) => ({ label: p.name, onSelect: () => onOpenRecentProject?.(p.path) }))
              : [{ label: 'No Recent Projects' }],
        },
        { label: 'New Window', onSelect: onNewWindow },
        // Only actionable while unsaved (scratch) — a real project is already
        // on disk, so there's nothing to relocate.
        { label: 'Save Project to Folder…', onSelect: isScratch ? onSaveProjectToFolder : undefined },
        { label: 'Save', onSelect: onSave },
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
  ]
}

const NO_DRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

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

export const TitleBar: React.FC<TitleBarProps> = (props) => {
  const { projectName, isScratch } = props
  const MENUS = buildMenus(props)
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
                  <div key={item.label} style={{ position: 'relative' }}>
                    <button
                      disabled={!item.onSelect && !item.items}
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
                          <button
                            key={sub.label}
                            disabled={!sub.onSelect}
                            onClick={() => {
                              sub.onSelect?.()
                              setOpenMenu(null)
                              setOpenSubmenu(null)
                            }}
                            style={menuItemStyle(!!sub.onSelect)}
                          >
                            {sub.label}
                          </button>
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
            title={isScratch ? 'Unsaved — File ▸ Save Project to Folder…' : projectName}
            style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', ...MONO }}
          >
            {projectName}
            {isScratch && <span style={{ color: '#e0a040' }}> ●</span>}
          </span>
        )}
      </div>
    </Frame>
  )
}
