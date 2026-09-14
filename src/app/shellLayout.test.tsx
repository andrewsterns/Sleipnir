// The bottom dock has to stay out of the way of two things: dialogs, which it
// used to paint over, and the app's own content, which it only avoids while the
// strip reclaimed for it matches its height.

import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalDock } from './TerminalDock/TerminalDock'
import { ProblemsDock } from './ProblemsDock/ProblemsDock'
import { DOCK_PANEL_HEIGHT, DOCK_TOGGLE_MARGIN, DOCK_TOGGLE_RAISED, LAYER } from './shellLayout'
import { isTerminalToggle, TERMINAL_TOGGLE_DEFAULT_KEY, TERMINAL_TOGGLE_ID } from './shortcuts'
import { DEFAULT_KEYBINDINGS } from '../00_keybindings'

describe('shell stacking order', () => {
  // The bug: the dock painted at 999 while every modal and popover sits at 200,
  // so an open terminal took a 320px bite out of the bottom of any dialog —
  // including the buttons needed to dismiss it.
  it('puts the dock below dialogs, and dialogs below the palette and menus', () => {
    expect(LAYER.viewChrome).toBeLessThan(LAYER.dock)
    expect(LAYER.dock).toBeLessThan(LAYER.dialog)
    expect(LAYER.dialog).toBeLessThan(LAYER.palette)
    expect(LAYER.palette).toBeLessThan(LAYER.titleBarMenu)
  })

  // Modals across the app pass this literal as `z={200}` (DeletePathModal,
  // RenamePathModal, AddNodeModal, CommandConfirmModal, …). If the tier and the
  // literal ever drift apart, the dock starts covering dialogs again.
  it('matches the z the app’s modals actually pass', () => {
    expect(LAYER.dialog).toBe(200)
  })
})

describe('dock panel geometry', () => {
  it('raises the toggle by exactly the height the panel occupies', () => {
    // Otherwise the toggle either overlaps the open panel or floats in a gap
    // above it.
    expect(DOCK_TOGGLE_RAISED).toBe(DOCK_PANEL_HEIGHT + DOCK_TOGGLE_MARGIN)
  })

  /**
   * The docks are controlled, and only build their panel once they have been
   * opened at least once — so drive them the way App.tsx does rather than
   * pinning `open` to a constant.
   */
  function Controlled({ render: renderDock }: { render: (p: DockProps) => React.ReactNode }) {
    const [open, setOpen] = useState(false)
    return <>{renderDock({ open, onOpenChange: setOpen })}</>
  }
  type DockProps = { open: boolean; onOpenChange: (open: boolean) => void }

  /** Opens a dock the way a user does, and hands back its panel. */
  function openPanel(title: string): HTMLElement {
    fireEvent.click(screen.getByTitle(title))
    // The panel is the fixed, full-width element the toggle reveals.
    const panel = document.querySelector('[style*="position: fixed"][style*="bottom: 0"]')
    expect(panel).not.toBeNull()
    return panel as HTMLElement
  }

  it('sizes and tiers the terminal panel from the shared constants', () => {
    render(<Controlled render={(p) => <TerminalDock {...p} />} />)
    const panel = openPanel('Terminal')
    expect(panel.style.height).toBe(`${DOCK_PANEL_HEIGHT}px`)
    expect(panel.style.zIndex).toBe(String(LAYER.dock))
  })

  it('tiers a sibling dock identically, so none of them outranks a dialog', () => {
    render(
      <Controlled
        render={(p) => <ProblemsDock {...p} browserRefs={{ current: new Map() }} />}
      />,
    )
    const panel = openPanel('Problems')
    expect(panel.style.height).toBe(`${DOCK_PANEL_HEIGHT}px`)
    expect(panel.style.zIndex).toBe(String(LAYER.dock))
  })

  it('keeps the toggle below dialogs too, so it cannot float over one', () => {
    render(<TerminalDock open={false} onOpenChange={() => {}} />)
    const toggle = screen.getByTitle('Terminal')
    expect(Number(toggle.style.zIndex)).toBeLessThan(LAYER.dialog)
    expect(toggle.style.bottom).toBe(`${DOCK_TOGGLE_MARGIN}px`)
  })

  it('lifts the toggle clear of an open panel', () => {
    render(<TerminalDock open onOpenChange={() => {}} shiftUp />)
    expect(screen.getByTitle('Terminal').style.bottom).toBe(`${DOCK_TOGGLE_RAISED}px`)
  })
})

describe('the terminal toggle shortcut', () => {
  const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('matches Ctrl+` and Cmd+`', () => {
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true }))).toBe(true)
    expect(isTerminalToggle(press({ code: 'Backquote', metaKey: true }))).toBe(true)
  })

  it('ignores the bare key, other keys, and the AltGr combo', () => {
    expect(isTerminalToggle(press({ code: 'Backquote' }))).toBe(false)
    expect(isTerminalToggle(press({ code: 'KeyJ', ctrlKey: true }))).toBe(false)
    // Layouts that reach the backquote through AltGr must still be able to type it.
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('matches on the physical key, not the character the layout produces', () => {
    // On a French layout this key emits neither "`" nor anything stable, so a
    // `key`-based rule would simply not fire.
    expect(isTerminalToggle(press({ code: 'Backquote', key: 'ò', ctrlKey: true }))).toBe(true)
  })

  it('follows a remap onto the character Settings captured', () => {
    // Settings records `e.key`, so a remapped binding is compared as a
    // character — the physical-key rule only applies to the backquote default.
    expect(isTerminalToggle(press({ code: 'KeyJ', key: 'j', ctrlKey: true }), 'j')).toBe(true)
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true }), 'j')).toBe(false)
  })

  it('is registered so Settings can show and remap it', () => {
    const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === TERMINAL_TOGGLE_ID)
    expect(entry?.key).toBe(TERMINAL_TOGGLE_DEFAULT_KEY)
    expect(entry?.label).toBeTruthy()
  })
})
