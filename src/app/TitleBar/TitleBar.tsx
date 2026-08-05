import React, { useEffect, useRef, useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { Logo } from '../UIKit/Logo/Logo'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Matches the titleBarOverlay height set in electron/main.cjs — the OS draws
// its own minimize/maximize/close buttons on top of the right edge of this
// row at that same height, so this bar's height has to line up with it.
export const TITLE_BAR_HEIGHT = 32

interface MenuItem {
  label: string
  onSelect?: () => void
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

const execEdit = (command: string) => () => document.execCommand(command)

export interface TitleBarProps {
  onSave?: () => void
  onSaveAll?: () => void
  /** Undefined (not just a no-op) when running outside Electron — see App.tsx's feature-detection via sleipnirApi's openFileDialog/openFolderDialog. Disables the menu item rather than hiding it, so it's discoverable either way. */
  onOpenFile?: () => void
  onOpenFolder?: () => void
}

function buildMenus({ onSave, onSaveAll, onOpenFile, onOpenFolder }: TitleBarProps): MenuDef[] {
  return [
    {
      label: 'File',
      items: [
        { label: 'Save', onSelect: onSave },
        { label: 'Save All', onSelect: onSaveAll },
        { label: 'Open File…', onSelect: onOpenFile },
        { label: 'Open Folder…', onSelect: onOpenFolder },
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

export const TitleBar: React.FC<TitleBarProps> = (props) => {
  const MENUS = buildMenus(props)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const onClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null)
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
      stroke={{ bottom: { color: 'rgba(255,255,255,0.08)' } }}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        ref={rootRef}
        style={{ display: 'flex', alignItems: 'center', height: '100%', ...NO_DRAG }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--text-1)' }}>
          <Logo className="h-4 w-auto" />
        </div>

        {MENUS.map((menu) => (
          <div key={menu.label} style={{ position: 'relative' }}>
            <button
              onClick={() => setOpenMenu((cur) => (cur === menu.label ? null : menu.label))}
              style={{
                background: openMenu === menu.label ? 'rgba(255,255,255,0.08)' : 'transparent',
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
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  padding: '4px 0',
                }}
              >
                {menu.items.map((item) => (
                  <button
                    key={item.label}
                    disabled={!item.onSelect}
                    onClick={() => {
                      item.onSelect?.()
                      setOpenMenu(null)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: item.onSelect ? 'pointer' : 'default',
                      color: item.onSelect ? 'var(--text-1)' : 'var(--text-3)',
                      fontSize: 12,
                      padding: '6px 12px',
                      ...MONO,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  )
}
